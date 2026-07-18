package picoclaw

import (
	"testing"

	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
)

func TestApplyAgentLLMSettings(t *testing.T) {
	temp := 1.0
	cfg := &picoclawconfig.Config{
		Agents: picoclawconfig.AgentsConfig{
			Defaults: picoclawconfig.AgentDefaults{
				ModelName: "my-model",
			},
		},
		ModelList: []*picoclawconfig.ModelConfig{
			{ModelName: "my-model", Model: "openai/gpt-5"},
		},
	}
	if err := ApplyAgentLLMSettings(cfg, AgentLLMSettings{
		Temperature:     &temp,
		ThinkingEnabled: true,
		ThinkingLevel:   "high",
	}); err != nil {
		t.Fatalf("ApplyAgentLLMSettings() error = %v", err)
	}
	if cfg.Agents.Defaults.Temperature == nil || *cfg.Agents.Defaults.Temperature != 1.0 {
		t.Fatalf("temperature = %v, want 1.0", cfg.Agents.Defaults.Temperature)
	}
	if cfg.ModelList[0].ThinkingLevel != "high" {
		t.Fatalf("thinking_level = %q, want high", cfg.ModelList[0].ThinkingLevel)
	}
	read := ReadAgentLLMSettings(cfg)
	if !read.ThinkingEnabled || read.ThinkingLevel != "high" {
		t.Fatalf("ReadAgentLLMSettings() = %+v, want thinking enabled high", read)
	}
}

func TestApplyAgentLLMSettings_DisableThinking(t *testing.T) {
	cfg := &picoclawconfig.Config{
		Agents: picoclawconfig.AgentsConfig{
			Defaults: picoclawconfig.AgentDefaults{ModelName: "m"},
		},
		ModelList: []*picoclawconfig.ModelConfig{
			{ModelName: "m", Model: "openai/gpt-5", ThinkingLevel: "medium"},
		},
	}
	if err := ApplyAgentLLMSettings(cfg, AgentLLMSettings{ThinkingEnabled: false}); err != nil {
		t.Fatalf("ApplyAgentLLMSettings() error = %v", err)
	}
	if cfg.ModelList[0].ThinkingLevel != "off" {
		t.Fatalf("thinking_level = %q, want off", cfg.ModelList[0].ThinkingLevel)
	}
	read := ReadAgentLLMSettings(cfg)
	if read.ThinkingEnabled {
		t.Fatal("expected thinking disabled")
	}
}
