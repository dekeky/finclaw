package webui

import (
	"compress/gzip"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// DistFS 嵌入的 dist 根（Vite 输出目录）。
func DistFS() (fs.FS, error) {
	return fs.Sub(distRoot, "dist")
}

func contentType(name string) string {
	switch {
	case strings.HasSuffix(name, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(name, ".js"):
		return "text/javascript; charset=utf-8"
	case strings.HasSuffix(name, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(name, ".woff2"):
		return "font/woff2"
	case strings.HasSuffix(name, ".png"):
		return "image/png"
	case strings.HasSuffix(name, ".svg"):
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}

func cacheControl(rel string) string {
	if rel == "index.html" {
		return "no-cache"
	}
	if strings.HasPrefix(rel, "assets/") {
		return "public, max-age=31536000, immutable"
	}
	return "public, max-age=86400"
}

func shouldCompress(rel string) bool {
	switch {
	case strings.HasSuffix(rel, ".js"), strings.HasSuffix(rel, ".css"),
		strings.HasSuffix(rel, ".html"), strings.HasSuffix(rel, ".svg"):
		return true
	default:
		return false
	}
}

func acceptsGzip(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")
}

func serveStatic(c *gin.Context, data []byte, rel string) {
	ct := contentType(rel)
	c.Header("Cache-Control", cacheControl(rel))

	if c.Request.Method == http.MethodHead {
		c.Header("Content-Type", ct)
		c.Header("Content-Length", strconv.Itoa(len(data)))
		c.Status(http.StatusOK)
		return
	}

	if acceptsGzip(c.Request) && shouldCompress(rel) {
		c.Header("Content-Type", ct)
		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")
		c.Status(http.StatusOK)
		gw := gzip.NewWriter(c.Writer)
		_, _ = gw.Write(data)
		_ = gw.Close()
		return
	}

	c.Data(http.StatusOK, ct, data)
}

// SPANoRoute：静态文件 + 回退 index.html；作为 NoRoute 注册于所有 API 之后。
func SPANoRoute(dist fs.FS) gin.HandlerFunc {
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

		data, err := fs.ReadFile(dist, rel)
		if err != nil {
			data, err = fs.ReadFile(dist, "index.html")
			if err != nil {
				c.AbortWithStatus(http.StatusNotFound)
				return
			}
			rel = "index.html"
		}

		serveStatic(c, data, rel)
	}
}
