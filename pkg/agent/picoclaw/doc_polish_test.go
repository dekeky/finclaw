package picoclaw

import (
	"strings"
	"testing"
)

func TestDocPolishSystemPrompt(t *testing.T) {
	prompt := docPolishSystemPrompt()
	if !strings.Contains(prompt, "Markdown") {
		t.Fatal("expected Markdown in system prompt")
	}
	if !strings.Contains(prompt, "用户") {
		t.Fatal("expected user requirement guidance in system prompt")
	}
}
