package agentruntime

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/pkg/agent/fquant"
	"github.com/gin-gonic/gin"
)

type PaperRouter struct {
	r              *gin.Engine
	authMiddleware gin.HandlerFunc
	client         *fquant.Client
	bars           barsFetcher
}

func NewPaperRouter(r *gin.Engine, authMiddleware gin.HandlerFunc, fquantAddr string) *PaperRouter {
	client := fquant.New(fquantAddr)
	return &PaperRouter{
		r:              r,
		authMiddleware: authMiddleware,
		client:         client,
		bars:           client,
	}
}

func (pr *PaperRouter) WithBars(bars barsFetcher) *PaperRouter {
	if pr != nil && bars != nil {
		pr.bars = bars
	}
	return pr
}

func (pr *PaperRouter) ConfigRouter() {
	group := pr.r.Group("/api/v1/paper", pr.authMiddleware)
	group.POST("/sessions", pr.createSession)
	group.GET("/sessions", pr.listSessions)
	group.GET("/sessions/:id", pr.getSession)
	group.PATCH("/sessions/:id", pr.renameSession)
	group.POST("/sessions/:id/pause", pr.pauseSession)
	group.POST("/sessions/:id/resume", pr.resumeSession)
	group.POST("/sessions/:id/restart", pr.restartSession)
	group.POST("/sessions/:id/sync", pr.syncNow)
	group.DELETE("/sessions/:id", pr.deleteSession)
}

type createPaperRequest struct {
	Name            string   `json:"name"`
	StrategyName    string   `json:"strategy_name"`
	StrategyID      string   `json:"strategy_id"`
	FromRunID       string   `json:"from_run_id"`
	InitialCash     float64  `json:"initial_cash"`
	Universe        string   `json:"universe"`
	Symbols         []string `json:"symbols"`
	Index           string   `json:"index"`
	GoLive          string   `json:"go_live"`
	CommissionRate  *float64 `json:"commission_rate"`
	MinCommission   *float64 `json:"min_commission"`
	StampTaxRate    *float64 `json:"stamp_tax_rate"`
	TransferFeeRate *float64 `json:"transfer_fee_rate"`
	Slippage        *float64 `json:"slippage"`
	LotSize         *int     `json:"lot_size"`
}

type renamePaperRequest struct {
	Name string `json:"name"`
}

