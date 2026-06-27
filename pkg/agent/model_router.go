package agentruntime

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/gin-gonic/gin"
)

// ModelRouter exposes CRUD for reusable model profiles.
type ModelRouter struct {
	r              *gin.Engine
	authMiddleware gin.HandlerFunc
}

func NewModelRouter(r *gin.Engine, authMiddleware gin.HandlerFunc) *ModelRouter {
	return &ModelRouter{r: r, authMiddleware: authMiddleware}
}

func (mr *ModelRouter) ConfigRouter() {
	group := mr.r.Group("/api/v1/models", mr.authMiddleware)
	group.POST("/model-probe", mr.probeModelProfile)
	group.GET("/:name", mr.getModel)
	group.GET("", mr.listModels)
	group.POST("", mr.createModel)
	group.PUT("/:name", mr.updateModel)
	group.DELETE("/:name", mr.deleteModel)
}

type modelListResp struct {
	Models []modelProfileSummary `json:"models"`
	Total  int                   `json:"total"`
}

func (mr *ModelRouter) listModels(c *gin.Context) {
	userID := getUserID(c)
	models, err := NewModelStore(userID).List()
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(modelListResp{Models: models, Total: len(models)})
}

func (mr *ModelRouter) getModel(c *gin.Context) {
	userID := getUserID(c)
	displayName := strings.TrimSpace(c.Param("name"))
	profile, err := NewModelStore(userID).Get(displayName)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			ginx.NewRender(c, http.StatusNotFound).Err(err)
			return
		}
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(profile)
}

type createModelRequest struct {
	DisplayName string `json:"display_name" binding:"required"`
	ModelName   string `json:"model_name,omitempty"`
	Model       string `json:"model" binding:"required"`
	ApiBase     string `json:"api_base" binding:"required"`
	ApiKey      string `json:"api_key" binding:"required"`
}

func (mr *ModelRouter) createModel(c *gin.Context) {
	userID := getUserID(c)
	var req createModelRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	profile, err := NewModelStore(userID).Create(ModelProfile{
		DisplayName: req.DisplayName,
		ModelName:   req.ModelName,
		Model:       req.Model,
		ApiBase:     req.ApiBase,
		ApiKey:      req.ApiKey,
	})
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "already exists") {
			status = http.StatusConflict
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c, http.StatusCreated).Data(profile)
}

type updateModelRequest struct {
	DisplayName string `json:"display_name" binding:"required"`
	ModelName   string `json:"model_name,omitempty"`
	Model       string `json:"model" binding:"required"`
	ApiBase     string `json:"api_base" binding:"required"`
	ApiKey      string `json:"api_key,omitempty"`
}

func (mr *ModelRouter) updateModel(c *gin.Context) {
	userID := getUserID(c)
	currentName := strings.TrimSpace(c.Param("name"))
	var req updateModelRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	profile, err := NewModelStore(userID).Update(currentName, ModelProfile{
		DisplayName: req.DisplayName,
		ModelName:   req.ModelName,
		Model:       req.Model,
		ApiBase:     req.ApiBase,
		ApiKey:      req.ApiKey,
	})
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
	ginx.NewRender(c).Data(profile)
}

func (mr *ModelRouter) deleteModel(c *gin.Context) {
	userID := getUserID(c)
	displayName := strings.TrimSpace(c.Param("name"))
	home := agentHomeDir(userID)
	inUse, err := countAgentsUsingModelProfile(home, displayName)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	if inUse > 0 {
		ginx.NewRender(c, http.StatusConflict).Err(fmt.Errorf("model profile %q is used by %d agent(s)", displayName, inUse))
		return
	}
	if err := NewModelStore(userID).Delete(displayName); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		ginx.NewRender(c, status).Err(err)
		return
	}
	ginx.NewRender(c).Data(gin.H{"deleted": displayName})
}

type probeModelProfileRequest struct {
	DisplayName   string        `json:"display_name,omitempty"`
	ModelProvider ModelProvider `json:"model_provider" binding:"required"`
}

func (mr *ModelRouter) probeModelProfile(c *gin.Context) {
	userID := getUserID(c)
	var req probeModelProfileRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	if err := fillModelName(&req.ModelProvider); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	apiKey, err := NewModelStore(userID).ResolveProbeAPIKey(req.DisplayName, req.ModelProvider.ApiKey)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	mc := req.ModelProvider.toPicoModelConfig(apiKey)
	result := ProbeModelConfig(c.Request.Context(), mc)
	status := http.StatusOK
	if !result.Ok {
		status = http.StatusBadRequest
	}
	ginx.NewRender(c, status).Data(result)
}
