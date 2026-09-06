// Package fquant is an HTTP client for the fquant backtest service.
package fquant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/finclaw/internal/config"
)

const DefaultBaseURL = config.DefaultFquantAddr

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// APIError is an HTTP error returned by fquant.
type APIError struct {
	Status int
	Detail string
}

func (e *APIError) Error() string {
	if e.Detail != "" {
		return e.Detail
	}
	return fmt.Sprintf("fquant HTTP %d", e.Status)
}

// Client talks to a fquant FastAPI process.
type Client struct {
	baseURL string
	http    *http.Client
}

func New(baseURL string) *Client {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		base = DefaultBaseURL
	}
	return &Client{
		baseURL: base,
		http:    &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *Client) BaseURL() string { return c.baseURL }

// UsernameForUser maps a FinClaw user id onto fquant's username alphabet.
func UsernameForUser(userID string) string {
	raw := strings.TrimSpace(userID)
	if usernamePattern.MatchString(raw) {
		return raw
	}
	var b strings.Builder
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '-':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), "_-")
	if out == "" {
		out = "user"
	}
	if len(out) > 64 {
		out = out[:64]
	}
	if out[0] >= '0' && out[0] <= '9' {
		out = "u_" + out
		if len(out) > 64 {
			out = out[:64]
		}
	}
	return out
}

type StrategyItem struct {
	Name       string `json:"name"`
	Filename   string `json:"filename"`
	UploadedAt string `json:"uploaded_at"`
	UpdatedAt  string `json:"updated_at,omitempty"`
	Source     string `json:"source,omitempty"`
}

type SubmitRunRequest struct {
	StrategyName    string   `json:"strategy_name"`
	InitialCash     float64  `json:"initial_cash"`
	StartTime       string   `json:"start_time"`
	EndTime         string   `json:"end_time"`
	Universe        string   `json:"universe"`
	Symbols         []string `json:"symbols,omitempty"`
	Index           string   `json:"index,omitempty"`
	CommissionRate  *float64 `json:"commission_rate,omitempty"`
	MinCommission   *float64 `json:"min_commission,omitempty"`
	StampTaxRate    *float64 `json:"stamp_tax_rate,omitempty"`
	TransferFeeRate *float64 `json:"transfer_fee_rate,omitempty"`
	Slippage        *float64 `json:"slippage,omitempty"`
	LotSize         *int     `json:"lot_size,omitempty"`
}

type SubmitRunResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Name   string `json:"name,omitempty"`
}

type ListEnvelope[T any] struct {
	Items []T `json:"items"`
}

// PricePoint is one daily OHLCV bar. Null numbers stay as JSON null so the chart can skip them.
type PricePoint struct {
	Symbol string   `json:"symbol"`
	Time   string   `json:"time"`
	Open   *float64 `json:"open"`
	High   *float64 `json:"high"`
	Low    *float64 `json:"low"`
	Close  *float64 `json:"close"`
	Volume *float64 `json:"volume"`
}

// BarSeries is one symbol's bars plus the display name used by the overlay/K-line UI.
type BarSeries struct {
	Code   string       `json:"code"`
	Name   string       `json:"name"`
	Series []PricePoint `json:"series"`
}

// BarsResponse is GET /api/market/bars from fquant, and the FinClaw proxy body.
type BarsResponse struct {
	Items []BarSeries `json:"items"`
}

// StrategyTemplate is the canonical default source fquant serves for new strategies.
type StrategyTemplate struct {
	Name   string `json:"name"`
	Source string `json:"source"`
}

