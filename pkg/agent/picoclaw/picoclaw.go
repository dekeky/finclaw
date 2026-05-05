package picoclaw

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/providers"
)

func LoadAgentByConfig(rootDir, agentName string) (*agent.AgentLoop, *bus.MessageBus, error) {
	configPath := agentConfigPath(rootDir, agentName)
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return nil, nil, fmt.Errorf("agent config not found")
	}
	conf, err := picoclawconfig.LoadConfig(configPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to load agent config: %w", err)
	}
	conf.Agents.Defaults.ToolFeedback.Enabled = true
	conf.Agents.Defaults.Workspace = agentWorkspacePath(rootDir, agentName)
	provider, _, err := providers.CreateProvider(conf)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create provider for agent: %w", err)
	}
	msgBus := bus.NewMessageBus()
	agentLoop := agent.NewAgentLoop(conf, msgBus, provider)

	return agentLoop, msgBus, nil
}

func NewPicoclawAgent(rootDir string, msgBus *bus.MessageBus, modelConf *picoclawconfig.ModelConfig, agentName string) (*agent.AgentLoop, error) {
	if err := modelConf.Validate(); err != nil {
		return nil, fmt.Errorf("invalid model config: %w", err)
	}

	modelConf.RequestTimeout = 500
	provider, _, err := providers.CreateProviderFromConfig(modelConf)
	if err != nil {
		logger.Errorf("failed to create provider for model %q: %v", modelConf.ModelName, err)
		return nil, err
	}

	picoConf, err := newPicoclawConfig(rootDir, agentName)
	if err != nil {
		logger.Errorf("failed to load picoclaw config: %v", err)
		return nil, err
	}
	picoConf.Agents.Defaults.ToolFeedback.Enabled = true
	picoConf.Agents.Defaults.Workspace = agentWorkspacePath(rootDir, agentName)

	if err := applyModelConfig(picoConf, modelConf); err != nil {
		return nil, err
	}
	picoclawconfig.SaveConfig(agentConfigPath(rootDir, agentName), picoConf)

	// picoConf 在此之后的改动不影响上面已创建的 provider（例如 HTTP request_timeout 须在 CreateProviderFromConfig 之前写入 modelConf）。

	agentLoop := agent.NewAgentLoop(picoConf, msgBus, provider)
	return agentLoop, nil
}

func newPicoclawConfig(rootDir, agentName string) (*picoclawconfig.Config, error) {
	picoConfigPath := agentConfigPath(rootDir, agentName)
	if _, err := os.Stat(picoConfigPath); os.IsNotExist(err) {
		conf := picoclawconfig.DefaultConfig()
		picoclawconfig.SaveConfig(picoConfigPath, conf)
		return conf, nil
	}
	return picoclawconfig.LoadConfig(picoConfigPath)
}

// applyModelConfig 把前端传进来的模型同步到 picoclaw Config 里：
//  1. 注册到 ModelList，使 alias 解析、fallback、thinking_level 等可以工作；
//  2. 设置 Agents.Defaults.ModelName，使 implicit main agent 能拿到正确的 agent.Model。
//
// 如果 ModelList 中已存在同名 alias，则覆盖，避免脏数据。
func applyModelConfig(picoConf *picoclawconfig.Config, modelConf *picoclawconfig.ModelConfig) error {
	if picoConf == nil || modelConf == nil {
		return fmt.Errorf("nil config when applying model config")
	}

	alias := strings.TrimSpace(modelConf.ModelName)
	if alias == "" {
		return fmt.Errorf("model_name is required")
	}

	replaced := false
	for i, mc := range picoConf.ModelList {
		if mc != nil && strings.TrimSpace(mc.ModelName) == alias {
			picoConf.ModelList[i] = modelConf
			replaced = true
			break
		}
	}
	if !replaced {
		picoConf.ModelList = append(picoConf.ModelList, modelConf)
	}

	picoConf.Agents.Defaults.ModelName = alias

	return nil
}

func agentWorkspacePath(rootDir, agentName string) string {
	return filepath.Join(rootDir, agentName, "workspace")
}

func agentConfigPath(rootDir, agentName string) string {
	return filepath.Join(rootDir, agentName, "config.json")
}
