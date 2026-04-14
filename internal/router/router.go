package router

import (
	"log"
	"net/http"
	"path/filepath"
	"runtime"

	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/gin-gonic/gin"
	"github.com/sipeed/picoclaw/pkg/bus"
)

// FinClawRouter handles HTTP and WebSocket routes
type FinClawRouter struct {
	r        *gin.Engine
	bus      *bus.MessageBus
	fchannel *finclaw.FinClawChannel
}

// frontendDir returns <repo>/frontend based on this file's location (independent of process cwd).
func frontendDir() string {
	_, file, _, ok := runtime.Caller(1)
	if !ok {
		return "frontend"
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
	return filepath.Join(root, "frontend")
}

// NewFinClawRouter creates a new router instance
func NewFinClawRouter(b *bus.MessageBus, fchannel *finclaw.FinClawChannel) *FinClawRouter {
	return &FinClawRouter{bus: b, fchannel: fchannel}
}

// RoutesInit configures all HTTP and WebSocket routes
func (fr *FinClawRouter) RoutesInit() {
	fr.r = gin.Default()

	// CORS middleware
	fr.r.Use(CORSMiddleware())

	// Serve static files from frontend/ (repo root, not cwd — ../../web never existed)
	frontDir := frontendDir()
	fr.r.Static("/static", frontDir)
	fr.r.Static("/src", filepath.Join(frontDir, "src"))
	fr.r.StaticFile("/", filepath.Join(frontDir, "index.html"))

	// WebSocket chat endpoints
	fr.r.GET("/chat", fr.handleWebSocket)

	// Health check
	fr.r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"timestamp": "now",
			"services": gin.H{
				"message_bus": fr.bus != nil,
				"websocket":   true,
			},
		})
	})

	log.Println("📡 Routes initialized")
}

// Run starts the HTTP server
func (fr *FinClawRouter) Run(addr string) error {
	log.Printf("🌐 Server starting on %s", addr)
	return fr.r.Run(addr)
}
