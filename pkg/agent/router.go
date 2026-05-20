package agentruntime

import (
	"fmt"
	"net/http"
	"os"
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
	// 子资源路由须在 /:name 之前注册，避免被单段路由抢占。
	group.GET("/:name/skills", ar.getAgentSkills)
	group.GET("/:name/workspace-files", ar.getWorkspaceFiles)
	group.POST("/:name/workspace-files/:file/generate", ar.generateWorkspaceFile)
	group.PUT("/:name/workspace-files/:file", ar.putWorkspaceFile)
	group.POST("/:name/workspace-files/init", ar.initWorkspaceFiles)
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
	Model   string `json:"model"`
	ApiBase string `json:"api_base"`
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
			Model:     strings.TrimSpace(mc.Model),
			ApiBase:   strings.TrimSpace(mc.APIBase),
			HasApiKey: strings.TrimSpace(mc.APIKey()) != "",
		}
	} else if modelAlias != "" {
		info.Model = modelAlias
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
	ModelName string `json:"model_name,omitempty"`
	Model     string `json:"model" binding:"required"`
	ApiBase   string `json:"api_base" binding:"required"`
	ApiKey    string `json:"api_key" binding:"required"`
}

// fillModelName sets PicoClaw's model_list alias from model when the client omits model_name.
func fillModelName(mp *ModelProvider) error {
	if mp == nil {
		return fmt.Errorf("model_provider is required")
	}
	mp.Model = strings.TrimSpace(mp.Model)
	mp.ApiBase = strings.TrimSpace(mp.ApiBase)
	if mp.Model == "" {
		return fmt.Errorf("model is required")
	}
	if strings.TrimSpace(mp.ModelName) == "" {
		mp.ModelName = mp.Model
	} else {
		mp.ModelName = strings.TrimSpace(mp.ModelName)
	}
	return nil
}

func (mp ModelProvider) toPicoModelConfig(apiKey string) *picoclawconfig.ModelConfig {
	return &picoclawconfig.ModelConfig{
		ModelName: mp.ModelName,
		Model:     mp.Model,
		APIBase:   mp.ApiBase,
		APIKeys:   picoclawconfig.SimpleSecureStrings(apiKey),
	}
}

type agentStatusResp struct {
	Name          string `json:"name"`
	ModelProvider string `json:"model_provider"`
}

// POST /agents — create and register a new agent via the configured creator.
func (ar *AgentManagerRouter) createAgent(c *gin.Context) {
	var req createAgentRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	if err := fillModelName(&req.ModelProvider); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	msgBus := bus.NewMessageBus()
	picoclawAgent, err := picoclaw.NewPicoclawAgent(config.FinclawHomePath(), msgBus, req.ModelProvider.toPicoModelConfig(req.ModelProvider.ApiKey), req.Name)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ar.agentManager.AddAgent(req.Name, picoclawAgent, msgBus)

	ginx.NewRender(c, http.StatusCreated).Data(agentStatusResp{Name: req.Name, ModelProvider: req.ModelProvider.Model})
}

// update-only：api_key 可省略或为空，此时沿用该 Agent 当前配置里可用的密钥。
type updateModelProviderPayload struct {
	ModelName string `json:"model_name,omitempty"`
	Model     string `json:"model" binding:"required"`
	ApiBase   string `json:"api_base" binding:"required"`
	ApiKey    string `json:"api_key,omitempty"`
}

func fillUpdateModelName(mp *updateModelProviderPayload) error {
	if mp == nil {
		return fmt.Errorf("model_provider is required")
	}
	mp.Model = strings.TrimSpace(mp.Model)
	mp.ApiBase = strings.TrimSpace(mp.ApiBase)
	if mp.Model == "" {
		return fmt.Errorf("model is required")
	}
	if strings.TrimSpace(mp.ModelName) == "" {
		mp.ModelName = mp.Model
	} else {
		mp.ModelName = strings.TrimSpace(mp.ModelName)
	}
	return nil
}

