package webui

import (
	"bytes"
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

type fileEntry struct {
	raw  []byte
	gzip []byte
}

// StaticServer 启动时预读并预压缩静态资源，避免首屏并发请求时逐请求 gzip 导致连接中断。
type StaticServer struct {
	files map[string]fileEntry
}

// NewStaticServer 从嵌入的 dist 构建内存缓存。
func NewStaticServer() (*StaticServer, error) {
	dist, err := DistFS()
	if err != nil {
		return nil, err
	}

	s := &StaticServer{files: make(map[string]fileEntry)}
	err = fs.WalkDir(dist, ".", func(name string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}

		data, err := fs.ReadFile(dist, name)
		if err != nil {
			return err
		}

		entry := fileEntry{raw: data}
		if shouldCompress(name) {
			var buf bytes.Buffer
			gw := gzip.NewWriter(&buf)
			if _, err := gw.Write(data); err != nil {
				_ = gw.Close()
				return err
			}
			if err := gw.Close(); err != nil {
				return err
			}
			entry.gzip = buf.Bytes()
		}

		s.files[name] = entry
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s, nil
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

func (s *StaticServer) serve(c *gin.Context, entry fileEntry, rel string) {
	ct := contentType(rel)
	c.Header("Cache-Control", cacheControl(rel))

	if c.Request.Method == http.MethodHead {
		body := entry.raw
		if acceptsGzip(c.Request) && len(entry.gzip) > 0 {
			body = entry.gzip
			c.Header("Content-Encoding", "gzip")
			c.Header("Vary", "Accept-Encoding")
		}
		c.Header("Content-Type", ct)
		c.Header("Content-Length", strconv.Itoa(len(body)))
		c.Status(http.StatusOK)
		return
	}

	if acceptsGzip(c.Request) && len(entry.gzip) > 0 {
		c.Header("Content-Type", ct)
		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")
		c.Header("Content-Length", strconv.Itoa(len(entry.gzip)))
		c.Status(http.StatusOK)
		_, _ = c.Writer.Write(entry.gzip)
		return
	}

	c.Data(http.StatusOK, ct, entry.raw)
}

// Handler：静态文件 + SPA 回退 index.html；作为 NoRoute 注册于所有 API 之后。
func (s *StaticServer) Handler() gin.HandlerFunc {
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

		entry, ok := s.files[rel]
		if !ok {
			if strings.HasPrefix(rel, "assets/") {
				c.AbortWithStatus(http.StatusNotFound)
				return
			}
			var fallback bool
			entry, fallback = s.files["index.html"]
			if !fallback {
				c.AbortWithStatus(http.StatusNotFound)
				return
			}
			rel = "index.html"
		}

		s.serve(c, entry, rel)
	}
}

// SPANoRoute 保留兼容；新代码请使用 NewStaticServer。
func SPANoRoute(dist fs.FS) gin.HandlerFunc {
	s := &StaticServer{files: make(map[string]fileEntry)}
	_ = fs.WalkDir(dist, ".", func(name string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil || d.IsDir() {
			return walkErr
		}
		data, err := fs.ReadFile(dist, name)
		if err != nil {
			return err
		}
		entry := fileEntry{raw: data}
		if shouldCompress(name) {
			var buf bytes.Buffer
			gw := gzip.NewWriter(&buf)
			_, _ = gw.Write(data)
			_ = gw.Close()
			entry.gzip = buf.Bytes()
		}
		s.files[name] = entry
		return nil
	})
	return s.Handler()
}
