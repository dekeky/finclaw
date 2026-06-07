package weixin

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"github.com/finclaw/internal/config"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/identity"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// ============ WeixinChannel 主体结构 ============

// WeixinChannel 微信频道实现
// 通过腾讯 iLink REST API 与微信用户进行消息收发
// 注意: 当前实现为独立版本，不依赖 picoclaw 的 BaseChannel
type WeixinChannel struct {
	api    *ApiClient                         // iLink API HTTP 客户端
	config *config.WeixinSettings             // 微信配置
	ctx    context.Context                    // 生命周期上下文
	cancel context.CancelFunc                 // 取消函数
	running atomic.Bool                       // 运行状态
	name   string                             // 频道名称
	msgBus *bus.MessageBus                    // 消息总线
	mediaStore interface{}                    // 媒体存储（待集成）

	// contextTokens 存储每个用户的 context_token
	contextTokens sync.Map

	typingMu    sync.Mutex                      // 保护 typingCache 的互斥锁
	typingCache map[string]typingTicketCacheEntry // typing_ticket 缓存

	pauseMu   sync.Mutex // 保护 pauseUntil 的互斥锁
	pauseUntil time.Time // 会话暂停结束时间

	syncBufPath       string // 轮询游标文件路径
	contextTokensPath string // context_token 文件路径

	typingStops sync.Map // map[chatID]context.CancelFunc - 正在输入取消函数

	// pendingReplies 待发送的回复队列（当收到用户第一条消息时，还来不及回复，先队列起来）
	pendingRepliesMu sync.Mutex
	pendingReplies   map[string][]OutboundMessage // key = userID

	// finclawForwardCh forwards non-weixin outbound messages to the finclaw channel.
	// This avoids two goroutines consuming from msgBus.OutboundChan() which would
	// cause messages to be randomly lost.
	finclawForwardCh chan bus.OutboundMessage
}

// GetMediaStore 返回媒体存储
// TODO: 集成 finclaw 的媒体存储系统
func (c *WeixinChannel) GetMediaStore() interface{} {
	return c.mediaStore
}

// ============ 初始化与构造函数 ============

// NewWeixinChannel 创建新的微信频道实例
func NewWeixinChannel(
	cfg *config.WeixinSettings,
	msgBus *bus.MessageBus,
) (*WeixinChannel, error) {
	// 创建 API 客户端
	api, err := NewApiClient(cfg.BaseURL, cfg.Token, cfg.Proxy)
	if err != nil {
		return nil, fmt.Errorf("weixin: failed to create API client: %w", err)
	}

	return &WeixinChannel{
		api:               api,
		config:            cfg,
		name:              "weixin",
		msgBus:            msgBus,
		typingCache:       make(map[string]typingTicketCacheEntry),
		syncBufPath:       buildWeixinSyncBufPath(cfg),
		contextTokensPath: buildWeixinContextTokensPath(cfg),
		pendingReplies:    make(map[string][]OutboundMessage),
	}, nil
}

// ============ 基础接口实现 ============

// Name 返回频道名称
func (c *WeixinChannel) Name() string {
	return c.name
}

// SetName 设置频道名称
func (c *WeixinChannel) SetName(name string) {
	c.name = name
}

// IsRunning 返回频道是否正在运行
func (c *WeixinChannel) IsRunning() bool {
	return c.running.Load()
}

// SetRunning 设置频道运行状态
func (c *WeixinChannel) SetRunning(running bool) {
	c.running.Store(running)
}

// SetFinclawForwardCh sets the channel for forwarding non-weixin outbound messages
// to the finclaw channel. This is necessary to avoid two goroutines consuming from
// msgBus.OutboundChan(), which would cause messages to be randomly lost.
func (c *WeixinChannel) SetFinclawForwardCh(ch chan bus.OutboundMessage) {
	c.finclawForwardCh = ch
}

// ============ 生命周期管理 ============

// Start 启动微信频道
// 启动后会从磁盘恢复 context_tokens，然后开始轮询消息
func (c *WeixinChannel) Start(ctx context.Context) error {
	logger.InfoC("weixin", "Starting Weixin channel")
	c.ctx, c.cancel = context.WithCancel(ctx)
	c.SetRunning(true)

	// 从磁盘恢复 context_tokens
	c.restoreContextTokens()

	// 启动轮询循环
	go c.pollLoop(c.ctx)

	// 启动出站消息处理循环
	go c.processOutboundLoop(c.ctx)

	logger.InfoC("weixin", "Weixin channel started")
	return nil
}

