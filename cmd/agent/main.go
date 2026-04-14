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
	_ "github.com/finclaw/internal/rss"
	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/providers"
)

func main() {
	log.Println("🚀 Finclaw Agent Starting...")
	// 1. Load configuration
	finclawConf := finclawconfig.FinConfigGet()
	// 2. Create message bus (the core of the system)
	msgBus := bus.NewMessageBus()
	// 4. Create LLM provider from config
	provider, _, err := providers.CreateProvider(finclawConf.Config)
	if err != nil {
		log.Fatalf("❌ Failed to create provider: %v", err)
	}
	// 5. Create agent loop (uses bus + provider)
	agentLoop := agent.NewAgentLoop(finclawConf.Config, msgBus, provider)
	ctx, _ := context.WithCancel(context.Background())
	log.Println("✅ Finclaw Agent Ready!")
	go func() {
		if err := agentLoop.Run(ctx); err != nil {
			log.Printf("❌ Agent loop error: %v", err)
		}
	}()

	fchannel := finclaw.NewFinChannel(ctx, msgBus, finclawConf.FinClawChannelConf)
	go fchannel.ProcessAgentMessage(msgBus.OutboundChan())
	frouter := router.NewFinClawRouter(msgBus, fchannel)
	frouter.RoutesInit()
	if err := frouter.Run(finclawConf.ServerAddr); err != nil {
		log.Fatalf("❌ Failed to run router: %v", err)
	}
}
