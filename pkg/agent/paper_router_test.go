package agentruntime

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func paperTestEngine(t *testing.T, userID, fquantURL string) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userId", userID)
		c.Next()
	})
	NewPaperRouter(engine, func(c *gin.Context) { c.Next() }, fquantURL).ConfigRouter()
	return engine
}

func TestCreatePaperRejectsJoinQuant(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_paper"
	if _, err := NewStrategyStore(userID).Create("jq", StrategyPlatformJoinQuant, "def initialize(context):\n    pass\n", ""); err != nil {
		t.Fatal(err)
	}
	engine := paperTestEngine(t, userID, "http://127.0.0.1:9")
	body, _ := json.Marshal(createPaperRequest{StrategyName: "jq", Universe: "picks", Symbols: []string{"600000"}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/paper/sessions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
}

func TestPaperSessionCRUD(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	origPoll := paperPollInterval
	paperPollInterval = time.Millisecond
	t.Cleanup(func() { paperPollInterval = origPoll })
	userID := "u_paper"
	if _, err := NewStrategyStore(userID).Create("dual_ma", StrategyPlatformFinClaw, "from akquant import Strategy\nclass S(Strategy):\n    pass\n", ""); err != nil {
		t.Fatal(err)
	}

	var runHits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/strategies/dual_ma"):
			http.Error(w, `{"detail":"not found"}`, http.StatusNotFound)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/strategies/source"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"name":"dual_ma"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/market/bars":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"code":"600000","name":"浦发","series":[{"symbol":"600000","time":"2026-09-11","close":10}]}]}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/runs"):
			runHits++
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"paper-run-1","status":"queued"}`))
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/runs/paper-run-1"):
			w.Header().Set("Content-Type", "application/json")
			if strings.HasSuffix(r.URL.Path, "/blotter") {
				_, _ = w.Write([]byte(`{"orders":[],"trades":[{"time":"2026-09-11","symbol":"600000"}],"rebalances":[]}`))
				return
			}
			if strings.HasSuffix(r.URL.Path, "/positions") {
				_, _ = w.Write([]byte(`{"items":[{"symbol":"600000","quantity":100,"time":"2026-09-11"}]}`))
				return
			}
			_, _ = w.Write([]byte(`{"id":"paper-run-1","status":"succeeded","result":{"equity_curve":[{"time":"2026-09-11","equity":101000}],"metrics":{"total_return_pct":1}}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	engine := paperTestEngine(t, userID, srv.URL)
	body, _ := json.Marshal(createPaperRequest{
		StrategyName: "dual_ma",
		Universe:     "picks",
		Symbols:      []string{"600000"},
		InitialCash:  100000,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/paper/sessions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d body = %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Body struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"body"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Body.ID == "" || created.Body.Name != "dual_ma" {
		t.Fatalf("created = %+v", created.Body)
	}

	deadline := time.Now().Add(2 * time.Second)
	var status string
	for time.Now().Before(deadline) {
		get := httptest.NewRequest(http.MethodGet, "/api/v1/paper/sessions/"+created.Body.ID, nil)
		out := httptest.NewRecorder()
		engine.ServeHTTP(out, get)
		if out.Code != http.StatusOK {
			t.Fatalf("get status = %d body = %s", out.Code, out.Body.String())
		}
		var payload struct {
			Body struct {
				Status      string         `json:"status"`
				LastBarDate string         `json:"last_bar_date"`
				Equity      float64        `json:"equity"`
				Result      map[string]any `json:"result"`
			} `json:"body"`
		}
		_ = json.Unmarshal(out.Body.Bytes(), &payload)
		status = payload.Body.Status
		if status == paperStatusRunning && payload.Body.LastBarDate == "2026-09-11" && payload.Body.Equity == 101000 {
			if payload.Body.Result == nil {
				t.Fatal("expected sliced result")
			}
			break
		}
		if status == paperStatusFailed {
			t.Fatalf("sync failed: %s", out.Body.String())
		}
		time.Sleep(20 * time.Millisecond)
	}
	if status != paperStatusRunning {
		t.Fatalf("status stayed %q, runHits=%d", status, runHits)
	}

	pause := httptest.NewRequest(http.MethodPost, "/api/v1/paper/sessions/"+created.Body.ID+"/pause", nil)
	out := httptest.NewRecorder()
	engine.ServeHTTP(out, pause)
	if out.Code != http.StatusOK || !bytes.Contains(out.Body.Bytes(), []byte(`"paused"`)) {
		t.Fatalf("pause = %d %s", out.Code, out.Body.String())
	}

	renameBody, _ := json.Marshal(renamePaperRequest{Name: "双均线模拟"})
	rename := httptest.NewRequest(http.MethodPatch, "/api/v1/paper/sessions/"+created.Body.ID, bytes.NewReader(renameBody))
	rename.Header.Set("Content-Type", "application/json")
	out = httptest.NewRecorder()
	engine.ServeHTTP(out, rename)
	if out.Code != http.StatusOK || !bytes.Contains(out.Body.Bytes(), []byte("双均线模拟")) {
		t.Fatalf("rename = %d %s", out.Code, out.Body.String())
	}

	del := httptest.NewRequest(http.MethodDelete, "/api/v1/paper/sessions/"+created.Body.ID, nil)
	out = httptest.NewRecorder()
	engine.ServeHTTP(out, del)
	if out.Code != http.StatusOK {
		t.Fatalf("delete = %d %s", out.Code, out.Body.String())
	}
	get := httptest.NewRequest(http.MethodGet, "/api/v1/paper/sessions/"+created.Body.ID, nil)
	out = httptest.NewRecorder()
	engine.ServeHTTP(out, get)
	if out.Code != http.StatusNotFound {
		t.Fatalf("get after delete = %d", out.Code)
	}
}

func TestCreatePaperFromBacktestRun(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_paper_run"
	if _, err := NewStrategyStore(userID).Create("dual_ma", StrategyPlatformFinClaw, "from akquant import Strategy\nclass S(Strategy):\n    pass\n", ""); err != nil {
		t.Fatal(err)
	}
	comm := 0.0003
	if err := persistSubmittedBacktest(userID, "run-from", "succeeded", "dual_ma", "class S", submitBacktestRequest{
		StrategyName:   "dual_ma",
		InitialCash:    200000,
		Universe:       "picks",
		Symbols:        []string{"600000"},
		CommissionRate: &comm,
	}); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/market/bars" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[{"code":"600000","name":"x","series":[{"time":"2026-09-11","close":1}]}]}`))
			return
		}
		if r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/strategies/") {
			http.Error(w, `{"detail":"not found"}`, http.StatusNotFound)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/strategies/source") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"name":"dual_ma"}`)
			return
		}
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/runs") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"id":"x","status":"queued"}`)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	engine := paperTestEngine(t, userID, srv.URL)
	body, _ := json.Marshal(createPaperRequest{FromRunID: "run-from"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/paper/sessions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"initial_cash":200000`)) {
		t.Fatalf("did not copy cash: %s", rec.Body.String())
	}
}
