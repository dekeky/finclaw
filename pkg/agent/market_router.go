package agentruntime

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/pkg/agent/market"
	"github.com/finclaw/pkg/agent/picoclaw"
	"github.com/gin-gonic/gin"
	"github.com/sipeed/picoclaw/pkg/bus"
)

// MarketRouter exposes the desktop AgentHub template catalog and lets users
// create agents from those templates.
type MarketRouter struct {
	agentManager   *AgentManager
	r              *gin.Engine
	authMiddleware gin.HandlerFunc
	client         *market.Client
}

// NewMarketRouter builds a MarketRouter targeting the given AgentHub address.
func NewMarketRouter(agentManager *AgentManager, r *gin.Engine, authMiddleware gin.HandlerFunc, agentHubAddr string) *MarketRouter {
	return &MarketRouter{
		agentManager:   agentManager,
		r:              r,
		authMiddleware: authMiddleware,
		client:         market.New(agentHubAddr),
	}
}

// ConfigRouter registers /api/v1/market/* routes.
func (mr *MarketRouter) ConfigRouter() {
	group := mr.r.Group("/api/v1/market", mr.authMiddleware)
	group.GET("/categories", mr.listCategories)
	group.GET("/templates", mr.listTemplates)
	group.GET("/templates/:name/file", mr.getTemplateFile)
	group.GET("/templates/:name", mr.getTemplate)
	group.POST("/install", mr.installTemplate)
	group.POST("/upload", mr.uploadAgent)
}

func (mr *MarketRouter) listCategories(c *gin.Context) {
	categories, err := mr.client.ListCategories()
	if err != nil {
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}
	ginx.NewRender(c).Data(gin.H{"categories": categories})
}

type marketTemplateListResp struct {
	Templates []market.AgentMeta `json:"templates"`
	Total     int                `json:"total"`
}

func (mr *MarketRouter) listTemplates(c *gin.Context) {
	templates, err := mr.client.ListTemplates(c.Query("category"))
	if err != nil {
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}
	ginx.NewRender(c).Data(marketTemplateListResp{Templates: templates, Total: len(templates)})
}

func (mr *MarketRouter) getTemplate(c *gin.Context) {
	name := strings.TrimSpace(c.Param("name"))
	if name == "" {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("template name is required"))
		return
	}
	detail, err := mr.client.GetTemplate(name)
	if err != nil {
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}
	ginx.NewRender(c).Data(detail)
}

type marketFileResp struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func (mr *MarketRouter) getTemplateFile(c *gin.Context) {
	name := strings.TrimSpace(c.Param("name"))
	path := strings.TrimSpace(c.Query("path"))
	if name == "" || path == "" {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("template name and path are required"))
		return
	}
	content, err := mr.client.GetTemplateFile(name, c.Query("version"), path)
	if err != nil {
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}
	ginx.NewRender(c).Data(marketFileResp{Path: path, Content: content})
}

type installTemplateRequest struct {
	Template string `json:"template" binding:"required"`
	Version  string `json:"version,omitempty"`
	Name     string `json:"name" binding:"required"`
	// FromAgent, when set, reuses an existing agent's model provider (model,
	// api_base and stored api_key) so the user does not have to re-enter
	// credentials. Takes precedence over ModelProvider when both are present.
	FromAgent string `json:"from_agent,omitempty"`
	// ModelProvider is required unless FromAgent is set.
	ModelProvider *ModelProvider `json:"model_provider,omitempty"`
}

type installTemplateResp struct {
	Name          string `json:"name"`
	ModelProvider string `json:"model_provider"`
	Template      string `json:"template"`
	Kind          string `json:"kind"`
	SkillDir      string `json:"skill_dir,omitempty"`
}

