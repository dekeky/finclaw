package router

import (
	"fmt"
	"log"
	"net/http"

	"github.com/finclaw/internal/auth"
	finclawconfig "github.com/finclaw/internal/config"
	"github.com/finclaw/internal/rss"
	"github.com/finclaw/internal/webui"
	agentruntime "github.com/finclaw/pkg/agent"
	"github.com/gin-gonic/gin"
)

// FinClawRouter handles HTTP and WebSocket routes
type FinClawRouter struct {
	r             *gin.Engine
	agentManager  *agentruntime.AgentManager
	finclawConf   *finclawconfig.FinclawConfig
	rssServerAddr string
	agentHubAddr  string
	authStore     *auth.Store
}

// NewFinClawRouter creates a new router instance
func NewFinClawRouter(rssServerAddr, agentHubAddr string, agentManager *agentruntime.AgentManager, authStore *auth.Store, finclawConf *finclawconfig.FinclawConfig) *FinClawRouter {
	return &FinClawRouter{
		rssServerAddr: rssServerAddr,
		agentHubAddr:  agentHubAddr,
		agentManager:  agentManager,
		authStore:     authStore,
		finclawConf:   finclawConf,
	}
}

// RoutesInit configures all HTTP and WebSocket routes
func (fr *FinClawRouter) RoutesInit() error {
	fr.r = gin.Default()
	fr.r.Use(CORSMiddleware())

	dist, err := webui.DistFS()
	if err != nil {
		return fmt.Errorf("webui: %w", err)
	}
	fr.webSocketRouter()
	fr.rssRouter()
	fr.authRouter()
	fr.agentManagerRouter()
	fr.marketRouter()
	fr.weixinRouter()

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
	agentManagerRouter := agentruntime.NewAgentManagerRouter(fr.agentManager, fr.r, auth.AuthMiddleware(fr.authStore))
	agentManagerRouter.ConfigRouter()
}

func (fr *FinClawRouter) marketRouter() {
	marketRouter := agentruntime.NewMarketRouter(fr.agentManager, fr.r, auth.AuthMiddleware(fr.authStore), fr.agentHubAddr)
	marketRouter.ConfigRouter()
}

func (fr *FinClawRouter) authRouter() {
	handler := auth.NewHandler(fr.authStore)
	authGroup := fr.r.Group("/api/v1/auth")
	{
		authGroup.POST("/register", handler.Register)
		authGroup.POST("/login", handler.Login)
		authGroup.GET("/me", auth.AuthMiddleware(fr.authStore), handler.Me)
		authGroup.POST("/refresh", auth.AuthMiddleware(fr.authStore), handler.Refresh)
	}
}

// Run starts the HTTP server
func (fr *FinClawRouter) Run(addr string) error {
	log.Printf("🌐 Server starting on %s", addr)
	return fr.r.Run(addr)
}