// restoreContextTokens 从磁盘加载 context tokens 到内存
// 这样重启后仍能回复之前的会话
func (c *WeixinChannel) restoreContextTokens() {
	tokens, err := loadContextTokens(c.contextTokensPath)
	if err != nil {
		logger.WarnCF("weixin", "Failed to load persisted context tokens", map[string]any{
			"path":  c.contextTokensPath,
			"error": err.Error(),
		})
		return
	}
	if len(tokens) == 0 {
		return
	}
	// 恢复到内存 sync.Map
	for userID, token := range tokens {
		c.contextTokens.Store(userID, token)
	}
	logger.InfoCF("weixin", "Restored context tokens from disk", map[string]any{
		"path":  c.contextTokensPath,
		"count": len(tokens),
	})
}

// persistContextTokens 将内存中的 context tokens 持久化到磁盘
// 用于重启后恢复会话
func (c *WeixinChannel) persistContextTokens() {
	tokens := make(map[string]string)
	c.contextTokens.Range(func(k, v any) bool {
		if userID, ok := k.(string); ok {
			if token, ok := v.(string); ok {
				tokens[userID] = token
			}
		}
		return true
	})
	if err := saveContextTokens(c.contextTokensPath, tokens); err != nil {
		logger.WarnCF("weixin", "Failed to persist context tokens", map[string]any{
			"path":  c.contextTokensPath,
			"error": err.Error(),
		})
	}
}

// Stop 停止微信频道
func (c *WeixinChannel) Stop(ctx context.Context) error {
	logger.InfoC("weixin", "Stopping Weixin channel")
	c.SetRunning(false)
	if c.cancel != nil {
		c.cancel()
	}
	return nil
}

// ============ 核心轮询循环 ============

// pollLoop 长轮询循环，持续从 iLink API 获取新消息
// 这是微信频道的核心，负责接收用户发送的消息
//
// 轮询机制:
// 1. 发送 GET 请求到 getupdates API
// 2. 如果没有新消息，服务器会等待最多 35 秒再返回
// 3. 有新消息时立即返回
// 4. 处理完消息后立即发起下一次请求
func (c *WeixinChannel) pollLoop(ctx context.Context) {
	const (
		defaultPollTimeoutMs = 35_000  // 默认长轮询超时时间（毫秒）
		retryDelay           = 2 * time.Second  // 失败后重试延迟
		backoffDelay         = 30 * time.Second // 连续失败后的退避延迟
		maxConsecutiveFails  = 3      // 连续失败次数阈值
	)

	consecutiveFails := 0 // 连续失败计数

	// 尝试从磁盘恢复上次的轮询游标（用于断线重连后不错过消息）
	getUpdatesBuf, err := loadGetUpdatesBuf(c.syncBufPath)
	if err != nil {
		logger.WarnCF("weixin", "Failed to load persisted get_updates_buf", map[string]any{
			"path":  c.syncBufPath,
			"error": err.Error(),
		})
		getUpdatesBuf = ""
	} else if getUpdatesBuf != "" {
		logger.InfoCF("weixin", "Resuming persisted get_updates_buf", map[string]any{
			"path":   c.syncBufPath,
			"bytes":  len(getUpdatesBuf),
			"source": "disk",
		})
	}
	nextTimeoutMs := defaultPollTimeoutMs

	for {
		// 检查上下文是否已取消
		select {
		case <-ctx.Done():
			logger.InfoC("weixin", "Weixin poll loop stopped")
			return
		default:
		}

		// 如果会话被暂停，等待恢复
		if err := c.waitWhileSessionPaused(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}
			continue
		}

		// 创建带超时的上下文（比长轮询多 5 秒）
		pollCtx, pollCancel := context.WithTimeout(ctx, time.Duration(nextTimeoutMs+5000)*time.Millisecond)

		// 发送长轮询请求
		resp, err := c.api.GetUpdates(pollCtx, GetUpdatesReq{
			GetUpdatesBuf: getUpdatesBuf,
		})
		pollCancel()

		if err != nil {
			// 检查是否正在关闭
			if ctx.Err() != nil {
				return
			}

			consecutiveFails++
			logger.WarnCF("weixin", "getUpdates failed", map[string]any{
				"error":   err.Error(),
				"attempt": consecutiveFails,
			})

			// 连续失败达到阈值后进入退避
			if consecutiveFails >= maxConsecutiveFails {
				logger.ErrorCF("weixin", "Too many consecutive failures, backing off", map[string]any{
					"duration": backoffDelay,
				})
				consecutiveFails = 0
				select {
				case <-ctx.Done():
					return
				case <-time.After(backoffDelay):
				}
			} else {
				select {
				case <-ctx.Done():
					return
				case <-time.After(retryDelay):
				}
			}
			continue
		}

		// 检查会话是否过期
		if isSessionExpiredStatus(resp.Ret, resp.Errcode) {
			remaining := c.pauseSession("getupdates", resp.Ret, resp.Errcode, resp.Errmsg)
			select {
			case <-ctx.Done():
				return
			case <-time.After(remaining):
			}
			continue
		}

		// 检查 API 错误
		if resp.Errcode != 0 || resp.Ret != 0 {
			consecutiveFails++
			logger.ErrorCF("weixin", "getUpdates API error", map[string]any{
				"ret":     resp.Ret,
				"errcode": resp.Errcode,
				"errmsg":  resp.Errmsg,
			})
			select {
			case <-ctx.Done():
				return
			case <-time.After(retryDelay):
			}
			continue
		}

		// 成功！重置连续失败计数
		consecutiveFails = 0

		// 更新轮询超时时间（使用服务器建议的值）
		if resp.LongpollingTimeoutMs > 0 {
			nextTimeoutMs = resp.LongpollingTimeoutMs
		}

		// 保存轮询游标用于断线重连
		if resp.GetUpdatesBuf != "" {
			getUpdatesBuf = resp.GetUpdatesBuf
			if err := saveGetUpdatesBuf(c.syncBufPath, getUpdatesBuf); err != nil {
				logger.WarnCF("weixin", "Failed to persist get_updates_buf", map[string]any{
					"path":  c.syncBufPath,
					"error": err.Error(),
				})
			}
		}

		// 分发消息到处理器
		for _, msg := range resp.Msgs {
			c.handleInboundMessage(ctx, msg)
		}
	}
}

