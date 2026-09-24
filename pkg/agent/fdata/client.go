// Package fdata is an HTTP client for the finclaw-data market API.
package fdata

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/finclaw/internal/config"
	"github.com/finclaw/pkg/agent/fquant"
)

const (
	maxURLChars       = 2048
	stockFactorFields = "code,trade_date,vol,open,high,low,close,open_qfq,high_qfq,low_qfq,close_qfq"
	indexDailyFields  = "code,trade_date,open,high,low,close,vol"
	stockNameFields   = "code,name"
)

var indexNames = map[string]string{
	"000001": "上证综指",
	"000016": "上证50",
	"000300": "沪深300",
	"000852": "中证1000",
	"000905": "中证500",
	"000906": "中证800",
	"000922": "中证红利",
	"399001": "深证成指",
	"399006": "创业板指",
	"399303": "国证2000",
}

var indexAliases = map[string]string{
	"399300": "000300",
	"510300": "000300",
	"510050": "000016",
	"510500": "000905",
}

type queryResponse struct {
	Rows []map[string]any `json:"rows"`
}

// Client talks to finclaw-data /v1 endpoints.
type Client struct {
	baseURL  string
	user     string
	password string
	http     *http.Client
}

// New returns a finclaw-data client. Empty addr falls back to the default
// production URL. Empty credentials fall back to QUANT_API_USER / QUANT_API_PASSWORD.
func New(baseURL, username, password string) *Client {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = config.DefaultFdataAddr
	}
	user := strings.TrimSpace(username)
	if user == "" {
		user = strings.TrimSpace(os.Getenv("QUANT_API_USER"))
	}
	if user == "" {
		user = "root"
	}
	pass := password
	if strings.TrimSpace(pass) == "" {
		pass = os.Getenv("QUANT_API_PASSWORD")
	}
	if strings.TrimSpace(pass) == "" {
		pass = os.Getenv("FINCLAW_DATA_PASSWORD")
	}
	return &Client{
		baseURL:  base,
		user:     user,
		password: pass,
		http:     &http.Client{Timeout: 120 * time.Second},
	}
}

func (c *Client) BaseURL() string { return c.baseURL }

// GetBars fetches daily OHLCV from finclaw-data. Stocks use stock_factor_pro
// (qfq), indexes use index_daily, so colliding tickers stay distinct.
func (c *Client) GetBars(ctx context.Context, codes, indexes []string, startTime, endTime string) (*fquant.BarsResponse, error) {
	stocks := uniqueCodes(codes)
	idx := uniqueCodes(indexes)
	if len(stocks) == 0 && len(idx) == 0 {
		return &fquant.BarsResponse{Items: []fquant.BarSeries{}}, nil
	}
	start := compactDay(startTime)
	end := compactDay(endTime)

	var (
		stockPoints []fquant.PricePoint
		indexPoints []fquant.PricePoint
		names       map[string]string
		stockErr    error
		indexErr    error
	)
	var wg sync.WaitGroup
	if len(stocks) > 0 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			stockPoints, stockErr = c.fetchPoints(ctx, "/v1/stock_factor_pro", stocks, start, end, stockFactorFields, true)
		}()
		wg.Add(1)
		go func() {
			defer wg.Done()
			names = c.lookupStockNames(ctx, stocks)
		}()
	}
	if len(idx) > 0 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			indexPoints, indexErr = c.fetchPoints(ctx, "/v1/index_daily", canonicalIndexes(idx), start, end, indexDailyFields, false)
		}()
	}
	wg.Wait()
	if stockErr != nil {
		return nil, stockErr
	}
	if indexErr != nil {
		return nil, indexErr
	}

	indexSet := make(map[string]struct{}, len(idx))
	for _, code := range idx {
		indexSet[code] = struct{}{}
	}
	out := &fquant.BarsResponse{Items: make([]fquant.BarSeries, 0, len(stocks)+len(idx))}
	for _, code := range append(append([]string{}, stocks...), idx...) {
		points := stockPoints
		name := code
		match := code
		if _, ok := indexSet[code]; ok {
			points = indexPoints
			match = indexKey(code)
			name = indexName(match)
		} else if names != nil && names[code] != "" {
			name = names[code]
		}
		series := make([]fquant.PricePoint, 0)
		for _, point := range points {
			if point.Symbol != match {
				continue
			}
			point.Symbol = code
			series = append(series, point)
		}
		out.Items = append(out.Items, fquant.BarSeries{Code: code, Name: name, Series: series})
	}
	return out, nil
}

