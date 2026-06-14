// Finclaw - AI Agent Backend Framework
// Built on picoclaw's core components
//
// Core Components Used:
//   - pkg/bus.MessageBus    : Message routing hub
//   - pkg/agent.AgentLoop   : Main agent loop
//   - pkg/providers          : LLM provider factory
//   - pkg/session           : Session management
//   - pkg/config             : Configuration management
//   - pkg/ws.Channel        : WebSocket channel for frontend
//   - internal/server       : Gin HTTP server with WebSocket chat

package main

import (
	"context"
	"log"
	"strings"

	"github.com/finclaw/internal/auth"
	finclawconfig "github.com/finclaw/internal/config"
	"github.com/finclaw/internal/router"
	agentruntime "github.com/finclaw/pkg/agent"
	"github.com/finclaw/pkg/channels/weixin"
)

func main() {
	log.Println("🚀 Finclaw Agent Starting...")
	// 1. Load configuration
	finclawConf := finclawconfig.FinConfigGet()
	// 2. Create message bus (the core of the system)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	agentManager, err := agentruntime.Init(ctx, finclawConf)
	if err != nil {
		log.Fatalf("❌ Failed to init agent manager: %v", err)
	}

	authStore, err := auth.NewStore()
	if err != nil {
		log.Fatalf("❌ Failed to init auth store: %v", err)
	}
	defer authStore.Close()

	agentHubAddr := finclawConf.AgentHubAddr
	if agentHubAddr == "" {
		agentHubAddr = finclawconfig.DefaultAgentHubAddr
	}
	frouter := router.NewFinClawRouter(finclawConf.RSSServerAddr, agentHubAddr, agentManager, authStore, finclawConf)

	// 3. Init weixin channels for enabled configs (router needs to register them for rebind)
	initWeixinChannels(ctx, agentManager, finclawConf, frouter)

	if err := frouter.RoutesInit(); err != nil {
		log.Fatalf("❌ Failed to init routes: %v", err)
	}
	if err := frouter.Run(finclawConf.ServerAddr); err != nil {
		log.Fatalf("❌ Failed to run router: %v", err)
	}
}

// initWeixinChannels 根据配置初始化微信频道
func initWeixinChannels(ctx context.Context, agentManager *agentruntime.AgentManager, conf *finclawconfig.FinclawConfig, frouter *router.FinClawRouter) {
	if conf.Channels == nil {
		return
	}

	// 获取所有 agent 的名称
	agentNames := agentManager.Names()
	if len(agentNames) == 0 {
		log.Println("⚠️ No agents found, skipping weixin channel init")
		return
	}

	// 默认 agent：列表中的第一个（没有 bound_agent 配置时使用）
	defaultAgentName := agentNames[0]

	// 遍历所有渠道配置，初始化已绑定的微信频道
	// 判定标准：有 Token（扫码绑定后由前端写入），不再依赖 enabled 字段
	for name, chConfig := range conf.Channels {
		if chConfig == nil || chConfig.Weixin == nil {
			continue
		}
		if chConfig.Weixin.Token == "" {
			log.Printf("ℹ️ Weixin channel %s has no token (not bound), skipping", name)
			continue
		}

		// 解析 bound_agent，匹配 agentManager 中的内部 key（格式 userID:agentName）。
		// 配置里通常只填 agentName，所以做后缀匹配。找不到则回退到默认 agent。
		targetAgent := resolveBoundAgent(agentNames, chConfig.Weixin.BoundAgent, defaultAgentName)

		// 通过 AgentManager 作为 resolver，支持运行时通过 Rebind 切换绑定 agent。
		weixinCh, err := weixin.NewWeixinChannel(chConfig.Weixin, agentManager, targetAgent)
		if err != nil {
			log.Printf("⚠️ Failed to create weixin channel %s: %v", name, err)
			continue
		}

		if err := weixinCh.Start(ctx); err != nil {
			log.Printf("⚠️ Failed to start weixin channel %s: %v", name, err)
			continue
		}

		// 注册到 router 以支持热切换 bound_agent。
		frouter.RegisterWeixinChannel(name, weixinCh)

		log.Printf("✅ Weixin channel %s started (base_url: %s, bound_agent: %s)",
			name, chConfig.Weixin.BaseURL, targetAgent)
	}
}

// resolveBoundAgent 在 agentManager 的内部 key 中查找最匹配 boundAgent 的项。
//
//   - 若 boundAgent 直接存在于 agentNames 中，按精确匹配返回；
//   - 否则匹配后缀 ":boundAgent"（兼容 userID:agentName 格式）；
//   - 都失败时回退到 defaultAgent。
func resolveBoundAgent(agentNames []string, boundAgent, defaultAgent string) string {
	if boundAgent == "" {
		return defaultAgent
	}
	for _, key := range agentNames {
		if key == boundAgent {
			return key
		}
	}
	suffix := ":" + boundAgent
	for _, key := range agentNames {
		if strings.HasSuffix(key, suffix) {
			return key
		}
	}
	log.Printf("⚠️ bound_agent %q not found, fallback to %q", boundAgent, defaultAgent)
	return defaultAgent
}