// ============ 消息处理 ============

// SenderInfo 提供发送者信息结构
type SenderInfo struct {
	Platform    string
	PlatformID  string
	CanonicalID string
	Username    string
	DisplayName string
}

// InboundContext 入站消息上下文
type InboundContext struct {
	Channel   string
	ChatID    string
	ChatType  string
	SenderID  string
	MessageID string
	Raw       map[string]string
}

// handleInboundMessage 处理收到的微信消息
// 将微信消息格式转换为内部消息格式并发送到消息总线
// 注意: 当前为存根实现，待集成 finclaw 的消息系统后完善
func (c *WeixinChannel) handleInboundMessage(ctx context.Context, msg WeixinMessage) {
	fromUserID := msg.FromUserID
	if fromUserID == "" {
		return // 忽略没有发送者的消息
	}

	// 生成消息 ID
	messageID := msg.ClientID
	if messageID == "" {
		messageID = uuid.New().String()
	}

	// 从 item_list 提取文本内容
	var parts []string
	for _, item := range msg.ItemList {
		switch item.Type {
		case MessageItemTypeText:
			// 文本消息
			if item.TextItem != nil && item.TextItem.Text != "" {
				parts = append(parts, item.TextItem.Text)
			}
		case MessageItemTypeVoice:
			// 语音消息（服务器已转文字）
			if item.VoiceItem != nil && item.VoiceItem.Text != "" {
				parts = append(parts, item.VoiceItem.Text)
			} else {
				parts = append(parts, "[audio]")
			}
		case MessageItemTypeImage:
			parts = append(parts, "[image]")
		case MessageItemTypeFile:
			if item.FileItem != nil && item.FileItem.FileName != "" {
				parts = append(parts, fmt.Sprintf("[file: %s]", item.FileItem.FileName))
			} else {
				parts = append(parts, "[file]")
			}
		case MessageItemTypeVideo:
			parts = append(parts, "[video]")
		}
	}

	// 下载媒体文件（如有）
	var mediaRefs []string
	if mediaItem := selectInboundMediaItem(msg); mediaItem != nil {
		ref, err := c.downloadMediaFromItem(ctx, fromUserID, messageID, mediaItem)
		if err != nil {
			logger.ErrorCF("weixin", "Failed to download inbound media", map[string]any{
				"from_user_id": fromUserID,
				"message_id":   messageID,
				"type":         mediaItem.Type,
				"error":        err.Error(),
			})
		} else if ref != "" {
			mediaRefs = append(mediaRefs, ref)
		}
	}

	// 组合文本内容
	content := strings.Join(parts, "\n")
	if content == "" && len(mediaRefs) == 0 {
		return // 空消息，忽略
	}

	// 构建发送者信息
	sender := SenderInfo{
		Platform:    "weixin",
		PlatformID:  fromUserID,
		CanonicalID: identity.BuildCanonicalID("weixin", fromUserID),
		Username:    fromUserID,
		DisplayName: fromUserID,
	}

	// 构建消息元数据
	metadata := map[string]string{
		"from_user_id":  fromUserID,
		"context_token": msg.ContextToken, // 用于回复
		"session_id":    msg.SessionID,
	}

	logger.DebugCF("weixin", "Received message", map[string]any{
		"from_user_id": fromUserID,
		"content_len":  len(content),
		"media_count":  len(mediaRefs),
	})

	// 保存 context_token，用于后续回复
	if msg.ContextToken != "" {
		logger.InfoCF("weixin", "Saving context token", map[string]any{
			"user_id":       fromUserID,
			"context_token": msg.ContextToken[:min(20, len(msg.ContextToken))] + "...",
		})
		c.contextTokens.Store(fromUserID, msg.ContextToken)
		c.persistContextTokens()

		// 保存成功后，立即发送该用户积压的待回复消息
		c.flushPendingReplies(ctx, fromUserID)
	}

	// 构建入站上下文
	inboundCtx := InboundContext{
		Channel:   "weixin",
		ChatID:    fromUserID,
		ChatType:  "direct", // 私聊
		SenderID:  fromUserID,
		MessageID: messageID,
		Raw:       metadata,
	}

	// 发送到消息处理
	c.handleMessage(ctx, fromUserID, content, mediaRefs, inboundCtx, sender)
}

