package agentruntime

import (
	"log"
	"sort"
	"strings"

	"github.com/finclaw/internal/config"
	"github.com/finclaw/pkg/channels/weixin"
)

// StartWeixinChannels starts polling for all enabled weixin channel configs.
func (m *AgentManager) StartWeixinChannels(conf *config.FinclawConfig) {
	m.reloadWeixinChannels(conf, false)
}

// ReloadWeixinChannels stops running weixin channels and restarts from the latest config.
// Call after binding saves a new bot token so polling uses the new credentials.
func (m *AgentManager) ReloadWeixinChannels(conf *config.FinclawConfig) {
	m.reloadWeixinChannels(conf, true)
}

func (m *AgentManager) reloadWeixinChannels(conf *config.FinclawConfig, stopExisting bool) {
	if conf == nil || conf.Channels == nil {
		return
	}

	m.weixinMu.Lock()
	defer m.weixinMu.Unlock()

	if stopExisting {
		for name, ch := range m.weixinChannels {
			_ = ch.Stop(m.ctx)
			delete(m.weixinChannels, name)
			log.Printf("🛑 Weixin channel %s stopped", name)
		}
	}

	agentNames := m.namesLocked()
	if len(agentNames) == 0 {
		log.Println("⚠️ No agents found, skipping weixin channel init")
		return
	}

	defaultAgentName := agentNames[0]
	msgBus := m.msgBusses[defaultAgentName]
	if msgBus == nil {
		log.Printf("⚠️ Failed to get msgBus for agent %s, skipping weixin channel init", defaultAgentName)
		return
	}
	weixinOutCh := m.weixinOutboundChs[defaultAgentName]
	if weixinOutCh == nil {
		log.Printf("⚠️ No weixin outbound queue for agent %s", defaultAgentName)
		return
	}

	if m.weixinChannels == nil {
		m.weixinChannels = make(map[string]*weixin.WeixinChannel)
	}

	for name, chConfig := range conf.Channels {
		if chConfig == nil || !chConfig.Enabled || chConfig.Weixin == nil {
			continue
		}
		if strings.TrimSpace(chConfig.Weixin.Token) == "" {
			log.Printf("⚠️ Weixin channel %s enabled but token is empty, skipping", name)
			continue
		}
		if _, running := m.weixinChannels[name]; running {
			continue
		}

		weixinCh, err := weixin.NewWeixinChannel(chConfig.Weixin, msgBus)
		if err != nil {
			log.Printf("⚠️ Failed to create weixin channel %s: %v", name, err)
			continue
		}
		weixinCh.SetOutboundCh(weixinOutCh)
		if err := weixinCh.Start(m.ctx); err != nil {
			log.Printf("⚠️ Failed to start weixin channel %s: %v", name, err)
			continue
		}
		m.weixinChannels[name] = weixinCh
		log.Printf("✅ Weixin channel %s started (agent=%s, base_url=%s)", name, defaultAgentName, chConfig.Weixin.BaseURL)
	}
}

// namesLocked returns sorted agent names; caller must not hold weixinMu.
func (m *AgentManager) namesLocked() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	names := make([]string, 0, len(m.agents))
	for name := range m.agents {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
