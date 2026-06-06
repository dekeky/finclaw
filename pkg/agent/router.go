package agentruntime

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/internal/auth"
	"github.com/finclaw/internal/config"
	"github.com/finclaw/pkg/agent/picoclaw"
	"github.com/gin-gonic/gin"
	picoagent "github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
)

type AgentManagerRouter struct {
	agentManager  *AgentManager
	r             *gin.Engine
	authMiddleware gin.HandlerFunc
}

func NewAgentManagerRouter(agentManager *AgentManager, r *gin.Engine, authMiddleware gin.HandlerFunc) *AgentManagerRouter {
	return &AgentManagerRouter{agentManager: agentManager, r: r, authMiddleware: authMiddleware}
}

func (ar *AgentManagerRouter) ConfigRouter() {
	group := ar.r.Group("/api/v1/agents", ar.authMiddleware)
	group.GET("/:name/skills", ar.getAgentSkills)
	group.DELETE("/:name/skills", ar.deleteSkill)
	group.GET("/:name/skills/file", ar.getSkillFile)
	group.PUT("/:name/skills/file", ar.putSkillFile)
	group.GET("/:name/workspace-files", ar.getWorkspaceFiles)
	group.POST("/:name/workspace-files/:file/generate", ar.generateWorkspaceFile)
	group.PUT("/:name/workspace-files/:file", ar.putWorkspaceFile)
	group.POST("/:name/workspace-files/init", ar.initWorkspaceFiles)
	group.GET("/:name/docs", ar.listDocFiles)
	group.GET("/:name/docs/*filepath", ar.getDocFile)
	group.PUT("/:name/docs/*filepath", ar.putDocFile)
	group.DELETE("/:name/docs/*filepath", ar.deleteDocFile)
	group.POST("/model-probe", ar.probeModelProvider)
	group.GET("/:name", ar.getAgent)
	group.GET("", ar.listAgents)
	group.POST("", ar.createAgent)
	group.PUT("/:name", ar.updateAgent)
	group.DELETE("/:name", ar.deleteAgent)
}

// getUserID extracts userId from gin context (set by AuthMiddleware).
func getUserID(c *gin.Context) string {
	return auth.GetUserID(c)
}

// agentHomeDir returns the user-specific home directory for agents.
func agentHomeDir(userID string) string {
	return UserAgentHome(userID)
}

type agentListResp struct {
	Agents []string `json:"agents"`
	Total  int      `json:"total"`
}

// GET /api/v1/agents — list agents for the authenticated user.
func (ar *AgentManagerRouter) listAgents(c *gin.Context) {
	userID := getUserID(c)
	names := ar.agentManager.NamesByUser(userID)
	ginx.NewRender(c).Data(agentListResp{Agents: names, Total: len(names)})
}

type agentModelProviderInfo struct {
	Model   string `json:"model"`
	ApiBase string `json:"api_base"`
	HasApiKey bool `json:"has_api_key"`
}

type agentDetailResp struct {
	Name          string                 `json:"name"`
	Workspace     string                 `json:"workspace,omitempty"`
	ModelProvider agentModelProviderInfo `json:"model_provider"`
}

// GET /api/v1/agents/:name — runtime config summary for one agent (no secrets).
func (ar *AgentManagerRouter) getAgent(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	internalKey := AgentKey(userID, name)

	a, ok := ar.agentManager.Get(internalKey)
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
	Name string `json:"name" binding:"required"`
	// FromAgent, when set, reuses an existing agent's model provider (model,
	// api_base and stored api_key). Takes precedence over ModelProvider.
	FromAgent string `json:"from_agent,omitempty"`
	// ModelProvider is required unless FromAgent is set.
	ModelProvider *ModelProvider `json:"model_provider,omitempty"`
}

