package agentruntime

import (
	"encoding/json"
	"errors"
	"net/http"
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
	group.POST("/runs", br.submitRun)
	group.GET("/runs", br.listRuns)
	group.GET("/runs/:id", br.getRun)
	group.GET("/runs/:id/blotter", br.getRunBlotter)
	group.GET("/runs/:id/positions", br.getRunPositions)
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
	ginx.NewRender(c, http.StatusCreated).Data(run)
}

func (br *BacktestRouter) listRuns(c *gin.Context) {
	username := fquant.UsernameForUser(getUserID(c))
	items, err := br.client.ListRuns(c.Request.Context(), username)
	if err != nil {
		writeFquantError(c, err)
		return
	}
	if items == nil {
		items = []json.RawMessage{}
	}
	ginx.NewRender(c).Data(gin.H{"items": items})
}

func (br *BacktestRouter) getRun(c *gin.Context) {
	username := fquant.UsernameForUser(getUserID(c))
	raw, err := br.client.GetRun(c.Request.Context(), username, strings.TrimSpace(c.Param("id")))
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
}

func (br *BacktestRouter) getRunBlotter(c *gin.Context) {
	username := fquant.UsernameForUser(getUserID(c))
	raw, err := br.client.GetRunBlotter(c.Request.Context(), username, strings.TrimSpace(c.Param("id")))
	if err != nil {
		writeFquantError(c, err)
		return
	}
	writeRawJSON(c, raw)
}

func (br *BacktestRouter) getRunPositions(c *gin.Context) {
	username := fquant.UsernameForUser(getUserID(c))
	raw, err := br.client.GetRunPositions(
		c.Request.Context(),
		username,
		strings.TrimSpace(c.Param("id")),
		c.Query("date"),
		c.Query("symbol"),
	)
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
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}
	ginx.NewRender(c).Data(payload)
}

func writeFquantError(c *gin.Context, err error) {
	status := fquant.HTTPStatus(err)
	if status < 400 {
		status = http.StatusBadGateway
	}
	ginx.NewRender(c, status).Err(err)
}