// resolveInstallModelProvider picks the model provider for an install request:
// reuse an existing agent's config when from_agent is set, otherwise validate
// the inline model_provider payload.
func (mr *MarketRouter) resolveInstallModelProvider(userID string, req *installTemplateRequest) (ModelProvider, error) {
	if from := strings.TrimSpace(req.FromAgent); from != "" {
		return modelProviderFromAgent(mr.agentManager, userID, from)
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

// POST /api/v1/market/install — download a template from AgentHub, apply it to a
// new agent workspace, then create and register the agent.
func (mr *MarketRouter) installTemplate(c *gin.Context) {
	userID := getUserID(c)
	var req installTemplateRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))

	req.Template = strings.TrimSpace(req.Template)
	req.Name = strings.TrimSpace(req.Name)
	if req.Template == "" {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("template is required"))
		return
	}
	if err := validateAgentName(req.Name); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	mp, err := mr.resolveInstallModelProvider(userID, &req)
	if err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	internalKey := AgentKey(userID, req.Name)
	if _, exists := mr.agentManager.Get(internalKey); exists {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("agent %q already exists", req.Name))
		return
	}

	home := agentHomeDir(userID)
	if _, err := os.Stat(picoclaw.AgentConfigPath(home, req.Name)); err == nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("agent %q already exists", req.Name))
		return
	}

	zipPath, cleanup, err := mr.client.DownloadTemplate(req.Template, req.Version)
	if err != nil {
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}
	defer cleanup()

	// agentDir is created fresh by this request; remove it if any later step
	// fails so a half-installed template does not linger on disk.
	agentDir := filepath.Join(home, req.Name)
	workspace := picoclaw.AgentWorkspacePath(home, req.Name)
	result, err := market.InstallTemplateZip(zipPath, workspace, req.Template)
	if err != nil {
		_ = os.RemoveAll(agentDir)
		ginx.NewRender(c, http.StatusBadRequest).Err(err)
		return
	}

	msgBus := bus.NewMessageBus()
	picoclawAgent, err := picoclaw.NewPicoclawAgent(home, msgBus, mp.toPicoModelConfig(mp.ApiKey), req.Name)
	if err != nil {
		_ = os.RemoveAll(agentDir)
		ginx.NewRender(c, http.StatusInternalServerError).Err(err)
		return
	}
	mr.agentManager.AddAgent(internalKey, picoclawAgent, msgBus)

	ginx.NewRender(c, http.StatusCreated).Data(installTemplateResp{
		Name:          req.Name,
		ModelProvider: mp.Model,
		Template:      req.Template,
		Kind:          result.Kind,
		SkillDir:      result.SkillDir,
	})
}

type uploadAgentRequest struct {
	AgentName   string `json:"agentName" binding:"required"`
	Category    string `json:"category,omitempty"`
	Version     string `json:"version,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
	Summary     string `json:"summary,omitempty"`
	UploadToken string `json:"uploadToken,omitempty"`
}

type uploadAgentResp struct {
	AgentName     string `json:"agentName"`
	Category      string `json:"category"`
	DisplayName   string `json:"displayName"`
	Summary       string `json:"summary"`
	LatestVersion string `json:"latestVersion"`
}

// POST /api/v1/market/upload — zip the agent workspace and upload to AgentHub.
func (mr *MarketRouter) uploadAgent(c *gin.Context) {
	userID := getUserID(c)
	var req uploadAgentRequest
	ginx.PanicIfNotNil(c.ShouldBindJSON(&req))

	req.AgentName = strings.TrimSpace(req.AgentName)
	if req.AgentName == "" {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("agentName is required"))
		return
	}

	// Upload token must be provided in the request body — not read from config file.
	token := strings.TrimSpace(req.UploadToken)
	if token == "" {
		ginx.NewRender(c, http.StatusForbidden).Err(fmt.Errorf("upload token is required — please enter your AgentHub upload token in the dialog"))
		return
	}
	uploadClient := mr.client.WithUploadToken(token)

	internalKey := AgentKey(userID, req.AgentName)
	if _, exists := mr.agentManager.Get(internalKey); !exists {
		ginx.NewRender(c, http.StatusNotFound).Err(fmt.Errorf("agent %q not found", req.AgentName))
		return
	}

	home := agentHomeDir(userID)
	workspace := picoclaw.AgentWorkspacePath(home, req.AgentName)
	if _, err := os.Stat(workspace); err != nil {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("agent workspace not found"))
		return
	}

	meta, err := uploadClient.UploadAgent(workspace, market.UploadAgentRequest{
		AgentName:   req.AgentName,
		Category:    req.Category,
		Version:     req.Version,
		DisplayName: req.DisplayName,
		Summary:     req.Summary,
	})
	if err != nil {
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}

	ginx.NewRender(c, http.StatusCreated).Data(uploadAgentResp{
		AgentName:     meta.AgentName,
		Category:      meta.Category,
		DisplayName:   meta.DisplayName,
		Summary:       meta.Summary,
		LatestVersion: meta.LatestVersion,
	})
}
