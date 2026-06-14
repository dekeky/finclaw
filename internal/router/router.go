package router

import (
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/finclaw/internal/auth"
	finclawconfig "github.com/finclaw/internal/config"
	"github.com/finclaw/internal/rss"
	"github.com/finclaw/internal/webui"
	agentruntime "github.com/finclaw/pkg/agent"
	"github.com/finclaw/pkg/channels/weixin"
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

	weixinMu       sync.RWMutex
	weixinChannels map[string]*weixin.WeixinChannel // channel name -> running channel
}

// NewFinClawRouter creates a new router instance
func NewFinClawRouter(rssServerAddr, agentHubAddr string, agentManager *agentruntime.AgentManager, authStore *auth.Store, finclawConf *finclawconfig.FinclawConfig) *FinClawRouter {
	return &FinClawRouter{
		rssServerAddr:  rssServerAddr,
		agentHubAddr:   agentHubAddr,
		agentManager:   agentManager,
		authStore:      authStore,
		finclawConf:    finclawConf,
		weixinChannels: make(map[string]*weixin.WeixinChannel),
	}
}

// RegisterWeixinChannel 注册一个正在运行的微信频道实例，
// 供 PUT /api/weixin/auth/settings 在切换 bound_agent 时调用 Rebind。
func (fr *FinClawRouter) RegisterWeixinChannel(name string, ch *weixin.WeixinChannel) {
	fr.weixinMu.Lock()
	defer fr.weixinMu.Unlock()
	fr.weixinChannels[name] = ch
}

// rebindAllWeixinChannels 让所有已注册的微信频道切换到新的 agent。
// 当前实现按通道名单一切换；多通道场景下需要调用方传入更细的映射，本函数会对所有通道生效。
func (fr *FinClawRouter) rebindAllWeixinChannels(agentName string) int {
	fr.weixinMu.RLock()
	defer fr.weixinMu.RUnlock()
	count := 0
	for _, ch := range fr.weixinChannels {
		if ch.Rebind(agentName) {
			count++
		}
	}
	return count
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
