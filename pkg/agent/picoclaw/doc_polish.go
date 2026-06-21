package picoclaw

import (
	"context"
	"fmt"
	"strings"
	"time"

	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/providers"
)

// PolishDocRequest controls AI polish for a markdown document.
type PolishDocRequest struct {
	Prompt         string
	CurrentContent string
}

// PolishDocMarkdown calls the agent LLM to rewrite or polish markdown from a user prompt.
func PolishDocMarkdown(ctx context.Context, cfg *picoclawconfig.Config, req PolishDocRequest) (string, error) {
	if cfg == nil {
		return "", fmt.Errorf("agent config is required")
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return "", fmt.Errorf("prompt is required")
	}

	provider, modelID, err := providers.CreateProvider(cfg)
	if err != nil {
		return "", fmt.Errorf("create provider: %w", err)
	}

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 180*time.Second)
	defer cancel()

	userParts := []string{
		fmt.Sprintf("用户要求：\n%s", prompt),
	}
	current := strings.TrimSpace(req.CurrentContent)
	if current != "" {
		userParts = append(userParts, fmt.Sprintf("当前文档内容（可在其基础上改写，除非用户要求完全重写）：\n%s", current))
	}
	userParts = append(userParts, "请直接输出最终的 Markdown 正文，不要加解释性前后缀。禁止输出思考过程、think/reasoning 标签或代码块。")

	messages := []providers.Message{
		{Role: "system", Content: docPolishSystemPrompt()},
		{Role: "user", Content: strings.Join(userParts, "\n\n---\n\n")},
	}

	resp, err := provider.Chat(ctx, messages, nil, modelID, map[string]any{
		"thinking_level": "off",
	})
	if err != nil {
		return "", fmt.Errorf("llm chat: %w", err)
	}

	out := strings.TrimSpace(resp.Content)
	if out == "" {
		return "", fmt.Errorf("model returned empty content")
	}
	out = stripThinkingFromContent(out)
	out = stripMarkdownCodeFence(out)
	out = strings.TrimSpace(out)
	if out == "" {
		return "", fmt.Errorf("model returned only thinking content")
	}
	return out, nil
}

func docPolishSystemPrompt() string {
	return `你是一名专业的 Markdown 文档编辑助手。根据用户的自然语言要求，对文档进行润色、改写、翻译、扩写、缩写或结构调整。

要求：
1. 保留 Markdown 结构：标题层级、列表、表格、代码块、链接、图片、块引用（以 > 开头的行，含 > **标签**：说明 这类元信息块）等，除非用户明确要求改变结构。
2. 代码块内的代码、URL、文件路径、技术标识符（如 API 名称、变量名）保持原样，除非用户要求修改。
3. 严格遵循用户的具体要求（如翻译语言、语气风格、删减内容等）。
4. 不要添加解释性前后缀；不要输出思考过程或元信息。`
}
