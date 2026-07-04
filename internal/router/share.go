package router

import (
	"net/http"
	"strings"

	"github.com/dekeky/rssmanager/pkg/ginx"
	agentruntime "github.com/finclaw/pkg/agent"
	"github.com/gin-gonic/gin"
)

func (fr *FinClawRouter) shareRouter() {
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
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "share not found"})
		return
	}
	workspace, err := agentruntime.ResolveAgentWorkspace(fr.agentManager, share.UserID, share.AgentName)
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
