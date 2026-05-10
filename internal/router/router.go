package router

import (
	"fmt"
	"log"
	"net/http"

	"github.com/finclaw/internal/rss"
	"github.com/finclaw/internal/webui"
	agentruntime "github.com/finclaw/pkg/agent"
	"github.com/gin-gonic/gin"
)

// FinClawRouter handles HTTP and WebSocket routes
type FinClawRouter struct {
	r             *gin.Engine
	agentManager  *agentruntime.AgentManager
	rssServerAddr string
}

// NewFinClawRouter creates a new router instance
func NewFinClawRouter(rssServerAddr string, agentManager *agentruntime.AgentManager) *FinClawRouter {
	return &FinClawRouter{rssServerAddr: rssServerAddr, agentManager: agentManager}
}

// RoutesInit configures all HTTP and WebSocket routes
func (fr *FinClawRouter) RoutesInit() error {
	fr.r = gin.Default()
	fr.r.Use(CORSMiddleware())

	dist, err := webui.DistFS()
	if err != nil {
		return fmt.Errorf("webui: %w", err)
	}
	fr.r.Use(webui.AgentsDocumentFallback(dist))

	fr.webSocketRouter()
	fr.rssRouter()
	fr.agentManagerRouter()

	fr.r.NoRoute(webui.SPANoRoute(dist))

	log.Println("📡 Routes initialized")
	return nil
}

func (fr *FinClawRouter) webSocketRouter() {
	fr.r.GET("/ws/chat/:agentName", fr.handleWebSocket)
	fr.r.GET("/chat/:agentName", fr.handleWebSocket)

	// Health check
	fr.r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"timestamp": "now",
			"services": gin.H{
				"websocket": true,
			},
		})
	})
}

func (fr *FinClawRouter) rssRouter() {
	rssRouter := rss.NewRssRouter(fr.rssServerAddr, fr.r)
	rssRouter.ConfigRouter()
}

func (fr *FinClawRouter) agentManagerRouter() {
	agentManagerRouter := agentruntime.NewAgentManagerRouter(fr.agentManager, fr.r)
	agentManagerRouter.ConfigRouter()
}

// Run starts the HTTP server
func (fr *FinClawRouter) Run(addr string) error {
	log.Printf("🌐 Server starting on %s", addr)
	return fr.r.Run(addr)
}
