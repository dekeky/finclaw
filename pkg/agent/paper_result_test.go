package agentruntime

import (
	"math"
	"testing"
)

func TestPaperMetricsSharpeRatio(t *testing.T) {
	curve := []paperEquityPoint{
		{Time: "2026-01-01", Equity: 100000},
		{Time: "2026-01-02", Equity: 101000},
		{Time: "2026-01-03", Equity: 100500},
		{Time: "2026-01-04", Equity: 102000},
	}
	metrics := paperMetricsFromCurve(curve, 100000, 0)
	sharpe, ok := metrics["sharpe_ratio"].(float64)
	if !ok || math.IsNaN(sharpe) || math.IsInf(sharpe, 0) {
		t.Fatalf("sharpe = %#v", metrics["sharpe_ratio"])
	}
	if _, ok := metrics["annualized_return"].(float64); !ok {
		t.Fatalf("annualized_return = %#v", metrics["annualized_return"])
	}
}

func TestPaperMetricsSharpeRatioFlatCurve(t *testing.T) {
	curve := []paperEquityPoint{
		{Time: "2026-01-01", Equity: 100000},
		{Time: "2026-01-02", Equity: 100000},
		{Time: "2026-01-03", Equity: 100000},
	}
	metrics := paperMetricsFromCurve(curve, 100000, 0)
	if _, ok := metrics["sharpe_ratio"]; ok {
		t.Fatalf("flat curve should not set sharpe: %#v", metrics)
	}
}

func TestSlicePaperResultFromGoLive(t *testing.T) {
	result := map[string]any{
		"equity_curve": []any{
			map[string]any{"time": "2026-01-01", "equity": 100000.0},
			map[string]any{"time": "2026-01-10", "equity": 101000.0},
			map[string]any{"time": "2026-01-20", "equity": 110000.0},
		},
		"trades": []any{
			map[string]any{"time": "2026-01-05", "symbol": "600000"},
			map[string]any{"time": "2026-01-15", "symbol": "000001"},
		},
		"action_days": []any{"2026-01-05", "2026-01-15"},
	}
	sliced := slicePaperResult(result, "2026-01-10", 100000)
	curve := parsePaperEquityCurve(sliced["equity_curve"])
	if len(curve) != 2 || curve[0].Time != "2026-01-10" || curve[1].Equity != 110000 {
		t.Fatalf("curve = %+v", curve)
	}
	trades, _ := sliced["trades"].([]any)
	if len(trades) != 1 {
		t.Fatalf("trades = %#v", trades)
	}
	metrics := asMap(sliced["metrics"])
	if got := asFloat(metrics["total_return_pct"]); got < 8.8 || got > 9.0 {
		t.Fatalf("return = %v", got)
	}
	if got := asFloat(metrics["total_pnl"]); got != 9000 {
		t.Fatalf("pnl = %v", got)
	}
}

func TestPaperMetricsEmptyCurve(t *testing.T) {
	metrics := paperMetricsFromCurve(nil, 50000, 0)
	if asFloat(metrics["end_market_value"]) != 50000 {
		t.Fatalf("metrics = %#v", metrics)
	}
}

func TestUniquePaperName(t *testing.T) {
	used := map[string]struct{}{"双均线": {}, "双均线 2": {}}
	if got := uniquePaperName(used, "双均线"); got != "双均线 3" {
		t.Fatalf("got %q", got)
	}
}

func TestSlicePaperResultDropsWarmupRebalance(t *testing.T) {
	result := map[string]any{
		"equity_curve": []any{
			map[string]any{"time": "2026-08-24", "equity": 98000.0},
			map[string]any{"time": "2026-09-15", "equity": 97000.0},
		},
		"rebalances": []any{
			map[string]any{"time": "2026-08-14", "targets": map[string]any{"000001": 0.5}},
			map[string]any{"time": "2026-08-24", "targets": map[string]any{"000063": 0.4}, "reason": "warmup"},
		},
		"holdings": []any{
			map[string]any{"time": "2026-09-15", "symbol": "000063", "quantity": 100.0},
		},
		"orders": []any{
			map[string]any{"created_at": "2026-08-24", "symbol": "000063", "status": "filled"},
		},
	}
	sliced := slicePaperResult(result, "2026-09-16", 100000)
	if rebalances, _ := sliced["rebalances"].([]any); len(rebalances) != 0 {
		t.Fatalf("warmup rebalances = %#v", rebalances)
	}
	if holdings, _ := sliced["holdings"].([]any); len(holdings) != 0 {
		t.Fatalf("warmup holdings = %#v", holdings)
	}
	if orders, _ := sliced["orders"].([]any); len(orders) != 0 {
		t.Fatalf("warmup orders = %#v", orders)
	}
}

func TestPaperEngineStartIsGoLive(t *testing.T) {
	if got := paperEngineStart("2026-09-16"); got != "2026-09-16" {
		t.Fatalf("got %q", got)
	}
}

func TestLastPaperBarDate(t *testing.T) {
	if got := lastPaperBarDate(map[string]any{
		"equity_curve": []any{
			map[string]any{"time": "2026-09-11", "equity": 100000.0},
			map[string]any{"time": "2026-09-15", "equity": 99000.0},
		},
	}); got != "2026-09-15" {
		t.Fatalf("got %q", got)
	}
	if got := lastPaperBarDate(map[string]any{}); got != "" {
		t.Fatalf("empty = %q", got)
	}
}
