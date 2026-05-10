package webui

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

// DistFS 嵌入的 dist 根（Vite 输出目录）。
func DistFS() (fs.FS, error) {
	return fs.Sub(distRoot, "dist")
}

// AgentsDocumentFallback：浏览器整页打开 /agents 时返回 index.html，fetch /agents 仍走 API。
func AgentsDocumentFallback(dist fs.FS) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet || c.Request.URL.Path != "/agents" {
			c.Next()
			return
		}
		if c.Request.Header.Get("Sec-Fetch-Dest") != "document" {
			c.Next()
			return
		}
		data, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			c.Next()
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
		c.Abort()
	}
}

// SPANoRoute：静态文件 + 回退 index.html；作为 NoRoute 注册于所有 API 之后。
func SPANoRoute(dist fs.FS) gin.HandlerFunc {
	fileServer := http.FileServer(http.FS(dist))
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		reqPath := path.Clean(c.Request.URL.Path)
		if strings.Contains(reqPath, "..") {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}

		rel := strings.TrimPrefix(reqPath, "/")
		if rel == "" {
			rel = "index.html"
		}
		if f, err := dist.Open(rel); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}
		data, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	}
}
