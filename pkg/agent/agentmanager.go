package agentruntime

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/finclaw/internal/config"
	"github.com/finclaw/pkg/agent/picoclaw"
	"github.com/finclaw/pkg/channels/finclaw"
	"github.com/finclaw/pkg/channels/weixin"
	picoagent "github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/media"
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

	// Per-agent delivery queues fed by a single OutboundChan dispatcher per agent.
	// Go channels allow only one reader on OutboundChan; the dispatcher routes by
	// outbound channel name so web (fin) and weixin can run in parallel.
	finclawOutboundChs map[string]chan bus.OutboundMessage
	weixinOutboundChs  map[string]chan bus.OutboundMessage
	outboundDispatcherCancels map[string]context.CancelFunc
	weixinChannels            map[string]*weixin.WeixinChannel
	weixinMu                  sync.Mutex

	// mediaStore is shared by every agent loop and web channel. Refs are random
	// UUIDs (globally unique), so a single store serves all agents and lets the
	// media download route resolve refs without knowing which agent produced them.
	mediaStore media.MediaStore

	mu  sync.RWMutex
	ctx context.Context
}

func NewAgentManager(ctx context.Context, finclawConf *config.FinclawConfig) *AgentManager {
	return &AgentManager{
		ctx:                ctx,
		agents:             make(map[string]*agentEntry),
		msgBusses:          make(map[string]*bus.MessageBus),
		finclawChannel:     make(map[string]*finclaw.FinClawChannel),
		finclawOutboundChs:        make(map[string]chan bus.OutboundMessage),
		weixinOutboundChs:         make(map[string]chan bus.OutboundMessage),
		outboundDispatcherCancels: make(map[string]context.CancelFunc),
		finclawConf:        finclawConf,
		mediaStore:         media.NewFileMediaStore(),
	}
}

// GetMediaStore returns the shared media store used to resolve outbound media
// refs (e.g. when serving the /fin/media download route).
func (m *AgentManager) GetMediaStore() media.MediaStore {
	return m.mediaStore
}

// Register adds an agent under the given name. If an agent with the same name
// is already running it is stopped first.
func (m *AgentManager) AddAgent(name string, agent Agent, msgBus *bus.MessageBus) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.msgBusses[name] = msgBus

	finclawOutCh := make(chan bus.OutboundMessage, 64)
	weixinOutCh := make(chan bus.OutboundMessage, 64)
	m.finclawOutboundChs[name] = finclawOutCh
	m.weixinOutboundChs[name] = weixinOutCh

	finclawChannel := finclaw.NewFinChannel(m.ctx, msgBus, m.finclawConf.FinClawChannelConf)
	finclawChannel.SetMediaStore(m.mediaStore)
	go finclawChannel.ProcessAgentMessage(finclawOutCh)
	m.finclawChannel[name] = finclawChannel
	m.startOutboundDispatcher(name, msgBus, finclawChannel, finclawOutCh, weixinOutCh)

	var agentLoop *picoagent.AgentLoop
	if loop, ok := agent.(*picoagent.AgentLoop); ok {
		// Reuse PicoClaw's media handling: the loop resolves inbound media and
		// emits OutboundMediaMessage for tool-generated files. Without a channel
		// manager wired, the loop falls back to bus.PublishOutboundMedia, which
		// the outbound dispatcher routes to the web channel's SendMedia.
		agentLoop = loop
		loop.SetMediaStore(m.mediaStore)
		if err := loop.MountHook(newFinReasoningHook(msgBus)); err != nil {
			logger.WarnCF("agent", "Failed to mount fin reasoning hook", map[string]any{
				"name":  name,
				"error": err.Error(),
			})
		}
		if err := loop.MountHook(newFinTypingHook(msgBus)); err != nil {
			logger.WarnCF("agent", "Failed to mount fin typing hook", map[string]any{
				"name":  name,
				"error": err.Error(),
			})
		}
	}

	if entry, ok := m.agents[name]; ok {
		entry.cancel()
	}
	ctx, cancel := context.WithCancel(m.ctx)
	m.agents[name] = &agentEntry{agent: agent, cancel: cancel}

	// Surface vision-unsupported retries to the web UI so users learn their
	// model can't process images instead of watching an endless spinner.
	if agentLoop != nil {
		watchVisionUnsupported(ctx, agentLoop, msgBus)
	}
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
	sort.Strings(names)
	return names
}

// GetMsgBus returns the message bus for the given agent name.
func (m *AgentManager) GetMsgBus(name string) *bus.MessageBus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.msgBusses[name]
}

// GetWeixinOutboundCh returns the weixin delivery queue for the given agent.
// The outbound dispatcher routes channel=weixin messages here; WeixinChannel reads it.
func (m *AgentManager) GetWeixinOutboundCh(name string) chan bus.OutboundMessage {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.weixinOutboundChs[name]
}