func (pr *PaperRouter) createSession(c *gin.Context) {
	userID := getUserID(c)
	var req createPaperRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	if err := pr.applyCreateDefaults(userID, &req); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "不存在") || strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}

	detail, err := currentStrategyScript(userID, req.StrategyID, req.StrategyName)
	if err != nil {
		status := http.StatusNotFound
		if !strings.Contains(err.Error(), "不存在") && !strings.Contains(err.Error(), "not found") {
			status = http.StatusInternalServerError
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	if detail.Platform != StrategyPlatformFinClaw {
		ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("仅 FinClaw 策略可开启实盘模拟"))
		return
	}
	universe, symbols, index, err := normalizeUniverse(req.Universe, req.Symbols, req.Index)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	if req.InitialCash <= 0 {
		req.InitialCash = 100000
	}
	goLive := paperDayKey(req.GoLive)
	if goLive == "" {
		if latest, err := pr.latestMarketDate(c.Request.Context(), paperSession{
			Universe:    universe,
			Symbols:     symbols,
			Index:       index,
			EngineStart: paperEngineStart(paperToday()),
			GoLive:      paperToday(),
		}); err == nil && latest != "" {
			goLive = latest
		} else {
			goLive = paperToday()
		}
	}

	sessions, err := listPaperSessions(userID)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	baseName := strings.TrimSpace(req.Name)
	if baseName == "" {
		baseName = detail.Name
	}
	name, err := normalizePaperName(uniquePaperName(paperNameSet(sessions, ""), baseName))
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	sess := paperSession{
		ID:              newPaperID(),
		Name:            name,
		Status:          paperStatusRunning,
		StrategyName:    detail.Name,
		StrategyID:      firstNonEmpty(strings.TrimSpace(req.StrategyID), detail.ID),
		GoLive:          goLive,
		EngineStart:     paperEngineStart(goLive),
		InitialCash:     req.InitialCash,
		Equity:          req.InitialCash,
		Universe:        universe,
		Symbols:         symbols,
		Index:           index,
		CommissionRate:  req.CommissionRate,
		MinCommission:   req.MinCommission,
		StampTaxRate:    req.StampTaxRate,
		TransferFeeRate: req.TransferFeeRate,
		Slippage:        req.Slippage,
		LotSize:         req.LotSize,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := savePaperSession(userID, sess); err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if err := savePaperSource(userID, sess.ID, detail.Script); err != nil {
		_ = deletePaperSession(userID, sess.ID)
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	pr.startSync(userID, sess.ID, true)
	ginx.NewRender(c, http.StatusCreated).Data(pr.sessionView(userID, sess, false))
}

func (pr *PaperRouter) applyCreateDefaults(userID string, req *createPaperRequest) error {
	if strings.TrimSpace(req.FromRunID) == "" {
		if strings.TrimSpace(req.StrategyName) == "" && strings.TrimSpace(req.StrategyID) == "" {
			return errors.New("请选择策略")
		}
		return nil
	}
	raw, ok := loadLocalRunRaw(userID, strings.TrimSpace(req.FromRunID))
	if !ok {
		return fmtPaperNotFound("回测记录不存在")
	}
	run, err := parseBacktestRun(raw)
	if err != nil {
		return err
	}
	if strings.TrimSpace(req.StrategyName) == "" {
		req.StrategyName = run.StrategyName
	}
	if strings.TrimSpace(req.StrategyID) == "" {
		req.StrategyID = run.StrategyID
	}
	if req.InitialCash <= 0 {
		req.InitialCash = asFloat(run.Request["initial_cash"])
	}
	if strings.TrimSpace(req.Universe) == "" {
		req.Universe = asString(run.Request["universe"])
	}
	if len(req.Symbols) == 0 {
		req.Symbols = asStringSlice(run.Request["symbols"])
	}
	if strings.TrimSpace(req.Index) == "" {
		req.Index = asString(run.Request["index"])
	}
	if req.CommissionRate == nil {
		req.CommissionRate = asFloatPtr(run.Request["commission_rate"])
	}
	if req.MinCommission == nil {
		req.MinCommission = asFloatPtr(run.Request["min_commission"])
	}
	if req.StampTaxRate == nil {
		req.StampTaxRate = asFloatPtr(run.Request["stamp_tax_rate"])
	}
	if req.TransferFeeRate == nil {
		req.TransferFeeRate = asFloatPtr(run.Request["transfer_fee_rate"])
	}
	if req.Slippage == nil {
		req.Slippage = asFloatPtr(run.Request["slippage"])
	}
	if req.LotSize == nil {
		req.LotSize = asIntPtr(run.Request["lot_size"])
	}
	return nil
}

func fmtPaperNotFound(message string) error {
	return errors.New(message)
}

func (pr *PaperRouter) listSessions(c *gin.Context) {
	userID := getUserID(c)
	pr.kickUserRunning(userID)
	items, err := listPaperSessions(userID)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	strategyName := strings.TrimSpace(c.Query("strategy_name"))
	strategyID := strings.TrimSpace(c.Query("strategy_id"))
	out := make([]gin.H, 0, len(items))
	for _, sess := range items {
		if strategyName != "" || strategyID != "" {
			if !sameStrategyRef(sess.StrategyID, sess.StrategyName, strategyID, strategyName) {
				continue
			}
		}
		out = append(out, pr.sessionView(userID, sess, false))
	}
	ginx.NewRender(c).Data(gin.H{"items": out})
}

func (pr *PaperRouter) getSession(c *gin.Context) {
	userID := getUserID(c)
	sess, err := loadPaperSession(userID, c.Param("id"))
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	if sess.Status == paperStatusRunning || sess.Status == paperStatusFailed {
		pr.startSync(userID, sess.ID, false)
		if fresh, loadErr := loadPaperSession(userID, sess.ID); loadErr == nil {
			sess = fresh
		}
	}
	ginx.NewRender(c).Data(pr.sessionView(userID, sess, true))
}

func (pr *PaperRouter) renameSession(c *gin.Context) {
	userID := getUserID(c)
	var req renamePaperRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	name, err := normalizePaperName(req.Name)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	sess, err := loadPaperSession(userID, c.Param("id"))
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	sessions, err := listPaperSessions(userID)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	for _, item := range sessions {
		if item.ID != sess.ID && item.Name == name {
			ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("已有同名实盘模拟"))
			return
		}
	}
	sess.Name = name
	sess.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := savePaperSession(userID, sess); err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(pr.sessionView(userID, sess, false))
}

func (pr *PaperRouter) pauseSession(c *gin.Context) {
	pr.setStatus(c, paperStatusPaused, false)
}

func (pr *PaperRouter) resumeSession(c *gin.Context) {
	pr.setStatus(c, paperStatusRunning, true)
}

func (pr *PaperRouter) setStatus(c *gin.Context, status string, sync bool) {
	userID := getUserID(c)
	sess, err := loadPaperSession(userID, c.Param("id"))
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	sess.Status = status
	if status == paperStatusRunning {
		sess.LastError = ""
	}
	sess.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := savePaperSession(userID, sess); err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if sync {
		pr.startSync(userID, sess.ID, true)
	}
	ginx.NewRender(c).Data(pr.sessionView(userID, sess, true))
}

func (pr *PaperRouter) restartSession(c *gin.Context) {
	userID := getUserID(c)
	sess, err := loadPaperSession(userID, c.Param("id"))
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	detail, err := currentStrategyScript(userID, sess.StrategyID, sess.StrategyName)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("来源策略已删除，无法用当前代码重启"))
		return
	}
	if detail.Platform != StrategyPlatformFinClaw {
		ginx.NewRender(c, http.StatusBadRequest).Err(errors.New("仅 FinClaw 策略可开启实盘模拟"))
		return
	}
	goLive := paperToday()
	if latest, err := pr.latestMarketDate(c.Request.Context(), sess); err == nil && latest != "" {
		goLive = latest
	}
	now := time.Now().UTC().Format(time.RFC3339)
	sess.StrategyName = detail.Name
	sess.StrategyID = firstNonEmpty(detail.ID, sess.StrategyID)
	sess.GoLive = goLive
	sess.EngineStart = paperEngineStart(goLive)
	sess.LastBarDate = ""
	sess.LastRunID = ""
	sess.LastError = ""
	sess.Equity = sess.InitialCash
	sess.ReturnPct = 0
	sess.Status = paperStatusRunning
	sess.UpdatedAt = now
	if err := savePaperSource(userID, sess.ID, detail.Script); err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if err := savePaperLatest(userID, sess.ID, nil); err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if err := savePaperSession(userID, sess); err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	pr.startSync(userID, sess.ID, true)
	ginx.NewRender(c).Data(pr.sessionView(userID, sess, true))
}

