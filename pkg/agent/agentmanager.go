package agentruntime

import (
	"context"
	"fmt"
	"sync"

	"github.com/finclaw/internal/config"
	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/logger"
)

type agentEntry struct {
	agent  Agent
	cancel context.CancelFunc
}

type AgentManager struct {
	agents         map[string]*agentEntry
	msgBusses      map[string]*bus.MessageBus
	finclawChannel map[string]*finclaw.FinClawChannel
	finclawConf    *config.FinclawConfig

	mu  sync.RWMutex
	ctx context.Context
}

func NewAgentManager(ctx context.Context, finclawConf *config.FinclawConfig) *AgentManager {
	return &AgentManager{
		ctx:            ctx,
		agents:         make(map[string]*agentEntry),
		msgBusses:      make(map[string]*bus.MessageBus),
		finclawChannel: make(map[string]*finclaw.FinClawChannel),
		finclawConf:    finclawConf,
	}
}

// Register adds an agent under the given name. If an agent with the same name
// is already running it is stopped first.
func (m *AgentManager) AddAgent(name string, agent Agent, msgBus *bus.MessageBus) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.msgBusses[name] = msgBus
	finclawChannel := finclaw.NewFinChannel(m.ctx, msgBus, m.finclawConf.FinClawChannelConf)
	go finclawChannel.ProcessAgentMessage(msgBus.OutboundChan())
	m.finclawChannel[name] = finclawChannel

	if entry, ok := m.agents[name]; ok {
		entry.cancel()
	}
	ctx, cancel := context.WithCancel(m.ctx)
	m.agents[name] = &agentEntry{agent: agent, cancel: cancel}
	go func() {
		if err := agent.Run(ctx); err != nil {
			logger.ErrorCF("agent", "Failed to run agent", map[string]any{
				"name":  name,
				"error": err.Error(),
			})
		}
	}()
}

// Get returns the Agent registered under name, if any.
func (m *AgentManager) Get(name string) (Agent, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	entry, ok := m.agents[name]
	if !ok {
		return nil, false
	}
	return entry.agent, true
}

// GetFinClawChannel returns the FinClawChannel registered under name, if any.
func (m *AgentManager) GetFinClawChannel(name string) (*finclaw.FinClawChannel, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ch, ok := m.finclawChannel[name]
	return ch, ok
}

// Names returns the names of all registered agents.
func (m *AgentManager) Names() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	names := make([]string, 0, len(m.agents))
	for name := range m.agents {
		names = append(names, name)
	}
	return names
}

// Remove stops and removes an agent from the manager.
func (m *AgentManager) Remove(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry, ok := m.agents[name]
	if !ok {
		return fmt.Errorf("agent %q not found", name)
	}
	if entry.cancel != nil {
		entry.cancel()
	}
	delete(m.agents, name)
	delete(m.msgBusses, name)
	delete(m.finclawChannel, name)
	return nil
}
