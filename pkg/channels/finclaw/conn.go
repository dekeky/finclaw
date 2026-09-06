package finclaw

import (
	"errors"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sipeed/picoclaw/pkg/logger"
)

var ErrConnectionClosed = errors.New("connection closed")

// DefaultSessionBufferMaxSize is the ring buffer capacity per session when reconnecting.
const DefaultSessionBufferMaxSize = 2000

type CachedMessage struct {
	ID          string
	Content     string
	Role        string
	Kind        string
	Attachments []Attachment
	Timestamp   time.Time
}

// SessionBuffer is a ring buffer that stores recent messages for a session.
type SessionBuffer struct {
	mu       sync.Mutex
	messages []*CachedMessage
	head     int
	size     int
	maxSize  int
}

func NewSessionBuffer(maxSize int) *SessionBuffer {
	if maxSize <= 0 {
		maxSize = DefaultSessionBufferMaxSize
	}
	return &SessionBuffer{
		messages: make([]*CachedMessage, maxSize),
		maxSize:  maxSize,
	}
}

func (sb *SessionBuffer) Push(msg *CachedMessage) {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.messages[sb.head] = msg
	sb.head = (sb.head + 1) % sb.maxSize
	if sb.size < sb.maxSize {
		sb.size++
	}
}

func (sb *SessionBuffer) GetAll() []*CachedMessage {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	if sb.size == 0 {
		return nil
	}
	result := make([]*CachedMessage, 0, sb.size)
	start := (sb.head - sb.size + sb.maxSize) % sb.maxSize
	for i := 0; i < sb.size; i++ {
		idx := (start + i) % sb.maxSize
		result = append(result, sb.messages[idx])
	}
	return result
}

func (sb *SessionBuffer) Clear() {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.head = 0
	sb.size = 0
}

func (sb *SessionBuffer) Size() int {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	return sb.size
}

type finConn struct {
	id        string
	conn      *websocket.Conn
	sessionID string
	writeMu   sync.Mutex
	writeWait time.Duration
}

func newFinConn(id string, conn *websocket.Conn, sessionID string, writeWait time.Duration) *finConn {
	return &finConn{
		id:        id,
		conn:      conn,
		sessionID: sessionID,
		writeMu:   sync.Mutex{},
		writeWait: writeWait,
	}
}

func (fc *finConn) close() {
	fc.conn.Close()
}

// sendCloseFrame sends a WebSocket Close frame before closing the connection.
func (fc *finConn) sendCloseFrame() {
	fc.writeMu.Lock()
	_ = fc.conn.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		time.Now().Add(2*time.Second),
	)
	fc.writeMu.Unlock()
}

func (fc *finConn) writeMessage(msgType int, payload []byte) error {
	fc.writeMu.Lock()
	defer fc.writeMu.Unlock()
	if fc.writeWait > 0 {
		_ = fc.conn.SetWriteDeadline(time.Now().Add(fc.writeWait))
	} else {
		_ = fc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	}
	err := fc.conn.WriteMessage(msgType, payload)
	_ = fc.conn.SetWriteDeadline(time.Time{})
	return err
}

func (fc *finConn) writeJson(payload any) error {
	fc.writeMu.Lock()
	defer fc.writeMu.Unlock()
	if fc.writeWait > 0 {
		_ = fc.conn.SetWriteDeadline(time.Now().Add(fc.writeWait))
	} else {
		_ = fc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	}
	err := fc.conn.WriteJSON(payload)
	_ = fc.conn.SetWriteDeadline(time.Time{})
	return err
}

func (fc *finConn) readMessage() (int, []byte, error) {
	return fc.conn.ReadMessage()
}

func (fc *finConn) pingLoop(interval time.Duration, done <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			fc.writeMu.Lock()
			_ = fc.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			err := fc.conn.WriteMessage(websocket.PingMessage, nil)
			if err != nil {
				fc.writeMu.Unlock()
				// Normal when the peer closed or we already sent a close frame — not worth warning.
				if errors.Is(err, websocket.ErrCloseSent) {
					return
				}
				logger.WarnCF("finclaw", "Failed to send ping, connection may be closing", map[string]any{
					"conn_id": fc.id,
					"error":   err.Error(),
				})
				return
			}
			_ = fc.conn.SetWriteDeadline(time.Time{})
			fc.writeMu.Unlock()
		}
	}
}

func (fc *finConn) SetReadDeadline(readTimeout time.Duration) {
	fc.conn.SetReadDeadline(time.Now().Add(readTimeout))
	fc.conn.SetPongHandler(func(appData string) error {
		return fc.conn.SetReadDeadline(time.Now().Add(readTimeout))
	})
}
