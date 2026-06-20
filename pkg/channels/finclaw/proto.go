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
	// Transient indicators the web client understands directly (see useWebSocket).
	// They carry no content and are never cached; their sole job is to tell the
	// client the agent is working so its send-confirm watchdog does not reconnect.
	TypeTypingStart FinMessageType = "typing_start"
	TypeTypingStop  FinMessageType = "typing_stop"
)

// Attachment is a single media file delivered to the web client. The URL is a
// same-origin download path; the client appends its auth token when fetching.
type Attachment struct {
	Type        string `json:"type"` // "image" | "audio" | "video" | "file"
	URL         string `json:"url"`
	Filename    string `json:"filename,omitempty"`
	ContentType string `json:"content_type,omitempty"`
	Caption     string `json:"caption,omitempty"`
}

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
