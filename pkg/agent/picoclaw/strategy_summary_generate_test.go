package picoclaw

import (
	"strings"
	"testing"
)

func TestStrategyLibrarySummarySystemPrompt(t *testing.T) {
	prompt := strategyLibrarySummarySystemPrompt()
	if !strings.Contains(prompt, "策略市场") {
		t.Fatal("expected strategy market guidance in system prompt")
	}
	if !strings.Contains(prompt, "不要编造") {
		t.Fatal("expected no-fabrication guidance in system prompt")
	}
	if !strings.Contains(prompt, "只输出简介正文") {
		t.Fatal("expected body-only instruction in system prompt")
	}
}