type ModelProvider struct {
	ModelName string `json:"model_name,omitempty"`
	Model     string `json:"model" binding:"required"`
	ApiBase   string `json:"api_base" binding:"required"`
	ApiKey    string `json:"api_key" binding:"required"`
}

// validateAgentName guards the agent name before it is used to build
// filesystem paths (workspace/config live under <home>/<name>/...). It rejects
// empty names, path separators and traversal sequences while still allowing
// non-ASCII (e.g. Chinese) display names.
func validateAgentName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("agent name is required")
	}
	if len(name) > 64 {
		return fmt.Errorf("agent name is too long (max 64 characters)")
	}
	if name == "." || name == ".." {
		return fmt.Errorf("invalid agent name")
	}
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		return fmt.Errorf("agent name must not contain path separators or \"..\"")
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			return fmt.Errorf("agent name contains invalid control characters")
		}
	}
	return nil
}

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

// modelProviderFromAgent builds a ModelProvider (including the stored api key)
// from an existing agent's runtime config so a new agent can reuse it.
func modelProviderFromAgent(am *AgentManager, userID, agentName string) (ModelProvider, error) {
	agentName = strings.TrimSpace(agentName)
	if agentName == "" {
		return ModelProvider{}, fmt.Errorf("from_agent is empty")
	}
	cfg, err := resolveAgentRuntimeConfig(am, userID, agentName)
	if err != nil {
		return ModelProvider{}, err
	}
	alias := strings.TrimSpace(cfg.Agents.Defaults.ModelName)
	mc, err := cfg.GetModelConfig(alias)
	if err != nil || mc == nil {
		return ModelProvider{}, fmt.Errorf("agent %q has no usable model config to reuse", agentName)
	}
	key := strings.TrimSpace(mc.APIKey())
	if key == "" {
		return ModelProvider{}, fmt.Errorf("agent %q has no saved api key to reuse", agentName)
	}
	mp := ModelProvider{
		ModelName: strings.TrimSpace(mc.ModelName),
		Model:     strings.TrimSpace(mc.Model),
		ApiBase:   strings.TrimSpace(mc.APIBase),
		ApiKey:    key,
	}
	if err := fillModelName(&mp); err != nil {
		return ModelProvider{}, fmt.Errorf("agent %q model config is invalid: %w", agentName, err)
	}
	return mp, nil
}

func resolveCreateModelProvider(am *AgentManager, userID string, req *createAgentRequest) (ModelProvider, error) {
	if from := strings.TrimSpace(req.FromAgent); from != "" {
		return modelProviderFromAgent(am, userID, from)
	}
	if req.ModelProvider == nil {
		return ModelProvider{}, fmt.Errorf("either model_provider or from_agent is required")
	}
	mp := *req.ModelProvider
	if err := fillModelName(&mp); err != nil {
		return ModelProvider{}, err
	}
	if strings.TrimSpace(mp.ApiKey) == "" {
		return ModelProvider{}, fmt.Errorf("api_key is required")
	}
	return mp, nil
}

type probeModelProviderRequest struct {
	ModelProvider ModelProvider `json:"model_provider" binding:"required"`
	// AgentName when set, reuse stored api_key if model_provider.api_key is empty.
	AgentName string `json:"agent_name,omitempty"`
}

