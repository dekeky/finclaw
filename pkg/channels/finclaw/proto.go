package finclaw

type (
	FinMessageType string
)

// Protocol message types.
const (
	TypePing        FinMessageType = "ping"
	TypePong        FinMessageType = "pong"
	TypeConnected   FinMessageType = "connected"
	TypeError       FinMessageType = "error"
	TypeMessageSend FinMessageType = "message.send"
)

type FinMessage struct {
	Type      FinMessageType `json:"type"`
	ID        string         `json:"id,omitempty"`
	SessionID string         `json:"session_id,omitempty"`
	Timestamp int64          `json:"timestamp,omitempty"`
	Payload   map[string]any `json:"payload,omitempty"`
}

func NewFinMessage(fmsgType FinMessageType, payload map[string]any) *FinMessage {
	return &FinMessage{
		Type:    fmsgType,
		Payload: payload,
	}
}

// newError creates an error PicoMessage.
func newError(message string) *FinMessage {
	return NewFinMessage(TypeError, map[string]any{
		"message": message,
	})
}
