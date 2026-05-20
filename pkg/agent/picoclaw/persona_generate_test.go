package picoclaw

import (
	"strings"
	"testing"
)

func TestStripThinkingFromContent(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"# Agent\n\nRole.", "# Agent\n\nRole."},
		{
			"<think>planning...</think>\n\n# Soul\n\nCalm.",
			"# Soul\n\nCalm.",
		},
		{
			"```think\nhidden\n```\n\n# User",
			"# User",
		},
		{"<thinking>only think</thinking>", ""},
		{"<thinking>only think", ""},
	}
	for _, tc := range tests {
		got := stripThinkingFromContent(tc.in)
		if got != tc.want {
			t.Fatalf("stripThinkingFromContent(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestStripMarkdownCodeFence(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"# Hello", "# Hello"},
		{"```markdown\n# Soul\n\nCalm.\n```", "# Soul\n\nCalm."},
		{"```\nline\n```", "line"},
	}
	for _, tc := range tests {
		got := stripMarkdownCodeFence(tc.in)
		if got != tc.want {
			t.Fatalf("stripMarkdownCodeFence(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPersonaGenerateSystemPrompt(t *testing.T) {
	if !strings.Contains(personaGenerateSystemPrompt("AGENT.md", "test"), "AGENT.md") {
		t.Fatal("expected AGENT prompt")
	}
	if !strings.Contains(personaGenerateSystemPrompt("SOUL.md", "test"), "SOUL.md") {
		t.Fatal("expected SOUL prompt")
	}
}
