package picoclaw

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/providers"
)

func NewPicoclawAgent(rootDir string, msgBus *bus.MessageBus, modelConf *picoclawconfig.ModelConfig) (*agent.AgentLoop, error) {
	if err := modelConf.Validate(); err != nil {
		return nil, fmt.Errorf("invalid model config: %w", err)
	}

	provider, _, err := providers.CreateProviderFromConfig(modelConf)
	if err != nil {
		logger.Errorf("failed to create provider for model %q: %v", modelConf.ModelName, err)
		return nil, err
	}

	picoConf, err := newPicoclawConfig(rootDir, modelConf.ModelName)
	if err != nil {
		logger.Errorf("failed to load picoclaw config: %v", err)
		return nil, err
	}

	if err := applyModelConfig(picoConf, modelConf); err != nil {
		return nil, err
	}

	agentLoop := agent.NewAgentLoop(picoConf, msgBus, provider)
	return agentLoop, nil
}

func newPicoclawConfig(rootDir, agentName string) (*picoclawconfig.Config, error) {
	picoConfigPath := filepath.Join(rootDir, agentName, "config.json")
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
