package agentruntime

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestPageBlotterJSON(t *testing.T) {
	events := make([]map[string]any, 0, 25)
	for i := 1; i <= 25; i++ {
		day := "2020-01-02"
		if i > 20 {
			day = "2020-02-03"
		}
		symbol := "600000"
		if i%5 == 0 {
			symbol = "000001"
		}
		events = append(events, map[string]any{
			"time":     day,
			"method":   "rebalance_weights",
			"selected": []string{symbol},
			"status":   "submitted",
		})
	}
	raw, err := json.Marshal(map[string]any{
		"orders": []map[string]any{
			{"symbol": "600000", "created_at": "2020-01-02", "updated_at": "2020-01-02", "status": "filled"},
			{"symbol": "000001", "created_at": "2020-02-03", "updated_at": "2020-02-03", "status": "filled"},
			{"symbol": "600519", "created_at": "2020-03-01", "status": "rejected"},
		},
		"trades":     []map[string]any{{"symbol": "SHOULD_RETURN_TRADE", "net_pnl": 12.5}},
		"rebalances": events,
		"rejects":    []map[string]any{},
		"logs":       []map[string]any{{"message": "SHOULD_NOT_RETURN"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	first, err := pageBlotterJSON(raw, parseBlotterPageQuery("", "", "", "", "", ""))
	if err != nil {
		t.Fatal(err)
	}
	var page map[string]any
	if err := json.Unmarshal(first, &page); err != nil {
		t.Fatal(err)
	}
	if asInt(page["page"]) != 1 || asInt(page["page_size"]) != 20 || asInt(page["total"]) != 25 {
		t.Fatalf("page meta = %+v", page)
	}
	rebalances, _ := page["rebalances"].([]any)
	if len(rebalances) != 20 {
		t.Fatalf("first page size = %d", len(rebalances))
	}
	if _, ok := page["logs"]; ok {
		t.Fatal("paged blotter should omit logs")
	}
	if text, _ := json.Marshal(page["trades"]); !bytes.Contains(text, []byte("SHOULD_RETURN_TRADE")) {
		t.Fatalf("paged blotter should keep trades for symbol pnl, got %s", text)
	}
	orders, _ := page["orders"].([]any)
	if len(orders) != 2 {
		t.Fatalf("page orders = %#v", orders)
	}
	days, _ := page["action_days"].([]any)
	if len(days) != 2 {
		t.Fatalf("action_days = %#v", days)
	}

	meta, err := pageBlotterJSON(raw, parseBlotterPageQuery("", "", "", "", "", "1"))
	if err != nil {
		t.Fatal(err)
	}
	page = map[string]any{}
	if err := json.Unmarshal(meta, &page); err != nil {
		t.Fatal(err)
	}
	if _, ok := page["rebalances"]; ok {
		t.Fatal("days_only should omit rebalances")
	}
	days, _ = page["action_days"].([]any)
	if len(days) != 2 {
		t.Fatalf("days_only action_days = %#v", days)
	}

	second, err := pageBlotterJSON(raw, parseBlotterPageQuery("2", "20", "", "", "", ""))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(second, &page); err != nil {
		t.Fatal(err)
	}
	rebalances, _ = page["rebalances"].([]any)
	if asInt(page["page"]) != 2 || len(rebalances) != 5 {
		t.Fatalf("second page = %+v", page)
	}

	filtered, err := pageBlotterJSON(raw, parseBlotterPageQuery("1", "20", "2020-02-01", "2020-02-28", "000001", ""))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(filtered, &page); err != nil {
		t.Fatal(err)
	}
	rebalances, _ = page["rebalances"].([]any)
	if asInt(page["total"]) != 1 || len(rebalances) != 1 {
		t.Fatalf("filtered page = %+v", page)
	}
}

func TestBlotterFullReturnsAllEventsAndOrders(t *testing.T) {
	events := make([]map[string]any, 0, 25)
	for i := 1; i <= 25; i++ {
		day := "2020-01-02"
		if i > 20 {
			day = "2020-02-03"
		}
		events = append(events, map[string]any{
			"time":     day,
			"method":   "rebalance_weights",
			"selected": []string{"600000"},
			"status":   "submitted",
		})
	}
	raw, err := json.Marshal(map[string]any{
		"orders": []map[string]any{
			{"symbol": "600000", "created_at": "2020-01-02", "updated_at": "2020-01-03", "status": "filled", "filled_quantity": 100},
			{"symbol": "000001", "created_at": "2020-02-03", "updated_at": "2020-02-04", "status": "filled", "filled_quantity": 50},
		},
		"rebalances": events,
	})
	if err != nil {
		t.Fatal(err)
	}
	q := parseBlotterPageQuery("", "", "", "", "", "")
	q.Full = true
	out, err := pageBlotterJSON(raw, q)
	if err != nil {
		t.Fatal(err)
	}
	var page map[string]any
	if err := json.Unmarshal(out, &page); err != nil {
		t.Fatal(err)
	}
	rebalances, _ := page["rebalances"].([]any)
	orders, _ := page["orders"].([]any)
	if asInt(page["total"]) != 25 || len(rebalances) != 25 {
		t.Fatalf("full events = total=%v rows=%d", page["total"], len(rebalances))
	}
	if len(orders) != 2 {
		t.Fatalf("full should return every order, got %#v", orders)
	}
}

func TestBlotterFullPassesThroughTradesAndRejects(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"orders": []map[string]any{
			{"symbol": "601012", "created_at": "2020-02-06", "updated_at": "2020-02-07", "status": "filled", "filled_quantity": 6300, "avg_price": 15.0},
		},
		"trades": []map[string]any{
			{"symbol": "601012", "net_pnl": 3909.75, "pnl": 4068.18},
		},
		"rebalances": []map[string]any{
			{
				"time":     "2020-02-06",
				"method":   "order_target_percent",
				"reason":   "短均线上穿且 PE=26.4<40",
				"targets":  map[string]any{"601012": 0.95},
				"status":   "submitted",
				"order_ids": []string{"oid-1"},
			},
		},
		"rejects": []map[string]any{
			{"time": "2020-02-13", "symbol": "600519", "side": "buy", "quantity": 100, "reject_reason": "insufficient cash", "status": "rejected"},
		},
		"logs": []map[string]any{{"time": "2020-02-06", "message": "buy"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	q := parseBlotterPageQuery("", "", "", "", "", "")
	q.Full = true
	out, err := pageBlotterJSON(raw, q)
	if err != nil {
		t.Fatal(err)
	}
	var page map[string]any
	if err := json.Unmarshal(out, &page); err != nil {
		t.Fatal(err)
	}
	trades, _ := page["trades"].([]any)
	if len(trades) != 1 {
		t.Fatalf("full trades = %#v", trades)
	}
	trade, _ := trades[0].(map[string]any)
	if asString(trade["symbol"]) != "601012" || asInt(trade["net_pnl"]) == 0 {
		t.Fatalf("trade pnl missing: %#v", trade)
	}
	rebalances, _ := page["rebalances"].([]any)
	if len(rebalances) != 1 {
		t.Fatalf("full rebalances = %#v", rebalances)
	}
	row, _ := rebalances[0].(map[string]any)
	if asString(row["reason"]) != "短均线上穿且 PE=26.4<40" || asString(row["method"]) != "order_target_percent" {
		t.Fatalf("rebalance fields stripped: %#v", row)
	}
	rejects, _ := page["rejects"].([]any)
	if len(rejects) != 1 {
		t.Fatalf("full rejects = %#v", rejects)
	}
	reject, _ := rejects[0].(map[string]any)
	if asString(reject["symbol"]) != "600519" || asString(reject["reject_reason"]) != "insufficient cash" {
		t.Fatalf("reject fields stripped: %#v", reject)
	}
}

func TestBlotterFillDayJoinsSignalAndFill(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"orders": []map[string]any{
			{"symbol": "600900", "created_at": "2023-04-25T08:00:00+08:00", "updated_at": "2023-04-26T08:00:00+08:00", "status": "filled", "filled_quantity": 9600},
			{"symbol": "601088", "created_at": "2023-04-25T08:00:00+08:00", "updated_at": "2023-04-26T08:00:00+08:00", "status": "filled", "filled_quantity": 7900},
		},
		"rebalances": []map[string]any{
			{"time": "2023-04-25", "method": "order_target_percent", "status": "submitted", "targets": map[string]any{"600900": 0.0}},
			{"time": "2023-04-25", "method": "order_target_percent", "status": "submitted", "targets": map[string]any{"601088": 0.95}},
			{"time": "2023-04-26", "method": "order_target_percent", "status": "submitted", "targets": map[string]any{"600028": 0.95}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Chart markers use fill days. Clicking 2023-04-26 must return the T-day
	// signals that actually filled, not the next day's unfilled targets.
	q := parseBlotterPageQuery("1", "100", "", "", "", "")
	q.FillDay = "2023-04-26"
	out, err := pageBlotterJSON(raw, q)
	if err != nil {
		t.Fatal(err)
	}
	var page map[string]any
	if err := json.Unmarshal(out, &page); err != nil {
		t.Fatal(err)
	}
	rebalances, _ := page["rebalances"].([]any)
	orders, _ := page["orders"].([]any)
	if asInt(page["total"]) != 2 || len(rebalances) != 2 {
		t.Fatalf("fill_day events = total=%v rows=%#v", page["total"], rebalances)
	}
	if len(orders) != 2 {
		t.Fatalf("fill_day orders = %#v", orders)
	}
	for _, item := range rebalances {
		row, _ := item.(map[string]any)
		if asString(row["time"]) != "2023-04-25" {
			t.Fatalf("fill_day should return signal-day events, got %#v", row)
		}
	}

	// Same-day from/to stays signal-day based so the log filter is unchanged.
	signal, err := pageBlotterJSON(raw, parseBlotterPageQuery("1", "100", "2023-04-26", "2023-04-26", "", ""))
	if err != nil {
		t.Fatal(err)
	}
	page = map[string]any{}
	if err := json.Unmarshal(signal, &page); err != nil {
		t.Fatal(err)
	}
	rebalances, _ = page["rebalances"].([]any)
	if asInt(page["total"]) != 1 || len(rebalances) != 1 {
		t.Fatalf("signal-day filter = %+v", page)
	}

	// Viewing the signal day still needs the T+1 fill attached.
	prior, err := pageBlotterJSON(raw, parseBlotterPageQuery("1", "100", "2023-04-25", "2023-04-25", "", ""))
	if err != nil {
		t.Fatal(err)
	}
	page = map[string]any{}
	if err := json.Unmarshal(prior, &page); err != nil {
		t.Fatal(err)
	}
	orders, _ = page["orders"].([]any)
	if asInt(page["total"]) != 2 || len(orders) != 2 {
		t.Fatalf("signal-day should include T+1 fills, got total=%v orders=%#v", page["total"], orders)
	}
}

func TestBlotterActionDaysFilledOnly(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"orders": []map[string]any{
			{"symbol": "600000", "created_at": "2020-01-02", "updated_at": "2020-01-03", "status": "filled", "filled_quantity": 100},
			{"symbol": "000001", "created_at": "2020-02-03", "status": "rejected", "filled_quantity": 0},
			{"symbol": "600519", "created_at": "2020-03-01", "status": "submitted"},
			{"symbol": "000002", "created_at": "2024-06-11", "filled_quantity": 0},
			{"symbol": "000003", "created_at": "2024-06-11", "status": "filled", "filled_quantity": 0, "reject_reason": "insufficient cash"},
		},
		"rebalances": []map[string]any{
			{"time": "2020-01-02", "method": "rebalance_weights", "status": "submitted"},
			{"time": "2020-02-03", "method": "rebalance_weights", "status": "noop"},
			{"time": "2020-04-01", "method": "record_rebalance", "status": "noted"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	out, err := pageBlotterJSON(raw, parseBlotterPageQuery("", "", "", "", "", "1"))
	if err != nil {
		t.Fatal(err)
	}
	var page map[string]any
	if err := json.Unmarshal(out, &page); err != nil {
		t.Fatal(err)
	}
	days, _ := page["action_days"].([]any)
	if len(days) != 1 || days[0] != "2020-01-03" {
		t.Fatalf("filled action_days = %#v", days)
	}
}

func TestExtractBlotterFillsKeepsFilledOnly(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"orders": []map[string]any{
			{"symbol": "600000", "created_at": "2020-01-02", "updated_at": "2020-01-03", "status": "filled", "filled_quantity": 100},
			{"symbol": "000001", "created_at": "2020-02-03", "status": "rejected", "reject_reason": "insufficient cash"},
			{"symbol": "600519", "created_at": "2020-03-01", "status": "submitted"},
		},
		"trades": []map[string]any{
			{"symbol": "600000", "net_pnl": 12.5},
		},
		"rebalances": []map[string]any{
			{"time": "2020-01-02", "method": "order_target_percent", "status": "submitted", "targets": map[string]any{"600000": 0.95}, "order_ids": []string{"oid-fill"}},
			{"time": "2020-02-03", "method": "order_target_percent", "status": "submitted", "targets": map[string]any{"000001": 0.95}, "order_ids": []string{"oid-reject"}},
			{"time": "2020-04-01", "method": "record_rebalance", "status": "noted"},
		},
		"rejects": []map[string]any{
			{"time": "2020-02-03", "symbol": "000001", "reject_reason": "insufficient cash", "status": "rejected"},
		},
		"logs": []map[string]any{{"message": "SHOULD_NOT_KEEP"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	out, err := extractBlotterFills(raw)
	if err != nil {
		t.Fatal(err)
	}
	var page map[string]any
	if err := json.Unmarshal(out, &page); err != nil {
		t.Fatal(err)
	}
	if _, ok := page["rejects"]; ok {
		t.Fatal("fills should omit rejects")
	}
	if _, ok := page["logs"]; ok {
		t.Fatal("fills should omit logs")
	}
	orders, _ := page["orders"].([]any)
	if len(orders) != 1 {
		t.Fatalf("filled orders = %#v", orders)
	}
	rebalances, _ := page["rebalances"].([]any)
	if len(rebalances) != 1 {
		t.Fatalf("filled rebalances = %#v", rebalances)
	}
	row, _ := rebalances[0].(map[string]any)
	if asString(row["time"]) != "2020-01-02" {
		t.Fatalf("kept rebalance = %#v", row)
	}
	days, _ := page["action_days"].([]any)
	if len(days) != 1 || days[0] != "2020-01-03" {
		t.Fatalf("fills action_days = %#v", days)
	}
	trades, _ := page["trades"].([]any)
	if len(trades) != 1 {
		t.Fatalf("fills should keep trades: %#v", trades)
	}
}

func asInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	default:
		return 0
	}
}