// handleMessage 处理消息的存根实现
// TODO: 实现与 finclaw 消息系统的集成
func (c *WeixinChannel) handleMessage(ctx context.Context, chatID, content string, media []string, inboundCtx InboundContext, sender SenderInfo) {
	logger.InfoCF("weixin", "Message received", map[string]any{
		"chat_id":  chatID,
		"sender":   sender.PlatformID,
		"content": content,
		"media":   media,
	})

	// 先停止该用户之前的"正在输入"状态（如果有的话）
	// 防止之前的 typing 一直保持导致用户困惑
	if stopFn, ok := c.typingStops.LoadAndDelete(chatID); ok {
		if cancel, ok := stopFn.(func()); ok {
			cancel()
			logger.InfoCF("weixin", "Stopped previous typing indicator", map[string]any{
				"chat_id": chatID,
			})
		}
	}

	// 立即发送"正在输入"状态，让用户知道消息已收到并正在处理
	if stopFn, err := c.StartTyping(ctx, chatID); err != nil {
		logger.WarnCF("weixin", "Failed to start typing indicator", map[string]any{
			"chat_id": chatID,
			"error":   err.Error(),
		})
	} else if stopFn != nil {
		c.typingStops.Store(chatID, stopFn)
		logger.InfoCF("weixin", "Typing indicator started", map[string]any{
			"chat_id": chatID,
		})
	}

	// 构建入站消息并发送到消息总线
	inboundMsg := bus.InboundMessage{
		Channel:  "weixin",
		SenderID: sender.PlatformID,
		Sender: bus.SenderInfo{
			Platform:    sender.Platform,
			PlatformID:  sender.PlatformID,
			CanonicalID: sender.CanonicalID,
			Username:    sender.Username,
			DisplayName: sender.DisplayName,
		},
		ChatID:     chatID,
		Content:    content,
		Media:      media,
		Peer:       bus.Peer{Kind: "direct", ID: chatID},
		MessageID:  inboundCtx.MessageID,
		SessionKey: buildSessionKey(chatID),
		Metadata:   inboundCtx.Raw,
	}

	// 发送到消息总线
	if c.msgBus != nil {
		c.msgBus.PublishInbound(ctx, inboundMsg)
		logger.DebugCF("weixin", "Published inbound message to bus", map[string]any{
			"session_key": inboundMsg.SessionKey,
		})
	}
}

// buildSessionKey 构建会话密钥
func buildSessionKey(chatID string) string {
	return fmt.Sprintf("weixin:%s", chatID)
}

