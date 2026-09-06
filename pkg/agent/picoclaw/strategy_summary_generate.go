package picoclaw

import (
	"context"
	"fmt"
	"strings"
	"time"

	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/providers"
)

const maxStrategySummaryScriptRunes = 3000

// GenerateStrategyLibrarySummaryRequest controls AI drafting for a strategy-library listing summary.
type GenerateStrategyLibrarySummaryRequest struct {
	Prompt         string
	CurrentSummary string
	Title          string
	StrategyName   string
	Platform       string
	Script         string
}

// GenerateStrategyLibrarySummary calls the agent LLM to draft or polish a strategy-market summary.
func GenerateStrategyLibrarySummary(ctx context.Context, cfg *picoclawconfig.Config, req GenerateStrategyLibrarySummaryRequest) (string, error) {
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

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = "根据策略名称与代码，写一段适合策略市场展示的简短简介，突出思路、适用场景与注意事项。"
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = strings.TrimSpace(req.StrategyName)
	}

	userParts := []string{
		fmt.Sprintf("策略名称：%s", strings.TrimSpace(req.StrategyName)),
	}
	if title != "" && title != strings.TrimSpace(req.StrategyName) {
		userParts = append(userParts, fmt.Sprintf("展示标题：%s", title))
	}
	if platform := strings.TrimSpace(req.Platform); platform != "" {
		userParts = append(userParts, fmt.Sprintf("策略平台：%s", platform))
	}
	if script := truncateRunes(strings.TrimSpace(req.Script), maxStrategySummaryScriptRunes); script != "" {
		userParts = append(userParts, "策略代码：\n"+script)
	}
	userParts = append(userParts, fmt.Sprintf("用户要求：\n%s", prompt))
	if current := strings.TrimSpace(req.CurrentSummary); current != "" {
		userParts = append(userParts, fmt.Sprintf("当前简介草稿（可在其基础上润色改写）：\n%s", current))
	}
	userParts = append(userParts, "请直接输出最终的简介正文，不要加解释性前后缀。禁止输出思考过程、think/reasoning 标签、Markdown 或代码块。")

	messages := []providers.Message{
		{Role: "system", Content: strategyLibrarySummarySystemPrompt()},
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

func strategyLibrarySummarySystemPrompt() string {
	return `你是量化策略市场文案助手。请根据提供的策略资料，撰写或润色一段用于策略市场展示的简介。

要求：
- 使用中文（除非资料明确要求英文）
- 纯文本，1-3 句话，总长度约 40-180 字
- 突出策略思路、适用场景、核心逻辑与注意事项
- 语气专业、清晰，适合作为市场列表摘要
- 不要标题、不要 Markdown、不要 bullet 列表、不要 emoji 堆砌
- 不要编造代码中不存在的指标、标的或收益承诺
- 只输出简介正文`
}
