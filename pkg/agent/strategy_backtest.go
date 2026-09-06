package agentruntime

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/pkg/agent/fquant"
	"github.com/gin-gonic/gin"
)

// BacktestRouter proxies native FinClaw strategy runs to the fquant service.
type BacktestRouter struct {
	r              *gin.Engine
	authMiddleware gin.HandlerFunc
	client         *fquant.Client
}

func NewBacktestRouter(r *gin.Engine, authMiddleware gin.HandlerFunc, fquantAddr string) *BacktestRouter {
	return &BacktestRouter{
		r:              r,
		authMiddleware: authMiddleware,
		client:         fquant.New(fquantAddr),
	}
}

func (br *BacktestRouter) ConfigRouter() {
	group := br.r.Group("/api/v1/backtest", br.authMiddleware)
	group.GET("/runtime", br.runtime)
	group.POST("/runs", br.submitRun)
	group.GET("/runs", br.listRuns)
	group.GET("/runs/:id", br.getRun)
	group.PATCH("/runs/:id", br.renameRun)
	group.DELETE("/runs/:id", br.deleteRun)
	group.GET("/runs/:id/blotter", br.getRunBlotter)
	group.GET("/runs/:id/positions", br.getRunPositions)
	group.GET("/indicators", br.listIndicators)
	group.GET("/symbols", br.listSymbols)
	group.GET("/universe/stocks", br.universeStocks)
	group.GET("/universe/indexes", br.universeIndexes)
	group.GET("/universe/indexes/:code", br.universeIndexDetail)
	group.GET("/market/bars", br.marketBars)
	group.GET("/market/fina", br.marketFina)
}

type submitBacktestRequest struct {
	StrategyName    string   `json:"strategy_name" binding:"required"`
	InitialCash     float64  `json:"initial_cash"`
	StartTime       string   `json:"start_time"`
	EndTime         string   `json:"end_time"`
	Universe        string   `json:"universe" binding:"required"`
	Symbols         []string `json:"symbols"`
	Index           string   `json:"index"`
	CommissionRate  *float64 `json:"commission_rate"`
	MinCommission   *float64 `json:"min_commission"`
	StampTaxRate    *float64 `json:"stamp_tax_rate"`
	TransferFeeRate *float64 `json:"transfer_fee_rate"`
	Slippage        *float64 `json:"slippage"`
	LotSize         *int     `json:"lot_size"`
}

func (br *BacktestRouter) submitRun(c *gin.Context) {
	userID := getUserID(c)
	var req submitBacktestRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	if req.InitialCash <= 0 {
		req.InitialCash = 100000
	}
	if strings.TrimSpace(req.StartTime) == "" {
		req.StartTime = "2020-01-01"
	}
	if strings.TrimSpace(req.EndTime) == "" {
		req.EndTime = "2023-12-31"
	}

	detail, err := NewStrategyStore(userID).Get(req.StrategyName)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	if detail.Platform != StrategyPlatformFinClaw {
		ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("仅 FinClaw 策略可通过内置回测运行，聚宽策略请复制到聚宽控制台"))
		return
	}
	universe, symbols, index, err := normalizeUniverse(req.Universe, req.Symbols, req.Index)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	username := fquant.UsernameForUser(userID)
	if _, err := br.client.UpsertStrategy(c.Request.Context(), username, detail.Name, detail.Script); err != nil {
		writeFquantError(c, err)
		return
	}
	run, err := br.client.SubmitRun(c.Request.Context(), username, fquant.SubmitRunRequest{
		StrategyName:    detail.Name,
		InitialCash:     req.InitialCash,
		StartTime:       req.StartTime,
		EndTime:         req.EndTime,
		Universe:        universe,
		Symbols:         symbols,
		Index:           index,
		CommissionRate:  req.CommissionRate,
		MinCommission:   req.MinCommission,
		StampTaxRate:    req.StampTaxRate,
		TransferFeeRate: req.TransferFeeRate,
		Slippage:        req.Slippage,
		LotSize:         req.LotSize,
	})
	if err != nil {
		writeFquantError(c, err)
		return
	}
	br.persistSubmitQuietly(userID, run.ID, run.Status, detail.Name, detail.Script, req)
	if entry, ok := lookupBacktestIndex(userID, run.ID); ok {
		run.Name = entry.Name
	}
	if !isTerminalBacktestStatus(run.Status) {
		br.startPersistLoop(userID, run.ID)
	}
	ginx.NewRender(c, http.StatusCreated).Data(gin.H{
		"id":          run.ID,
		"status":      run.Status,
		"name":        run.Name,
		"fquant_addr": browserFquantAddr(br.client.BaseURL()),
		"username":    username,
	})
}

func (br *BacktestRouter) runtime(c *gin.Context) {
	ginx.NewRender(c).Data(gin.H{
		"fquant_addr": browserFquantAddr(br.client.BaseURL()),
		"username":    fquant.UsernameForUser(getUserID(c)),
	})
}

