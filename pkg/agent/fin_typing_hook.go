package agentruntime

import (
	"context"

	"github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
)

// finTypingHook gives the web (fin) client an early "agent is working" signal.
//
// The web client arms a send-confirm watchdog after every message it sends and
// reconnects if it receives no server message within a few seconds. Turns that
// produce no early output — most notably vision/image analysis, which goes
// straight into a single long LLM call — would otherwise blow past that window,
// causing a spurious reconnect that drops the in-flight response. Emitting a
// typing_start before each LLM call keeps the connection alive; the final reply
// (or the 120s client fallback) clears the typing state.
type finTypingHook struct {
	msgBus *bus.MessageBus
}

func newFinTypingHook(msgBus *bus.MessageBus) agent.HookRegistration {
	return agent.NamedHook("fin-typing-forward", &finTypingHook{msgBus: msgBus})
}

func (h *finTypingHook) BeforeLLM(
	ctx context.Context,
	req *agent.LLMHookRequest,
) (*agent.LLMHookRequest, agent.HookDecision, error) {
	if h == nil || h.msgBus == nil || req == nil {
		return req, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}
	inbound := turnInboundContext(req.Context)
	if inbound == nil || inbound.Channel != "fin" || inbound.ChatID == "" {
		return req, agent.HookDecision{Action: agent.HookActionContinue}, nil
	}

	_ = h.msgBus.PublishOutbound(ctx, bus.OutboundMessage{
		Channel: inbound.Channel,
		ChatID:  inbound.ChatID,
		Context: bus.InboundContext{
			Channel: inbound.Channel,
			ChatID:  inbound.ChatID,
			Raw: map[string]string{
				"message_kind": "typing_start",
			},
		},
		Content: "",
	})

	return req, agent.HookDecision{Action: agent.HookActionContinue}, nil
}

func (h *finTypingHook) AfterLLM(
	ctx context.Context,
	resp *agent.LLMHookResponse,
) (*agent.LLMHookResponse, agent.HookDecision, error) {
	return resp, agent.HookDecision{Action: agent.HookActionContinue}, nil
}
