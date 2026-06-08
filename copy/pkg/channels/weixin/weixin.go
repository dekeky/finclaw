package weixin

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/identity"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// ============ WeixinChannel 主体结构 ============

// WeixinChannel 微信频道实现
// 通过腾讯 iLink REST API 与微信用户进行消息收发
type WeixinChannel struct {
	*channels.BaseChannel                     // 继承基础频道功能
	api    *ApiClient                         // iLink API HTTP 客户端
	config *config.WeixinSettings             // 微信配置
	ctx    context.Context                    // 生命周期上下文
	cancel context.CancelFunc                 // 取消函数
	bus    *bus.MessageBus                    // 消息总线

	// contextTokens 存储每个用户的 context_token
	// context_token 是微信用于关联回复会话的标识
	// 格式: from_user_id → context_token
	contextTokens sync.Map

	typingMu    sync.Mutex                      // 保护 typingCache 的互斥锁
	typingCache map[string]typingTicketCacheEntry // typing_ticket 缓存

	pauseMu   sync.Mutex // 保护 pauseUntil 的互斥锁
	pauseUntil time.Time // 会话暂停结束时间

	syncBufPath       string // 轮询游标文件路径
	contextTokensPath string // context_token 文件路径
}

// ============ 初始化与构造函数 ============

// init 注册微信频道工厂函数到 channels 包
// 这样 channels.Manager 可以通过配置创建 WeixinChannel 实例
func init() {
	channels.RegisterFactory(
		config.ChannelWeixin, // 频道名称标识符
		func(channelName, channelType string, cfg *config.Config, bus *bus.MessageBus) (channels.Channel, error) {
			// 获取频道配置
			bc := cfg.Channels[channelName]
			decoded, err := bc.GetDecoded()
			if err != nil {
				return nil, err
			}
			weixinCfg, ok := decoded.(*config.WeixinSettings)
			if !ok {
				return nil, channels.ErrSendFailed
			}
			// 创建频道实例
			ch, err := NewWeixinChannel(bc, weixinCfg, bus)
			if err != nil {
				return nil, err
			}
			// 如果配置中指定了不同的频道名称，设置它
			if channelName != config.ChannelWeixin {
				ch.SetName(channelName)
			}
			return ch, nil
		},
	)
}

// NewWeixinChannel 创建新的微信频道实例
func NewWeixinChannel(
	bc *config.Channel,
	cfg *config.WeixinSettings,
	messageBus *bus.MessageBus,
) (*WeixinChannel, error) {
	// 创建 API 客户端
	api, err := NewApiClient(cfg.BaseURL, cfg.Token.String(), cfg.Proxy)
	if err != nil {
		return nil, fmt.Errorf("weixin: failed to create API client: %w", err)
	}

	// 创建基础频道
	base := channels.NewBaseChannel(
		bc.Name(),
		cfg,
		messageBus,
		bc.AllowFrom,
		channels.WithMaxMessageLength(4000), // 微信消息最大长度限制
		channels.WithReasoningChannelID(bc.ReasoningChannelID),
	)

	return &WeixinChannel{
		BaseChannel:       base,
		api:               api,
		config:            cfg,
		bus:               messageBus,
		typingCache:       make(map[string]typingTicketCacheEntry),
		syncBufPath:       buildWeixinSyncBufPath(cfg),        // 轮询游标持久化路径
		contextTokensPath: buildWeixinContextTokensPath(cfg), // context_token 持久化路径
	}, nil
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

// handleInboundMessage 处理收到的微信消息
// 将微信消息格式转换为内部消息格式并发送到消息总线
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
	sender := bus.SenderInfo{
		Platform:    "weixin",
		PlatformID:  fromUserID,
		CanonicalID: identity.BuildCanonicalID("weixin", fromUserID),
		Username:    fromUserID,
		DisplayName: fromUserID,
	}

	// 检查发送者是否在白名单中
	if !c.IsAllowedSender(sender) {
		logger.DebugCF("weixin", "Message rejected by allowlist", map[string]any{
			"from_user_id": fromUserID,
		})
		return
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
		c.contextTokens.Store(fromUserID, msg.ContextToken)
		c.persistContextTokens()
	}

	// 构建入站上下文
	inboundCtx := bus.InboundContext{
		Channel:   "weixin",
		ChatID:    fromUserID,
		ChatType:  "direct", // 私聊
		SenderID:  fromUserID,
		MessageID: messageID,
		Raw:       metadata,
	}
	if msg.ContextToken != "" {
		inboundCtx.ReplyHandles = map[string]string{
			"context_token": msg.ContextToken,
		}
	}

	// 发送到消息总线，触发 Agent 处理
	c.HandleInboundContext(ctx, fromUserID, content, mediaRefs, inboundCtx, sender)
}

// ============ 发送消息 ============

// Send 实现 channels.Channel 接口，发送文本消息给微信用户
func (c *WeixinChannel) Send(ctx context.Context, msg bus.OutboundMessage) ([]string, error) {
	if !c.IsRunning() {
		return nil, channels.ErrNotRunning
	}
	if err := c.ensureSessionActive(); err != nil {
		return nil, err
	}

	if msg.Content == "" {
		return nil, nil
	}

	// 获取目标用户 ID（就是 chat_id，即 from_user_id）
	toUserID := msg.ChatID

	// 查找该用户的 context_token
	// context_token 是接收消息时保存的，用于告诉微信这条回复属于哪个会话
	contextToken := ""
	if ct, ok := c.contextTokens.Load(toUserID); ok {
		contextToken, _ = ct.(string)
	}

	// 如果没有 context_token，无法发送回复
	// 这通常是因为没有收到过该用户的消息，不知道回复给谁
	if contextToken == "" {
		logger.ErrorCF("weixin", "Missing context token, cannot send message", map[string]any{
			"to_user_id": toUserID,
		})
		return nil, fmt.Errorf("weixin send: %w: missing context token for chat %s", channels.ErrSendFailed, toUserID)
	}

	// 发送文本消息
	if err := c.sendTextMessage(ctx, toUserID, contextToken, msg.Content); err != nil {
		logger.ErrorCF("weixin", "Failed to send message", map[string]any{
			"to_user_id": toUserID,
			"error":      err.Error(),
		})
		if c.remainingPause() > 0 {
			return nil, fmt.Errorf("weixin send: %w", channels.ErrSendFailed)
		}
		return nil, fmt.Errorf("weixin send: %w", channels.ErrTemporary)
	}

	return nil, nil
}

// ============ 语音能力 ============

// VoiceCapabilities 返回微信支持的语音能力
// 微信支持 ASR（语音转文字）和 TTS（文字转语音）
func (c *WeixinChannel) VoiceCapabilities() channels.VoiceCapabilities {
	return channels.VoiceCapabilities{ASR: true, TTS: true}
}