func (pr *PaperRouter) syncNow(c *gin.Context) {
	userID := getUserID(c)
	sess, err := loadPaperSession(userID, c.Param("id"))
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	pr.startSync(userID, sess.ID, true)
	if fresh, loadErr := loadPaperSession(userID, sess.ID); loadErr == nil {
		sess = fresh
	}
	ginx.NewRender(c).Data(pr.sessionView(userID, sess, true))
}

func (pr *PaperRouter) deleteSession(c *gin.Context) {
	userID := getUserID(c)
	id := strings.TrimSpace(c.Param("id"))
	if err := deletePaperSession(userID, id); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "不存在") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c).Data(gin.H{"id": id})
}

func (pr *PaperRouter) sessionView(userID string, sess paperSession, includeResult bool) gin.H {
	view := gin.H{
		"id":                sess.ID,
		"name":              sess.Name,
		"status":            sess.Status,
		"strategy_name":     sess.StrategyName,
		"strategy_id":       sess.StrategyID,
		"strategy_missing":  strings.TrimSpace(sess.LibraryEntryID) == "" && !strategyStillExists(userID, sess.StrategyID, sess.StrategyName),
		"go_live":           sess.GoLive,
		"engine_start":      sess.EngineStart,
		"last_bar_date":     sess.LastBarDate,
		"last_run_id":       sess.LastRunID,
		"last_error":        sess.LastError,
		"initial_cash":      sess.InitialCash,
		"equity":            sess.Equity,
		"return_pct":        sess.ReturnPct,
		"universe":          sess.Universe,
		"symbols":           sess.Symbols,
		"index":             sess.Index,
		"commission_rate":   sess.CommissionRate,
		"min_commission":    sess.MinCommission,
		"stamp_tax_rate":    sess.StampTaxRate,
		"transfer_fee_rate": sess.TransferFeeRate,
		"slippage":          sess.Slippage,
		"lot_size":          sess.LotSize,
		"created_at":        sess.CreatedAt,
		"updated_at":        sess.UpdatedAt,
		"request":           paperRequestView(sess),
	}
	if result, ok := loadPaperLatest(userID, sess.ID); ok {
		if compact := compactEquityCurve(result["equity_curve"], galleryEquityPoints); len(compact) > 0 {
			view["equity_curve"] = compact
		}
		if includeResult {
			view["result"] = result
		}
	}
	if includeResult {
		if source := loadPaperSource(userID, sess.ID); source != "" {
			view["source"] = source
		}
	}
	return view
}

func paperRequestView(sess paperSession) gin.H {
	return gin.H{
		"strategy_name":     sess.StrategyName,
		"strategy_id":       sess.StrategyID,
		"symbols":           sess.Symbols,
		"universe":          sess.Universe,
		"index":             sess.Index,
		"initial_cash":      sess.InitialCash,
		"start_time":        sess.GoLive,
		"end_time":          firstNonEmpty(sess.LastBarDate, sess.GoLive),
		"commission_rate":   sess.CommissionRate,
		"min_commission":    sess.MinCommission,
		"stamp_tax_rate":    sess.StampTaxRate,
		"transfer_fee_rate": sess.TransferFeeRate,
		"slippage":          sess.Slippage,
		"lot_size":          sess.LotSize,
	}
}

func asFloat(v any) float64 {
	n, _ := asFloat64OK(v)
	return n
}

func asFloatPtr(v any) *float64 {
	n, ok := asFloat64OK(v)
	if !ok {
		return nil
	}
	return &n
}

func asIntPtr(v any) *int {
	n, ok := asFloat64OK(v)
	if !ok {
		return nil
	}
	i := int(n)
	return &i
}

func asStringSlice(v any) []string {
	switch t := v.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s := asString(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}