func (mp updateModelProviderPayload) toModelProvider(apiKey string) ModelProvider {
	return ModelProvider{
		ModelName: mp.ModelName,
		Model:     mp.Model,
		ApiBase:   mp.ApiBase,
		ApiKey:    apiKey,
	}
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
	if err := fillUpdateModelName(&req.ModelProvider); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	var loop *picoagent.AgentLoop
	if lg, ok := a.(*picoagent.AgentLoop); ok && lg != nil {
		loop = lg
	}

	apiKey, err := resolveUpdateAPIKey(loop, req.ModelProvider.ModelName, req.ModelProvider.ApiKey)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	mp := req.ModelProvider.toModelProvider(apiKey)
	msgBus := bus.NewMessageBus()
	picoclawAgent, err := picoclaw.NewPicoclawAgent(config.FinclawHomePath(), msgBus, mp.toPicoModelConfig(apiKey), name)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ar.agentManager.AddAgent(name, picoclawAgent, msgBus)

	ginx.NewRender(c).Data(agentStatusResp{Name: name, ModelProvider: mp.Model})
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

type workspaceFilesResp struct {
	Workspace string                  `json:"workspace"`
	Files     []picoclaw.PersonaFile  `json:"files"`
}

type putWorkspaceFileReq struct {
	Content string `json:"content"`
}

type generateWorkspaceFileReq struct {
	Prompt         string `json:"prompt" binding:"required"`
	CurrentContent string `json:"current_content,omitempty"`
}

type generateWorkspaceFileResp struct {
	Content string `json:"content"`
}

func (ar *AgentManagerRouter) resolveAgentConfig(name string) (*picoclawconfig.Config, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("agent name is required")
	}
	if a, ok := ar.agentManager.Get(name); ok {
		if loop, ok := a.(*picoagent.AgentLoop); ok && loop != nil {
			if cfg := loop.GetConfig(); cfg != nil {
				return cfg, nil
			}
		}
	}
	home := config.FinclawHomePath()
	cfgPath := picoclaw.AgentConfigPath(home, name)
	if _, err := os.Stat(cfgPath); err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("agent %q not found", name)
		}
		return nil, fmt.Errorf("stat agent config: %w", err)
	}
	return picoclaw.LoadAgentConfig(home, name)
}

func (ar *AgentManagerRouter) resolveAgentWorkspace(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("agent name is required")
	}
	if a, ok := ar.agentManager.Get(name); ok {
		if loop, ok := a.(*picoagent.AgentLoop); ok && loop != nil {
			if cfg := loop.GetConfig(); cfg != nil {
				if ws := strings.TrimSpace(cfg.Agents.Defaults.Workspace); ws != "" {
					return ws, nil
				}
			}
		}
	}
	home := config.FinclawHomePath()
	cfgPath := picoclaw.AgentConfigPath(home, name)
	if _, err := os.Stat(cfgPath); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("agent %q not found", name)
		}
		return "", fmt.Errorf("stat agent config: %w", err)
	}
	return picoclaw.AgentWorkspacePath(home, name), nil
}

// GET /agents/:name/skills — list skills visible to the agent (workspace / global / builtin).
func (ar *AgentManagerRouter) getAgentSkills(c *gin.Context) {
	name := c.Param("name")
	workspace, err := ar.resolveAgentWorkspace(name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	summary, err := picoclaw.ListAgentSkills(workspace)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(summary)
}

// GET /agents/:name/workspace-files — read AGENT.md, SOUL.md, USER.md.
func (ar *AgentManagerRouter) getWorkspaceFiles(c *gin.Context) {
	name := c.Param("name")
	workspace, err := ar.resolveAgentWorkspace(name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	files, err := picoclaw.ReadPersonaFiles(workspace)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(workspaceFilesResp{Workspace: workspace, Files: files})
}

// PUT /agents/:name/workspace-files/:file — write one persona markdown file.
func (ar *AgentManagerRouter) putWorkspaceFile(c *gin.Context) {
	name := c.Param("name")
	filename := c.Param("file")
	workspace, err := ar.resolveAgentWorkspace(name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	var req putWorkspaceFileReq
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	if err := picoclaw.WritePersonaFile(workspace, filename, req.Content); err != nil {
		if strings.Contains(err.Error(), "unsupported persona file") {
			ginx.NewRender(c, http.StatusBadRequest).Err(err)
			return
		}
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(picoclaw.PersonaFile{Name: filename, Content: req.Content, Exists: true})
}

// POST /agents/:name/workspace-files/init — create missing persona files from templates.
func (ar *AgentManagerRouter) initWorkspaceFiles(c *gin.Context) {
	name := c.Param("name")
	workspace, err := ar.resolveAgentWorkspace(name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	if err := picoclaw.EnsurePersonaFiles(workspace); err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	files, err := picoclaw.ReadPersonaFiles(workspace)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(workspaceFilesResp{Workspace: workspace, Files: files})
}

// POST /agents/:name/workspace-files/:file/generate — AI draft persona markdown from user prompt.
func (ar *AgentManagerRouter) generateWorkspaceFile(c *gin.Context) {
	name := c.Param("name")
	filename := c.Param("file")
	if err := picoclaw.ValidatePersonaFilename(filename); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	cfg, err := ar.resolveAgentConfig(name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	var req generateWorkspaceFileReq
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	content, err := picoclaw.GeneratePersonaFile(c.Request.Context(), cfg, filename, picoclaw.GeneratePersonaRequest{
		Prompt:         req.Prompt,
		CurrentContent: req.CurrentContent,
		AgentName:      name,
	})
	if err != nil {
		if strings.Contains(err.Error(), "prompt is required") {
			ginx.NewRender(c, http.StatusBadRequest).Err(err)
			return
		}
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(generateWorkspaceFileResp{Content: content})
}
