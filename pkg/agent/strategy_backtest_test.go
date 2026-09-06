package agentruntime

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

var defaultBacktestNamePattern = regexp.MustCompile(`dual_ma_\d{8}_\d{4}`)

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
	origInterval := backtestPersistPollInterval
	origTimeout := backtestPersistTimeout
	backtestPersistPollInterval = time.Millisecond
	backtestPersistTimeout = 50 * time.Millisecond
	t.Cleanup(func() {
		backtestPersistPollInterval = origInterval
		backtestPersistTimeout = origTimeout
	})
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
	if !defaultBacktestNamePattern.Match(rec.Body.Bytes()) {
		t.Fatalf("response missing default run name: %s", rec.Body.String())
	}
	if gotRun.Universe != "picks" || len(gotRun.Symbols) != 2 || gotRun.Symbols[0] != "600000" || gotRun.Symbols[1] != "000001" {
		t.Fatalf("proxied run = %+v", gotRun)
	}

	stub := filepath.Join(localRunDir(t, userID, "abc123"), "summary.md")
	if data, err := os.ReadFile(stub); err != nil || !bytes.Contains(data, []byte("queued")) {
		t.Fatalf("local stub = %s err=%v", data, err)
	}
}

func TestRunBlotterAndPositionsProxy(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_test/runs/abc123":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"abc123","status":"succeeded","source":"class S(Strategy):\n    pass\n","request":{"strategy_name":"dual_ma"}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_test/runs/abc123/blotter":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[{"symbol":"600000","created_at":"2020-01-02","status":"filled"}],"rebalances":[{"time":"2020-01-02","method":"rebalance_weights","selected":["600000"],"status":"submitted"}],"trades":[]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_test/runs/abc123/positions":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"symbol":"600000","quantity":100,"time":"2020-01-02T00:00:00"}]}`))
		case r.Method == http.MethodPatch && r.URL.Path == "/api/users/u_test/runs/abc123":
			raw, _ := io.ReadAll(r.Body)
			var payload struct {
				Name string `json:"name"`
			}
			_ = json.Unmarshal(raw, &payload)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"abc123","name":"` + payload.Name + `","strategy_name":"dual_ma"}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/api/users/u_test/runs/abc123":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"abc123"}`))
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

	detailReq := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123", nil)
	detailRec := httptest.NewRecorder()
	engine.ServeHTTP(detailRec, detailReq)
	if detailRec.Code != http.StatusOK || !bytes.Contains(detailRec.Body.Bytes(), []byte("class S(Strategy)")) {
		t.Fatalf("detail status=%d body=%s", detailRec.Code, detailRec.Body.String())
	}
	waitForLocalRun(t, "u_test", "abc123")
	runDir := filepath.Join(AccountBacktestsRootForUser("u_test"), "dual_ma", "dual_ma")
	if data, err := os.ReadFile(filepath.Join(runDir, "summary.md")); err != nil || !bytes.Contains(data, []byte("dual_ma")) {
		t.Fatalf("persisted summary = %s err=%v", data, err)
	}
	if _, err := os.Stat(filepath.Join(runDir, "blotter.json")); !os.IsNotExist(err) {
		t.Fatal("detail get should not persist blotter")
	}

	blotterReq := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123/blotter", nil)
	blotterRec := httptest.NewRecorder()
	engine.ServeHTTP(blotterRec, blotterReq)
	if blotterRec.Code != http.StatusOK || !bytes.Contains(blotterRec.Body.Bytes(), []byte("600000")) || !bytes.Contains(blotterRec.Body.Bytes(), []byte(`"page":1`)) {
		t.Fatalf("blotter status=%d body=%s", blotterRec.Code, blotterRec.Body.String())
	}
	waitForLocalFile(t, filepath.Join(runDir, "blotter.json"), []byte("600000"))
	waitForLocalFile(t, filepath.Join(runDir, "blotter-fills.json"), []byte("600000"))

	fillsReq := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123/blotter?fills=1", nil)
	fillsRec := httptest.NewRecorder()
	engine.ServeHTTP(fillsRec, fillsReq)
	if fillsRec.Code != http.StatusOK || !bytes.Contains(fillsRec.Body.Bytes(), []byte("action_days")) {
		t.Fatalf("fills status=%d body=%s", fillsRec.Code, fillsRec.Body.String())
	}

	posReq := httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123/positions?date=2020-01-02", nil)
	posRec := httptest.NewRecorder()
	engine.ServeHTTP(posRec, posReq)
	if posRec.Code != http.StatusOK || !bytes.Contains(posRec.Body.Bytes(), []byte("quantity")) {
		t.Fatalf("positions status=%d body=%s", posRec.Code, posRec.Body.String())
	}

	renameBody, _ := json.Marshal(map[string]string{"name": "我的回测"})
	renameReq := httptest.NewRequest(http.MethodPatch, "/api/v1/backtest/runs/abc123", bytes.NewReader(renameBody))
	renameReq.Header.Set("Content-Type", "application/json")
	renameRec := httptest.NewRecorder()
	engine.ServeHTTP(renameRec, renameReq)
	if renameRec.Code != http.StatusOK || !bytes.Contains(renameRec.Body.Bytes(), []byte("我的回测")) {
		t.Fatalf("rename status=%d body=%s", renameRec.Code, renameRec.Body.String())
	}
	renamedDir := filepath.Join(AccountBacktestsRootForUser("u_test"), "dual_ma", "我的回测")
	if _, err := os.Stat(filepath.Join(renamedDir, "summary.md")); err != nil {
		t.Fatalf("renamed dir missing: %v", err)
	}
	if _, err := os.Stat(runDir); !os.IsNotExist(err) {
		t.Fatalf("old named dir still exists")
	}
	runDir = renamedDir

	blankReq := httptest.NewRequest(http.MethodPatch, "/api/v1/backtest/runs/abc123", bytes.NewReader([]byte(`{"name":"  "}`)))
	blankReq.Header.Set("Content-Type", "application/json")
	blankRec := httptest.NewRecorder()
	engine.ServeHTTP(blankRec, blankReq)
	if blankRec.Code != http.StatusBadRequest {
		t.Fatalf("blank rename status=%d body=%s", blankRec.Code, blankRec.Body.String())
	}

	delReq := httptest.NewRequest(http.MethodDelete, "/api/v1/backtest/runs/abc123", nil)
	delRec := httptest.NewRecorder()
	engine.ServeHTTP(delRec, delReq)
	if delRec.Code != http.StatusOK || !bytes.Contains(delRec.Body.Bytes(), []byte("abc123")) {
		t.Fatalf("delete status=%d body=%s", delRec.Code, delRec.Body.String())
	}
	if _, err := os.Stat(runDir); !os.IsNotExist(err) {
		t.Fatalf("local run dir still exists: %v", err)
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
		case r.URL.Path == "/api/indicators":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"id":"pe_ttm","source":"kline","group":"估值","label":"市盈率 TTM"}]}`))
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
		"/api/v1/backtest/indicators",
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
		if !bytes.Contains(rec.Body.Bytes(), []byte("600000")) &&
			!bytes.Contains(rec.Body.Bytes(), []byte("000300")) &&
			!bytes.Contains(rec.Body.Bytes(), []byte("pe_ttm")) {
			t.Fatalf("%s unexpected body = %s", path, rec.Body.String())
		}
	}
}

func TestCompletedBacktestReadsFromLocal(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	var getRunHits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/u_test/runs/abc123":
			getRunHits++
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"abc123","name":"早盘回测","status":"succeeded","strategy_name":"dual_ma","live_equity":[{"time":"2020-01-02","equity":100100}],"result":{"metrics":{"trade_count":1},"equity_curve":[{"time":"2020-01-02","equity":100100}]},"request":{"strategy_name":"dual_ma"}}`))
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/blotter"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"orders":[{"symbol":"600000","created_at":"2020-01-02"}],"rebalances":[{"time":"2020-01-02","method":"rebalance_weights","selected":["600000"]}],"trades":[]}`))
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/positions"):
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

	first := httptest.NewRecorder()
	engine.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123", nil))
	if first.Code != http.StatusOK {
		t.Fatalf("first get status=%d body=%s", first.Code, first.Body.String())
	}
	if getRunHits != 1 {
		t.Fatalf("first getRun hits = %d", getRunHits)
	}
	if !bytes.Contains(first.Body.Bytes(), []byte("equity_curve")) {
		t.Fatalf("first get should return fquant result immediately: %s", first.Body.String())
	}

	waitForLocalRun(t, "u_test", "abc123")
	if _, ok := loadLocalBlotter("u_test", "abc123"); ok {
		t.Fatal("completed getRun should not prefetch blotter")
	}
	if _, ok := loadLocalPositions("u_test", "abc123"); ok {
		t.Fatal("completed getRun should not prefetch positions")
	}

	listRec := httptest.NewRecorder()
	engine.ServeHTTP(listRec, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs", nil))
	if listRec.Code != http.StatusOK || !bytes.Contains(listRec.Body.Bytes(), []byte("早盘回测")) {
		t.Fatalf("local list status=%d body=%s", listRec.Code, listRec.Body.String())
	}

	second := httptest.NewRecorder()
	engine.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123", nil))
	if second.Code != http.StatusOK || !bytes.Contains(second.Body.Bytes(), []byte("equity_curve")) {
		t.Fatalf("second get status=%d body=%s", second.Code, second.Body.String())
	}
	if getRunHits != 1 {
		t.Fatalf("completed getRun still hit fquant: hits=%d", getRunHits)
	}

	blotterRec := httptest.NewRecorder()
	engine.ServeHTTP(blotterRec, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123/blotter", nil))
	if blotterRec.Code != http.StatusOK || !bytes.Contains(blotterRec.Body.Bytes(), []byte("600000")) {
		t.Fatalf("on-demand blotter status=%d body=%s", blotterRec.Code, blotterRec.Body.String())
	}

	posRec := httptest.NewRecorder()
	engine.ServeHTTP(posRec, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/abc123/positions?date=2020-01-02", nil))
	if posRec.Code != http.StatusOK || !bytes.Contains(posRec.Body.Bytes(), []byte("600000")) {
		t.Fatalf("on-demand positions status=%d body=%s", posRec.Code, posRec.Body.String())
	}
}

func localRunDir(t *testing.T, userID, runID string) string {
	t.Helper()
	entry, ok := lookupBacktestIndex(userID, runID)
	if !ok {
		t.Fatalf("run %s not indexed", runID)
	}
	return filepath.Join(AccountBacktestsRootForUser(userID), filepath.FromSlash(entry.Dir))
}

func waitForLocalRun(t *testing.T, userID, runID string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if raw, ok := loadLocalRunRaw(userID, runID); ok && isTerminalBacktestStatus(statusFromBacktestRaw(raw)) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("local result persist did not finish")
}

func waitForLocalFile(t *testing.T, path string, contains []byte) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var last []byte
	var lastErr error
	for time.Now().Before(deadline) {
		last, lastErr = os.ReadFile(path)
		if lastErr == nil && (contains == nil || bytes.Contains(last, contains)) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("local file %s did not appear: data=%s err=%v", path, last, lastErr)
}

func TestLiveRunReadsEquityFromFquant(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_live"
	if err := persistSubmittedBacktest(userID, "run-live", "running", "dual_ma", "class S(Strategy): pass\n", submitBacktestRequest{
		StrategyName: "dual_ma",
		InitialCash:  100000,
		StartTime:    "2020-01-01",
		EndTime:      "2020-12-31",
		Universe:     "picks",
		Symbols:      []string{"600000"},
	}); err != nil {
		t.Fatal(err)
	}
	if err := persistBacktestRun(userID, json.RawMessage(`{
		"id":"run-live","status":"running","strategy_name":"dual_ma",
		"live_equity":[{"time":"2020-01-02","equity":100000}]
	}`)); err != nil {
		t.Fatal(err)
	}

	var getRunHits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/users/u_live/runs/run-live" {
			http.NotFound(w, r)
			return
		}
		getRunHits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"run-live","status":"running","strategy_name":"dual_ma","source":"LIVE_SOURCE_SHOULD_DROP","live_equity":[{"time":"2020-01-02","equity":100000},{"time":"2020-01-03","equity":101000}]}`))
	}))
	defer srv.Close()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", userID)
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, srv.URL).ConfigRouter()

	first := httptest.NewRecorder()
	engine.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/run-live", nil))
	if first.Code != http.StatusOK || !bytes.Contains(first.Body.Bytes(), []byte("100000")) {
		t.Fatalf("live FinClaw get should return local stub status=%d body=%s", first.Code, first.Body.String())
	}
	if bytes.Contains(first.Body.Bytes(), []byte("101000")) {
		t.Fatal("live FinClaw get should not proxy fquant equity")
	}
	if getRunHits != 0 {
		t.Fatalf("live FinClaw get should not hit fquant, hits=%d", getRunHits)
	}

	second := httptest.NewRecorder()
	engine.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/run-live", nil))
	if second.Code != http.StatusOK || bytes.Contains(second.Body.Bytes(), []byte("101000")) {
		t.Fatalf("second live get status=%d body=%s", second.Code, second.Body.String())
	}
	if getRunHits != 0 {
		t.Fatalf("live FinClaw get still hit fquant: hits=%d", getRunHits)
	}

	fresh := httptest.NewRecorder()
	engine.ServeHTTP(fresh, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runs/run-live?live=1", nil))
	if fresh.Code != http.StatusOK || !bytes.Contains(fresh.Body.Bytes(), []byte("101000")) {
		t.Fatalf("live=1 should proxy fquant equity status=%d body=%s", fresh.Code, fresh.Body.String())
	}
	if getRunHits != 1 {
		t.Fatalf("live=1 hits = %d", getRunHits)
	}
}

func TestBacktestRuntimeExposesFquant(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", "u_live")
		c.Next()
	})
	NewBacktestRouter(engine, func(c *gin.Context) { c.Next() }, "http://127.0.0.1:8001").ConfigRouter()
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/backtest/runtime", nil))
	if rec.Code != http.StatusOK || !bytes.Contains(rec.Body.Bytes(), []byte("http://127.0.0.1:8001")) {
		t.Fatalf("runtime status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("u_live")) {
		t.Fatalf("runtime missing username: %s", rec.Body.String())
	}
}
