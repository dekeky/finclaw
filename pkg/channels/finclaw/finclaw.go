package finclaw

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/logger"
)

type FinChannelConfig struct {
	ReadTimeout  time.Duration `toml:"readTimeout"`  // in seconds，默认60s，当客户端持续一段时间未发送消息时，会关闭连接
	PingInterval time.Duration `toml:"pingInterval"` // in seconds，默认30s，用户探活
	WriteWait    time.Duration `toml:"writeWait"`    // in seconds，默认10s，写超时，防止慢客户端阻塞
	MaxConn      int           `toml:"maxConn"`      // 最大连接数，默认1000
}

func (config *FinChannelConfig) getReadTimeout() time.Duration {
	if config.ReadTimeout <= 0 {
		return 60 * time.Second
	}
	return config.ReadTimeout * time.Second
}

func (config *FinChannelConfig) getPingInterval() time.Duration {
	if config.PingInterval <= 0 {
		return 30 * time.Second
	}
	return config.PingInterval * time.Second
}

func (config *FinChannelConfig) getWriteWait() time.Duration {
	if config.WriteWait <= 0 {
		return 10 * time.Second
	}
	return config.WriteWait * time.Second
}

func (config *FinChannelConfig) getMaxConn() int {
	if config.MaxConn <= 0 {
		return 1000
	}
	return config.MaxConn
}

type FinClawChannel struct {
	*channels.BaseChannel
	Ctx          context.Context
	upgrader     websocket.Upgrader
	conns        map[string]*finConn
	sessionConns map[string]map[string]*finConn // sessionID -> connID -> *picoConn
	connsMu      sync.RWMutex
	sessionBufs  map[string]*SessionBuffer // sessionID -> cached messages buffer
	bufMu        sync.Mutex
	config       *FinChannelConfig
	closed       atomic.Bool
}

func NewFinChannel(ctx context.Context, messageBus *bus.MessageBus, config *FinChannelConfig) *FinClawChannel {
	base := channels.NewBaseChannel("fin", nil, messageBus, nil)
	return &FinClawChannel{
		Ctx:         ctx,
		BaseChannel: base,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		conns:        make(map[string]*finConn),
		sessionConns: make(map[string]map[string]*finConn),
		sessionBufs:  make(map[string]*SessionBuffer),
		config:       config,
	}
}

// close marks the channel as closed.
func (fchannel *FinClawChannel) Close() {
	fchannel.closed.Store(true)
}

func (fchannel *FinClawChannel) isClosed() bool {
	return fchannel.closed.Load()
}

func (fchannel *FinClawChannel) getSessionBuffer(sessionID string) *SessionBuffer {
	fchannel.bufMu.Lock()
	defer fchannel.bufMu.Unlock()
	buf, ok := fchannel.sessionBufs[sessionID]
	if !ok {
		buf = NewSessionBuffer(200)
		fchannel.sessionBufs[sessionID] = buf
	}
	return buf
}

func (fchannel *FinClawChannel) clearSessionBuffer(sessionID string) {
	fchannel.bufMu.Lock()
	defer fchannel.bufMu.Unlock()
	if buf, ok := fchannel.sessionBufs[sessionID]; ok {
		buf.Clear()
		delete(fchannel.sessionBufs, sessionID)
	}
}

// flushSessionBuffer sends all cached messages to a reconnecting client.
// After successful delivery, the buffer is cleared to avoid re-delivery.
func (fchannel *FinClawChannel) flushSessionBuffer(sessionID string, fconn *finConn) {
	buf := fchannel.getSessionBuffer(sessionID)
	cached := buf.GetAll()
	if len(cached) == 0 {
		return
	}

	logger.InfoCF("fin", "Flushing cached messages to reconnecting client", map[string]any{
		"session_id": sessionID,
		"count":      len(cached),
		"conn_id":    fconn.id,
	})

	for _, msg := range cached {
		payload := map[string]any{
			"content": msg.Content,
			"role":    msg.Role,
		}
		if msg.Kind != "" {
			payload["message_kind"] = msg.Kind
		}
		response := map[string]any{
			"type":       TypeMessageSend,
			"id":         msg.ID,
			"from_cache": true,
			"payload":    payload,
		}
		if err := fconn.writeJson(response); err != nil {
			logger.WarnCF("fin", "Failed to deliver cached message", map[string]any{
				"conn_id": fconn.id,
				"msg_id":  msg.ID,
				"error":   err.Error(),
			})
			break
		}
	}

	// Clear buffer after flush (messages either delivered or lost)
	fchannel.clearSessionBuffer(sessionID)
}

