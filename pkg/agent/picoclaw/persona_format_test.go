package picoclaw

import (
	"strings"
	"testing"
)

func TestAgentMDTemplateMatchesPicoClawFrontmatterSplit(t *testing.T) {
	data, err := personaTemplates.ReadFile("templates/AGENT.md")
	if err != nil {
		t.Fatalf("read template: %v", err)
	}
	content := string(data)
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	lines := strings.Split(content, "\n")
	if strings.TrimSpace(lines[0]) != "---" {
		t.Fatalf("AGENT.md must start with ---, got %q", lines[0])
	}
	end := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			end = i
			break
		}
	}
	if end == -1 {
		t.Fatal("AGENT.md missing closing --- for frontmatter")
	}
	body := strings.TrimSpace(strings.Join(lines[end+1:], "\n"))
	if body == "" {
		t.Fatal("AGENT.md body after frontmatter must not be empty")
	}
	if strings.Contains(body, "description:") {
		t.Fatal("description should live in frontmatter, not body")
	}
}

func TestGeneratePromptsMentionPicoClawRules(t *testing.T) {
	if !strings.Contains(agentMDGeneratePrompt("demo"), "name: demo") {
		t.Fatal("AGENT prompt should include name example")
	}
	if !strings.Contains(soulMDGeneratePrompt("demo"), "整文件") {
		t.Fatal("SOUL prompt should mention whole-file injection")
	}
	if !strings.Contains(userMDGeneratePrompt(), "整文件") {
		t.Fatal("USER prompt should mention whole-file injection")
	}
}
