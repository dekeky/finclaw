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
	ctx, _ := context.WithCancel(context.Background())

	agentManager, err := agentruntime.Init(ctx, finclawConf)
	if err != nil {
		log.Fatalf("❌ Failed to init agent manager: %v", err)
	}

	// 3. Init weixin channels for enabled configs
	initWeixinChannels(ctx, agentManager, finclawConf)

	frouter := router.NewFinClawRouter(finclawConf.RSSServerAddr, agentManager, finclawConf)

	if err := frouter.RoutesInit(); err != nil {
		log.Fatalf("❌ Failed to init routes: %v", err)
	}
	if err := frouter.Run(finclawConf.ServerAddr); err != nil {
		log.Fatalf("❌ Failed to run router: %v", err)
	}
}

// initWeixinChannels 根据配置初始化微信频道
func initWeixinChannels(ctx context.Context, agentManager *agentruntime.AgentManager, conf *finclawconfig.FinclawConfig) {
	if conf.Channels == nil {
		return
	}

	// 获取所有 agent 的名称
	agentNames := agentManager.Names()
	if len(agentNames) == 0 {
		log.Println("⚠️ No agents found, skipping weixin channel init")
		return
	}

	// 默认使用第一个 agent 的 msgBus
	defaultAgentName := agentNames[0]
	msgBus := agentManager.GetMsgBus(defaultAgentName)
	if msgBus == nil {
		log.Printf("⚠️ Failed to get msgBus for agent %s, skipping weixin channel init", defaultAgentName)
		return
	}

	// 遍历所有渠道配置，初始化已启用的微信频道
	for name, chConfig := range conf.Channels {
		if chConfig == nil || !chConfig.Enabled {
			continue
		}
		if chConfig.Weixin == nil {
			continue
		}

		weixinCh, err := weixin.NewWeixinChannel(chConfig.Weixin, msgBus)
		if err != nil {
			log.Printf("⚠️ Failed to create weixin channel %s: %v", name, err)
			continue
		}

		// 设置 finclaw 转发通道，避免两个 goroutine 同时消费
		// msgBus.OutboundChan() 导致消息随机丢失
		if finclawCh := agentManager.GetFinclawOutboundCh(defaultAgentName); finclawCh != nil {
			weixinCh.SetFinclawForwardCh(finclawCh)
		}

		if err := weixinCh.Start(ctx); err != nil {
			log.Printf("⚠️ Failed to start weixin channel %s: %v", name, err)
			continue
		}

		log.Printf("✅ Weixin channel %s started (base_url: %s)", name, chConfig.Weixin.BaseURL)
	}
}
