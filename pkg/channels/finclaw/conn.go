package finclaw

import (
	"errors"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sipeed/picoclaw/pkg/logger"
)

var ErrConnectionClosed = errors.New("connection closed")

type finConn struct {
	id        string
	conn      *websocket.Conn
	sessionID string
	writeMu   sync.Mutex
}

func newFinConn(id string, conn *websocket.Conn, sessionID string) *finConn {
	return &finConn{
		id:        id,
		conn:      conn,
		sessionID: sessionID,
		writeMu:   sync.Mutex{},
	}
}

func (fc *finConn) close() {
	fc.conn.Close()
}

func (fc *finConn) writeMessage(msgType int, payload []byte) error {
	fc.writeMu.Lock()
	defer fc.writeMu.Unlock()
	return fc.conn.WriteMessage(msgType, payload)
}

func (fc *finConn) writeJson(payload any) error {
	fc.writeMu.Lock()
	defer fc.writeMu.Unlock()
	return fc.conn.WriteJSON(payload)
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
			err := fc.conn.WriteMessage(websocket.PingMessage, nil)
			fc.writeMu.Unlock()
			if err != nil {
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
		}
	}
}

func (fc *finConn) SetReadDeadline(readTimeout time.Duration) {
	fc.conn.SetReadDeadline(time.Now().Add(readTimeout))
	fc.conn.SetPongHandler(func(appData string) error {
		return fc.conn.SetReadDeadline(time.Now().Add(readTimeout))
	})
}
