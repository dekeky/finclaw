package picoclaw

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/agent"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
)

var validThinkingLevels = map[string]struct{}{
	"off":       {},
	"low":       {},
	"medium":    {},
	"high":      {},
	"xhigh":     {},
	"adaptive":  {},
}

// AgentLLMSettings holds per-agent LLM generation options persisted in config.json.
type AgentLLMSettings struct {
	Temperature     *float64 `json:"temperature,omitempty"`
	ThinkingEnabled bool     `json:"thinking_enabled"`
	ThinkingLevel   string   `json:"thinking_level,omitempty"`
}

// ReadAgentLLMSettings extracts temperature and thinking options from a PicoClaw config.
func ReadAgentLLMSettings(cfg *picoclawconfig.Config) AgentLLMSettings {
	out := AgentLLMSettings{ThinkingLevel: "medium"}
	if cfg == nil {
		return out
	}
	if cfg.Agents.Defaults.Temperature != nil {
		t := *cfg.Agents.Defaults.Temperature
		out.Temperature = &t
	}
	alias := strings.TrimSpace(cfg.Agents.Defaults.ModelName)
	if alias == "" {
		return out
	}
	mc, err := cfg.GetModelConfig(alias)
	if err != nil || mc == nil {
		return out
	}
	level := strings.ToLower(strings.TrimSpace(mc.ThinkingLevel))
	if level == "" || level == "off" {
		return out
	}
	out.ThinkingEnabled = true
	out.ThinkingLevel = level
	return out
}

func validateThinkingLevel(level string, enabled bool) (string, error) {
	level = strings.ToLower(strings.TrimSpace(level))
	if !enabled {
		return "off", nil
	}
	if level == "" || level == "off" {
		level = "medium"
	}
	if _, ok := validThinkingLevels[level]; !ok || level == "off" {
		return "", fmt.Errorf("invalid thinking_level %q", level)
	}
	return level, nil
}

func validateTemperature(t float64) error {
	if t < 0 || t > 2 {
		return fmt.Errorf("temperature must be between 0 and 2")
	}
	return nil
}

// ApplyAgentLLMSettings writes LLM settings into an in-memory PicoClaw config.
func ApplyAgentLLMSettings(cfg *picoclawconfig.Config, settings AgentLLMSettings) error {
	if cfg == nil {
		return fmt.Errorf("nil config when applying llm settings")
	}
	if settings.Temperature != nil {
		t := *settings.Temperature
		if err := validateTemperature(t); err != nil {
			return err
		}
		cfg.Agents.Defaults.Temperature = &t
	}
	alias := strings.TrimSpace(cfg.Agents.Defaults.ModelName)
	if alias == "" {
		return fmt.Errorf("agent has no model configured")
	}
	thinkingLevel, err := validateThinkingLevel(settings.ThinkingLevel, settings.ThinkingEnabled)
	if err != nil {
		return err
	}
	updated := false
	for i, mc := range cfg.ModelList {
		if mc != nil && strings.TrimSpace(mc.ModelName) == alias {
			cfg.ModelList[i].ThinkingLevel = thinkingLevel
			updated = true
			break
		}
	}
	if !updated {
		return fmt.Errorf("model %q not found in model_list", alias)
	}
	return nil
}

// ReloadAgentLLMSettings persists LLM settings and hot-reloads the running agent loop.
func ReloadAgentLLMSettings(loop *agent.AgentLoop, rootDir, agentName string, settings AgentLLMSettings) error {
	if loop == nil {
		return fmt.Errorf("agent loop is nil")
	}
	cfgPath := agentConfigPath(rootDir, agentName)
	picoConf, err := picoclawconfig.LoadConfig(cfgPath)
	if err != nil {
		return fmt.Errorf("load agent config: %w", err)
	}
	if err := ApplyAgentLLMSettings(picoConf, settings); err != nil {
		return err
	}
	if err := picoclawconfig.SaveConfig(cfgPath, picoConf); err != nil {
		return fmt.Errorf("save agent config: %w", err)
	}
	registry := loop.GetRegistry()
	if registry == nil {
		return fmt.Errorf("agent registry is nil")
	}
	defaultAgent := registry.GetDefaultAgent()
	if defaultAgent == nil || defaultAgent.Provider == nil {
		return fmt.Errorf("agent provider is unavailable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := loop.ReloadProviderAndConfig(ctx, defaultAgent.Provider, picoConf); err != nil {
		return fmt.Errorf("reload agent config: %w", err)
	}
	return nil
}
