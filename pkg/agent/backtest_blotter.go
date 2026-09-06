package agentruntime

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
)

const (
	defaultBlotterPage     = 1
	defaultBlotterPageSize = 20
	maxBlotterPageSize     = 100
)

type blotterPageQuery struct {
	Page     int
	PageSize int
	From     string
	To       string
	Symbol   string
	FillDay  string
	DaysOnly bool
	Full     bool
	Fills    bool
}

func parseBlotterPageQuery(page, pageSize, from, to, symbol, daysOnly string) blotterPageQuery {
	q := blotterPageQuery{
		Page:     atoiDefault(page, defaultBlotterPage),
		PageSize: atoiDefault(pageSize, defaultBlotterPageSize),
		From:     strings.TrimSpace(from),
		To:       strings.TrimSpace(to),
		Symbol:   strings.TrimSpace(symbol),
		DaysOnly: daysOnly == "1" || strings.EqualFold(strings.TrimSpace(daysOnly), "true"),
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = defaultBlotterPageSize
	}
	if q.PageSize > maxBlotterPageSize {
		q.PageSize = maxBlotterPageSize
	}
	return q
}

func atoiDefault(raw string, fallback int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}

func pageBlotterJSON(raw json.RawMessage, q blotterPageQuery) (json.RawMessage, error) {
	var env struct {
		Orders     []json.RawMessage `json:"orders"`
		Trades     []json.RawMessage `json:"trades"`
		Rebalances []map[string]any  `json:"rebalances"`
		Rejects    []map[string]any  `json:"rejects"`
		Logs       []json.RawMessage `json:"logs"`
		Indicators any               `json:"indicators"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, err
	}
	events := mergeBlotterEvents(env.Rebalances, env.Rejects)
	minTime, maxTime, symbols := blotterBounds(events)
	orders := parseBlotterOrders(env.Orders)
	actionDays := blotterActionDays(env.Orders)
	if env.Trades == nil {
		env.Trades = []json.RawMessage{}
	}
	if q.DaysOnly {
		out, err := json.Marshal(map[string]any{
			"action_days": actionDays,
			"total":       len(events),
			"min_time":    minTime,
			"max_time":    maxTime,
			"symbols":     symbols,
		})
		if err != nil {
			return nil, err
		}
		return out, nil
	}
	if q.Full && q.From == "" && q.To == "" && q.Symbol == "" && q.FillDay == "" {
		out, err := json.Marshal(map[string]any{
			"orders":      env.Orders,
			"trades":      env.Trades,
			"rebalances":  env.Rebalances,
			"rejects":     env.Rejects,
			"logs":        env.Logs,
			"indicators":  env.Indicators,
			"page":        1,
			"page_size":   len(events),
			"total":       len(events),
			"min_time":    minTime,
			"max_time":    maxTime,
			"symbols":     symbols,
			"action_days": actionDays,
		})
		if err != nil {
			return nil, err
		}
		return out, nil
	}
	filtered := make([]map[string]any, 0, len(events))
	for _, event := range events {
		if !matchBlotterEvent(event, q, orders) {
			continue
		}
		filtered = append(filtered, event)
	}
	total := len(filtered)
	page := filtered
	pageSize := total
	pageNo := 1
	if !q.Full {
		pageSize = q.PageSize
		pageNo = q.Page
		start := (q.Page - 1) * q.PageSize
		if start > total {
			start = total
		}
		end := start + q.PageSize
		if end > total {
			end = total
		}
		page = filtered[start:end]
	}
	rebalances := make([]map[string]any, 0, len(page))
	rejects := make([]map[string]any, 0)
	for _, event := range page {
		if asString(event["method"]) == "rejected" {
			rejects = append(rejects, map[string]any{
				"time":          event["time"],
				"symbol":        firstBlotterSymbol(event),
				"side":          blotterPlanString(event, "side"),
				"quantity":      blotterPlanValue(event, "quantity"),
				"reject_reason": firstNonEmpty(asString(event["reason"]), blotterPlanString(event, "reject_reason")),
				"status":        "rejected",
			})
			continue
		}
		rebalances = append(rebalances, event)
	}
	orderOut := env.Orders
	if !q.Full || q.From != "" || q.To != "" || q.Symbol != "" || q.FillDay != "" {
		orderOut = filterOrdersForEvents(env.Orders, page, q.Symbol, q.FillDay)
	}
	out, err := json.Marshal(map[string]any{
		"orders":      orderOut,
		"trades":      env.Trades,
		"rebalances":  rebalances,
		"rejects":     rejects,
		"page":        pageNo,
		"page_size":   pageSize,
		"total":       total,
		"min_time":    minTime,
		"max_time":    maxTime,
		"symbols":     symbols,
		"action_days": actionDays,
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func mergeBlotterEvents(rebalances, rejects []map[string]any) []map[string]any {
	covered := map[string]struct{}{}
	for _, row := range rebalances {
		if strings.ToLower(asString(row["status"])) != "rejected" {
			continue
		}
		day := blotterEventDay(row)
		for _, symbol := range blotterEventSymbols(row) {
			covered[day+"|"+symbol] = struct{}{}
		}
	}
	events := append([]map[string]any{}, rebalances...)
	for _, row := range rejects {
		day := dayKeyString(asString(row["time"]))
		symbol := asString(row["symbol"])
		if symbol != "" {
			if _, ok := covered[day+"|"+symbol]; ok {
				continue
			}
		}
		events = append(events, map[string]any{
			"time":   row["time"],
			"method": "rejected",
			"reason": firstNonEmpty(asString(row["reject_reason"]), asString(row["reason"])),
			"status": "rejected",
			"selected": func() []string {
				if symbol == "" {
					return []string{}
				}
				return []string{symbol}
			}(),
			"plan": map[string]any{
				"reject_reason": row["reject_reason"],
				"side":          row["side"],
				"quantity":      row["quantity"],
			},
		})
	}
	sort.SliceStable(events, func(i, j int) bool {
		return blotterEventDay(events[i]) > blotterEventDay(events[j])
	})
	return events
}

func matchBlotterEvent(row map[string]any, q blotterPageQuery, orders []blotterOrder) bool {
	if q.FillDay != "" {
		if !eventHasFillOnDay(row, q.FillDay, orders) {
			return false
		}
	} else {
		day := blotterEventDay(row)
		if q.From != "" && (day == "" || day < q.From) {
			return false
		}
		if q.To != "" && (day == "" || day > q.To) {
			return false
		}
	}
	if q.Symbol == "" {
		return true
	}
	for _, item := range blotterEventSymbols(row) {
		if item == q.Symbol {
			return true
		}
	}
	return false
}

func eventHasFillOnDay(row map[string]any, fillDay string, orders []blotterOrder) bool {
	if fillDay == "" {
		return false
	}
	signal := blotterEventDay(row)
	symbols := blotterEventSymbols(row)
	for _, order := range orders {
		if !order.filled {
			continue
		}
		if order.fillDay != fillDay {
			continue
		}
		if signal != "" && order.createdDay != signal {
			continue
		}
		if len(symbols) > 0 && !containsString(symbols, order.symbol) {
			continue
		}
		return true
	}
	return false
}

func filterOrdersForEvents(orders []json.RawMessage, events []map[string]any, symbol, fillDay string) []json.RawMessage {
	if len(orders) == 0 || len(events) == 0 {
		return []json.RawMessage{}
	}
	days := map[string]struct{}{}
	symbols := map[string]struct{}{}
	for _, event := range events {
		if day := blotterEventDay(event); day != "" {
			days[day] = struct{}{}
		}
		for _, item := range blotterEventSymbols(event) {
			symbols[item] = struct{}{}
		}
	}
	out := make([]json.RawMessage, 0)
	for _, raw := range orders {
		order := parseBlotterOrder(raw)
		if order.symbol == "" && order.createdDay == "" && order.fillDay == "" {
			continue
		}
		code := order.symbol
		if symbol != "" && code != symbol {
			continue
		}
		if fillDay != "" && order.fillDay != fillDay && order.createdDay != fillDay {
			continue
		}
		if len(symbols) > 0 && code != "" {
			if _, ok := symbols[code]; !ok {
				continue
			}
		}
		if len(days) > 0 {
			_, createdOK := days[order.createdDay]
			_, fillOK := days[order.fillDay]
			if order.createdDay != "" || order.fillDay != "" {
				if !createdOK && !fillOK {
					continue
				}
			}
		}
		out = append(out, raw)
	}
	return out
}

type blotterOrder struct {
	symbol     string
	createdDay string
	fillDay    string
	filled     bool
}

func parseBlotterOrders(raw []json.RawMessage) []blotterOrder {
	out := make([]blotterOrder, 0, len(raw))
	for _, item := range raw {
		order := parseBlotterOrder(item)
		if order.symbol == "" && order.createdDay == "" && order.fillDay == "" {
			continue
		}
		out = append(out, order)
	}
	return out
}

func parseBlotterOrder(raw json.RawMessage) blotterOrder {
	var order struct {
		Symbol         string   `json:"symbol"`
		Status         string   `json:"status"`
		CreatedAt      string   `json:"created_at"`
		UpdatedAt      string   `json:"updated_at"`
		Time           string   `json:"time"`
		FilledQuantity *float64 `json:"filled_quantity"`
		Quantity       *float64 `json:"quantity"`
		RejectReason   string   `json:"reject_reason"`
	}
	if err := json.Unmarshal(raw, &order); err != nil {
		return blotterOrder{}
	}
	created := firstNonEmpty(dayKeyString(order.CreatedAt), dayKeyString(order.Time))
	fill := firstNonEmpty(dayKeyString(order.UpdatedAt), created)
	qty := order.FilledQuantity
	if qty == nil {
		qty = order.Quantity
	}
	filled := strings.ToLower(strings.TrimSpace(order.Status)) == "filled" &&
		strings.TrimSpace(order.RejectReason) == "" &&
		(qty == nil || *qty > 0)
	return blotterOrder{
		symbol:     strings.TrimSpace(order.Symbol),
		createdDay: created,
		fillDay:    fill,
		filled:     filled,
	}
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func extractBlotterFills(raw json.RawMessage) (json.RawMessage, error) {
	var env struct {
		Orders     []json.RawMessage `json:"orders"`
		Trades     []json.RawMessage `json:"trades"`
		Rebalances []map[string]any  `json:"rebalances"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, err
	}
	filledOrders := make([]json.RawMessage, 0)
	parsed := make([]blotterOrder, 0)
	for _, item := range env.Orders {
		order := parseBlotterOrder(item)
		if !order.filled {
			continue
		}
		filledOrders = append(filledOrders, item)
		parsed = append(parsed, order)
	}
	rebalances := make([]map[string]any, 0)
	for _, event := range env.Rebalances {
		if eventHasAnyFill(event, parsed) {
			rebalances = append(rebalances, event)
		}
	}
	if env.Trades == nil {
		env.Trades = []json.RawMessage{}
	}
	return json.Marshal(map[string]any{
		"orders":      filledOrders,
		"trades":      env.Trades,
		"rebalances":  rebalances,
		"action_days": blotterActionDays(filledOrders),
	})
}