func (c *Client) fetchPoints(ctx context.Context, path string, codes []string, start, end, fields string, qfq bool) ([]fquant.PricePoint, error) {
	rows, err := c.getRows(ctx, path, url.Values{
		"codes":  {strings.Join(codes, ",")},
		"start":  {start},
		"end":    {end},
		"fields": {fields},
	})
	if err != nil {
		return nil, err
	}
	points := make([]fquant.PricePoint, 0, len(rows))
	for _, row := range rows {
		code := bareCode(rowString(row, "code"))
		if code == "" {
			continue
		}
		day := dayKey(rowValue(row, "trade_date"))
		if day == "" {
			continue
		}
		open, high, low, close := ohlc(row, qfq)
		points = append(points, fquant.PricePoint{
			Symbol: code,
			Time:   day,
			Open:   open,
			High:   high,
			Low:    low,
			Close:  close,
			Volume: asFloat(rowValue(row, "vol")),
		})
	}
	return points, nil
}

func (c *Client) lookupStockNames(ctx context.Context, codes []string) map[string]string {
	rows, err := c.getRows(ctx, "/v1/stocks", url.Values{
		"codes":  {strings.Join(codes, ",")},
		"fields": {stockNameFields},
	})
	if err != nil {
		return nil
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		code := bareCode(rowString(row, "code"))
		name := strings.TrimSpace(rowString(row, "name"))
		if code == "" || name == "" {
			continue
		}
		out[code] = name
	}
	return out
}

func (c *Client) getRows(ctx context.Context, path string, query url.Values) ([]map[string]any, error) {
	batches := splitCodeQuery(c.baseURL+path, query)
	if len(batches) == 0 {
		batches = []url.Values{query}
	}
	var rows []map[string]any
	for _, batch := range batches {
		body, err := c.getJSON(ctx, path, batch)
		if err != nil {
			return nil, err
		}
		rows = append(rows, body.Rows...)
	}
	return rows, nil
}