// processOutboundLoop 处理出站消息循环
// 从消息总线读取出站消息并发送给微信用户
// 注意: 这是 msgBus.OutboundChan() 的唯一消费者。
// 非微信消息会被转发到 finclawForwardCh 供 finclaw 频道处理，
// 以避免多个 goroutine 从同一个 channel 读取导致消息随机丢失。
func (c *WeixinChannel) processOutboundLoop(ctx context.Context) {
	if c.msgBus == nil {
		logger.WarnCF("weixin", "msgBus is nil, cannot process outbound messages", nil)
		return
	}

	logger.InfoCF("weixin", "Starting outbound message processor", nil)
	for {
		select {
		case <-ctx.Done():
			logger.InfoCF("weixin", "Outbound message processor stopped", nil)
			return
		case outboundMsg, ok := <-c.msgBus.OutboundChan():
			if !ok {
				logger.InfoCF("weixin", "Outbound channel closed", nil)
				return
			}
			logger.InfoCF("weixin", "Processing outbound message", map[string]any{
				"channel":     outboundMsg.Channel,
				"chat_id":     outboundMsg.ChatID,
				"kind":        outboundMsg.Metadata["message_kind"],
				"content_len": len(outboundMsg.Content),
			})

			// 非微信消息转发给 finclaw 频道处理
			if outboundMsg.Channel != "weixin" {
				if c.finclawForwardCh != nil {
					select {
					case c.finclawForwardCh <- outboundMsg:
					default:
						logger.WarnCF("weixin", "Finclaw outbound channel full, dropping message", map[string]any{
							"channel": outboundMsg.Channel,
							"chat_id": outboundMsg.ChatID,
						})
					}
				}
				continue
			}

			// 处理 typing 指示器
			kind := outboundMsg.Metadata["message_kind"]
			if kind == "typing_start" {
				// 停止之前的 typing（如果有）
				if stopFn, ok := c.typingStops.LoadAndDelete(outboundMsg.ChatID); ok {
					if cancel, ok := stopFn.(func()); ok {
						cancel()
					}
				}
				stopTyping, err := c.StartTyping(ctx, outboundMsg.ChatID)
				if err != nil {
					logger.WarnCF("weixin", "Failed to start typing (from hook)", map[string]any{
						"chat_id": outboundMsg.ChatID,
						"error":   err.Error(),
					})
				} else {
					c.typingStops.Store(outboundMsg.ChatID, stopTyping)
					logger.InfoCF("weixin", "Typing started (from hook)", map[string]any{
						"chat_id": outboundMsg.ChatID,
					})
				}
				continue
			} else if kind == "typing_stop" {
				if stopFn, ok := c.typingStops.LoadAndDelete(outboundMsg.ChatID); ok {
					if cancel, ok := stopFn.(func()); ok {
						cancel()
						logger.InfoCF("weixin", "Typing stopped (from hook)", map[string]any{
							"chat_id": outboundMsg.ChatID,
						})
					}
				}
				continue
			}

			// 有实际消息要发送时，先停止 typing 状态
			if stopFn, ok := c.typingStops.LoadAndDelete(outboundMsg.ChatID); ok {
				if cancel, ok := stopFn.(func()); ok {
					cancel()
					logger.InfoCF("weixin", "Typing stopped before sending message", map[string]any{
						"chat_id": outboundMsg.ChatID,
					})
				}
			}

			// 发送消息给微信用户
			if _, err := c.Send(ctx, OutboundMessage{
				Channel: outboundMsg.Channel,
				ChatID:  outboundMsg.ChatID,
				Content: outboundMsg.Content,
			}); err != nil {
				logger.ErrorCF("weixin", "Failed to send outbound message", map[string]any{
					"chat_id": outboundMsg.ChatID,
					"error":   err.Error(),
				})
			}
		}
	}
}

// ============ 发送消息 ============

// OutboundMessage 出站消息结构
type OutboundMessage struct {
	Channel string
	ChatID  string
	Content string
}

// stripMarkdown 去除 markdown 格式，转换为纯文本
// 微信不支持 markdown 渲染，转换以便阅读
func stripMarkdown(text string) string {
	// 去除 **bold** -> bold
	text = strings.ReplaceAll(text, "**", "")
	// 去除 *italic* -> (保留原样，因为微信也支持)
	// 去除 `code` -> code
	text = strings.ReplaceAll(text, "`", "")
	// 去除 ### 标题
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "### ") {
			text = strings.ReplaceAll(text, line, strings.TrimPrefix(line, "### "))
		}
	}
	// 去除表格 header 分隔符 |---|
	lines := strings.Split(text, "\n")
	var cleanLines []string
	for _, line := range lines {
		if strings.Contains(line, "|---|") || strings.Contains(line, "|:--|") {
			continue
		}
		cleanLines = append(cleanLines, line)
	}
	text = strings.Join(cleanLines, "\n")
	// 去除 | 列分隔（简单处理）
	text = strings.ReplaceAll(text, "|", "  ")
	return strings.TrimSpace(text)
}