// POST /api/v1/agents/model-probe — test model provider connectivity without persisting.
func (ar *AgentManagerRouter) probeModelProvider(c *gin.Context) {
	userID := getUserID(c)
	var req probeModelProviderRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	if err := fillModelName(&req.ModelProvider); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	apiKey, err := ar.resolveProbeAPIKey(userID, req.AgentName, req.ModelProvider.ApiKey, req.ModelProvider.ModelName)
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

func (ar *AgentManagerRouter) resolveProbeAPIKey(userID, agentName, provided, modelAlias string) (string, error) {
	if k := strings.TrimSpace(provided); k != "" {
		return k, nil
	}
	agentName = strings.TrimSpace(agentName)
	if agentName == "" {
		return "", fmt.Errorf("api_key is required")
	}
	cfg, err := resolveAgentRuntimeConfig(ar.agentManager, userID, agentName)
	if err != nil {
		return "", err
	}
	alias := strings.TrimSpace(modelAlias)
	if mc, err := cfg.GetModelConfig(alias); err == nil && mc != nil {
		if k := strings.TrimSpace(mc.APIKey()); k != "" {
			return k, nil
		}
	}
	prev := strings.TrimSpace(cfg.Agents.Defaults.ModelName)
	if prev != "" && prev != alias {
		if mc, err := cfg.GetModelConfig(prev); err == nil && mc != nil {
			if k := strings.TrimSpace(mc.APIKey()); k != "" {
				return k, nil
			}
		}
	}
	return "", fmt.Errorf("api_key is required: no saved key found for agent %q", agentName)
}

type agentStatusResp struct {
	Name          string `json:"name"`
	ModelProvider string `json:"model_provider"`
}

// POST /api/v1/agents — create and register a new agent under the user's directory.
func (ar *AgentManagerRouter) createAgent(c *gin.Context) {
	userID := getUserID(c)
	var req createAgentRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	req.Name = strings.TrimSpace(req.Name)
	if err := validateAgentName(req.Name); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	mp, err := resolveCreateModelProvider(ar.agentManager, userID, &req)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	home := agentHomeDir(userID)
	msgBus := bus.NewMessageBus()
	picoclawAgent, err := picoclaw.NewPicoclawAgent(home, msgBus, mp.toPicoModelConfig(mp.ApiKey), req.Name)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	internalKey := AgentKey(userID, req.Name)
	ar.agentManager.AddAgent(internalKey, picoclawAgent, msgBus)

	ginx.NewRender(c, http.StatusCreated).Data(agentStatusResp{Name: req.Name, ModelProvider: mp.Model})
}

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

// PUT /api/v1/agents/:name — replace model provider and restart agent.
func (ar *AgentManagerRouter) updateAgent(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	internalKey := AgentKey(userID, name)

	a, ok := ar.agentManager.Get(internalKey)
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
	home := agentHomeDir(userID)
	msgBus := bus.NewMessageBus()
	picoclawAgent, err := picoclaw.NewPicoclawAgent(home, msgBus, mp.toPicoModelConfig(apiKey), name)
	if err != nil {
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ar.agentManager.AddAgent(internalKey, picoclawAgent, msgBus)

	ginx.NewRender(c).Data(agentStatusResp{Name: name, ModelProvider: mp.Model})
}

// DELETE /api/v1/agents/:name — stop and remove an agent from memory and disk.
func (ar *AgentManagerRouter) deleteAgent(c *gin.Context) {
	userID := getUserID(c)
	name := strings.TrimSpace(c.Param("name"))
	if err := validateAgentName(name); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	internalKey := AgentKey(userID, name)

	if err := ar.agentManager.Remove(internalKey); err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}

	agentDir := filepath.Join(agentHomeDir(userID), name)
	if err := os.RemoveAll(agentDir); err != nil && !os.IsNotExist(err) {
		ginx.NewRender(c, http.StatusInternalServerError).Err(fmt.Errorf("remove agent data: %w", err))
		return
	}
	ginx.NewRender(c).Data(agentStatusResp{Name: name})
}

type workspaceFilesResp struct {
	Workspace string                 `json:"workspace"`
	Files     []picoclaw.PersonaFile `json:"files"`
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

// resolveAgentRuntimeConfig returns the picoclaw config for a user's agent,
// preferring the in-memory running config and falling back to the config.json
// on disk. Shared by AgentManagerRouter and MarketRouter.
func resolveAgentRuntimeConfig(am *AgentManager, userID, name string) (*picoclawconfig.Config, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("agent name is required")
	}
	internalKey := AgentKey(userID, name)
	if a, ok := am.Get(internalKey); ok {
		if loop, ok := a.(*picoagent.AgentLoop); ok && loop != nil {
			if cfg := loop.GetConfig(); cfg != nil {
				return cfg, nil
			}
		}
	}
	home := agentHomeDir(userID)
	cfgPath := picoclaw.AgentConfigPath(home, name)
	if _, err := os.Stat(cfgPath); err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("agent %q not found", name)
		}
		return nil, fmt.Errorf("stat agent config: %w", err)
	}
	return picoclaw.LoadAgentConfig(home, name)
}