func (br *BacktestRouter) listRuns(c *gin.Context) {
	userID := getUserID(c)
	items := loadLocalRunList(userID)
	for _, item := range items {
		run, err := parseBacktestRun(item)
		if err != nil || run.ID == "" || isTerminalBacktestStatus(run.Status) {
			continue
		}
		br.startPersistLoop(userID, run.ID)
	}
	if items == nil {
		items = []json.RawMessage{}
	}
	ginx.NewRender(c).Data(gin.H{"items": items})
}

func (br *BacktestRouter) getRun(c *gin.Context) {
	userID := getUserID(c)
	runID := strings.TrimSpace(c.Param("id"))
	live := c.Query("live") == "1"
	if raw, ok := loadLocalRunRaw(userID, runID); ok {
		if isTerminalBacktestStatus(statusFromBacktestRaw(raw)) {
			writeRawJSON(c, raw)
			return
		}
		if !live {
			writeRawJSON(c, raw)
			br.startPersistLoop(userID, runID)
			return
		}
	}

	username := fquant.UsernameForUser(userID)
	raw, err := br.client.GetRun(c.Request.Context(), username, runID)
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
	if isTerminalBacktestStatus(statusFromBacktestRaw(raw)) {
		br.persistRunInBackground(userID, raw)
		return
	}
	br.startPersistLoop(userID, runID)
}

func browserFquantAddr(raw string) string {
	raw = strings.TrimRight(strings.TrimSpace(raw), "/")
	if raw == "" {
		return fquant.DefaultBaseURL
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return raw
	}
	host := parsed.Hostname()
	if host == "0.0.0.0" || host == "::" {
		port := parsed.Port()
		if port == "" {
			parsed.Host = "127.0.0.1"
		} else {
			parsed.Host = net.JoinHostPort("127.0.0.1", port)
		}
		return strings.TrimRight(parsed.String(), "/")
	}
	return raw
}

type renameRunRequest struct {
	Name string `json:"name"`
}

func (br *BacktestRouter) renameRun(c *gin.Context) {
	var req renameRunRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	name := strings.TrimSpace(req.Name)
	if name == "" {
		ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("回测名称不能为空"))
		return
	}
	if len([]rune(name)) > 64 {
		ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("回测名称最长 64 个字符"))
		return
	}
	userID := getUserID(c)
	runID := strings.TrimSpace(c.Param("id"))
	if localRunIsTerminal(userID, runID) {
		br.persistRenameQuietly(userID, runID, name)
		if raw, ok := loadLocalRunRaw(userID, runID); ok {
			writeRawJSON(c, raw)
			return
		}
	}
	username := fquant.UsernameForUser(userID)
	raw, err := br.client.UpdateRunName(c.Request.Context(), username, runID, name)
	if err != nil {
		writeFquantError(c, err)
		return
	}
	br.persistRunQuietly(userID, raw)
	br.persistRenameQuietly(userID, runID, name)
	writeRawJSON(c, raw)
}

func (br *BacktestRouter) deleteRun(c *gin.Context) {
	userID := getUserID(c)
	runID := strings.TrimSpace(c.Param("id"))
	terminal := localRunIsTerminal(userID, runID)
	if !terminal {
		username := fquant.UsernameForUser(userID)
		if raw, err := br.client.DeleteRun(c.Request.Context(), username, runID); err != nil && !localHasRun(userID, runID) {
			writeFquantError(c, err)
			return
		} else if err == nil {
			br.removePersistedQuietly(userID, runID)
			writeRawJSON(c, raw)
			return
		}
	}
	br.removePersistedQuietly(userID, runID)
	payload, _ := json.Marshal(map[string]string{"id": runID})
	writeRawJSON(c, payload)
}

func (br *BacktestRouter) getRunBlotter(c *gin.Context) {
	userID := getUserID(c)
	runID := strings.TrimSpace(c.Param("id"))
	query := parseBlotterPageQuery(c.Query("page"), c.Query("page_size"), c.Query("from"), c.Query("to"), c.Query("symbol"), c.Query("days_only"))
	query.FillDay = strings.TrimSpace(c.Query("fill_day"))
	full := strings.TrimSpace(c.Query("full"))
	query.Full = full == "1" || strings.EqualFold(full, "true")
	fills := strings.TrimSpace(c.Query("fills"))
	query.Fills = fills == "1" || strings.EqualFold(fills, "true")
	if query.Fills {
		query.Full = true
	}
	if query.DaysOnly || query.Fills {
		if raw, ok := loadLocalBlotterFills(userID, runID); ok {
			paged, err := pageBlotterJSON(raw, query)
			if err != nil {
				ginx.NewRender(c, http.StatusInternalServerError).Err(err)
				return
			}
			writeRawJSON(c, paged)
			return
		}
	}
	raw, ok := loadLocalBlotter(userID, runID)
	if !ok {
		username := fquant.UsernameForUser(userID)
		fetched, err := br.client.GetRunBlotter(c.Request.Context(), username, runID)
		if err != nil {
			writeFquantError(c, err)
			return
		}
		br.persistBlotterInBackground(userID, runID, fetched)
		raw = fetched
	}
	if query.DaysOnly || query.Fills {
		extracted, err := extractBlotterFills(raw)
		if err != nil {
			ginx.NewRender(c, http.StatusInternalServerError).Err(err)
			return
		}
		if ok {
			br.persistBlotterFillsInBackground(userID, runID, extracted)
		}
		raw = extracted
	}
	paged, err := pageBlotterJSON(raw, query)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	writeRawJSON(c, paged)
}