// handleWebSocket upgrades the HTTP connection and manages the WebSocket lifecycle.
func (fchannel *FinClawChannel) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := fchannel.upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.ErrorCF("finclaw", "WebSocket upgrade failed", map[string]any{
			"error": err.Error(),
		})
		return
	}

	// Determine session ID from query param or generate one
	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		sessionID = uuid.New().String()
	}

	fconn, err := fchannel.createAndAddConnection(conn, sessionID)
	if err != nil {
		_ = conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "too many connections"),
			time.Now().Add(2*time.Second),
		)
		_ = conn.Close()
		return
	}

	// Send connected message so the client knows its sessionID
	connectedMsg := &FinMessage{
		Type:      TypeConnected,
		SessionID: sessionID,
	}
	if writeErr := fconn.writeJson(connectedMsg); writeErr != nil {
		logger.WarnCF("finclaw", "Failed to send connected message", map[string]any{
			"conn_id": fconn.id,
			"error":   writeErr.Error(),
		})
		fconn.close()
		fchannel.removeConnection(fconn.id)
		return
	}

	logger.InfoCF("finclaw", "WebSocket client connected", map[string]any{
		"conn_id":    fconn.id,
		"session_id": sessionID,
	})

	// Flush cached messages to reconnecting client
	fchannel.flushSessionBuffer(sessionID, fconn)

	go fchannel.readLoop(fconn)
}

// createAndAddConnection checks MaxConnections and registers a connection atomically.
func (fchannel *FinClawChannel) createAndAddConnection(conn *websocket.Conn, sessionID string) (*finConn, error) {
	fchannel.connsMu.Lock()
	defer fchannel.connsMu.Unlock()

	if len(fchannel.conns) >= fchannel.config.getMaxConn() {
		return nil, fmt.Errorf("max connections reached")
	}

	var connID string
	for {
		connID = uuid.New().String()
		if _, exists := fchannel.conns[connID]; !exists {
			break
		}
	}

	fconn := newFinConn(connID, conn, sessionID, fchannel.config.getWriteWait())
	fchannel.conns[fconn.id] = fconn
	bySession, ok := fchannel.sessionConns[fconn.sessionID]
	if !ok {
		bySession = make(map[string]*finConn)
		fchannel.sessionConns[fconn.sessionID] = bySession
	}
	bySession[fconn.id] = fconn

	return fconn, nil
}

// readLoop reads messages from a WebSocket connection.
func (fchannel *FinClawChannel) readLoop(fconn *finConn) {
	defer func() {
		fconn.sendCloseFrame()
		fconn.close()
		if removed := fchannel.removeConnection(fconn.id); removed != nil {
			logger.InfoCF("fin", "WebSocket client disconnected", map[string]any{
				"conn_id":    removed.id,
				"session_id": removed.sessionID,
			})
		}
	}()

	fconn.SetReadDeadline(fchannel.config.getReadTimeout())
	// Start ping ticker
	go fconn.pingLoop(fchannel.config.getPingInterval(), fchannel.Ctx.Done())

	for {
		select {
		case <-fchannel.Ctx.Done():
			return
		default:
		}
		if fchannel.isClosed() {
			return
		}

		_, rawMsg, err := fconn.readMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				logger.DebugCF("fin", "WebSocket read error", map[string]any{
					"conn_id": fconn.id,
					"error":   err.Error(),
				})
			}
			return
		}

		var msg FinMessage
		if err := json.Unmarshal(rawMsg, &msg); err != nil {
			logger.ErrorCF("fin", "Failed to parse message", map[string]any{
				"conn_id": fconn.id,
				"error":   err.Error(),
				"raw":     string(rawMsg),
			})
			errMsg := newError("failed to parse message")
			fconn.writeJson(errMsg)
			continue
		}

		logger.InfoCF("fin", "Received message", map[string]any{
			"conn_id":    fconn.id,
			"msg_type":   msg.Type,
			"msg_id":     msg.ID,
			"session_id": msg.SessionID,
		})

		fchannel.handleMessage(fconn, msg)
	}
}

// removeConnection deletes a connection from indexes and returns it when found.
func (fchannel *FinClawChannel) removeConnection(connID string) *finConn {
	fchannel.connsMu.Lock()
	defer fchannel.connsMu.Unlock()

	pc, ok := fchannel.conns[connID]
	if !ok {
		return nil
	}

	delete(fchannel.conns, connID)
	if bySession, ok := fchannel.sessionConns[pc.sessionID]; ok {
		delete(bySession, connID)
		if len(bySession) == 0 {
			delete(fchannel.sessionConns, pc.sessionID)
		}
	}

	return pc
}

