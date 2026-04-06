package finclaw

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sipeed/picoclaw/pkg/logger"
)

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
		writeMu:   sync.Mutex{}, // 避免回复的消息和ping消息写入时并发冲突
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
			// Send a ping message
			if err := fc.writeMessage(websocket.PingMessage, nil); err != nil {
				logger.WarnCF("finclaw", "Failed to send ping, connection may be closing", map[string]any{
					"conn_id": fc.id,
					"error":   err.Error(),
				})
				// Don't return here, let the readLoop detect the close
			}
		}
	}
}

func (fc *finConn) SetReadDeadline(readTimeout time.Duration) {
	fc.conn.SetReadDeadline(time.Now().Add(readTimeout))
	fc.conn.SetPongHandler(func(appData string) error {
		_ = fc.conn.SetReadDeadline(time.Now().Add(readTimeout))
		return nil
	})
}
