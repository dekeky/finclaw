package router

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"unicode"

	"github.com/finclaw/internal/auth"
	"github.com/gin-gonic/gin"
)

// mediaRouter registers the authenticated media download endpoint used by the
// web UI to fetch files produced by PicoClaw tools (images, audio, files).
//
// The URL is referenced from <img src> / <a href>, which cannot send an
// Authorization header, so the token is accepted as a query parameter (same as
// the chat WebSocket).
func (fr *FinClawRouter) mediaRouter() {
	fr.r.GET("/fin/media/:refID", fr.handleMediaDownload)
}

func (fr *FinClawRouter) handleMediaDownload(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token query parameter is required"})
		return
	}
	claims, err := auth.ParseToken(token)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}
	user, err := fr.authStore.GetUserByID(claims.UserID)
	if err != nil || user == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	refID := strings.TrimSpace(c.Param("refID"))
	if refID == "" || strings.Contains(refID, "/") {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid media ref"})
		return
	}

	store := fr.agentManager.GetMediaStore()
	if store == nil {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "media store unavailable"})
		return
	}

	localPath, meta, err := store.ResolveWithMeta("media://" + refID)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "media not found"})
		return
	}

	file, err := os.Open(localPath)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "media not found"})
		return
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil || stat.IsDir() {
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "media not found"})
		return
	}

	contentType := strings.TrimSpace(meta.ContentType)
	if contentType != "" {
		c.Header("Content-Type", contentType)
	}
	c.Header("Content-Disposition", mediaContentDisposition(meta.Filename, contentType))
	c.Header("Cache-Control", "private, max-age=300")

	http.ServeContent(c.Writer, c.Request, meta.Filename, stat.ModTime(), file)
}

// mediaContentDisposition shows images inline and forces a download for other
// types. It always sets an RFC 5987 UTF-8 filename* for non-ASCII names.
func mediaContentDisposition(filename, contentType string) string {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		filename = "download"
	}
	filename = strings.ReplaceAll(filename, `"`, `_`)

	disposition := "attachment"
	if strings.HasPrefix(strings.ToLower(contentType), "image/") && !strings.Contains(strings.ToLower(contentType), "svg") {
		disposition = "inline"
	}

	ascii := toASCIIFilename(filename)
	encoded := url.PathEscape(filename)
	return fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`, disposition, ascii, encoded)
}

func toASCIIFilename(filename string) string {
	var b strings.Builder
	for _, r := range filename {
		if r < unicode.MaxASCII && r != '"' && r != '\\' && !unicode.IsControl(r) {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	s := strings.TrimSpace(b.String())
	if s == "" {
		return "download"
	}
	return s
}