// Send 发送文本消息给微信用户
func (c *WeixinChannel) Send(ctx context.Context, msg OutboundMessage) ([]string, error) {
	logger.InfoCF("weixin", "Send called", map[string]any{
		"chat_id":  msg.ChatID,
		"content": msg.Content,
		"running": c.IsRunning(),
	})
	if !c.IsRunning() {
		return nil, fmt.Errorf("weixin channel not running")
	}
	if err := c.ensureSessionActive(); err != nil {
		logger.ErrorCF("weixin", "Session not active", map[string]any{
			"error": err.Error(),
		})
		return nil, err
	}

	if msg.Content == "" {
		return nil, nil
	}

	// 获取目标用户 ID（就是 chat_id，即 from_user_id）
	toUserID := msg.ChatID

	logger.InfoCF("weixin", "Send - looking up context token", map[string]any{
		"to_user_id": toUserID,
	})

	// 查找该用户的 context_token
	// context_token 是接收消息时保存的，用于告诉微信这条回复属于哪个会话
	contextToken := ""
	if ct, ok := c.contextTokens.Load(toUserID); ok {
		contextToken, _ = ct.(string)
	}

	logger.InfoCF("weixin", "Send - context token lookup result", map[string]any{
		"to_user_id":    toUserID,
		"has_context":   contextToken != "",
	})
	if contextToken != "" {
		logger.InfoCF("weixin", "Send - token prefix", map[string]any{
			"token_prefix": contextToken[:min(20, len(contextToken))] + "...",
		})
	}

	// 如果没有 context_token，无法发送回复
	// 将消息加入待发送队列，等收到该用户下一条消息获得 context_token 后再发送
	if contextToken == "" {
		logger.InfoCF("weixin", "Missing context token, queueing reply for later", map[string]any{
			"to_user_id": toUserID,
			"content":    msg.Content,
		})
		c.pendingRepliesMu.Lock()
		c.pendingReplies[toUserID] = append(c.pendingReplies[toUserID], msg)
		c.pendingRepliesMu.Unlock()
		return nil, nil // 不返回错误，让调用方以为发送成功
	}

	// 发送文本消息（先去除 markdown 格式）
	cleanContent := stripMarkdown(msg.Content)
	logger.InfoCF("weixin", "Send - calling sendTextMessage", map[string]any{
		"to_user_id": toUserID,
		"text_len":   len(cleanContent),
	})
	if err := c.sendTextMessage(ctx, toUserID, contextToken, cleanContent); err != nil {
		logger.ErrorCF("weixin", "Failed to send message", map[string]any{
			"to_user_id": toUserID,
			"error":      err.Error(),
		})
		if c.remainingPause() > 0 {
			return nil, fmt.Errorf("weixin send: session paused")
		}
		return nil, fmt.Errorf("weixin send: temporary error")
	}

	return nil, nil
}

// flushPendingReplies 发送积压的待回复消息
func (c *WeixinChannel) flushPendingReplies(ctx context.Context, userID string) {
	c.pendingRepliesMu.Lock()
	replies := c.pendingReplies[userID]
	delete(c.pendingReplies, userID)
	c.pendingRepliesMu.Unlock()

	if len(replies) == 0 {
		return
	}

	logger.InfoCF("weixin", "Flushing pending replies", map[string]any{
		"user_id":    userID,
		"reply_count": len(replies),
	})

	for _, reply := range replies {
		if _, err := c.Send(ctx, reply); err != nil {
			logger.ErrorCF("weixin", "Failed to flush pending reply", map[string]any{
				"user_id": userID,
				"error":   err.Error(),
			})
		}
	}
}

// ============ 语音能力 ============

// VoiceCapabilities 返回微信支持的语音能力
// 微信支持 ASR（语音转文字）和 TTS（文字转语音）
func (c *WeixinChannel) VoiceCapabilities() struct{ ASR, TTS bool } {
	return struct{ ASR, TTS bool }{ASR: true, TTS: true}
}

// buildMediaScope 构建媒体作用域标识
func buildMediaScope(chatID, messageID string) string {
	id := messageID
	if id == "" {
		id = uuid.New().String()
	}
	return "weixin:" + chatID + ":" + id
}