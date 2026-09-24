package agentruntime

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/finclaw/internal/auth"
	"github.com/gin-gonic/gin"
)

func libraryTestEngine(t *testing.T, userID, fquantURL string) (*gin.Engine, *auth.Store) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store, err := auth.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", userID)
		c.Next()
	})
	paper := NewPaperRouter(engine, func(c *gin.Context) { c.Next() }, fquantURL)
	paper.ConfigRouter()
	NewStrategyLibraryRouter(engine, func(c *gin.Context) { c.Next() }, store, paper).ConfigRouter()
	return engine, store
}

func libraryFquantServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/market/bars":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"code":"000300.SH","name":"沪深300","series":[{"time":"2026-09-11","close":1}]}]}`))
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/strategies/"):
			http.Error(w, `{"detail":"not found"}`, http.StatusNotFound)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/strategies/source"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"name":"dual_ma"}`)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/runs"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"id":"lib-paper-run","status":"queued"}`)
		default:
			http.NotFound(w, r)
		}
	}))
}

func decodeLibraryBody(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var wrap struct {
		Body map[string]any `json:"body"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		t.Fatalf("decode: %v body=%s", err, raw)
	}
	if wrap.Body == nil {
		t.Fatalf("empty body: %s", raw)
	}
	return wrap.Body
}

func paperIsLive(status any) bool {
	s, _ := status.(string)
	return s == paperStatusRunning || s == paperStatusCatchingUp
}

func TestShareToLibraryStartsPaperAndAttachesRuns(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_library"
	if _, err := NewStrategyStore(userID).Create("dual_ma", StrategyPlatformFinClaw, "from akquant import Strategy\nclass S(Strategy):\n    pass\n", ""); err != nil {
		t.Fatal(err)
	}
	if err := persistSubmittedBacktest(userID, "run-lib", "succeeded", "dual_ma", "class S", submitBacktestRequest{
		StrategyName: "dual_ma",
		InitialCash:  200000,
		Universe:     "picks",
		Symbols:      []string{"600000"},
		StartTime:    "2020-01-01",
		EndTime:      "2021-01-01",
	}); err != nil {
		t.Fatal(err)
	}

	srv := libraryFquantServer()
	defer srv.Close()
	engine, _ := libraryTestEngine(t, userID, srv.URL)

	body, _ := json.Marshal(shareStrategyRequest{StrategyName: "dual_ma", Title: "双均线", Summary: "市场展示"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/strategy-library", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("share status = %d body = %s", rec.Code, rec.Body.String())
	}
	created := decodeLibraryBody(t, rec.Body.Bytes())
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatalf("missing id: %+v", created)
	}
	paper, _ := created["paper"].(map[string]any)
	if paper == nil {
		t.Fatalf("expected paper session on share: %s", rec.Body.String())
	}
	if !paperIsLive(paper["status"]) {
		t.Fatalf("paper status = %#v", paper["status"])
	}
	if paper["universe"] != "picks" {
		t.Fatalf("paper universe = %#v, want copied from backtest", paper["universe"])
	}
	if paper["initial_cash"] != 200000.0 && paper["initial_cash"] != float64(200000) {
		t.Fatalf("paper cash = %#v", paper["initial_cash"])
	}
	sessions, err := listPaperSessions(libraryPaperOwnerID)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || sessions[0].LibraryEntryID != id {
		t.Fatalf("library paper sessions = %+v", sessions)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/strategy-library", nil)
	listRec := httptest.NewRecorder()
	engine.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status = %d body = %s", listRec.Code, listRec.Body.String())
	}
	listBody := decodeLibraryBody(t, listRec.Body.Bytes())
	entries, _ := listBody["entries"].([]any)
	if len(entries) != 1 {
		t.Fatalf("entries = %#v", listBody["entries"])
	}
	card, _ := entries[0].(map[string]any)
	if !paperIsLive(card["paper_status"]) {
		t.Fatalf("card paper_status = %#v", card["paper_status"])
	}
	if card["go_live"] == "" {
		t.Fatalf("card missing go_live: %#v", card)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/strategy-library/"+id, nil)
	getRec := httptest.NewRecorder()
	engine.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status = %d body = %s", getRec.Code, getRec.Body.String())
	}
	detail := decodeLibraryBody(t, getRec.Body.Bytes())
	runs, _ := detail["runs"].([]any)
	if len(runs) != 1 {
		t.Fatalf("runs = %#v", detail["runs"])
	}
	run, _ := runs[0].(map[string]any)
	if run["id"] != "run-lib" {
		t.Fatalf("run id = %#v", run["id"])
	}
	if detail["paper"] == nil {
		t.Fatalf("detail missing paper: %s", getRec.Body.String())
	}

	del := httptest.NewRequest(http.MethodDelete, "/api/v1/strategy-library/"+id, nil)
	delRec := httptest.NewRecorder()
	engine.ServeHTTP(delRec, del)
	if delRec.Code != http.StatusOK {
		t.Fatalf("delete status = %d body = %s", delRec.Code, delRec.Body.String())
	}
	left, err := listPaperSessions(libraryPaperOwnerID)
	if err != nil {
		t.Fatal(err)
	}
	if len(left) != 0 {
		t.Fatalf("paper leftover after unlist: %+v", left)
	}
}

func TestShareJoinQuantDoesNotStartPaper(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_library_jq"
	if _, err := NewStrategyStore(userID).Create("jq", StrategyPlatformJoinQuant, "def initialize(context):\n    pass\n", ""); err != nil {
		t.Fatal(err)
	}
	engine, _ := libraryTestEngine(t, userID, "http://127.0.0.1:9")
	body, _ := json.Marshal(shareStrategyRequest{StrategyName: "jq", Title: "聚宽策略"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/strategy-library", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("share status = %d body = %s", rec.Code, rec.Body.String())
	}
	created := decodeLibraryBody(t, rec.Body.Bytes())
	if _, ok := created["paper"]; ok {
		t.Fatalf("joinquant should not start paper: %s", rec.Body.String())
	}
	sessions, err := listPaperSessions(libraryPaperOwnerID)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Fatalf("unexpected paper: %+v", sessions)
	}
}

func TestPaperSchedulerUserIDsIncludesLibraryOwner(t *testing.T) {
	found := false
	for _, id := range paperSchedulerUserIDs() {
		if id == libraryPaperOwnerID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("scheduler must keep market showcase paper running")
	}
}
