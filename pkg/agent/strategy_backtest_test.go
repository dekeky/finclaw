package agentruntime

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSubmitRunRejectsJoinQuant(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_test"
	store := NewStrategyStore(userID)
	if _, err := store.Create("jq_ma", StrategyPlatformJoinQuant, "def initialize(context):\n    pass\n", ""); err != nil {
		t.Fatal(err)
	}

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", userID)
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, "http://127.0.0.1:9").ConfigRouter()

	body, _ := json.Marshal(submitBacktestRequest{StrategyName: "jq_ma", Universe: "picks", Symbols: []string{"600000"}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/backtest/runs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestSubmitRunProxiesToFquant(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_test"
	store := NewStrategyStore(userID)
	if _, err := store.Create("dual_ma", StrategyPlatformFinClaw, "from akquant import Strategy\nclass S(Strategy):\n    pass\n", ""); err != nil {
		t.Fatal(err)
	}

	var gotSource string
	var gotRun submitBacktestRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_test/strategies/dual_ma":
			http.Error(w, `{"detail":"not found"}`, http.StatusNotFound)
		case r.Method == http.MethodPost && r.URL.Path == "/api/users/u_test/strategies/source":
			raw, _ := io.ReadAll(r.Body)
			var payload struct {
				Source string `json:"source"`
			}
			_ = json.Unmarshal(raw, &payload)
			gotSource = payload.Source
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"name":"dual_ma"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/users/u_test/runs":
			raw, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(raw, &gotRun)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"abc123","status":"queued"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", userID)
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, srv.URL).ConfigRouter()

	body, _ := json.Marshal(submitBacktestRequest{
		StrategyName: "dual_ma",
		InitialCash:  50000,
		StartTime:    "2021-01-01",
		EndTime:      "2022-01-01",
		Universe:     "picks",
		Symbols:      []string{"600000", " 000001 "},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/backtest/runs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if gotSource == "" {
		t.Fatal("strategy source was not upserted")
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("abc123")) {
		t.Fatalf("response missing run id: %s", rec.Body.String())
	}
	if gotRun.Universe != "picks" || len(gotRun.Symbols) != 2 || gotRun.Symbols[0] != "600000" || gotRun.Symbols[1] != "000001" {
		t.Fatalf("proxied run = %+v", gotRun)
	}
}

func TestRunBlotterAndPositionsProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_test/runs/abc123/blotter":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[{"symbol":"600000"}],"trades":[]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_test/runs/abc123/positions":
			if r.URL.Query().Get("date") != "2020-01-02" {
				http.Error(w, `{"detail":"missing date"}`, http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"symbol":"600000","quantity":100}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", "u_test")
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, srv.URL).ConfigRouter()

	blotterReq := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123/blotter", nil)
	blotterRec := httptest.NewRecorder()
	engine.ServeHTTP(blotterRec, blotterReq)
	if blotterRec.Code != http.StatusOK || !bytes.Contains(blotterRec.Body.Bytes(), []byte("600000")) {
		t.Fatalf("blotter status=%d body=%s", blotterRec.Code, blotterRec.Body.String())
	}

	posReq := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123/positions?date=2020-01-02", nil)
	posRec := httptest.NewRecorder()
	engine.ServeHTTP(posRec, posReq)
	if posRec.Code != http.StatusOK || !bytes.Contains(posRec.Body.Bytes(), []byte("quantity")) {
		t.Fatalf("positions status=%d body=%s", posRec.Code, posRec.Body.String())
	}
}

func TestSubmitRunRejectsEmptyPicks(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_test"
	store := NewStrategyStore(userID)
	if _, err := store.Create("dual_ma", StrategyPlatformFinClaw, "from akquant import Strategy\nclass S(Strategy):\n    pass\n", ""); err != nil {
		t.Fatal(err)
	}

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", userID)
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, "http://127.0.0.1:9").ConfigRouter()

	body, _ := json.Marshal(submitBacktestRequest{StrategyName: "dual_ma", Universe: "picks"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/backtest/runs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestMarketBarsForwardsIndexes(t *testing.T) {
	var gotCodes, gotIndexes string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/market/bars" {
			http.NotFound(w, r)
			return
		}
		gotCodes = r.URL.Query().Get("codes")
		gotIndexes = r.URL.Query().Get("indexes")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[{"code":"000001","name":"上证综合指数","series":[]}]}`))
	}))
	defer srv.Close()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", "u_test")
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, srv.URL).ConfigRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/market/bars?indexes=000001&start_time=2020-01-01&end_time=2020-02-01", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if gotCodes != "" {
		t.Fatalf("codes = %q, want empty", gotCodes)
	}
	if gotIndexes != "000001" {
		t.Fatalf("indexes = %q", gotIndexes)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("上证综合指数")) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestMarketBarsRejectsEmptyCodesAndIndexes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", "u_test")
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, "http://127.0.0.1:9").ConfigRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/market/bars?start_time=2020-01-01&end_time=2020-02-01", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestMarketBarsReturnsTypedSeries(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/market/bars" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[{"code":"600000","name":"浦发银行","series":[{"symbol":"600000","time":"2020-01-02T00:00:00","open":10.1,"high":10.5,"low":10.0,"close":10.3,"volume":1500000}]}]}`))
	}))
	defer srv.Close()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", "u_test")
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, srv.URL).ConfigRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/market/bars?codes=600000,600000&start_time=2020-01-01&end_time=2020-02-01", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}

	var envelope struct {
		Body struct {
			Items []struct {
				Code   string `json:"code"`
				Name   string `json:"name"`
				Series []struct {
					Symbol string   `json:"symbol"`
					Time   string   `json:"time"`
					Open   *float64 `json:"open"`
					High   *float64 `json:"high"`
					Low    *float64 `json:"low"`
					Close  *float64 `json:"close"`
					Volume *float64 `json:"volume"`
				} `json:"series"`
			} `json:"items"`
		} `json:"body"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if len(envelope.Body.Items) != 1 {
		t.Fatalf("items = %+v", envelope.Body.Items)
	}
	item := envelope.Body.Items[0]
	if item.Code != "600000" || item.Name != "浦发银行" || len(item.Series) != 1 {
		t.Fatalf("item = %+v", item)
	}
	if item.Series[0].Close == nil || *item.Series[0].Close != 10.3 {
		t.Fatalf("close = %+v", item.Series[0].Close)
	}
	if item.Series[0].Volume == nil || *item.Series[0].Volume != 1500000 {
		t.Fatalf("volume = %+v", item.Series[0].Volume)
	}
}

func TestUniverseAndFinaProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/universe/stocks":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"code":"600000","name":"浦发银行","kind":"stock"}]}`))
		case r.URL.Path == "/api/universe/indexes":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"code":"000300","name":"沪深300","size":300}]}`))
		case r.URL.Path == "/api/universe/indexes/000300":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":"000300","size":1,"symbols":[{"code":"600000","name":"浦发银行"}]}`))
		case r.URL.Path == "/api/market/fina":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"code":"600000","name":"浦发银行","rows":[{"eps_basic":1.2}]}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", "u_test")
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, srv.URL).ConfigRouter()

	for _, path := range []string{
		"/api/v1/backtest/universe/stocks?q=浦发",
		"/api/v1/backtest/universe/indexes",
		"/api/v1/backtest/universe/indexes/000300",
		"/api/v1/backtest/market/fina?codes=600000&start_time=2023-01-01&end_time=2023-12-31",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d body = %s", path, rec.Code, rec.Body.String())
		}
		if !bytes.Contains(rec.Body.Bytes(), []byte("600000")) && !bytes.Contains(rec.Body.Bytes(), []byte("000300")) {
			t.Fatalf("%s unexpected body = %s", path, rec.Body.String())
		}
	}
}