// startOutboundDispatcher is the sole consumer of msgBus.OutboundChan() for an agent.
// It demultiplexes replies so web (fin) and weixin channels operate in parallel.
func (m *AgentManager) startOutboundDispatcher(
	name string,
	msgBus *bus.MessageBus,
	finclawChannel *finclaw.FinClawChannel,
	finclawOutCh, weixinOutCh chan bus.OutboundMessage,
) {
	if msgBus == nil {
		return
	}
	if cancel, ok := m.outboundDispatcherCancels[name]; ok {
		cancel()
	}
	dispatchCtx, cancel := context.WithCancel(m.ctx)
	m.outboundDispatcherCancels[name] = cancel

	go func() {
		logger.InfoCF("agent", "Outbound dispatcher started", map[string]any{"agent": name})
		for {
			select {
			case <-dispatchCtx.Done():
				return
			case msg, ok := <-msgBus.OutboundChan():
				if !ok {
					return
				}
				target := finclawOutCh
				if msg.Channel == "weixin" {
					target = weixinOutCh
				}
				select {
				case target <- msg:
				case <-dispatchCtx.Done():
					return
				}
			case mediaMsg, ok := <-msgBus.OutboundMediaChan():
				if !ok {
					return
				}
				// Web channel is the only media-capable target today; WeChat has
				// no SendMedia, so non-web media is dropped (logged) for now.
				if mediaMsg.Channel != "" && mediaMsg.Channel != "fin" {
					logger.DebugCF("agent", "Dropping media for non-web channel", map[string]any{
						"agent":   name,
						"channel": mediaMsg.Channel,
					})
					continue
				}
				if finclawChannel == nil {
					continue
				}
				if _, err := finclawChannel.SendMedia(dispatchCtx, mediaMsg); err != nil {
					logger.WarnCF("agent", "Failed to deliver outbound media", map[string]any{
						"agent":   name,
						"chat_id": mediaMsg.ChatID,
						"error":   err.Error(),
					})
				}
			}
		}
	}()
}

// NamesByUser returns agent display names for a given userId.
func (m *AgentManager) NamesByUser(userID string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	prefix := userID + ":"
	names := make([]string, 0)
	for key := range m.agents {
		if strings.HasPrefix(key, prefix) {
			names = append(names, strings.TrimPrefix(key, prefix))
		}
	}
	sort.Strings(names)
	return names
}

// AgentKey returns the internal key for a user's agent.
func AgentKey(userID, agentName string) string {
	return userID + ":" + agentName
}

// ParseAgentKey splits an internal key into userID and agentName.
func ParseAgentKey(key string) (userID, agentName string) {
	parts := strings.SplitN(key, ":", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return "", key
}

// ReloadFromDisk stops the agent under key (if running) and loads it again from disk.
func (m *AgentManager) ReloadFromDisk(internalKey, home, agentName string) error {
	_ = m.Remove(internalKey)
	agentLoop, msgBus, err := picoclaw.LoadAgentByConfig(home, agentName)
	if err != nil {
		return err
	}
	m.AddAgent(internalKey, agentLoop, msgBus)
	return nil
}

// Rename renames an agent directory and updates the in-memory registration key.
func (m *AgentManager) Rename(userID, oldName, newName string) error {
	home := UserAgentHome(userID)
	oldKey := AgentKey(userID, oldName)
	newKey := AgentKey(userID, newName)

	_ = m.Remove(oldKey)
	if err := picoclaw.RenameAgentDir(home, oldName, newName); err != nil {
		if loop, msgBus, loadErr := picoclaw.LoadAgentByConfig(home, oldName); loadErr == nil {
			m.AddAgent(oldKey, loop, msgBus)
		}
		return err
	}
	return m.ReloadFromDisk(newKey, home, newName)
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
	if cancel, ok := m.outboundDispatcherCancels[name]; ok {
		cancel()
		delete(m.outboundDispatcherCancels, name)
	}
	if ch, ok := m.finclawOutboundChs[name]; ok {
		close(ch)
		delete(m.finclawOutboundChs, name)
	}
	if ch, ok := m.weixinOutboundChs[name]; ok {
		close(ch)
		delete(m.weixinOutboundChs, name)
	}
	return nil
}

// Init lists agent names persisted on disk: each immediate subdirectory of FinClaw home
// that contains config.json (same layout as picoclaw agentConfigPath).
// For backward compatibility, it also scans legacy top-level agent dirs (no userId prefix).
func Init(ctx context.Context, finclawConf *config.FinclawConfig) (*AgentManager, error) {
	home := config.FinclawHomePath()
	agentManager := NewAgentManager(ctx, finclawConf)

	// Scan user directories
	userEntries, err := os.ReadDir(home)
	if err != nil {
		if os.IsNotExist(err) {
			return agentManager, nil
		}
		return nil, fmt.Errorf("read finclaw home: %w", err)
	}

	for _, ue := range userEntries {
		if !ue.IsDir() || strings.HasPrefix(ue.Name(), ".") {
			continue
		}
		userDir := filepath.Join(home, ue.Name())
		agentNames, err := agentNamesFromDisk(userDir)
		if err != nil {
			continue
		}
		for _, agentName := range agentNames {
			internalKey := ue.Name() + ":" + agentName
			agentLoop, msgBus, err := picoclaw.LoadAgentByConfig(userDir, agentName)
			if err != nil {
				return nil, fmt.Errorf("load agent by config: %w", err)
			}
			agentManager.AddAgent(internalKey, agentLoop, msgBus)
		}
	}

	return agentManager, nil
}

// UserAgentHome returns the directory for a user's agents.
func UserAgentHome(userID string) string {
	return filepath.Join(config.FinclawHomePath(), userID)
}

// AgentNamesFromDisk returns sorted directory names under home that have agent config.json.
func agentNamesFromDisk(home string) ([]string, error) {
	st, err := os.Stat(home)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("finclaw home: %w", err)
	}
	if !st.IsDir() {
		return nil, fmt.Errorf("finclaw home is not a directory: %s", home)
	}
	entries, err := os.ReadDir(home)
	if err != nil {
		return nil, fmt.Errorf("read finclaw home: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		if name == config.FinclawWorkspace {
			continue
		}
		cfg := filepath.Join(home, name, "config.json")
		fi, err := os.Stat(cfg)
		if err != nil || fi.IsDir() {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}
