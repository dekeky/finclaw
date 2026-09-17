package agentruntime

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

func paperDayKey(v any) string {
	raw := strings.TrimSpace(asString(v))
	if raw == "" {
		return ""
	}
	if len(raw) >= 10 && raw[4] == '-' && raw[7] == '-' {
		return raw[:10]
	}
	if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return parsed.Format("2006-01-02")
	}
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed.Format("2006-01-02")
	}
	return raw
}

func paperEventDay(row map[string]any) string {
	if row == nil {
		return ""
	}
	for _, key := range []string{"time", "created_at", "date", "fill_day", "updated_at"} {
		if day := paperDayKey(row[key]); day != "" {
			return day
		}
	}
	return ""
}

func paperOnOrAfter(day, goLive string) bool {
	day = paperDayKey(day)
	goLive = paperDayKey(goLive)
	if goLive == "" {
		return true
	}
	if day == "" {
		return false
	}
	return day >= goLive
}

type paperEquityPoint struct {
	Time   string
	Equity float64
}

func parsePaperEquityCurve(raw any) []paperEquityPoint {
	list, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]paperEquityPoint, 0, len(list))
	for _, item := range list {
		row := asMap(item)
		if row == nil {
			continue
		}
		day := paperDayKey(row["time"])
		if day == "" {
			continue
		}
		equity, ok := asFloat64OK(row["equity"])
		if !ok {
			continue
		}
		out = append(out, paperEquityPoint{Time: day, Equity: equity})
	}
	return out
}

func slicePaperEquity(curve []paperEquityPoint, goLive string) []paperEquityPoint {
	if len(curve) == 0 {
		return nil
	}
	out := make([]paperEquityPoint, 0, len(curve))
	for _, point := range curve {
		if paperOnOrAfter(point.Time, goLive) {
			out = append(out, point)
		}
	}
	return out
}

func filterPaperRows(raw any, goLive string) []any {
	list, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]any, 0, len(list))
	for _, item := range list {
		row := asMap(item)
		if row == nil {
			out = append(out, item)
			continue
		}
		day := paperEventDay(row)
		if day == "" || paperOnOrAfter(day, goLive) {
			out = append(out, item)
		}
	}
	return out
}

func filterPaperDayList(raw any, goLive string) []any {
	list, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]any, 0, len(list))
	for _, item := range list {
		day := paperDayKey(item)
		if day == "" || paperOnOrAfter(day, goLive) {
			out = append(out, item)
		}
	}
	return out
}

func slicePaperResult(result map[string]any, goLive string, initialCash float64) map[string]any {
	if result == nil {
		result = map[string]any{}
	}
	sliced := make(map[string]any, len(result)+4)
	for key, value := range result {
		sliced[key] = value
	}
	curve := slicePaperEquity(parsePaperEquityCurve(result["equity_curve"]), goLive)
	points := make([]any, 0, len(curve))
	for _, point := range curve {
		points = append(points, map[string]any{"time": point.Time, "equity": point.Equity})
	}
	sliced["equity_curve"] = points
	if raw := filterPaperRows(result["trades"], goLive); raw != nil {
		sliced["trades"] = raw
	}
	if raw := filterPaperRows(result["orders"], goLive); raw != nil {
		sliced["orders"] = raw
	}
	if raw := filterPaperRows(result["rebalances"], goLive); raw != nil {
		sliced["rebalances"] = raw
	}
	if raw := filterPaperRows(result["holdings"], goLive); raw != nil {
		sliced["holdings"] = raw
	}
	if raw := filterPaperRows(result["prices"], goLive); raw != nil {
		sliced["prices"] = raw
	}
	if raw := filterPaperDayList(result["action_days"], goLive); raw != nil {
		sliced["action_days"] = raw
	}
	tradeCount := 0
	if trades, ok := sliced["trades"].([]any); ok {
		tradeCount = len(trades)
	}
	sliced["metrics"] = paperMetricsFromCurve(curve, initialCash, tradeCount)
	return sliced
}

func paperMetricsFromCurve(curve []paperEquityPoint, initialCash float64, tradeCount int) map[string]any {
	metrics := map[string]any{
		"trade_count":      tradeCount,
		"end_market_value": initialCash,
		"total_pnl":        0.0,
		"total_return_pct": 0.0,
		"max_drawdown_pct": 0.0,
	}
	if len(curve) == 0 {
		return metrics
	}
	first := curve[0].Equity
	last := curve[len(curve)-1].Equity
	if first == 0 {
		first = initialCash
	}
	metrics["end_market_value"] = last
	metrics["total_pnl"] = last - first
	if first != 0 {
		metrics["total_return_pct"] = (last - first) / first * 100
	}
	peak := first
	maxDD := 0.0
	for _, point := range curve {
		if point.Equity > peak {
			peak = point.Equity
		}
		if peak > 0 {
			dd := (peak - point.Equity) / peak * 100
			if dd > maxDD {
				maxDD = dd
			}
		}
	}
	metrics["max_drawdown_pct"] = maxDD
	if days := paperCurveDays(curve); days > 1 && first > 0 && last > 0 {
		metrics["annualized_return"] = math.Pow(last/first, 365.0/days) - 1
	}
	return metrics
}

func paperCurveDays(curve []paperEquityPoint) float64 {
	if len(curve) < 2 {
		return 0
	}
	start, err1 := time.Parse("2006-01-02", curve[0].Time)
	end, err2 := time.Parse("2006-01-02", curve[len(curve)-1].Time)
	if err1 != nil || err2 != nil {
		return float64(len(curve))
	}
	days := end.Sub(start).Hours() / 24
	if days < 1 {
		return 1
	}
	return days
}

func lastPaperEquity(result map[string]any, fallback float64) (equity float64, returnPct float64) {
	curve := parsePaperEquityCurve(result["equity_curve"])
	if len(curve) == 0 {
		return fallback, 0
	}
	first := curve[0].Equity
	last := curve[len(curve)-1].Equity
	if first == 0 {
		return last, 0
	}
	return last, (last - first) / first * 100
}

const galleryEquityPoints = 80

func compactEquityCurve(raw any, maxPoints int) []map[string]any {
	points := parsePaperEquityCurve(raw)
	if len(points) == 0 {
		return nil
	}
	if maxPoints < 2 {
		maxPoints = 2
	}
	sampled := points
	if len(points) > maxPoints {
		sampled = make([]paperEquityPoint, 0, maxPoints)
		last := len(points) - 1
		prev := -1
		for i := 0; i < maxPoints; i++ {
			idx := i * last / (maxPoints - 1)
			if idx == prev {
				continue
			}
			prev = idx
			sampled = append(sampled, points[idx])
		}
		if sampled[len(sampled)-1].Time != points[last].Time {
			sampled = append(sampled, points[last])
		}
	}
	out := make([]map[string]any, 0, len(sampled))
	for _, point := range sampled {
		out = append(out, map[string]any{"time": point.Time, "equity": point.Equity})
	}
	return out
}

func latestBarDateFromSeries(times []string) string {
	if len(times) == 0 {
		return ""
	}
	sort.Strings(times)
	return paperDayKey(times[len(times)-1])
}

func lastPaperBarDate(result map[string]any) string {
	curve := parsePaperEquityCurve(result["equity_curve"])
	if len(curve) == 0 {
		return ""
	}
	return curve[len(curve)-1].Time
}

func asFloat64OK(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case jsonNumber:
		f, err := t.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

type jsonNumber interface {
	Float64() (float64, error)
}
