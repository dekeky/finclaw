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

	frouter := router.NewFinClawRouter(finclawConf.RSSServerAddr, agentManager)

	frouter.RoutesInit()
	if err := frouter.Run(finclawConf.ServerAddr); err != nil {
		log.Fatalf("❌ Failed to run router: %v", err)
	}
}
