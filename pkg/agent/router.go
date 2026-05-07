package agentruntime

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/internal/config"
	"github.com/finclaw/pkg/agent/picoclaw"
	"github.com/gin-gonic/gin"
	picoagent "github.com/sipeed/picoclaw/pkg/agent"
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
	// 具名段路由先注册，避免与旧版 Gin/代理组合下出现异常匹配（与 GET "" 互不冲突）。
	group.GET("/:name", ar.getAgent)
	group.GET("", ar.listAgents)
	group.POST("", ar.createAgent)
	group.PUT("/:name", ar.updateAgent)
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

type agentModelProviderInfo struct {
	ModelName string `json:"model_name"`
	Model     string `json:"model"`
	ApiBase   string `json:"api_base"`
	// HasApiKey is true when a non-empty key is configured locally (value is never returned).
	HasApiKey bool `json:"has_api_key"`
}

type agentDetailResp struct {
	Name          string                 `json:"name"`
	Workspace     string                 `json:"workspace,omitempty"`
	ModelProvider agentModelProviderInfo `json:"model_provider"`
}

// GET /agents/:name — runtime config summary for one agent (no secrets).
func (ar *AgentManagerRouter) getAgent(c *gin.Context) {
	name := c.Param("name")
	a, ok := ar.agentManager.Get(name)
	if !ok {
		ginx.NewRender(c, http.StatusNotFound).Err(fmt.Errorf("agent %q not found", name))
		return
	}
	loop, ok := a.(*picoagent.AgentLoop)
	if !ok || loop == nil {
		ginx.NewRender(c).Data(agentDetailResp{Name: name})
		return
	}
	cfg := loop.GetConfig()
	if cfg == nil {
		ginx.NewRender(c).Data(agentDetailResp{Name: name})
		return
	}
	modelAlias := strings.TrimSpace(cfg.Agents.Defaults.ModelName)
	var info agentModelProviderInfo
	if mc, err := cfg.GetModelConfig(modelAlias); err == nil && mc != nil {
		info = agentModelProviderInfo{
			ModelName: strings.TrimSpace(mc.ModelName),
			Model:     strings.TrimSpace(mc.Model),
			ApiBase:   strings.TrimSpace(mc.APIBase),
			HasApiKey: strings.TrimSpace(mc.APIKey()) != "",
		}
	} else {
		info.ModelName = modelAlias
	}
	ginx.NewRender(c).Data(agentDetailResp{
		Name:          name,
		Workspace:     strings.TrimSpace(cfg.Agents.Defaults.Workspace),
		ModelProvider: info,
	})
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
	picoclawAgent, err := picoclaw.NewPicoclawAgent(config.FinclawHomePath(), msgBus, &picoclawconfig.ModelConfig{
		ModelName: req.ModelProvider.ModelName,
		Model:     req.ModelProvider.Model,
		APIBase:   req.ModelProvider.ApiBase,
		APIKeys:   picoclawconfig.SimpleSecureStrings(req.ModelProvider.ApiKey),
	}, req.Name)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ar.agentManager.AddAgent(req.Name, picoclawAgent, msgBus)

	ginx.NewRender(c, http.StatusCreated).Data(agentStatusResp{Name: req.Name, ModelProvider: req.ModelProvider.ModelName})
}

// update-only：api_key 可省略或为空，此时沿用该 Agent 当前配置里可用的密钥。
type updateModelProviderPayload struct {
	ModelName string `json:"model_name" binding:"required"`
	Model     string `json:"model" binding:"required"`
	ApiBase   string `json:"api_base" binding:"required"`
	ApiKey    string `json:"api_key,omitempty"`
}

type updateAgentRequest struct {
	ModelProvider updateModelProviderPayload `json:"model_provider" binding:"required"`
}

func resolveUpdateAPIKey(loop *picoagent.AgentLoop, modelAlias string, provided string) (string, error) {
	if strings.TrimSpace(provided) != "" {
		return strings.TrimSpace(provided), nil
	}
	if loop == nil {
		return "", fmt.Errorf("api_key is required when agent has no running config")
	}
	cfg := loop.GetConfig()
	if cfg == nil {
		return "", fmt.Errorf("api_key is required when agent has empty config")
	}
	alias := strings.TrimSpace(modelAlias)
	if mc, err := cfg.GetModelConfig(alias); err == nil && mc != nil {
		if k := strings.TrimSpace(mc.APIKey()); k != "" {
			return k, nil
		}
	}
	prev := strings.TrimSpace(cfg.Agents.Defaults.ModelName)
	if prev != alias {
		if mc, err := cfg.GetModelConfig(prev); err == nil && mc != nil {
			if k := strings.TrimSpace(mc.APIKey()); k != "" {
				return k, nil
			}
		}
	}
	return "", fmt.Errorf("api_key is required: no saved key found for this agent")
}

// PUT /agents/:name — replace model provider and restart agent (config saved on disk).
func (ar *AgentManagerRouter) updateAgent(c *gin.Context) {
	name := c.Param("name")
	a, ok := ar.agentManager.Get(name)
	if !ok {
		ginx.NewRender(c, http.StatusNotFound).Err(fmt.Errorf("agent %q not found", name))
		return
	}

	var req updateAgentRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))

	var loop *picoagent.AgentLoop
	if lg, ok := a.(*picoagent.AgentLoop); ok && lg != nil {
		loop = lg
	}

	apiKey, err := resolveUpdateAPIKey(loop, req.ModelProvider.ModelName, req.ModelProvider.ApiKey)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	msgBus := bus.NewMessageBus()
	picoclawAgent, err := picoclaw.NewPicoclawAgent(config.FinclawHomePath(), msgBus, &picoclawconfig.ModelConfig{
		ModelName: req.ModelProvider.ModelName,
		Model:     req.ModelProvider.Model,
		APIBase:   req.ModelProvider.ApiBase,
		APIKeys:   picoclawconfig.SimpleSecureStrings(apiKey),
	}, name)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ar.agentManager.AddAgent(name, picoclawAgent, msgBus)

	ginx.NewRender(c).Data(agentStatusResp{Name: name, ModelProvider: req.ModelProvider.ModelName})
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
