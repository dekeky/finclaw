package fquant

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUsernameForUser(t *testing.T) {
	tests := map[string]string{
		"u_123":       "u_123",
		"alice":       "alice",
		"user@ex.com": "user_ex_com",
		"  ":          "user",
		"123start":    "123start",
	}
	for in, want := range tests {
		if got := UsernameForUser(in); got != want {
			t.Fatalf("UsernameForUser(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestClientUpsertAndSubmit(t *testing.T) {
	var created, updated, submitted bool
	strategies := map[string]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_1/strategies/dual_ma":
			if _, ok := strategies["dual_ma"]; !ok {
				http.Error(w, `{"detail":"not found"}`, http.StatusNotFound)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"name": "dual_ma", "source": strategies["dual_ma"]})
		case r.Method == http.MethodPost && r.URL.Path == "/api/users/u_1/strategies/source":
			created = true
			body, _ := io.ReadAll(r.Body)
			var payload struct {
				Name   string `json:"name"`
				Source string `json:"source"`
			}
			_ = json.Unmarshal(body, &payload)
			strategies[payload.Name] = payload.Source
			writeJSON(w, http.StatusOK, map[string]any{"name": payload.Name, "source": payload.Source})
		case r.Method == http.MethodPut && r.URL.Path == "/api/users/u_1/strategies/dual_ma":
			updated = true
			body, _ := io.ReadAll(r.Body)
			var payload struct {
				Name   string `json:"name"`
				Source string `json:"source"`
			}
			_ = json.Unmarshal(body, &payload)
			strategies[payload.Name] = payload.Source
			writeJSON(w, http.StatusOK, map[string]any{"name": payload.Name, "source": payload.Source})
		case r.Method == http.MethodPost && r.URL.Path == "/api/users/u_1/runs":
			submitted = true
			writeJSON(w, http.StatusOK, map[string]any{"id": "run1", "status": "queued"})
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_1/runs":
			writeJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"id": "run1", "status": "queued"}}})
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_1/runs/run1":
			writeJSON(w, http.StatusOK, map[string]any{"id": "run1", "status": "succeeded"})
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_1/runs/run1/blotter":
			writeJSON(w, http.StatusOK, map[string]any{"orders": []any{}, "trades": []any{}})
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_1/runs/run1/positions":
			if r.URL.Query().Get("date") != "2020-01-02" {
				t.Errorf("date = %q", r.URL.Query().Get("date"))
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		case r.Method == http.MethodPatch && r.URL.Path == "/api/users/u_1/runs/run1":
			body, _ := io.ReadAll(r.Body)
			var payload struct {
				Name string `json:"name"`
			}
			_ = json.Unmarshal(body, &payload)
			writeJSON(w, http.StatusOK, map[string]any{"id": "run1", "name": payload.Name, "strategy_name": "dual_ma"})
		case r.Method == http.MethodDelete && r.URL.Path == "/api/users/u_1/runs/run1":
			writeJSON(w, http.StatusOK, map[string]any{"id": "run1"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	client := New(srv.URL)
	ctx := context.Background()
	first, err := client.UpsertStrategy(ctx, "u_1", "dual_ma", "print(1)")
	if err != nil {
		t.Fatal(err)
	}
	if first.Name != "dual_ma" || !created {
		t.Fatalf("first upsert: created=%v item=%+v", created, first)
	}
	second, err := client.UpsertStrategy(ctx, "u_1", "dual_ma", "print(2)")
	if err != nil {
		t.Fatal(err)
	}
	if !updated || second.Source != "print(2)" {
		t.Fatalf("second upsert: updated=%v item=%+v", updated, second)
	}
	run, err := client.SubmitRun(ctx, "u_1", SubmitRunRequest{
		StrategyName: "dual_ma",
		InitialCash:  100000,
		StartTime:    "2020-01-01",
		EndTime:      "2023-12-31",
		Universe:     "picks",
		Symbols:      []string{"600000"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !submitted || run.ID != "run1" || run.Status != "queued" {
		t.Fatalf("submit: submitted=%v run=%+v", submitted, run)
	}
	items, err := client.ListRuns(ctx, "u_1")
	if err != nil || len(items) != 1 {
		t.Fatalf("list: err=%v items=%s", err, items)
	}
	detail, err := client.GetRun(ctx, "u_1", "run1")
	if err != nil {
		t.Fatal(err)
	}
	if string(detail) == "" {
		t.Fatal("empty run detail")
	}
	blotter, err := client.GetRunBlotter(ctx, "u_1", "run1")
	if err != nil || !strings.Contains(string(blotter), "orders") {
		t.Fatalf("blotter: err=%v body=%s", err, blotter)
	}
	positions, err := client.GetRunPositions(ctx, "u_1", "run1", "2020-01-02", "")
	if err != nil || !strings.Contains(string(positions), "items") {
		t.Fatalf("positions: err=%v body=%s", err, positions)
	}
	renamed, err := client.UpdateRunName(ctx, "u_1", "run1", "我的回测")
	if err != nil || !strings.Contains(string(renamed), "我的回测") {
		t.Fatalf("rename: err=%v body=%s", err, renamed)
	}
	if _, err := client.DeleteRun(ctx, "u_1", "run1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestClientGetBars(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/market/bars" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("codes") != "600000" {
			t.Errorf("codes = %q", r.URL.Query().Get("codes"))
		}
		if r.URL.Query().Get("indexes") != "000300" {
			t.Errorf("indexes = %q", r.URL.Query().Get("indexes"))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"items": []map[string]any{
				{
					"code": "600000",
					"name": "浦发银行",
					"series": []map[string]any{
						{"symbol": "600000", "time": "2020-01-02T00:00:00", "open": 10.1, "high": 10.5, "low": 10.0, "close": 10.3, "volume": 1500000},
					},
				},
				{
					"code": "000300",
					"name": "沪深300指数",
					"series": []map[string]any{
						{"symbol": "000300", "time": "2020-01-02T00:00:00", "open": 4.1, "high": 4.2, "low": 4.0, "close": 4.15, "volume": 1200000},
					},
				},
			},
		})
	}))
	defer srv.Close()

	out, err := New(srv.URL).GetBars(context.Background(), []string{"600000"}, []string{"000300"}, "2020-01-01", "2020-02-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 2 {
		t.Fatalf("items = %d", len(out.Items))
	}
	if out.Items[0].Code != "600000" || out.Items[0].Name != "浦发银行" || len(out.Items[0].Series) != 1 {
		t.Fatalf("first series = %+v", out.Items[0])
	}
	if out.Items[0].Series[0].Close == nil || *out.Items[0].Series[0].Close != 10.3 {
		t.Fatalf("close = %+v", out.Items[0].Series[0].Close)
	}
	if out.Items[1].Code != "000300" || out.Items[1].Name != "沪深300指数" {
		t.Fatalf("index series = %+v", out.Items[1])
	}
	if out.Items[1].Series[0].Volume == nil || *out.Items[1].Series[0].Volume != 1200000 {
		t.Fatalf("volume = %+v", out.Items[1].Series[0].Volume)
	}
}

func TestClientGetBarsIndexesOnly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/market/bars" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("codes") != "" {
			t.Errorf("codes should be empty, got %q", r.URL.Query().Get("codes"))
		}
		if r.URL.Query().Get("indexes") != "000001" {
			t.Errorf("indexes = %q", r.URL.Query().Get("indexes"))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"items": []map[string]any{
				{"code": "000001", "name": "上证综合指数", "series": nil},
			},
		})
	}))
	defer srv.Close()

	out, err := New(srv.URL).GetBars(context.Background(), nil, []string{"000001"}, "2020-01-01", "2020-02-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 1 || out.Items[0].Code != "000001" {
		t.Fatalf("items = %+v", out.Items)
	}
	if out.Items[0].Series == nil {
		t.Fatal("nil series should normalize to empty slice")
	}
}

