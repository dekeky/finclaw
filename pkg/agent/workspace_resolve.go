package agentruntime

import (
	"fmt"
	"os"
	"strings"

	"github.com/finclaw/pkg/agent/picoclaw"
	picoagent "github.com/sipeed/picoclaw/pkg/agent"
)

// ResolveAgentWorkspace returns the on-disk workspace path for a user's agent.
func ResolveAgentWorkspace(m *AgentManager, userID, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("agent name is required")
	}
	internalKey := AgentKey(userID, name)
	if a, ok := m.Get(internalKey); ok {
		if loop, ok := a.(*picoagent.AgentLoop); ok && loop != nil {
			if cfg := loop.GetConfig(); cfg != nil {
				if ws := strings.TrimSpace(cfg.Agents.Defaults.Workspace); ws != "" {
					return ws, nil
				}
			}
		}
	}
	home := UserAgentHome(userID)
	cfgPath := picoclaw.AgentConfigPath(home, name)
	if _, err := os.Stat(cfgPath); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("agent %q not found", name)
		}
		return "", fmt.Errorf("stat agent config: %w", err)
	}
	return picoclaw.AgentWorkspacePath(home, name), nil
}
