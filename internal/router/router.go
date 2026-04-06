package router

import (
	"fmt"
	"log"
	"net/http"
	"path/filepath"

	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/sipeed/picoclaw/pkg/bus"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// FinClawRouter handles HTTP and WebSocket routes
type FinClawRouter struct {
	r        *gin.Engine
	bus      *bus.MessageBus
	fchannel *finclaw.FinClawChannel
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

	// Serve static files from web directory
	webDir, _ := filepath.Abs("../../web")
	fmt.Println(webDir)
	fr.r.Static("/static", webDir)
	fr.r.StaticFile("/", filepath.Join(webDir, "index.html"))

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
