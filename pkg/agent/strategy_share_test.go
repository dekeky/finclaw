package agentruntime

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSnapshotStrategyShareRuns(t *testing.T) {
	t.Setenv("FINCLAW_HOME", t.TempDir())
	userID := "u_share"
	raw := json.RawMessage(`{
		"id":"run-share",
		"name":"分享回测",
		"status":"succeeded",
		"strategy_name":"dual_ma",
		"updated_at":"2026-09-05T01:00:00Z",
		"request":{"strategy_name":"dual_ma","start_time":"2020-01-01","end_time":"2021-01-01","initial_cash":100000,"universe":"picks","symbols":["600000"]},
		"result":{"metrics":{"total_return_pct":0.12},"trades":[]},
		"source":"class S(Strategy): pass\n"
	}`)
	if err := persistBacktestRun(userID, raw); err != nil {
		t.Fatal(err)
	}
	if err := persistBacktestBlotterFills(userID, "run-share", json.RawMessage(`{
		"orders":[{"symbol":"600000","status":"filled"}],
		"trades":[{"symbol":"600000"}],
		"rebalances":[{"time":"2020-01-06","method":"order_target_percent","status":"submitted"}],
		"action_days":["2020-01-06"]
	}`)); err != nil {
		t.Fatal(err)
	}
	if err := persistBacktestPositions(userID, "run-share", json.RawMessage(`{
		"items":[{"time":"2020-01-06","symbol":"600000","quantity":100}]
	}`)); err != nil {
		t.Fatal(err)
	}

	runs, err := snapshotStrategyShareRuns(userID, "dual_ma", []string{"run-share", "run-share", ""})
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 {
		t.Fatalf("got %d runs", len(runs))
	}
	var snap map[string]any
	if err := json.Unmarshal(runs[0], &snap); err != nil {
		t.Fatal(err)
	}
	result := asMap(snap["result"])
	if len(asSlice(result["rebalances"])) != 1 {
		t.Fatalf("rebalances = %#v", result["rebalances"])
	}
	if len(asSlice(result["holdings"])) != 1 {
		t.Fatalf("holdings = %#v", result["holdings"])
	}
	if !ShareRunsAllowSymbol([]any{snap}, "600000") {
		t.Fatal("expected 600000 allowed")
	}
	if ShareRunsAllowSymbol([]any{snap}, "000001") {
		t.Fatal("did not expect 000001")
	}
	start, end := ShareRunsDateRange([]any{snap})
	if start != "2020-01-01" || end != "2021-01-01" {
		t.Fatalf("range %q %q", start, end)
	}

	if _, err := snapshotStrategyShareRuns(userID, "other", []string{"run-share"}); err == nil || !strings.Contains(err.Error(), "does not belong") {
		t.Fatalf("expected strategy mismatch, got %v", err)
	}
	if _, err := snapshotStrategyShareRuns(userID, "dual_ma", []string{"missing"}); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected missing run, got %v", err)
	}
}

func asSlice(v any) []any {
	items, _ := v.([]any)
	return items
}
