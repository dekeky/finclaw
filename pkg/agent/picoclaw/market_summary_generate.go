package picoclaw

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/providers"
)

const maxMarketSummaryContextRunes = 2000

// GenerateMarketSummaryRequest controls AI drafting for an AgentHub listing summary.
type GenerateMarketSummaryRequest struct {
	Prompt         string
	CurrentSummary string
	DisplayName    string
}

// GenerateMarketSummary calls the agent LLM to draft or polish a marketplace summary.
func GenerateMarketSummary(ctx context.Context, cfg *picoclawconfig.Config, workspace, agentName string, req GenerateMarketSummaryRequest) (string, error) {
	if cfg == nil {
		return "", fmt.Errorf("agent config is required")
	}

	provider, modelID, err := providers.CreateProvider(cfg)
	if err != nil {
		return "", fmt.Errorf("create provider: %w", err)
	}

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	contextBlock, err := buildMarketSummaryContext(workspace)
	if err != nil {
		return "", err
	}

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = "根据 Agent 的人设与能力，写一段适合 Agent 市场展示的简短简介，突出功能与适用场景。"
	}

	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		displayName = strings.TrimSpace(agentName)
	}

	userParts := []string{
		fmt.Sprintf("Agent 名称：%s", displayName),
	}
	if contextBlock != "" {
		userParts = append(userParts, "Agent 资料：\n"+contextBlock)
	}
	userParts = append(userParts, fmt.Sprintf("用户要求：\n%s", prompt))
	current := strings.TrimSpace(req.CurrentSummary)
	if current != "" {
		userParts = append(userParts, fmt.Sprintf("当前简介草稿（可在其基础上润色改写）：\n%s", current))
	}
	userParts = append(userParts, "请直接输出最终的简介正文，不要加解释性前后缀。禁止输出思考过程、think/reasoning 标签、Markdown 或代码块。")

	messages := []providers.Message{
		{Role: "system", Content: marketSummarySystemPrompt()},
		{Role: "user", Content: strings.Join(userParts, "\n\n---\n\n")},
	}

	resp, err := provider.Chat(ctx, messages, nil, modelID, map[string]any{
		"thinking_level": "off",
	})
	if err != nil {
		return "", fmt.Errorf("llm chat: %w", err)
	}

	content := strings.TrimSpace(resp.Content)
	if content == "" {
		return "", fmt.Errorf("model returned empty content")
	}
	content = stripThinkingFromContent(content)
	content = stripMarkdownCodeFence(content)
	content = strings.TrimSpace(content)
	content = strings.Trim(content, `"“"''`)
	if content == "" {
		return "", fmt.Errorf("model returned only thinking content")
	}
	return content, nil
}

func marketSummarySystemPrompt() string {
	return `你是 Agent 市场文案助手。请根据提供的 Agent 资料，撰写或润色一段用于 AgentHub 市场展示的简介。

要求：
- 使用中文（除非资料明确要求英文）
- 纯文本，1-3 句话，总长度约 40-180 字
- 突出核心能力、适用场景与差异化
- 语气专业、清晰，适合作为市场列表摘要
- 不要标题、不要 Markdown、不要 bullet 列表、不要 emoji 堆砌
- 只输出简介正文`
}

func buildMarketSummaryContext(workspace string) (string, error) {
	if strings.TrimSpace(workspace) == "" {
		return "", nil
	}

	var parts []string

	files, err := ReadPersonaFiles(workspace)
	if err != nil {
		return "", fmt.Errorf("read persona files: %w", err)
	}
	for _, f := range files {
		content := truncateRunes(strings.TrimSpace(f.Content), maxMarketSummaryContextRunes)
		if content == "" {
			continue
		}
		parts = append(parts, fmt.Sprintf("[%s]\n%s", f.Name, content))
	}

	if summary, err := ListAgentSkills(workspace); err == nil {
		var skillLines []string
		for _, sk := range summary.Skills {
			if !sk.Active {
				continue
			}
			line := strings.TrimSpace(sk.Name)
			if desc := strings.TrimSpace(sk.Description); desc != "" {
				line += "：" + truncateRunes(desc, 120)
			}
			if line != "" {
				skillLines = append(skillLines, "- "+line)
			}
		}
		if len(skillLines) > 0 {
			parts = append(parts, "[Skills]\n"+strings.Join(skillLines, "\n"))
		}
	}

	return strings.Join(parts, "\n\n"), nil
}

func truncateRunes(s string, max int) string {
	if max <= 0 || utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max]) + "…"
}
