package agentruntime

import (
	"net/http"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/gin-gonic/gin"
)

// StrategyRouter exposes CRUD for quant strategy scripts.
type StrategyRouter struct {
	r              *gin.Engine
	authMiddleware gin.HandlerFunc
}

func NewStrategyRouter(r *gin.Engine, authMiddleware gin.HandlerFunc) *StrategyRouter {
	return &StrategyRouter{r: r, authMiddleware: authMiddleware}
}

func (sr *StrategyRouter) ConfigRouter() {
	group := sr.r.Group("/api/v1/strategies", sr.authMiddleware)
	group.GET("/:name", sr.getStrategy)
	group.GET("", sr.listStrategies)
	group.POST("", sr.createStrategy)
	group.PUT("/:name", sr.updateStrategy)
	group.POST("/:name/pull", sr.pullStrategy)
	group.POST("/:name/sync", sr.syncStrategy)
	group.DELETE("/:name", sr.deleteStrategy)
}

type strategyListResp struct {
	Strategies []strategySummary `json:"strategies"`
	Total      int               `json:"total"`
}

func (sr *StrategyRouter) listStrategies(c *gin.Context) {
	userID := getUserID(c)
	store := NewStrategyStore(userID)
	strategies, err := store.List()
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(strategyListResp{Strategies: strategies, Total: len(strategies)})
}

func (sr *StrategyRouter) getStrategy(c *gin.Context) {
	userID := getUserID(c)
	name := strings.TrimSpace(c.Param("name"))
	detail, err := NewStrategyStore(userID).Get(name)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c).Data(detail)
}

type createStrategyRequest struct {
	Name     string `json:"name" binding:"required"`
	Platform string `json:"platform,omitempty"`
	Script   string `json:"script,omitempty"`
	Agent    string `json:"agent,omitempty"`
}

func (sr *StrategyRouter) createStrategy(c *gin.Context) {
	userID := getUserID(c)
	var req createStrategyRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	detail, err := NewStrategyStore(userID).Create(req.Name, req.Platform, req.Script, req.Agent)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "already exists") {
			status = http.StatusConflict
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c, http.StatusCreated).Data(detail)
}

type updateStrategyRequest struct {
	Name     string `json:"name" binding:"required"`
	Platform string `json:"platform,omitempty"`
	Script   string `json:"script,omitempty"`
}

func (sr *StrategyRouter) updateStrategy(c *gin.Context) {
	userID := getUserID(c)
	currentName := strings.TrimSpace(c.Param("name"))
	var req updateStrategyRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	detail, err := NewStrategyStore(userID).Update(currentName, req.Name, req.Platform, req.Script)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		} else if strings.Contains(err.Error(), "already exists") {
			status = http.StatusConflict
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c).Data(detail)
}

type pullStrategyRequest struct {
	Agent string `json:"agent" binding:"required"`
}

func (sr *StrategyRouter) pullStrategy(c *gin.Context) {
	userID := getUserID(c)
	name := strings.TrimSpace(c.Param("name"))
	var req pullStrategyRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	detail, err := NewStrategyStore(userID).PullFromAgent(req.Agent, name)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c).Data(detail)
}

type syncStrategyRequest struct {
	Agent string `json:"agent" binding:"required"`
}

func (sr *StrategyRouter) syncStrategy(c *gin.Context) {
	userID := getUserID(c)
	name := strings.TrimSpace(c.Param("name"))
	var req syncStrategyRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	if err := NewStrategyStore(userID).SyncToAgent(req.Agent, name); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	detail, err := NewStrategyStore(userID).Get(name)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(detail)
}

func (sr *StrategyRouter) deleteStrategy(c *gin.Context) {
	userID := getUserID(c)
	name := strings.TrimSpace(c.Param("name"))
	if err := NewStrategyStore(userID).Delete(name); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c).Data(gin.H{"deleted": name})
}
