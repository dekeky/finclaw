package agentruntime

import (
	"net/http"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/internal/config"
	"github.com/finclaw/pkg/agent/picoclaw"
	"github.com/gin-gonic/gin"
	"github.com/sipeed/picoclaw/pkg/bus"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
)

type AgentManagerRouter struct {
	agentManager *AgentManager
	r            *gin.Engine
}

func NewAgentManagerRouter(agentManager *AgentManager, r *gin.Engine) *AgentManagerRouter {
	return &AgentManagerRouter{agentManager: agentManager, r: r}
}

func (ar *AgentManagerRouter) ConfigRouter() {
	group := ar.r.Group("/agents")
	group.GET("", ar.listAgents)
	group.POST("", ar.createAgent)
	group.DELETE("/:name", ar.deleteAgent)
}

type agentListResp struct {
	Agents []string `json:"agents"`
	Total  int      `json:"total"`
}

// GET /agents — list all registered agents.
func (ar *AgentManagerRouter) listAgents(c *gin.Context) {
	names := ar.agentManager.Names()

	ginx.NewRender(c).Data(agentListResp{Agents: names, Total: len(names)})
}

type createAgentRequest struct {
	Name          string        `json:"name" binding:"required"`
	ModelProvider ModelProvider `json:"model_provider" binding:"required"`
}

type ModelProvider struct {
	ModelName string `json:"model_name" binding:"required"`
	Model     string `json:"model" binding:"required"`
	ApiBase   string `json:"api_base" binding:"required"`
	ApiKey    string `json:"api_key" binding:"required"`
}

type agentStatusResp struct {
	Name          string `json:"name"`
	ModelProvider string `json:"model_provider"`
}

// POST /agents — create and register a new agent via the configured creator.
func (ar *AgentManagerRouter) createAgent(c *gin.Context) {
	var req createAgentRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))

	msgBus := bus.NewMessageBus()
	picoclawAgent, err := picoclaw.NewPicoclawAgent(config.FinClawHomePath(), msgBus, &picoclawconfig.ModelConfig{
		ModelName: req.ModelProvider.ModelName,
		Model:     req.ModelProvider.Model,
		APIBase:   req.ModelProvider.ApiBase,
		APIKeys:   picoclawconfig.SimpleSecureStrings(req.ModelProvider.ApiKey),
	})
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ar.agentManager.AddAgent(req.Name, picoclawAgent, msgBus)

	ginx.NewRender(c, http.StatusCreated).Data(agentStatusResp{Name: req.Name, ModelProvider: req.ModelProvider.ModelName})
}

// DELETE /agents/:name — stop and remove an agent.
func (ar *AgentManagerRouter) deleteAgent(c *gin.Context) {
	name := c.Param("name")
	if err := ar.agentManager.Remove(name); err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	ginx.NewRender(c).Data(agentStatusResp{Name: name})
}
