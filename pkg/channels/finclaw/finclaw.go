package finclaw

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/identity"
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
	msgBus       *bus.MessageBus
	upgrader     websocket.Upgrader
	conns        map[string]*finConn
	sessionConns map[string]map[string]*finConn // sessionID -> connID -> *picoConn
	connsMu      sync.RWMutex
	sessionBufs  map[string]*SessionBuffer // sessionID -> cached messages buffer
	bufMu        sync.Mutex
	// recentUserBySession 记录各 session 最近一条用户输入，用于拦截 picoclaw steering
	// drain 误将 inbound 重发到 outbound 导致的「用户消息以 assistant 回显」。
	recentUserMu        sync.Mutex
	recentUserBySession map[string]string
	config              *FinChannelConfig
	closed              atomic.Bool
}

func NewFinChannel(ctx context.Context, messageBus *bus.MessageBus, config *FinChannelConfig) *FinClawChannel {
	base := channels.NewBaseChannel("fin", nil, messageBus, nil)
	return &FinClawChannel{
		Ctx:                 ctx,
		msgBus:              messageBus,
		BaseChannel:         base,
		recentUserBySession: make(map[string]string),
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
		buf = NewSessionBuffer(DefaultSessionBufferMaxSize)
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
		if len(msg.Attachments) > 0 {
			payload["attachments"] = msg.Attachments
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
	// sessionId 由前端持有并在 (重)连接 URL 中携带；服务端不再兜底生成。
	// 缺失即拒绝，强制前端为每个会话维护一个稳定的 sessionId。
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		logger.WarnCF("finclaw", "Rejecting WebSocket without sessionId", map[string]any{
			"remote": r.RemoteAddr,
			"path":   r.URL.Path,
		})
		http.Error(w, "sessionId query parameter is required", http.StatusBadRequest)
		return
	}

	conn, err := fchannel.upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.ErrorCF("finclaw", "WebSocket upgrade failed", map[string]any{
			"error": err.Error(),
		})
		return
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
	media, mediaErr := parseInlineImageMedia(msg.Payload)
	logger.InfoCF("fin", "handleMessageSend called", map[string]any{
		"conn_id":    fconn.id,
		"session_id": msg.SessionID,
		"content":    content,
		"media":      len(media),
		"payload":    msg.Payload,
	})
	if mediaErr != nil {
		logger.WarnCF("fin", "Invalid inbound media", map[string]any{
			"conn_id": fconn.id,
			"error":   mediaErr.Error(),
		})
		fconn.writeJson(newError(mediaErr.Error()))
		return
	}
	if strings.TrimSpace(content) == "" && len(media) == 0 {
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
	senderID := "fin-user"

	metadata := map[string]string{
		"platform":   "fin",
		"session_id": sessionID,
		"conn_id":    fconn.id,
	}

	sender := bus.SenderInfo{
		Platform:    "fin",
		PlatformID:  senderID,
		CanonicalID: identity.BuildCanonicalID("fin", senderID),
	}

	inboundCtx := bus.InboundContext{
		Channel:   "fin",
		ChatID:    chatID,
		ChatType:  "direct",
		SenderID:  senderID,
		MessageID: msg.ID,
		Raw:       metadata,
	}

	logger.InfoCF("fin", "Sending message to bus", map[string]any{
		"session_id": sessionID,
		"chat_id":    chatID,
		"sender_id":  senderID,
		"preview":    truncate(content, 50),
		"metadata":   metadata,
	})

	fchannel.recordRecentUserMessage(sessionID, content)
	fchannel.HandleInboundContext(fchannel.Ctx, chatID, content, media, inboundCtx, sender)

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

func (fchannel *FinClawChannel) recordRecentUserMessage(sessionID, content string) {
	if sessionID == "" {
		return
	}
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return
	}
	fchannel.recentUserMu.Lock()
	fchannel.recentUserBySession[sessionID] = trimmed
	fchannel.recentUserMu.Unlock()
}

func (fchannel *FinClawChannel) isMisroutedUserEcho(sessionID, content string, metadata map[string]string) bool {
	if metadata != nil && metadata["message_kind"] != "" {
		return false
	}
	trimmed := strings.TrimSpace(content)
	if trimmed == "" || sessionID == "" {
		return false
	}
	fchannel.recentUserMu.Lock()
	recent := fchannel.recentUserBySession[sessionID]
	fchannel.recentUserMu.Unlock()
	return recent != "" && recent == trimmed
}

// republishMisroutedInbound 将 picoclaw steering drain 误发到 outbound 的用户消息重新入队到 inbound。
func (fchannel *FinClawChannel) republishMisroutedInbound(sessionID string, agentMsg bus.OutboundMessage) {
	if fchannel.msgBus == nil {
		return
	}
	chatID := agentMsg.ChatID
	if chatID == "" {
		chatID = genChatID(sessionID)
	}
	ctx, cancel := context.WithTimeout(fchannel.Ctx, 2*time.Second)
	defer cancel()
	senderID := strings.TrimSpace(agentMsg.Context.SenderID)
	if senderID == "" {
		senderID = "fin-user"
	}
	inboundCtx := bus.InboundContext{
		Channel:  "fin",
		ChatID:   chatID,
		ChatType: "direct",
		SenderID: senderID,
		Raw: map[string]string{
			"platform":   "fin",
			"session_id": sessionID,
			"requeued":   "true",
		},
	}
	if err := fchannel.msgBus.PublishInbound(ctx, bus.InboundMessage{
		Context: inboundCtx,
		Content: agentMsg.Content,
	}); err != nil {
		logger.WarnCF("fin", "Failed to republish misrouted user echo to inbound", map[string]any{
			"session_id": sessionID,
			"error":      err.Error(),
		})
		return
	}
	logger.InfoCF("fin", "Republished misrouted user echo to inbound bus", map[string]any{
		"session_id": sessionID,
		"preview":    truncate(agentMsg.Content, 50),
	})
}

func (fchannel *FinClawChannel) ProcessAgentMessage(outbound <-chan bus.OutboundMessage) {
	for agentMsg := range outbound {
		logger.InfoCF("fin", "Processing agent message", map[string]any{
			"chat_id": agentMsg.ChatID,
			"content": agentMsg.Content,
		})

		sessionId := extractSessionIDFromChatId(agentMsg.ChatID)

		// Transient typing indicators carry no content. Forward them as their own
		// protocol frame and skip caching: their only purpose is to give the web
		// client an early "agent is working" signal so its send-confirm watchdog
		// stays alive during long, output-less turns (e.g. vision analysis).
		if kind := agentMsg.Context.Raw["message_kind"]; kind == string(TypeTypingStart) || kind == string(TypeTypingStop) {
			fchannel.broadcastTypingFrame(sessionId, FinMessageType(kind))
			continue
		}

		if fchannel.isMisroutedUserEcho(sessionId, agentMsg.Content, agentMsg.Context.Raw) {
			fchannel.republishMisroutedInbound(sessionId, agentMsg)
			continue
		}
		fchannel.connsMu.RLock()
		conns := fchannel.sessionConns[sessionId]
		fchannel.connsMu.RUnlock()

		// Format message for frontend - match frontend's expected format
		msgId := uuid.New().String()
		payload := map[string]any{
			"content": agentMsg.Content,
			"role":    "assistant",
		}
		if kind := agentMsg.Context.Raw["message_kind"]; kind != "" {
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
			Kind:      agentMsg.Context.Raw["message_kind"],
			Timestamp: time.Now(),
		})
	}
}

// broadcastTypingFrame sends a transient typing indicator (typing_start /
// typing_stop) to every live connection of a session. These frames are not
// cached: a reconnecting client should not replay a stale "typing" state.
func (fchannel *FinClawChannel) broadcastTypingFrame(sessionID string, frameType FinMessageType) {
	fchannel.connsMu.RLock()
	conns := fchannel.sessionConns[sessionID]
	fchannel.connsMu.RUnlock()
	if len(conns) == 0 {
		return
	}

	frame := map[string]any{"type": frameType}
	for _, fconn := range conns {
		go func(conn *finConn) {
			if err := conn.writeJson(frame); err != nil {
				logger.DebugCF("fin", "Failed to deliver typing frame", map[string]any{
					"conn_id":    conn.id,
					"session_id": sessionID,
					"error":      err.Error(),
				})
			}
		}(fconn)
	}
}

// SendMedia implements channels.MediaSender for the web UI. Media generated by
// PicoClaw tools (images, audio, files) is resolved from the shared MediaStore
// and delivered as a normal assistant message carrying structured attachments
// plus a same-origin download URL. The client appends its auth token to fetch.
func (fchannel *FinClawChannel) SendMedia(ctx context.Context, msg bus.OutboundMediaMessage) ([]string, error) {
	store := fchannel.GetMediaStore()
	if store == nil {
		return nil, fmt.Errorf("fin: no media store available")
	}

	sessionID := extractSessionIDFromChatId(msg.ChatID)
	attachments := make([]Attachment, 0, len(msg.Parts))
	caption := ""

	for _, part := range msg.Parts {
		localPath, meta, err := store.ResolveWithMeta(part.Ref)
		if err != nil {
			logger.ErrorCF("fin", "Failed to resolve media ref", map[string]any{
				"ref":   part.Ref,
				"error": err.Error(),
			})
			continue
		}

		filename := strings.TrimSpace(part.Filename)
		if filename == "" {
			filename = strings.TrimSpace(meta.Filename)
		}
		if filename == "" {
			filename = filepath.Base(localPath)
		}

		contentType := strings.TrimSpace(part.ContentType)
		if contentType == "" {
			contentType = strings.TrimSpace(meta.ContentType)
		}
		if contentType == "" {
			contentType = "application/octet-stream"
		}

		attachmentType := strings.TrimSpace(part.Type)
		if attachmentType == "" {
			attachmentType = inferAttachmentType(filename, contentType)
		}

		downloadURL, err := downloadURLForRef(part.Ref)
		if err != nil {
			logger.ErrorCF("fin", "Failed to build media download URL", map[string]any{
				"ref":   part.Ref,
				"error": err.Error(),
			})
			continue
		}

		if caption == "" && strings.TrimSpace(part.Caption) != "" {
			caption = strings.TrimSpace(part.Caption)
		}

		attachments = append(attachments, Attachment{
			Type:        attachmentType,
			URL:         downloadURL,
			Filename:    filename,
			ContentType: contentType,
			Caption:     strings.TrimSpace(part.Caption),
		})
	}

	if len(attachments) == 0 {
		return nil, fmt.Errorf("fin: no deliverable media parts")
	}

	msgID := uuid.New().String()
	payload := map[string]any{
		"content":     caption,
		"role":        "assistant",
		"attachments": attachments,
	}
	response := map[string]any{
		"type":    TypeMessageSend,
		"id":      msgID,
		"payload": payload,
	}

	fchannel.connsMu.RLock()
	conns := fchannel.sessionConns[sessionID]
	fchannel.connsMu.RUnlock()

	for _, fconn := range conns {
		go func(conn *finConn) {
			if err := conn.writeJson(response); err != nil {
				logger.WarnCF("fin", "Failed to deliver media to client, closing connection", map[string]any{
					"conn_id":    conn.id,
					"session_id": sessionID,
					"error":      err.Error(),
				})
				conn.sendCloseFrame()
				conn.close()
				fchannel.removeConnection(conn.id)
			}
		}(fconn)
	}

	fchannel.getSessionBuffer(sessionID).Push(&CachedMessage{
		ID:          msgID,
		Content:     caption,
		Role:        "assistant",
		Attachments: attachments,
		Timestamp:   time.Now(),
	})

	logger.InfoCF("fin", "Delivered media message", map[string]any{
		"session_id":  sessionID,
		"attachments": len(attachments),
	})

	return []string{msgID}, nil
}

func genChatID(sessionID string) string {
	return "fin:" + sessionID
}

func extractSessionIDFromChatId(chatID string) string {
	return strings.TrimPrefix(chatID, "fin:")
}
