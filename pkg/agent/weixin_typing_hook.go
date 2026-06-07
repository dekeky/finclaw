package agentruntime

import (
	"context"

	"github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
)

// weixinTypingHook sends typing indicator to WeChat users when the agent starts/stops LLM processing.
// This provides feedback to users while they wait for the agent to respond.
type weixinTypingHook struct {
	msgBus *bus.MessageBus
}

func newWeixinTypingHook(msgBus *bus.MessageBus) agent.HookRegistration {
	return agent.NamedHook("weixin-typing-forward", &weixinTypingHook{msgBus: msgBus})
}

func (h *weixinTypingHook) BeforeLLM(
	ctx context.Context,
	req *agent.LLMHookRequest,
) (*agent.LLMHookRequest, agent.HookDecision, error) {
	if h == nil || h.msgBus == nil || req == nil {
		return req, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}
	if req.Channel != "weixin" {
		return req, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}

	// Send typing start indicator via outbound message with special metadata
	h.msgBus.PublishOutbound(ctx, bus.OutboundMessage{
		Channel:  "weixin",
		ChatID:   req.ChatID,
		Content:  "", // Empty content means typing indicator
		Metadata: map[string]string{"message_kind": "typing_start"},
	})

	return req, agent.HookDecision{Action: agent.HookActionContinue}, nil
}

func (h *weixinTypingHook) AfterLLM(
	ctx context.Context,
	resp *agent.LLMHookResponse,
) (*agent.LLMHookResponse, agent.HookDecision, error) {
	if h == nil || h.msgBus == nil || resp == nil {
		return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}
	if resp.Channel != "weixin" {
		return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}

	// Send typing stop indicator
	h.msgBus.PublishOutbound(ctx, bus.OutboundMessage{
		Channel:  "weixin",
		ChatID:   resp.ChatID,
		Content:  "",
		Metadata: map[string]string{"message_kind": "typing_stop"},
	})

	return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
}