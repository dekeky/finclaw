package fdata

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/finclaw/pkg/agent/fquant"
)

func TestGetBarsStocksUseFactorPro(t *testing.T) {
	var gotCodes, gotFields, gotStart string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/stock_factor_pro":
			gotCodes = r.URL.Query().Get("codes")
			gotFields = r.URL.Query().Get("fields")
			gotStart = r.URL.Query().Get("start")
			writeJSON(w, map[string]any{
				"rows": []map[string]any{
					{
						"code":       "600000.SH",
						"trade_date": "20200102",
						"open_qfq":   10.1,
						"high_qfq":   10.5,
						"low_qfq":    10.0,
						"close_qfq":  10.3,
						"vol":        1500000,
					},
				},
			})
		case "/v1/stocks":
			writeJSON(w, map[string]any{
				"rows": []map[string]any{{"code": "600000.SH", "name": "浦发银行"}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	out, err := New(srv.URL, "", "").GetBars(context.Background(), []string{"600000", "600000"}, nil, "2020-01-01", "2020-02-01")
	if err != nil {
		t.Fatal(err)
	}
	if gotCodes != "600000" {
		t.Fatalf("codes = %q", gotCodes)
	}
	if gotStart != "20200101" {
		t.Fatalf("start = %q", gotStart)
	}
	if !strings.Contains(gotFields, "close_qfq") {
		t.Fatalf("fields = %q", gotFields)
	}
	if len(out.Items) != 1 {
		t.Fatalf("items = %+v", out.Items)
	}
	item := out.Items[0]
	if item.Code != "600000" || item.Name != "浦发银行" || len(item.Series) != 1 {
		t.Fatalf("item = %+v", item)
	}
	if item.Series[0].Close == nil || *item.Series[0].Close != 10.3 {
		t.Fatalf("close = %+v", item.Series[0].Close)
	}
	if item.Series[0].Time != "2020-01-02" {
		t.Fatalf("time = %q", item.Series[0].Time)
	}
}

func TestGetBarsIndexesUseIndexDaily(t *testing.T) {
	var gotPath, gotCodes string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotCodes = r.URL.Query().Get("codes")
		if r.URL.Path != "/v1/index_daily" {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, map[string]any{
			"rows": []map[string]any{
				{"code": "000300.SH", "trade_date": "2020-01-02", "open": 4.1, "high": 4.2, "low": 4.0, "close": 4.15, "vol": 1200000},
			},
		})
	}))
	defer srv.Close()

	out, err := New(srv.URL, "", "").GetBars(context.Background(), nil, []string{"000001"}, "2020-01-01", "2020-02-01")
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/v1/index_daily" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotCodes != "000001" {
		t.Fatalf("codes = %q", gotCodes)
	}
	if len(out.Items) != 1 || out.Items[0].Code != "000001" || out.Items[0].Name != "上证综指" {
		t.Fatalf("items = %+v", out.Items)
	}
	if len(out.Items[0].Series) != 0 {
		t.Fatalf("000001 should not take 000300 rows: %+v", out.Items[0].Series)
	}

	out, err = New(srv.URL, "", "").GetBars(context.Background(), nil, []string{"510300"}, "2020-01-01", "2020-02-01")
	if err != nil {
		t.Fatal(err)
	}
	if gotCodes != "000300" {
		t.Fatalf("aliased codes = %q", gotCodes)
	}
	if len(out.Items) != 1 || out.Items[0].Code != "510300" || out.Items[0].Name != "沪深300" {
		t.Fatalf("alias item = %+v", out.Items[0])
	}
	if len(out.Items[0].Series) != 1 || out.Items[0].Series[0].Close == nil || *out.Items[0].Series[0].Close != 4.15 {
		t.Fatalf("alias series = %+v", out.Items[0].Series)
	}
}

func TestGetBarsMixedAndAuth(t *testing.T) {
	var user, pass, factorPath, indexPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser, gotPass, ok := r.BasicAuth()
		if ok {
			user, pass = gotUser, gotPass
		}
		switch r.URL.Path {
		case "/v1/stock_factor_pro":
			factorPath = r.URL.Path
			writeJSON(w, map[string]any{"rows": []map[string]any{
				{"code": "600000.SH", "trade_date": "20200102", "close_qfq": 10.3, "vol": 1},
			}})
		case "/v1/index_daily":
			indexPath = r.URL.Path
			writeJSON(w, map[string]any{"rows": []map[string]any{
				{"code": "000300.SH", "trade_date": "20200102", "close": 4.15, "vol": 2},
			}})
		case "/v1/stocks":
			writeJSON(w, map[string]any{"rows": []map[string]any{}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	out, err := New(srv.URL, "root", "secret").GetBars(context.Background(), []string{"600000"}, []string{"000300"}, "2020-01-01", "2020-02-01")
	if err != nil {
		t.Fatal(err)
	}
	if user != "root" || pass != "secret" {
		t.Fatalf("auth = %q %q", user, pass)
	}
	if factorPath != "/v1/stock_factor_pro" || indexPath != "/v1/index_daily" {
		t.Fatalf("paths factor=%q index=%q", factorPath, indexPath)
	}
	if len(out.Items) != 2 || out.Items[0].Code != "600000" || out.Items[1].Code != "000300" {
		t.Fatalf("items = %+v", out.Items)
	}
	if out.Items[0].Name != "600000" {
		t.Fatalf("missing name should fall back to code, got %q", out.Items[0].Name)
	}
}

func TestGetBarsPropagatesAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"detail":"需要 code 或 codes"}`))
	}))
	defer srv.Close()

	_, err := New(srv.URL, "", "").GetBars(context.Background(), []string{"600000"}, nil, "2020-01-01", "2020-02-01")
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*fquant.APIError)
	if !ok {
		t.Fatalf("err type = %T (%v)", err, err)
	}
	if apiErr.Status != http.StatusBadRequest || apiErr.Detail != "需要 code 或 codes" {
		t.Fatalf("err = %+v", apiErr)
	}
}

func TestBareCodeAndDayKey(t *testing.T) {
	if got := bareCode("600000.SH"); got != "600000" {
		t.Fatalf("bare = %q", got)
	}
	if got := bareCode("1"); got != "000001" {
		t.Fatalf("pad = %q", got)
	}
	if got := dayKey("20200102"); got != "2020-01-02" {
		t.Fatalf("day = %q", got)
	}
	if got := compactDay("2020-01-02"); got != "20200102" {
		t.Fatalf("compact = %q", got)
	}
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}
