package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	"github.com/finclaw/internal/auth"
	agentruntime "github.com/finclaw/pkg/agent"
	"github.com/finclaw/pkg/agent/fquant"
	"github.com/gin-gonic/gin"
)

func (fr *FinClawRouter) shareRouter() {
	fr.r.GET("/api/public/share/:token/bars", fr.handlePublicStrategyShareBars)
	fr.r.GET("/api/public/share/:token", fr.handlePublicShare)
}

func (fr *FinClawRouter) handlePublicShare(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	if token == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}
	share, err := fr.authStore.GetAssetShare(token)
	if err != nil {
		strategyShare, sErr := fr.authStore.GetStrategyShare(token)
		if sErr != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "share not found"})
			return
		}
		fr.handlePublicStrategyShare(c, strategyShare)
		return
	}
	// Doc shares now resolve against the account-level shared docs; skill
	// shares stay scoped to the agent workspace that owns the skill.
	var workspace string
	if share.Kind == "skill" {
		workspace, err = agentruntime.ResolveAgentWorkspace(fr.agentManager, share.UserID, share.AgentName)
	} else {
		workspace = agentruntime.AccountDocsRootForUser(share.UserID)
		agentruntime.EnsureAccountDocsSwept(share.UserID)
	}
	if err != nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "shared asset not found"})
		return
	}

	if c.Query("download") != "" {
		meta, metaErr := agentruntime.ResolveShareMeta(share, workspace)
		if metaErr != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": metaErr.Error()})
			return
		}
		if meta.IsDir {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "folder sharing is not supported"})
			return
		}
		data, filename, contentType, err := agentruntime.ServeShareDownload(share, workspace)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.Header("Content-Disposition", agentruntime.AttachmentContentDisposition(filename))
		c.Data(http.StatusOK, contentType, data)
		return
	}

	if strings.EqualFold(c.GetHeader("Accept"), "application/json") || c.Query("format") == "json" {
		meta, err := agentruntime.ResolveShareMeta(share, workspace)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		if meta.IsDir {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "folder sharing is not supported"})
			return
		}
		ginx.NewRender(c).Data(meta)
		return
	}

	meta, err := agentruntime.ResolveShareMeta(share, workspace)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if meta.IsDir {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "folder sharing is not supported"})
		return
	}
	if meta.Content != "" {
		c.Header("Content-Type", "text/plain; charset=utf-8")
		c.String(http.StatusOK, meta.Content)
		return
	}
	data, filename, contentType, err := agentruntime.ServeShareDownload(share, workspace)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", agentruntime.AttachmentContentDisposition(filename))
	c.Data(http.StatusOK, contentType, data)
}

func (fr *FinClawRouter) handlePublicStrategyShare(c *gin.Context, share *auth.StrategyShare) {
	filename := share.StrategyName + ".py"
	if c.Query("download") != "" {
		c.Header("Content-Disposition", agentruntime.AttachmentContentDisposition(filename))
		c.Data(http.StatusOK, "text/x-python; charset=utf-8", []byte(share.Script))
		return
	}

	runs := decodeStrategyShareRuns(share.RunsJSON)
	runs = agentruntime.HydrateStrategyShareRuns(share.UserID, runs)
	meta := gin.H{
		"token":    share.Token,
		"kind":     "strategy",
		"name":     share.Title,
		"path":     share.StrategyName + ".py",
		"is_dir":   false,
		"platform": share.Platform,
		"script":   share.Script,
		"runs":     runs,
	}

	if strings.EqualFold(c.GetHeader("Accept"), "application/json") || c.Query("format") == "json" {
		ginx.NewRender(c).Data(meta)
		return
	}
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.String(http.StatusOK, share.Script)
}

func (fr *FinClawRouter) handlePublicStrategyShareBars(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	if token == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}
	share, err := fr.authStore.GetStrategyShare(token)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "share not found"})
		return
	}
	code := strings.TrimSpace(c.Query("code"))
	if code == "" {
		ginx.NewRender(c, http.StatusBadRequest).Err(fmt.Errorf("code is required"))
		return
	}
	runs := agentruntime.HydrateStrategyShareRuns(share.UserID, decodeStrategyShareRuns(share.RunsJSON))
	if !agentruntime.ShareRunsAllowSymbol(runs, code) {
		ginx.NewRender(c, http.StatusNotFound).Err(fmt.Errorf("symbol not in shared runs"))
		return
	}
	start, end := agentruntime.ShareRunsDateRange(runs)
	if q := strings.TrimSpace(c.Query("start_time")); q != "" {
		start = q
	}
	if q := strings.TrimSpace(c.Query("end_time")); q != "" {
		end = q
	}
	out, err := fquant.New(fr.fquantAddr()).GetBars(c.Request.Context(), []string{code}, nil, start, end)
	if err != nil {
		ginx.NewRender(c, http.StatusBadGateway).Err(err)
		return
	}
	ginx.NewRender(c).Data(out)
}

func decodeStrategyShareRuns(raw string) []any {
	var runs []any
	if trimmed := strings.TrimSpace(raw); trimmed != "" {
		if err := json.Unmarshal([]byte(trimmed), &runs); err != nil {
			return []any{}
		}
	}
	if runs == nil {
		return []any{}
	}
	return runs
}
