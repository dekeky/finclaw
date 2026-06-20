package agentruntime

import (
	"context"

	picoagent "github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// visionUnsupportedError is shown to web users when their chat model cannot
// process the image(s) they sent. Instead of letting PicoClaw silently strip
// the media and answer from the text alone, we abort the turn and surface this
// as a hard error so the user knowingly switches to a vision-capable model.
const visionUnsupportedError = "❌ 当前模型不支持图片识别，本次请求已终止。请在「模型」中切换到支持视觉（多模态）的模型后重新发送。"

// watchVisionUnsupported subscribes to the agent loop's runtime events and, when
// it detects that the LLM rejected an image because the model lacks vision
// support, it aborts the running turn and forwards an error to the web (fin)
// channel.
//
// PicoClaw's default behaviour is to drop the image and retry with text only.
// That is undesirable here: the user explicitly asked about a picture, so a
// text-only answer is misleading. We therefore hard-abort the turn (cancelling
// the in-flight text-only retry before it can produce a reply) and tell the
// user to pick a vision-capable model. The error is sent at most once per turn
// and the subscription is torn down when ctx is cancelled.
func watchVisionUnsupported(ctx context.Context, al *picoagent.AgentLoop, msgBus *bus.MessageBus) {
	if al == nil || msgBus == nil {
		return
	}

	sub := al.SubscribeEvents(32)

	go func() {
		defer al.UnsubscribeEvents(sub.ID)

		// Track turns we've already handled so repeated retries (one per media
		// ref / iteration) don't abort/notify twice.
		handled := make(map[string]struct{})

		for {
			select {
			case <-ctx.Done():
				return
			case evt, ok := <-sub.C:
				if !ok {
					return
				}
				if evt.Kind != picoagent.EventKindLLMRetry {
					continue
				}
				payload, ok := evt.Payload.(picoagent.LLMRetryPayload)
				if !ok || payload.Reason != "vision_unsupported" {
					continue
				}

				inbound := turnInboundContext(evt.Context)
				if inbound == nil || inbound.Channel != "fin" || inbound.ChatID == "" {
					continue
				}

				turnID := evt.Meta.TurnID
				if turnID != "" {
					if _, seen := handled[turnID]; seen {
						continue
					}
					handled[turnID] = struct{}{}
				}

				logger.WarnCF("agent", "Vision unsupported, aborting turn and surfacing error to web UI", map[string]any{
					"chat_id":     inbound.ChatID,
					"turn_id":     turnID,
					"session_key": evt.Meta.SessionKey,
					"error":       payload.Error,
				})

				// Stop PicoClaw from completing the text-only retry: hard-abort
				// the turn so no misleading "answered without the image" reply is
				// produced. Best-effort — if the turn already finished there is
				// nothing to cancel.
				if sessionKey := evt.Meta.SessionKey; sessionKey != "" {
					if err := al.HardAbort(sessionKey); err != nil {
						logger.DebugCF("agent", "Vision-unsupported hard abort skipped", map[string]any{
							"session_key": sessionKey,
							"turn_id":     turnID,
							"error":       err.Error(),
						})
					}
				}

				_ = msgBus.PublishOutbound(ctx, bus.OutboundMessage{
					Channel: inbound.Channel,
					ChatID:  inbound.ChatID,
					Context: bus.InboundContext{
						Channel: inbound.Channel,
						ChatID:  inbound.ChatID,
						Raw: map[string]string{
							"message_kind": "error",
						},
					},
					Content: visionUnsupportedError,
				})
			}
		}
	}()
}