func (br *BacktestRouter) getRunPositions(c *gin.Context) {
	userID := getUserID(c)
	runID := strings.TrimSpace(c.Param("id"))
	date := c.Query("date")
	symbol := c.Query("symbol")
	if raw, ok := loadLocalPositions(userID, runID); ok {
		filtered, err := filterLocalPositions(raw, date, symbol)
		if err != nil {
			ginx.NewRender(c, http.StatusInternalServerError).Err(err)
			return
		}
		writeRawJSON(c, filtered)
		return
	}
	username := fquant.UsernameForUser(userID)
	raw, err := br.client.GetRunPositions(
		c.Request.Context(),
		username,
		runID,
		date,
		symbol,
	)
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
	if strings.TrimSpace(date) == "" && strings.TrimSpace(symbol) == "" {
		br.persistPositionsInBackground(userID, runID, raw)
	}
}

func (br *BacktestRouter) listIndicators(c *gin.Context) {
	raw, err := br.client.ListIndicators(c.Request.Context())
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
}

func (br *BacktestRouter) listSymbols(c *gin.Context) {
	raw, err := br.client.ListSymbols(c.Request.Context(), c.Query("q"), c.Query("kind"), c.Query("codes"))
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
}

func (br *BacktestRouter) universeStocks(c *gin.Context) {
	raw, err := br.client.ListUniverseStocks(c.Request.Context(), c.Query("q"))
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
}

func (br *BacktestRouter) universeIndexes(c *gin.Context) {
	raw, err := br.client.ListUniverseIndexes(c.Request.Context())
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
}

func (br *BacktestRouter) universeIndexDetail(c *gin.Context) {
	raw, err := br.client.GetUniverseIndex(c.Request.Context(), strings.TrimSpace(c.Param("code")))
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
}

func (br *BacktestRouter) marketBars(c *gin.Context) {
	codes := splitCodes(c.Query("codes"))
	indexes := splitCodes(c.Query("indexes"))
	if len(codes) == 0 && len(indexes) == 0 {
		ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("codes 不能为空"))
		return
	}
	out, err := br.client.GetBars(c.Request.Context(), codes, indexes, c.Query("start_time"), c.Query("end_time"))
	if err != nil {
		writeFquantError(c, err)
		return
	}
	ginx.NewRender(c).Data(out)
}

func (br *BacktestRouter) marketFina(c *gin.Context) {
	codes := splitCodes(c.Query("codes"))
	if len(codes) == 0 {
		ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("codes 不能为空"))
		return
	}
	raw, err := br.client.GetFina(c.Request.Context(), codes, c.Query("start_time"), c.Query("end_time"))
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
}

func normalizeUniverse(kind string, symbols []string, index string) (string, []string, string, error) {
	mode := strings.ToLower(strings.TrimSpace(kind))
	cleaned := splitCodes(strings.Join(symbols, ","))
	index = strings.TrimSpace(index)
	switch mode {
	case "picks":
		if len(cleaned) == 0 {
			return "", nil, "", errors.New("请至少选择一只股票")
		}
		return mode, cleaned, "", nil
	case "index":
		if index == "" {
			return "", nil, "", errors.New("请选择指数")
		}
		return mode, nil, index, nil
	case "all":
		return mode, nil, "", nil
	default:
		return "", nil, "", errors.New("未知标的范围，期望 picks / index / all")
	}
}

func splitCodes(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		code := strings.TrimSpace(part)
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

func writeRawJSON(c *gin.Context, raw json.RawMessage) {
	if !json.Valid(raw) {
		ginx.NewRender(c, http.StatusBadGateway).Err(errors.New("invalid upstream json"))
		return
	}
	c.Header("Content-Type", "application/json; charset=utf-8")
	c.Status(http.StatusOK)
	_, _ = c.Writer.Write([]byte(`{"code":200,"body":`))
	_, _ = c.Writer.Write(raw)
	_, _ = c.Writer.Write([]byte(`}`))
}

func writeFquantError(c *gin.Context, err error) {
	status := fquant.HTTPStatus(err)
	if status < 400 {
		status = http.StatusBadGateway
	}
	ginx.NewRender(c, status).Err(err)
}