func (ar *AgentManagerRouter) resolveAgentConfig(userID, name string) (*picoclawconfig.Config, error) {
	return resolveAgentRuntimeConfig(ar.agentManager, userID, name)
}

func (ar *AgentManagerRouter) resolveAgentWorkspace(userID, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("agent name is required")
	}
	internalKey := AgentKey(userID, name)
	if a, ok := ar.agentManager.Get(internalKey); ok {
		if loop, ok := a.(*picoagent.AgentLoop); ok && loop != nil {
			if cfg := loop.GetConfig(); cfg != nil {
				if ws := strings.TrimSpace(cfg.Agents.Defaults.Workspace); ws != "" {
					return ws, nil
				}
			}
		}
	}
	home := agentHomeDir(userID)
	cfgPath := picoclaw.AgentConfigPath(home, name)
	if _, err := os.Stat(cfgPath); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("agent %q not found", name)
		}
		return "", fmt.Errorf("stat agent config: %w", err)
	}
	return picoclaw.AgentWorkspacePath(home, name), nil
}

// GET /api/v1/agents/:name/skills — list skills visible to the agent.
func (ar *AgentManagerRouter) getAgentSkills(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	workspace, err := ar.resolveAgentWorkspace(userID, name)
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

// GET /api/v1/agents/:name/skills/file?source=&skill=&file= — read one skill markdown file.
func (ar *AgentManagerRouter) getSkillFile(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	source := strings.TrimSpace(c.Query("source"))
	skill := strings.TrimSpace(c.Query("skill"))
	file := strings.TrimSpace(c.Query("file"))
	workspace, err := ar.resolveAgentWorkspace(userID, name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	content, err := picoclaw.ReadSkillFile(workspace, source, skill, file)
	if err != nil {
		renderSkillErr(c, err)
		return
	}
	ginx.NewRender(c).Data(content)
}

type putSkillFileReq struct {
	Content string `json:"content"`
}

// PUT /api/v1/agents/:name/skills/file?source=&skill=&file= — write one skill markdown file.
func (ar *AgentManagerRouter) putSkillFile(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	source := strings.TrimSpace(c.Query("source"))
	skill := strings.TrimSpace(c.Query("skill"))
	file := strings.TrimSpace(c.Query("file"))
	workspace, err := ar.resolveAgentWorkspace(userID, name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	var req putSkillFileReq
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	content, err := picoclaw.WriteSkillFile(workspace, source, skill, file, req.Content)
	if err != nil {
		renderSkillErr(c, err)
		return
	}
	ginx.NewRender(c).Data(content)
}

// DELETE /api/v1/agents/:name/skills?source=&skill= — delete an entire skill package.
func (ar *AgentManagerRouter) deleteSkill(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	source := strings.TrimSpace(c.Query("source"))
	skill := strings.TrimSpace(c.Query("skill"))
	workspace, err := ar.resolveAgentWorkspace(userID, name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	if err := picoclaw.DeleteSkill(workspace, source, skill); err != nil {
		renderSkillErr(c, err)
		return
	}
	ginx.NewRender(c).Data(gin.H{"deleted": skill})
}

func renderSkillErr(c *gin.Context, err error) {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "invalid") || strings.Contains(msg, "escapes") || strings.Contains(msg, "exceeds"):
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
	case strings.Contains(msg, "not found"):
		ginx.NewRender(c, http.StatusNotFound).Err(err)
	default:
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
	}
}

// GET /api/v1/agents/:name/workspace-files — read AGENT.md, SOUL.md, USER.md.
func (ar *AgentManagerRouter) getWorkspaceFiles(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	workspace, err := ar.resolveAgentWorkspace(userID, name)
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

// PUT /api/v1/agents/:name/workspace-files/:file — write one persona markdown file.
func (ar *AgentManagerRouter) putWorkspaceFile(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	filename := c.Param("file")
	workspace, err := ar.resolveAgentWorkspace(userID, name)
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

// POST /api/v1/agents/:name/workspace-files/init — create missing persona files from templates.
func (ar *AgentManagerRouter) initWorkspaceFiles(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	workspace, err := ar.resolveAgentWorkspace(userID, name)
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

// POST /api/v1/agents/:name/workspace-files/:file/generate — AI draft persona markdown from user prompt.
func (ar *AgentManagerRouter) generateWorkspaceFile(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	filename := c.Param("file")
	if err := picoclaw.ValidatePersonaFilename(filename); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}
	cfg, err := ar.resolveAgentConfig(userID, name)
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

type docListResp struct {
	Files []DocFileEntry `json:"files"`
}

// GET /api/v1/agents/:name/docs — list files in agent's docs/ directory.
func (ar *AgentManagerRouter) listDocFiles(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	subpath := c.Query("subpath")
	workspace, err := ar.resolveAgentWorkspace(userID, name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	files, err := ListDocFiles(workspace, subpath)
	if err != nil {
		if strings.Contains(err.Error(), "invalid") {
			ginx.NewRender(c, http.StatusBadRequest).Err(err)
			return
		}
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	ginx.NewRender(c).Data(docListResp{Files: files})
}

// GET /api/v1/agents/:name/docs/*filepath — read a file from agent's docs/ directory.
func (ar *AgentManagerRouter) getDocFile(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	filename := strings.TrimPrefix(c.Param("filepath"), "/")
	workspace, err := ar.resolveAgentWorkspace(userID, name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	content, err := ReadDocFile(workspace, filename)
	if err != nil {
		renderDocErr(c, err)
		return
	}
	ginx.NewRender(c).Data(content)
}

type putDocFileReq struct {
	Content string `json:"content"`
}

// PUT /api/v1/agents/:name/docs/*filepath — create or overwrite a file under docs/.
func (ar *AgentManagerRouter) putDocFile(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	filename := strings.TrimPrefix(c.Param("filepath"), "/")
	workspace, err := ar.resolveAgentWorkspace(userID, name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	var req putDocFileReq
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))
	content, err := WriteDocFile(workspace, filename, req.Content)
	if err != nil {
		renderDocErr(c, err)
		return
	}
	ginx.NewRender(c).Data(content)
}

// DELETE /api/v1/agents/:name/docs/*filepath — remove a file or directory under docs/.
func (ar *AgentManagerRouter) deleteDocFile(c *gin.Context) {
	userID := getUserID(c)
	name := c.Param("name")
	filename := strings.TrimPrefix(c.Param("filepath"), "/")
	workspace, err := ar.resolveAgentWorkspace(userID, name)
	if err != nil {
		ginx.NewRender(c, http.StatusNotFound).Err(err)
		return
	}
	if err := DeleteDocPath(workspace, filename); err != nil {
		renderDocErr(c, err)
		return
	}
	ginx.NewRender(c).Data(gin.H{"deleted": filename})
}

func renderDocErr(c *gin.Context, err error) {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "invalid") || strings.Contains(msg, "exceeds"):
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
	case strings.Contains(msg, "not found"):
		ginx.NewRender(c, http.StatusNotFound).Err(err)
	default:
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
	}
}

// Ensure config import is used (for FinclawHomePath in non-user contexts).
var _ = config.FinclawHomePath
