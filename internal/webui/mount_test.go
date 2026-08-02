package webui

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestStaticServerMissingAssetReturns404(t *testing.T) {
	gin.SetMode(gin.TestMode)

	s, err := NewStaticServer()
	if err != nil {
		t.Fatalf("NewStaticServer: %v", err)
	}

	r := gin.New()
	r.NoRoute(s.Handler())

	req := httptest.NewRequest(http.MethodGet, "/assets/does-not-exist.js", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "<!DOCTYPE html>") {
		t.Fatal("missing asset should not fall back to index.html")
	}
}

func TestStaticServerSPAFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)

	s, err := NewStaticServer()
	if err != nil {
		t.Fatalf("NewStaticServer: %v", err)
	}

	r := gin.New()
	r.NoRoute(s.Handler())

	req := httptest.NewRequest(http.MethodGet, "/chat", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "<!DOCTYPE html>") {
		t.Fatal("SPA route should fall back to index.html")
	}
}

func TestStaticServerPrecompressedAsset(t *testing.T) {
	gin.SetMode(gin.TestMode)

	s, err := NewStaticServer()
	if err != nil {
		t.Fatalf("NewStaticServer: %v", err)
	}

	entry, ok := s.files["assets/markdown-CaHIdFQa.js"]
	if !ok {
		t.Skip("markdown chunk not present in embedded dist")
	}
	if len(entry.gzip) == 0 {
		t.Fatal("expected precomputed gzip payload for markdown chunk")
	}

	r := gin.New()
	r.NoRoute(s.Handler())

	req := httptest.NewRequest(http.MethodGet, "/assets/markdown-CaHIdFQa.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", rec.Header().Get("Content-Encoding"))
	}
	if cl := rec.Header().Get("Content-Length"); cl == "" {
		t.Fatal("expected Content-Length header for precompressed asset")
	}

	body, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if len(body) != len(entry.gzip) {
		t.Fatalf("body len = %d, want %d", len(body), len(entry.gzip))
	}

	gr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	decompressed, err := io.ReadAll(gr)
	if err != nil {
		t.Fatalf("gzip decompress: %v", err)
	}
	if string(decompressed) != string(entry.raw) {
		t.Fatal("decompressed payload does not match raw asset")
	}
}
