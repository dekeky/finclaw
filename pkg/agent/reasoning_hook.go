package agentruntime

import (
	"context"
	"strings"

	"github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
)

const reasoningMessageKind = "reasoning"

// finReasoningHook forwards model reasoning_content to the fin WebSocket as separate messages.
// PicoClaw's handleReasoning requires a configured reasoning_channel_id; fin channel has none,
// so reasoning would otherwise be dropped before reaching the UI.
type finReasoningHook struct {
	msgBus *bus.MessageBus
}

func newFinReasoningHook(msgBus *bus.MessageBus) agent.HookRegistration {
	return agent.NamedHook("fin-reasoning-forward", &finReasoningHook{msgBus: msgBus})
}

func (h *finReasoningHook) BeforeLLM(
	ctx context.Context,
	req *agent.LLMHookRequest,
) (*agent.LLMHookRequest, agent.HookDecision, error) {
	return req, agent.HookDecision{Action: agent.HookActionContinue}, nil
}

func (h *finReasoningHook) AfterLLM(
	ctx context.Context,
	resp *agent.LLMHookResponse,
) (*agent.LLMHookResponse, agent.HookDecision, error) {
	if h == nil || h.msgBus == nil || resp == nil || resp.Response == nil {
		return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}
	if resp.Channel != "fin" || strings.TrimSpace(resp.ChatID) == "" {
		return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}

	reasoning := strings.TrimSpace(resp.Response.Reasoning)
	if reasoning == "" {
		reasoning = strings.TrimSpace(resp.Response.ReasoningContent)
	}
	if reasoning == "" {
		return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}

	_ = h.msgBus.PublishOutbound(ctx, bus.OutboundMessage{
		Channel: resp.Channel,
		ChatID:  resp.ChatID,
		Content: reasoning,
		Metadata: map[string]string{
			"message_kind": reasoningMessageKind,
		},
	})

	return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
}
