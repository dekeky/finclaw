package router

import (
	"log"
	"net/http"

	"github.com/finclaw/internal/rss"
	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/gin-gonic/gin"
	"github.com/sipeed/picoclaw/pkg/bus"
)

// FinClawRouter handles HTTP and WebSocket routes
type FinClawRouter struct {
	r             *gin.Engine
	bus           *bus.MessageBus
	fchannel      *finclaw.FinClawChannel
	rssServerAddr string
}

// NewFinClawRouter creates a new router instance
func NewFinClawRouter(b *bus.MessageBus, fchannel *finclaw.FinClawChannel, rssServerAddr string) *FinClawRouter {
	return &FinClawRouter{bus: b, fchannel: fchannel, rssServerAddr: rssServerAddr}
}

// RoutesInit configures all HTTP and WebSocket routes
func (fr *FinClawRouter) RoutesInit() {
	fr.r = gin.Default()

	// CORS middleware
	fr.r.Use(CORSMiddleware())

	fr.webSocketRouter()
	fr.rssRouter()

	log.Println("📡 Routes initialized")
}

func (fr *FinClawRouter) webSocketRouter() {
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
}

func (fr *FinClawRouter) rssRouter() {
	rssRouter := rss.NewRssRouter(fr.rssServerAddr, fr.r)
	rssRouter.ConfigRouter()
}

// Run starts the HTTP server
func (fr *FinClawRouter) Run(addr string) error {
	log.Printf("🌐 Server starting on %s", addr)
	return fr.r.Run(addr)
}