// handleMessage processes an inbound Pico Protocol message.
func (fchannel *FinClawChannel) handleMessage(fconn *finConn, msg FinMessage) {
	logger.DebugCF("fin", "Handling message", map[string]any{
		"conn_id": fconn.id,
		"type":    msg.Type,
	})

	switch msg.Type {
	case TypePing:
		logger.DebugCF("fin", "Ping received", map[string]any{"conn_id": fconn.id})
		// JSON-level ping also resets the read deadline, keeping the connection alive
		fconn.SetReadDeadline(fchannel.config.getReadTimeout())
		pong := NewFinMessage(TypePong, nil)
		pong.ID = msg.ID
		fconn.writeJson(pong)

	case TypeMessageSend:
		logger.DebugCF("fin", "Processing message.send", map[string]any{
			"conn_id":    fconn.id,
			"session_id": msg.SessionID,
		})
		fchannel.handleMessageSend(fconn, msg)

	default:
		logger.WarnCF("fin", "Unknown message type", map[string]any{
			"conn_id": fconn.id,
			"type":    msg.Type,
		})
		errMsg := newError(fmt.Sprintf("unknown message type: %s", msg.Type))
		fconn.writeJson(errMsg)
	}
}

// handleMessageSend processes an inbound message.send from a client.
func (fchannel *FinClawChannel) handleMessageSend(fconn *finConn, msg FinMessage) {
	content, _ := msg.Payload["content"].(string)
	logger.InfoCF("fin", "handleMessageSend called", map[string]any{
		"conn_id":    fconn.id,
		"session_id": msg.SessionID,
		"content":    content,
		"payload":    msg.Payload,
	})
	if strings.TrimSpace(content) == "" {
		logger.WarnCF("fin", "Empty message content", map[string]any{"conn_id": fconn.id})
		errMsg := newError("message content is empty")
		fconn.writeJson(errMsg)
		return
	}

	sessionID := msg.SessionID
	if sessionID == "" {
		sessionID = fconn.sessionID
	}

	chatID := genChatID(sessionID)

	peer := bus.Peer{Kind: "direct", ID: "fin:" + sessionID}

	metadata := map[string]string{
		"platform":   "fin",
		"session_id": sessionID,
		"conn_id":    fconn.id,
	}

	logger.InfoCF("fin", "Sending message to bus", map[string]any{
		"session_id": sessionID,
		"chat_id":    chatID,
		"peer":       peer.ID,
		"preview":    truncate(content, 50),
		"metadata":   metadata,
	})

	fchannel.HandleMessage(fchannel.Ctx, peer, msg.ID, "", chatID, content, nil, metadata)

	logger.InfoCF("fin", "Message sent to bus", map[string]any{
		"session_id": sessionID,
		"msg_id":     msg.ID,
	})
}

// truncate truncates a String to maxLen runes.
func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}

func (fchannel *FinClawChannel) ProcessAgentMessage(outbound <-chan bus.OutboundMessage) {
	for agentMsg := range outbound {
		logger.InfoCF("fin", "Processing agent message", map[string]any{
			"chat_id": agentMsg.ChatID,
			"content": agentMsg.Content,
		})

		sessionId := extractSessionIDFromChatId(agentMsg.ChatID)
		fchannel.connsMu.RLock()
		conns := fchannel.sessionConns[sessionId]
		fchannel.connsMu.RUnlock()

		// Format message for frontend - match frontend's expected format
		msgId := uuid.New().String()
		payload := map[string]any{
			"content": agentMsg.Content,
			"role":    "assistant",
		}
		if kind := agentMsg.Metadata["message_kind"]; kind != "" {
			payload["message_kind"] = kind
		}
		response := map[string]any{
			"type":    TypeMessageSend,
			"id":      msgId,
			"payload": payload,
		}

		// 异步发送给所有订阅该 session 的客户端，一个慢客户端不 block 消息循环
		for _, fconn := range conns {
			go func(conn *finConn) {
				if err := conn.writeJson(response); err != nil {
					logger.WarnCF("fin", "Failed to deliver message to client, closing connection", map[string]any{
						"conn_id":    conn.id,
						"session_id": sessionId,
						"error":      err.Error(),
					})
					conn.sendCloseFrame()
					conn.close()
					fchannel.removeConnection(conn.id)
				}
			}(fconn)
		}

		// Also cache the message so it can be delivered to reconnecting clients
		fchannel.getSessionBuffer(sessionId).Push(&CachedMessage{
			ID:        msgId,
			Content:   agentMsg.Content,
			Role:      "assistant",
			Kind:      agentMsg.Metadata["message_kind"],
			Timestamp: time.Now(),
		})
	}
}

func genChatID(sessionID string) string {
	return "fin:" + sessionID
}

func extractSessionIDFromChatId(chatID string) string {
	return strings.TrimPrefix(chatID, "fin:")
}
