package picoclaw

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/providers"
)

// GeneratePersonaRequest controls AI generation for a persona markdown file.
type GeneratePersonaRequest struct {
	Prompt         string
	CurrentContent string
	AgentName      string
}

// GeneratePersonaFile calls the agent's configured LLM to draft persona markdown.
func GeneratePersonaFile(ctx context.Context, cfg *picoclawconfig.Config, fileName string, req GeneratePersonaRequest) (string, error) {
	if cfg == nil {
		return "", fmt.Errorf("agent config is required")
	}
	if err := validatePersonaFilename(fileName); err != nil {
		return "", err
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
	ctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	system := personaGenerateSystemPrompt(fileName, req.AgentName)
	userParts := []string{
		fmt.Sprintf("用户要求：\n%s", prompt),
	}
	current := strings.TrimSpace(req.CurrentContent)
	if current != "" {
		userParts = append(userParts, fmt.Sprintf("当前文件内容（可在其基础上改写或续写，除非用户要求完全重写）：\n%s", current))
	}
	userParts = append(userParts, "请直接输出最终的 Markdown 正文，不要加解释性前后缀。禁止输出思考过程、think/reasoning 标签或代码块。")

	messages := []providers.Message{
		{Role: "system", Content: system},
		{Role: "user", Content: strings.Join(userParts, "\n\n---\n\n")},
	}

	llmOpts := map[string]any{
		"thinking_level": "off",
	}

	resp, err := provider.Chat(ctx, messages, nil, modelID, llmOpts)
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
	if content == "" {
		return "", fmt.Errorf("model returned only thinking content")
	}
	return content, nil
}

func personaGenerateSystemPrompt(fileName, agentName string) string {
	agentLabel := strings.TrimSpace(agentName)
	if agentLabel == "" {
		agentLabel = "assistant"
	}
	switch fileName {
	case "AGENT.md":
		return agentMDGeneratePrompt(agentLabel)
	case "SOUL.md":
		return soulMDGeneratePrompt(agentLabel)
	case "USER.md":
		return userMDGeneratePrompt()
	default:
		return "请根据用户要求输出 Markdown 文档正文。"
	}
}

var markdownFenceRE = regexp.MustCompile(`(?s)^` + "```(?:markdown|md)?\n?" + `(.*?)` + "\n?" + "```$")

var (
	thinkBlockREs []*regexp.Regexp
	thinkFenceRE  = regexp.MustCompile("(?is)```(?:think|thinking)\\s*[\\s\\S]*?```")
	thinkOpenTailRE = regexp.MustCompile(`(?is)^<(thinking|redacted_reasoning|redacted_thinking|think)(\s[^>]*)?>[\s\S]*$`)
)

func init() {
	tags := []string{"thinking", "redacted_reasoning", "redacted_thinking", "think"}
	thinkBlockREs = make([]*regexp.Regexp, 0, len(tags))
	for _, tag := range tags {
		pat := `(?is)<` + tag + `(\s[^>]*)?>[\s\S]*?</` + tag + `>`
		thinkBlockREs = append(thinkBlockREs, regexp.MustCompile(pat))
	}
}

// stripThinkingFromContent removes model reasoning/thinking wrappers from assistant output.
func stripThinkingFromContent(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	for {
		prev := s
		for _, re := range thinkBlockREs {
			s = re.ReplaceAllString(s, "")
		}
		s = thinkFenceRE.ReplaceAllString(s, "")
		s = strings.TrimSpace(s)
		if s == prev {
			break
		}
	}
	if m := thinkOpenTailRE.FindStringSubmatch(s); len(m) > 0 {
		// Unclosed think block at start with no body after — drop entire string.
		if idx := strings.Index(strings.ToLower(s), "</"+strings.ToLower(m[1])+">"); idx == -1 {
			return ""
		}
	}
	return strings.TrimSpace(s)
}

func stripMarkdownCodeFence(s string) string {
	s = strings.TrimSpace(s)
	if m := markdownFenceRE.FindStringSubmatch(s); len(m) == 2 {
		return strings.TrimSpace(m[1])
	}
	if strings.HasPrefix(s, "```") {
		lines := strings.Split(s, "\n")
		if len(lines) >= 2 && strings.HasPrefix(lines[0], "```") {
			end := len(lines) - 1
			for end > 0 && !strings.HasPrefix(strings.TrimSpace(lines[end]), "```") {
				end--
			}
			if end > 0 && strings.HasPrefix(strings.TrimSpace(lines[end]), "```") {
				return strings.TrimSpace(strings.Join(lines[1:end], "\n"))
			}
		}
	}
	return s
}

// LoadAgentConfig reads persisted agent config.json from FinClaw home.
func LoadAgentConfig(rootDir, agentName string) (*picoclawconfig.Config, error) {
	return picoclawconfig.LoadConfig(AgentConfigPath(rootDir, agentName))
}