func eventHasAnyFill(row map[string]any, orders []blotterOrder) bool {
	signal := blotterEventDay(row)
	symbols := blotterEventSymbols(row)
	for _, order := range orders {
		if !order.filled {
			continue
		}
		if signal != "" && order.createdDay != signal {
			continue
		}
		if len(symbols) > 0 && !containsString(symbols, order.symbol) {
			continue
		}
		return true
	}
	return false
}

func blotterActionDays(orders []json.RawMessage) []string {
	seen := map[string]struct{}{}
	for _, raw := range orders {
		var order struct {
			Status         string   `json:"status"`
			CreatedAt      string   `json:"created_at"`
			UpdatedAt      string   `json:"updated_at"`
			Time           string   `json:"time"`
			FilledQuantity *float64 `json:"filled_quantity"`
			Quantity       *float64 `json:"quantity"`
			RejectReason   string   `json:"reject_reason"`
		}
		if err := json.Unmarshal(raw, &order); err != nil {
			continue
		}
		if strings.ToLower(strings.TrimSpace(order.Status)) != "filled" {
			continue
		}
		if strings.TrimSpace(order.RejectReason) != "" {
			continue
		}
		qty := order.FilledQuantity
		if qty == nil {
			qty = order.Quantity
		}
		if qty != nil && *qty <= 0 {
			continue
		}
		day := firstNonEmpty(dayKeyString(order.UpdatedAt), dayKeyString(order.CreatedAt), dayKeyString(order.Time))
		if day == "" {
			continue
		}
		seen[day] = struct{}{}
	}
	days := make([]string, 0, len(seen))
	for day := range seen {
		days = append(days, day)
	}
	sort.Strings(days)
	return days
}