func (c *Client) getJSON(ctx context.Context, path string, query url.Values) (*queryResponse, error) {
	u := c.baseURL + path
	if encoded := query.Encode(); encoded != "" {
		u += "?" + encoded
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if strings.TrimSpace(c.password) != "" {
		req.SetBasicAuth(c.user, c.password)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("无法连接行情服务 (%s): %w", c.baseURL, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, parseAPIError(resp.StatusCode, raw)
	}
	var out queryResponse
	if len(strings.TrimSpace(string(raw))) == 0 {
		return &out, nil
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode finclaw-data response: %w", err)
	}
	if out.Rows == nil {
		out.Rows = []map[string]any{}
	}
	return &out, nil
}

func parseAPIError(status int, raw []byte) error {
	var payload struct {
		Detail json.RawMessage `json:"detail"`
	}
	detail := strings.TrimSpace(string(raw))
	if json.Unmarshal(raw, &payload) == nil && len(payload.Detail) > 0 {
		var asString string
		if json.Unmarshal(payload.Detail, &asString) == nil && asString != "" {
			detail = asString
		} else {
			detail = string(payload.Detail)
		}
	}
	if detail == "" {
		detail = fmt.Sprintf("finclaw-data HTTP %d", status)
	}
	return &fquant.APIError{Status: status, Detail: detail}
}

func splitCodeQuery(base string, query url.Values) []url.Values {
	raw := query.Get("codes")
	if raw == "" || !strings.Contains(raw, ",") {
		return []url.Values{cloneValues(query)}
	}
	codes := strings.Split(raw, ",")
	baseQuery := cloneValues(query)
	baseQuery.Del("codes")
	var batches []url.Values
	current := make([]string, 0, len(codes))
	for _, code := range codes {
		code = strings.TrimSpace(code)
		if code == "" {
			continue
		}
		trial := append(append([]string{}, current...), code)
		trialQuery := cloneValues(baseQuery)
		trialQuery.Set("codes", strings.Join(trial, ","))
		if len(current) > 0 && len(base+"?"+trialQuery.Encode()) > maxURLChars {
			batch := cloneValues(baseQuery)
			batch.Set("codes", strings.Join(current, ","))
			batches = append(batches, batch)
			current = []string{code}
			continue
		}
		current = trial
	}
	if len(current) > 0 {
		batch := cloneValues(baseQuery)
		batch.Set("codes", strings.Join(current, ","))
		batches = append(batches, batch)
	}
	return batches
}

func cloneValues(in url.Values) url.Values {
	out := make(url.Values, len(in))
	for key, values := range in {
		out[key] = append([]string{}, values...)
	}
	return out
}

func uniqueCodes(raw []string) []string {
	out := make([]string, 0, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for _, item := range raw {
		code := bareCode(item)
		if code == "" {
			continue
		}
		if _, ok := seen[code]; ok {
			continue
		}
		seen[code] = struct{}{}
		out = append(out, code)
	}
	return out
}

func canonicalIndexes(codes []string) []string {
	out := make([]string, 0, len(codes))
	seen := make(map[string]struct{}, len(codes))
	for _, code := range codes {
		canon := code
		if alias, ok := indexAliases[code]; ok {
			canon = alias
		}
		if _, ok := seen[canon]; ok {
			continue
		}
		seen[canon] = struct{}{}
		out = append(out, canon)
	}
	return out
}

func indexKey(code string) string {
	if alias, ok := indexAliases[code]; ok {
		return alias
	}
	return code
}

func indexName(code string) string {
	if name, ok := indexNames[code]; ok {
		return name
	}
	return code
}

func bareCode(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	lower := strings.ToLower(text)
	if strings.HasPrefix(lower, "sh.") || strings.HasPrefix(lower, "sz.") || strings.HasPrefix(lower, "bj.") {
		_, body, _ := strings.Cut(text, ".")
		text = body
	} else if i := strings.LastIndex(text, "."); i >= 0 {
		text = text[:i]
	}
	if isDigits(text) {
		for len(text) < 6 {
			text = "0" + text
		}
		if len(text) > 6 {
			text = text[len(text)-6:]
		}
	}
	return text
}

func isDigits(text string) bool {
	if text == "" {
		return false
	}
	for _, r := range text {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func compactDay(raw string) string {
	digits := make([]byte, 0, 8)
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			digits = append(digits, byte(r))
			if len(digits) == 8 {
				break
			}
		}
	}
	return string(digits)
}

func dayKey(value any) string {
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "" || text == "<nil>" {
		return ""
	}
	if len(text) >= 10 && text[4] == '-' && text[7] == '-' {
		return text[:10]
	}
	digits := compactDay(text)
	if len(digits) != 8 {
		return ""
	}
	return digits[:4] + "-" + digits[4:6] + "-" + digits[6:8]
}

func ohlc(row map[string]any, qfq bool) (open, high, low, close *float64) {
	return pickPrice(row, qfq, "open_qfq", "open"),
		pickPrice(row, qfq, "high_qfq", "high"),
		pickPrice(row, qfq, "low_qfq", "low"),
		pickPrice(row, qfq, "close_qfq", "close")
}

func pickPrice(row map[string]any, qfq bool, adjKey, rawKey string) *float64 {
	if qfq {
		if v := asFloat(rowValue(row, adjKey)); v != nil {
			return v
		}
	}
	return asFloat(rowValue(row, rawKey))
}

func rowString(row map[string]any, key string) string {
	return strings.TrimSpace(fmt.Sprint(rowValue(row, key)))
}

func rowValue(row map[string]any, key string) any {
	if row == nil {
		return nil
	}
	if value, ok := row[key]; ok {
		return value
	}
	return nil
}

func asFloat(value any) *float64 {
	switch v := value.(type) {
	case nil:
		return nil
	case float64:
		return floatPtr(v)
	case float32:
		return floatPtr(float64(v))
	case int:
		return floatPtr(float64(v))
	case int64:
		return floatPtr(float64(v))
	case json.Number:
		n, err := v.Float64()
		if err != nil {
			return nil
		}
		return floatPtr(n)
	case string:
		text := strings.TrimSpace(v)
		if text == "" || strings.EqualFold(text, "nan") || strings.EqualFold(text, "null") {
			return nil
		}
		n, err := strconv.ParseFloat(text, 64)
		if err != nil {
			return nil
		}
		return floatPtr(n)
	default:
		text := strings.TrimSpace(fmt.Sprint(v))
		if text == "" || text == "<nil>" {
			return nil
		}
		n, err := strconv.ParseFloat(text, 64)
		if err != nil {
			return nil
		}
		return floatPtr(n)
	}
}

func floatPtr(v float64) *float64 {
	if v != v {
		return nil
	}
	return &v
}
