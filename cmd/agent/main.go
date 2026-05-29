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

	"github.com/finclaw/internal/auth"
	finclawconfig "github.com/finclaw/internal/config"
	"github.com/finclaw/internal/router"
	agentruntime "github.com/finclaw/pkg/agent"
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

	frouter := router.NewFinClawRouter(finclawConf.RSSServerAddr, agentManager, authStore)

	if err := frouter.RoutesInit(); err != nil {
		log.Fatalf("❌ Failed to init routes: %v", err)
	}
	if err := frouter.Run(finclawConf.ServerAddr); err != nil {
		log.Fatalf("❌ Failed to run router: %v", err)
	}
}