// GetStrategyTemplate fetches the default strategy template from fquant
// (GET /api/strategy-template).
func (c *Client) GetStrategyTemplate(ctx context.Context) (*StrategyTemplate, error) {
	var out StrategyTemplate
	if err := c.doJSON(ctx, http.MethodGet, "/api/strategy-template", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// UpsertStrategy creates or updates a strategy source file in fquant.
func (c *Client) UpsertStrategy(ctx context.Context, username, name, source string) (*StrategyItem, error) {
	existing, err := c.GetStrategy(ctx, username, name)
	if err != nil {
		var apiErr *APIError
		if asAPIError(err, &apiErr) && apiErr.Status == http.StatusNotFound {
			return c.createStrategy(ctx, username, name, source)
		}
		return nil, err
	}
	return c.updateStrategy(ctx, username, existing.Name, name, source)
}

func (c *Client) GetStrategy(ctx context.Context, username, name string) (*StrategyItem, error) {
	var item StrategyItem
	if err := c.doJSON(ctx, http.MethodGet, c.userPath(username, "/strategies/"+url.PathEscape(name)), nil, &item); err != nil {
		return nil, err
	}
	return &item, nil
}

func (c *Client) createStrategy(ctx context.Context, username, name, source string) (*StrategyItem, error) {
	var item StrategyItem
	body := map[string]string{"name": name, "source": source}
	if err := c.doJSON(ctx, http.MethodPost, c.userPath(username, "/strategies/source"), body, &item); err != nil {
		return nil, err
	}
	return &item, nil
}

func (c *Client) updateStrategy(ctx context.Context, username, currentName, name, source string) (*StrategyItem, error) {
	var item StrategyItem
	body := map[string]string{"name": name, "source": source}
	if err := c.doJSON(ctx, http.MethodPut, c.userPath(username, "/strategies/"+url.PathEscape(currentName)), body, &item); err != nil {
		return nil, err
	}
	return &item, nil
}

func (c *Client) SubmitRun(ctx context.Context, username string, req SubmitRunRequest) (*SubmitRunResponse, error) {
	var out SubmitRunResponse
	if err := c.doJSON(ctx, http.MethodPost, c.userPath(username, "/runs"), req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) ListRuns(ctx context.Context, username string) ([]json.RawMessage, error) {
	var out ListEnvelope[json.RawMessage]
	if err := c.doJSON(ctx, http.MethodGet, c.userPath(username, "/runs"), nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

func (c *Client) GetRun(ctx context.Context, username, runID string) (json.RawMessage, error) {
	var raw json.RawMessage
	if err := c.doJSON(ctx, http.MethodGet, c.userPath(username, "/runs/"+url.PathEscape(runID)), nil, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func (c *Client) GetRunBlotter(ctx context.Context, username, runID string) (json.RawMessage, error) {
	return c.getRaw(ctx, c.userPath(username, "/runs/"+url.PathEscape(runID)+"/blotter"), nil)
}

func (c *Client) GetRunPositions(ctx context.Context, username, runID, date, symbol string) (json.RawMessage, error) {
	query := url.Values{}
	if date != "" {
		query.Set("date", date)
	}
	if symbol != "" {
		query.Set("symbol", symbol)
	}
	return c.getRaw(ctx, c.userPath(username, "/runs/"+url.PathEscape(runID)+"/positions"), query)
}

func (c *Client) UpdateRunName(ctx context.Context, username, runID, name string) (json.RawMessage, error) {
	var raw json.RawMessage
	if err := c.doJSON(ctx, http.MethodPatch, c.userPath(username, "/runs/"+url.PathEscape(runID)), map[string]string{"name": name}, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func (c *Client) DeleteRun(ctx context.Context, username, runID string) (json.RawMessage, error) {
	var raw json.RawMessage
	if err := c.doJSON(ctx, http.MethodDelete, c.userPath(username, "/runs/"+url.PathEscape(runID)), nil, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func (c *Client) ListIndicators(ctx context.Context) (json.RawMessage, error) {
	return c.getRaw(ctx, "/api/indicators", nil)
}

func (c *Client) ListSymbols(ctx context.Context, q, kind, codes string) (json.RawMessage, error) {
	query := url.Values{}
	if q != "" {
		query.Set("q", q)
	}
	if kind != "" {
		query.Set("kind", kind)
	}
	if codes != "" {
		query.Set("codes", codes)
	}
	return c.getRaw(ctx, "/api/symbols", query)
}

func (c *Client) ListUniverseStocks(ctx context.Context, q string) (json.RawMessage, error) {
	query := url.Values{}
	if q != "" {
		query.Set("q", q)
	}
	return c.getRaw(ctx, "/api/universe/stocks", query)
}

func (c *Client) ListUniverseIndexes(ctx context.Context) (json.RawMessage, error) {
	return c.getRaw(ctx, "/api/universe/indexes", nil)
}

func (c *Client) GetUniverseIndex(ctx context.Context, indexCode string) (json.RawMessage, error) {
	return c.getRaw(ctx, "/api/universe/indexes/"+url.PathEscape(indexCode), nil)
}

// GetBars fetches daily OHLCV. Stocks go in codes, indexes in indexes so
// colliding tickers such as 000001 (平安银行 vs 上证综指) stay distinct.
func (c *Client) GetBars(ctx context.Context, codes, indexes []string, startTime, endTime string) (*BarsResponse, error) {
	query := url.Values{}
	if len(codes) > 0 {
		query.Set("codes", strings.Join(codes, ","))
	}
	if len(indexes) > 0 {
		query.Set("indexes", strings.Join(indexes, ","))
	}
	if startTime != "" {
		query.Set("start_time", startTime)
	}
	if endTime != "" {
		query.Set("end_time", endTime)
	}
	var out BarsResponse
	if err := c.doJSON(ctx, http.MethodGet, "/api/market/bars?"+query.Encode(), nil, &out); err != nil {
		return nil, err
	}
	normalizeBars(&out)
	return &out, nil
}

func (c *Client) GetFina(ctx context.Context, codes []string, startTime, endTime string) (json.RawMessage, error) {
	query := url.Values{}
	query.Set("codes", strings.Join(codes, ","))
	if startTime != "" {
		query.Set("start_time", startTime)
	}
	if endTime != "" {
		query.Set("end_time", endTime)
	}
	return c.getRaw(ctx, "/api/market/fina", query)
}

func (c *Client) getRaw(ctx context.Context, path string, query url.Values) (json.RawMessage, error) {
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	var raw json.RawMessage
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func normalizeBars(out *BarsResponse) {
	if out.Items == nil {
		out.Items = []BarSeries{}
	}
	for i := range out.Items {
		if out.Items[i].Series == nil {
			out.Items[i].Series = []PricePoint{}
		}
	}
}

func (c *Client) userPath(username, suffix string) string {
	return "/api/users/" + url.PathEscape(username) + suffix
}

func (c *Client) doJSON(ctx context.Context, method, path string, body any, dest any) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("无法连接 fquant 服务 (%s): %w", c.baseURL, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		return parseAPIError(resp.StatusCode, raw)
	}
	if dest == nil || resp.StatusCode == http.StatusNoContent || len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return fmt.Errorf("decode fquant response: %w", err)
	}
	return nil
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
		detail = fmt.Sprintf("fquant HTTP %d", status)
	}
	return &APIError{Status: status, Detail: detail}
}

func asAPIError(err error, target **APIError) bool {
	if err == nil {
		return false
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		return false
	}
	*target = apiErr
	return true
}

func HTTPStatus(err error) int {
	var apiErr *APIError
	if asAPIError(err, &apiErr) {
		return apiErr.Status
	}
	return http.StatusBadGateway
}
