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
	inbound := turnInboundContext(req.Context)
	if inbound == nil || inbound.Channel != "weixin" {
		return req, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}

	_ = h.msgBus.PublishOutbound(ctx, bus.OutboundMessage{
		Channel: "weixin",
		ChatID:  inbound.ChatID,
		Context: bus.InboundContext{
			Channel: "weixin",
			ChatID:  inbound.ChatID,
			Raw: map[string]string{
				"message_kind": "typing_start",
			},
		},
		Content: "",
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
	inbound := turnInboundContext(resp.Context)
	if inbound == nil || inbound.Channel != "weixin" {
		return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}

	_ = h.msgBus.PublishOutbound(ctx, bus.OutboundMessage{
		Channel: "weixin",
		ChatID:  inbound.ChatID,
		Context: bus.InboundContext{
			Channel: "weixin",
			ChatID:  inbound.ChatID,
			Raw: map[string]string{
				"message_kind": "typing_stop",
			},
		},
		Content: "",
	})

	return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
}