func blotterBounds(events []map[string]any) (string, string, []string) {
	minTime := ""
	maxTime := ""
	seen := map[string]struct{}{}
	for _, event := range events {
		day := blotterEventDay(event)
		if day != "" {
			if minTime == "" || day < minTime {
				minTime = day
			}
			if maxTime == "" || day > maxTime {
				maxTime = day
			}
		}
		for _, symbol := range blotterEventSymbols(event) {
			seen[symbol] = struct{}{}
		}
	}
	symbols := make([]string, 0, len(seen))
	for symbol := range seen {
		symbols = append(symbols, symbol)
	}
	sort.Strings(symbols)
	return minTime, maxTime, symbols
}

func blotterEventDay(row map[string]any) string {
	return dayKeyString(asString(row["time"]))
}

func blotterEventSymbols(row map[string]any) []string {
	seen := map[string]struct{}{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value != "" {
			seen[value] = struct{}{}
		}
	}
	switch selected := row["selected"].(type) {
	case []any:
		for _, item := range selected {
			add(asString(item))
		}
	case []string:
		for _, item := range selected {
			add(item)
		}
	}
	if targets, ok := row["targets"].(map[string]any); ok {
		for key := range targets {
			if key != "scores" && key != "top_n" {
				add(key)
			}
		}
	}
	add(asString(row["symbol"]))
	out := make([]string, 0, len(seen))
	for symbol := range seen {
		out = append(out, symbol)
	}
	return out
}

func firstBlotterSymbol(row map[string]any) string {
	symbols := blotterEventSymbols(row)
	if len(symbols) == 0 {
		return ""
	}
	return symbols[0]
}

func blotterPlanString(row map[string]any, key string) string {
	plan, ok := row["plan"].(map[string]any)
	if !ok {
		return ""
	}
	return asString(plan[key])
}

func blotterPlanValue(row map[string]any, key string) any {
	plan, ok := row["plan"].(map[string]any)
	if !ok {
		return nil
	}
	return plan[key]
}

func dayKeyString(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) >= 10 {
		return raw[:10]
	}
	return raw
}