func TestClientUniverseAndFina(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/indicators":
			writeJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"id": "pe_ttm", "source": "kline", "group": "估值", "label": "市盈率 TTM"}}})
		case r.URL.Path == "/api/symbols":
			if r.URL.Query().Get("codes") != "600000,000300" {
				t.Errorf("codes = %q", r.URL.Query().Get("codes"))
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"code": "600000", "name": "浦发银行", "kind": "stock"}}})
		case r.URL.Path == "/api/universe/stocks":
			if r.URL.Query().Get("q") != "浦发" {
				t.Errorf("q = %q", r.URL.Query().Get("q"))
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"code": "600000", "name": "浦发银行", "kind": "stock"}}})
		case r.URL.Path == "/api/universe/indexes":
			writeJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"code": "000300", "name": "沪深300", "size": 300}}})
		case r.URL.Path == "/api/universe/indexes/000300":
			writeJSON(w, http.StatusOK, map[string]any{"code": "000300", "size": 1, "symbols": []map[string]any{{"code": "600000", "name": "浦发银行"}}})
		case r.URL.Path == "/api/market/fina":
			if r.URL.Query().Get("codes") != "600000" {
				t.Errorf("codes = %q", r.URL.Query().Get("codes"))
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"code": "600000", "name": "浦发银行", "rows": []map[string]any{{"eps_basic": 1.2}}}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	client := New(srv.URL)
	ctx := context.Background()
	indicators, err := client.ListIndicators(ctx)
	if err != nil || !strings.Contains(string(indicators), "pe_ttm") {
		t.Fatalf("indicators: err=%v body=%s", err, indicators)
	}
	symbols, err := client.ListSymbols(ctx, "", "", "600000,000300")
	if err != nil || !strings.Contains(string(symbols), "浦发银行") {
		t.Fatalf("symbols: err=%v body=%s", err, symbols)
	}
	stocks, err := client.ListUniverseStocks(ctx, "浦发")
	if err != nil || !strings.Contains(string(stocks), "600000") {
		t.Fatalf("stocks: err=%v body=%s", err, stocks)
	}
	indexes, err := client.ListUniverseIndexes(ctx)
	if err != nil || !strings.Contains(string(indexes), "沪深300") {
		t.Fatalf("indexes: err=%v body=%s", err, indexes)
	}
	detail, err := client.GetUniverseIndex(ctx, "000300")
	if err != nil || !strings.Contains(string(detail), "浦发银行") {
		t.Fatalf("index detail: err=%v body=%s", err, detail)
	}
	fina, err := client.GetFina(ctx, []string{"600000"}, "2023-01-01", "2023-12-31")
	if err != nil || !strings.Contains(string(fina), "eps_basic") {
		t.Fatalf("fina: err=%v body=%s", err, fina)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
