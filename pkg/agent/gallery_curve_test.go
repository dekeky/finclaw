package agentruntime

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCompactEquityCurveKeepsEnds(t *testing.T) {
	raw := make([]any, 0, 200)
	for i := 0; i < 200; i++ {
		day := time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC).AddDate(0, 0, i)
		raw = append(raw, map[string]any{
			"time":   day.Format("2006-01-02"),
			"equity": 100000.0 + float64(i),
		})
	}
	out := compactEquityCurve(raw, 80)
	if len(out) > 80 {
		t.Fatalf("len = %d", len(out))
	}
	if len(out) < 2 {
		t.Fatal("expected sampled curve")
	}
	if out[0]["time"] != "2020-01-02" {
		t.Fatalf("first = %v", out[0])
	}
	if out[len(out)-1]["time"] != "2020-07-19" {
		t.Fatalf("last = %v", out[len(out)-1])
	}
}

func TestLoadLocalRunListIncludesEquityCurve(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	raw := json.RawMessage(`{
		"id":"run-curve",
		"name":"早盘回测",
		"status":"succeeded",
		"strategy_name":"dual_ma",
		"updated_at":"2026-09-05T01:00:00Z",
		"request":{"strategy_name":"dual_ma","initial_cash":100000},
		"result":{"equity_curve":[{"time":"2020-01-02","equity":100000},{"time":"2020-01-03","equity":110000}]}
	}`)
	if err := persistBacktestRun("u_curve", raw); err != nil {
		t.Fatal(err)
	}
	items := loadLocalRunList("u_curve")
	if len(items) != 1 {
		t.Fatalf("items = %d", len(items))
	}
	if !bytes.Contains(items[0], []byte(`"equity_curve"`)) || !bytes.Contains(items[0], []byte("110000")) {
		t.Fatalf("list item missing curve: %s", items[0])
	}

	failed := json.RawMessage(`{
		"id":"run-fail",
		"name":"失败回测",
		"status":"failed",
		"strategy_name":"dual_ma",
		"updated_at":"2026-09-06T01:00:00Z",
		"result":{"equity_curve":[{"time":"2020-01-02","equity":100000},{"time":"2020-01-03","equity":90000}]}
	}`)
	if err := persistBacktestRun("u_curve", failed); err != nil {
		t.Fatal(err)
	}
	items = loadLocalRunList("u_curve")
	for _, item := range items {
		var top map[string]any
		if json.Unmarshal(item, &top) != nil {
			t.Fatal("unmarshal")
		}
		if top["id"] == "run-fail" && top["equity_curve"] != nil {
			t.Fatalf("failed run should omit curve: %s", item)
		}
	}
}

func TestPaperListIncludesEquityCurve(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_paper_curve"
	now := time.Now().UTC().Format(time.RFC3339)
	if err := savePaperSession(userID, paperSession{
		ID:           "p1",
		Name:         "dual_ma",
		Status:       paperStatusPaused,
		StrategyName: "dual_ma",
		InitialCash:  100000,
		Equity:       101000,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatal(err)
	}
	if err := savePaperLatest(userID, "p1", map[string]any{
		"equity_curve": []any{
			map[string]any{"time": "2026-09-10", "equity": 100000.0},
			map[string]any{"time": "2026-09-11", "equity": 101000.0},
		},
		"trades": []any{map[string]any{"symbol": "600000"}},
	}); err != nil {
		t.Fatal(err)
	}

	engine := paperTestEngine(t, userID, "http://127.0.0.1:9")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/paper/sessions", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"equity_curve"`)) || !bytes.Contains(rec.Body.Bytes(), []byte("101000")) {
		t.Fatalf("list missing curve: %s", rec.Body.String())
	}
	if bytes.Contains(rec.Body.Bytes(), []byte(`"trades"`)) {
		t.Fatalf("list should not include full result: %s", rec.Body.String())
	}
}
