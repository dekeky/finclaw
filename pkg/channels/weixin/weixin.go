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

// AgentResolver 按 agent 名称解析消息总线和 finclaw 转发通道。
// 用于运行时切换绑定的 agent，无需重启。
type AgentResolver interface {
	GetMsgBus(name string) *bus.MessageBus
	GetWeixinOutboundCh(name string) chan bus.OutboundMessage
}

// WeixinChannel 微信频道实现
// 通过腾讯 iLink REST API 与微信用户进行消息收发
// 注意: 当前实现为独立版本，不依赖 picoclaw 的 BaseChannel
type WeixinChannel struct {
	api        *ApiClient             // iLink API HTTP 客户端
	config     *config.WeixinSettings // 微信配置
	ctx        context.Context        // 生命周期上下文
	cancel     context.CancelFunc     // 取消函数
	running    atomic.Bool            // 运行状态
	name       string                 // 频道名称
	mediaStore interface{}            // 媒体存储（待集成）

	// 通过 resolver+boundAgent 动态查找 msgBus / finclaw 转发通道，
	// 支持运行时通过 Rebind 切换绑定 agent。
	resolver   AgentResolver
	bindMu     sync.RWMutex
	boundAgent string
	rebindMu   sync.Mutex
	rebindCh   atomic.Value // chan struct{} — 关闭此 channel 通知重新订阅

	// contextTokens 存储每个用户的 context_token
	contextTokens sync.Map

	typingMu    sync.Mutex                        // 保护 typingCache 的互斥锁
	typingCache map[string]typingTicketCacheEntry // typing_ticket 缓存

	pauseMu    sync.Mutex // 保护 pauseUntil 的互斥锁
	pauseUntil time.Time  // 会话暂停结束时间

	syncBufPath       string // 轮询游标文件路径
	contextTokensPath string // context_token 文件路径

	typingStops sync.Map // map[chatID]context.CancelFunc - 正在输入取消函数

	// pendingReplies 待发送的回复队列（当收到用户第一条消息时，还来不及回复，先队列起来；
	// 会话暂停期间无法下发的回复也会暂存在此，等暂停结束后自动重发，避免回复丢失）
	pendingRepliesMu sync.Mutex
	pendingReplies   map[string][]pendingReply // key = userID

	// flushScheduled 记录已为哪些用户安排了"稍后重发"定时器，避免重复创建。
	// 涵盖两种触发原因：会话暂停、发送失败重试。
	flushMu        sync.Mutex
	flushScheduled map[string]bool // key = userID

	// context token 持久化防抖：标记是否有未持久化的变更。
	// 用 debounce + 强制上限，避免每条消息都全量写盘。
	tokensDirty    atomic.Bool
	persistDone    chan struct{} // 关闭时通知持久化 goroutine 退出
	persistStarted sync.Once
}

// GetMediaStore 返回媒体存储
// TODO: 集成 finclaw 的媒体存储系统
func (c *WeixinChannel) GetMediaStore() interface{} {
	return c.mediaStore
}

// ============ 初始化与构造函数 ============

// NewWeixinChannel 创建新的微信频道实例。
// resolver 用于按 agent 名称查找 msgBus 和 finclaw 转发通道，支持运行时切换。
// boundAgent 为初始绑定的 agent 名（必须能被 resolver 解析到），后续可通过 Rebind 修改。
func NewWeixinChannel(
	cfg *config.WeixinSettings,
	resolver AgentResolver,
	boundAgent string,
) (*WeixinChannel, error) {
	// 创建 API 客户端
	api, err := NewApiClient(cfg.BaseURL, cfg.Token, cfg.Proxy)
	if err != nil {
		return nil, fmt.Errorf("weixin: failed to create API client: %w", err)
	}

	ch := &WeixinChannel{
		api:               api,
		config:            cfg,
		name:              "weixin",
		resolver:          resolver,
		boundAgent:        boundAgent,
		typingCache:       make(map[string]typingTicketCacheEntry),
		syncBufPath:       buildWeixinSyncBufPath(cfg),
		contextTokensPath: buildWeixinContextTokensPath(cfg),
		pendingReplies:   make(map[string][]pendingReply),
		flushScheduled:   make(map[string]bool),
	}
	// 通过关闭 channel 广播 rebind 信号：写端关旧建新，读端每次 Load 拿最新的。
	ch.rebindCh.Store(make(chan struct{}))
	return ch, nil
}

// BoundAgent 返回当前绑定的 agent 名（线程安全）。
func (c *WeixinChannel) BoundAgent() string {
	c.bindMu.RLock()
	defer c.bindMu.RUnlock()
	return c.boundAgent
}

// rebindNotifyCh 返回当前的 rebind 通知 channel。
// 收到关闭信号表示需要重新订阅出站通道。
func (c *WeixinChannel) rebindNotifyCh() chan struct{} {
	ch, _ := c.rebindCh.Load().(chan struct{})
	return ch
}

// currentMsgBus 获取当前绑定 agent 的消息总线。
func (c *WeixinChannel) currentMsgBus() *bus.MessageBus {
	c.bindMu.RLock()
	agent := c.boundAgent
	resolver := c.resolver
	c.bindMu.RUnlock()
	if resolver == nil || agent == "" {
		return nil
	}
	return resolver.GetMsgBus(agent)
}

func (c *WeixinChannel) currentWeixinOutboundCh() chan bus.OutboundMessage {
	c.bindMu.RLock()
	agent := c.boundAgent
	resolver := c.resolver
	c.bindMu.RUnlock()
	if resolver == nil || agent == "" {
		return nil
	}
	return resolver.GetWeixinOutboundCh(agent)
}

// Rebind 在运行时切换绑定的 agent，无需重启频道。
// 返回 false 表示新 agent 在 resolver 中不存在（msgBus 为 nil）。
// 通过关闭并重建 rebindCh 通知 processOutboundLoop，确保信号不丢失
// （即使在 resubscribe 窗口期发生多次 rebind 也不会漏）。
func (c *WeixinChannel) Rebind(agentName string) bool {
	if agentName == "" {
		return false
	}
	if c.resolver == nil || c.resolver.GetMsgBus(agentName) == nil {
		return false
	}

	c.bindMu.Lock()
	if c.boundAgent == agentName {
		c.bindMu.Unlock()
		return true
	}
	c.boundAgent = agentName
	c.bindMu.Unlock()

	// 关闭旧 channel 触发所有等待者，然后创建新的供下一次使用。
	// 用 rebindMu 串行化，避免并发 close 导致 panic。
	c.rebindMu.Lock()
	oldCh, _ := c.rebindCh.Load().(chan struct{})
	if oldCh != nil {
		close(oldCh)
	}
	c.rebindCh.Store(make(chan struct{}))
	c.rebindMu.Unlock()

	logger.InfoCF("weixin", "Rebound to agent", map[string]any{
		"agent": agentName,
	})
	return true
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

// ============ 生命周期管理 ============

// Start 启动微信频道
// 启动后会从磁盘恢复 context_tokens，然后开始轮询消息
func (c *WeixinChannel) Start(ctx context.Context) error {
	logger.InfoC("weixin", "Starting Weixin channel")
	c.ctx, c.cancel = context.WithCancel(ctx)
	c.SetRunning(true)

	// 从磁盘恢复 context_tokens
	c.restoreContextTokens()

	// 启动过期 token 清理
	go c.cleanupExpiredContextTokens(c.ctx)

	// 启动轮询循环
	go c.pollLoop(c.ctx)

	// 启动出站消息处理循环
	go c.processOutboundLoop(c.ctx)

	logger.InfoC("weixin", "Weixin channel started")
	return nil
}

// restoreContextTokens 从磁盘加载 context tokens 到内存
// 这样重启后仍能回复之前的会话（跳过已过期的 token）
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
	restored := 0
	// 恢复到内存 sync.Map，跳过已过期的 token
	for userID, entry := range tokens {
		if entry.UpdatedAt > 0 && time.Since(time.Unix(entry.UpdatedAt, 0)) > weixinContextTokenTTL {
			continue
		}
		c.contextTokens.Store(userID, entry)
		restored++
	}
	logger.InfoCF("weixin", "Restored context tokens from disk", map[string]any{
		"path":     c.contextTokensPath,
		"total":    len(tokens),
		"restored": restored,
	})
}

const (
	contextTokenPersistDebounce = 5 * time.Second  // 防抖延迟
	contextTokenPersistMaxWait  = 30 * time.Second // 最大延迟上限
)

// persistContextTokens 标记 context tokens 有变更，需要持久化。
// 实际写盘由后台 goroutine 做防抖合并，避免每条消息都全量写磁盘。
func (c *WeixinChannel) persistContextTokens() {
	c.tokensDirty.Store(true)
	c.ensurePersistLoop()
}

// ensurePersistLoop 确保持久化 goroutine 已启动（只启动一次）。
func (c *WeixinChannel) ensurePersistLoop() {
	c.persistStarted.Do(func() {
		c.persistDone = make(chan struct{})
		go c.persistLoop()
	})
}

// persistLoop 持久化循环，合并多次变更为一次写盘。
// 防抖逻辑：有变更后等 debounce 时间，如果期间又有变更则重新计时，
// 最多等 maxWait 后强制写一次，避免高频更新下永远不落地。
func (c *WeixinChannel) persistLoop() {
	debounce := time.NewTimer(contextTokenPersistDebounce)
	defer debounce.Stop()
	// 第一次直接停掉，等 dirty 标记后再 Reset。
	if !debounce.Stop() {
		<-debounce.C
	}

	maxWait := time.NewTicker(contextTokenPersistMaxWait)
	defer maxWait.Stop()

	// 初始状态：没有待写入的变更，等待。
	waiting := false

	for {
		if c.tokensDirty.Load() && !waiting {
			debounce.Reset(contextTokenPersistDebounce)
			waiting = true
		}

		select {
		case <-c.persistDone:
			// 退出前把最后一批变更写掉
			if c.tokensDirty.Load() {
				c.doPersistContextTokens()
			}
			return
		case <-debounce.C:
			if c.tokensDirty.Load() {
				c.doPersistContextTokens()
			}
			waiting = false
		case <-maxWait.C:
			// 强制上限：如果一直有更新拖着不写，最多 maxWait 强制写一次
			if c.tokensDirty.Load() && waiting {
				c.doPersistContextTokens()
				waiting = false
			}
		}
	}
}

// doPersistContextTokens 真正执行磁盘写入，调用方负责控制频率。
func (c *WeixinChannel) doPersistContextTokens() {
	c.tokensDirty.Store(false)
	tokens := make(map[string]contextTokenEntry)
	c.contextTokens.Range(func(k, v any) bool {
		if userID, ok := k.(string); ok {
			if entry, ok := v.(contextTokenEntry); ok {
				tokens[userID] = entry
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

// cleanupExpiredContextTokens 定期清理过期的 context_token，避免内存和磁盘无限增长
func (c *WeixinChannel) cleanupExpiredContextTokens(ctx context.Context) {
	ticker := time.NewTicker(weixinContextTokenCleanupInt)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.doCleanupExpiredContextTokens()
		}
	}
}

func (c *WeixinChannel) doCleanupExpiredContextTokens() {
	now := time.Now()
	removed := 0
	c.contextTokens.Range(func(k, v any) bool {
		if entry, ok := v.(contextTokenEntry); ok {
			if entry.UpdatedAt > 0 && now.Sub(time.Unix(entry.UpdatedAt, 0)) > weixinContextTokenTTL {
				c.contextTokens.Delete(k)
				removed++
			}
		}
		return true
	})
	if removed > 0 {
		logger.InfoCF("weixin", "Cleaned up expired context tokens", map[string]any{
			"removed": removed,
		})
		c.persistContextTokens()
	}
}

// Stop 停止微信频道
func (c *WeixinChannel) Stop(ctx context.Context) error {
	logger.InfoC("weixin", "Stopping Weixin channel")
	c.SetRunning(false)
	if c.cancel != nil {
		c.cancel()
	}
	// 停止持久化 goroutine，确保最后一批变更落盘
	if c.persistDone != nil {
		close(c.persistDone)
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
		defaultPollTimeoutMs = 35_000           // 默认长轮询超时时间（毫秒）
		retryDelay           = 2 * time.Second  // 失败后重试延迟
		backoffDelay         = 30 * time.Second // 连续失败后的退避延迟
		maxConsecutiveFails  = 3                // 连续失败次数阈值
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

		// 检查会话是否过期（属于预期内的场景，不算 API 调用失败，
		// 走 pauseSession 暂停一段时间后自动恢复，连续失败计数因此清零）。
		if isSessionExpiredStatus(resp.Ret, resp.Errcode) {
			consecutiveFails = 0
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
		c.contextTokens.Store(fromUserID, contextTokenEntry{
			Token:     msg.ContextToken,
			UpdatedAt: time.Now().Unix(),
		})
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
		"chat_id": chatID,
		"sender":  sender.PlatformID,
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
		MessageID:  inboundCtx.MessageID,
		SessionKey: buildSessionKey(chatID),
		Context: bus.InboundContext{
			Channel:   "weixin",
			ChatID:    chatID,
			ChatType:  "direct",
			SenderID:  sender.PlatformID,
			MessageID: inboundCtx.MessageID,
			Raw:       inboundCtx.Raw,
		},
	}

	// 发送到消息总线（按当前绑定的 agent 动态查找，支持热切换）
	if msgBus := c.currentMsgBus(); msgBus != nil {
		msgBus.PublishInbound(ctx, inboundMsg)
		logger.DebugCF("weixin", "Published inbound message to bus", map[string]any{
			"session_key": inboundMsg.SessionKey,
			"agent":       c.BoundAgent(),
		})
	} else {
		logger.WarnCF("weixin", "No msgBus available for current bound agent, dropping inbound message", map[string]any{
			"agent": c.BoundAgent(),
		})
	}
}

// buildSessionKey 构建会话密钥
func buildSessionKey(chatID string) string {
	return fmt.Sprintf("weixin:%s", chatID)
}

func (c *WeixinChannel) processOutboundLoop(ctx context.Context) {
	logger.InfoCF("weixin", "Starting outbound message processor", nil)

	for {
		outboundChan := c.currentWeixinOutboundCh()
		if outboundChan == nil {
			logger.WarnCF("weixin", "No weixin outbound queue for current bound agent, waiting for rebind", map[string]any{
				"agent": c.BoundAgent(),
			})
			select {
			case <-ctx.Done():
				logger.InfoCF("weixin", "Outbound message processor stopped", nil)
				return
			case <-c.rebindNotifyCh():
				continue
			}
		}

		logger.InfoCF("weixin", "Subscribed to weixin outbound queue", map[string]any{
			"agent": c.BoundAgent(),
		})

		for {
			select {
			case <-ctx.Done():
				logger.InfoCF("weixin", "Outbound message processor stopped", nil)
				return
			case <-c.rebindNotifyCh():
				logger.InfoCF("weixin", "Rebind signal received, re-subscribing", map[string]any{
					"agent": c.BoundAgent(),
				})
				goto resubscribe
			case outboundMsg, ok := <-outboundChan:
				if !ok {
					logger.InfoCF("weixin", "Outbound queue closed", nil)
					return
				}
				c.dispatchOutbound(ctx, outboundMsg)
			}
		}

	resubscribe:
	}
}

// isWorkProcessKind 判断 message_kind 是否属于"工作过程"类消息。
// 这类消息只用于 Web UI（finclaw）展示，不应推送给微信用户。
// 最终回复消息的 kind 为空字符串，会正常下发。
func isWorkProcessKind(kind string) bool {
	switch strings.TrimSpace(strings.ToLower(kind)) {
	case "thought", "reasoning", "tool_calls", "tool_feedback":
		return true
	default:
		return false
	}
}

// dispatchOutbound 处理单条出站消息（从 processOutboundLoop 中拆出便于复用）。
func (c *WeixinChannel) dispatchOutbound(ctx context.Context, outboundMsg bus.OutboundMessage) {
	logger.InfoCF("weixin", "Processing outbound message", map[string]any{
		"channel":     outboundMsg.Channel,
		"chat_id":     outboundMsg.ChatID,
		"kind":        outboundMsg.Context.Raw["message_kind"],
		"content_len": len(outboundMsg.Content),
	})

	if outboundMsg.Channel != "weixin" {
		return
	}

	// 处理 typing 指示器
	// 注意：weixin 端的 typing 生命周期是「收到用户消息 → 发送最终回复前」连续保持，
	// 由 handleMessage 的 StartTyping 启动、最终回复发送前的 typingStops 取消。
	// agent hook 发出的 typing_start/typing_stop 用于 finclaw（Web UI）展示更细粒度的状态，
	// 多轮工具调用会产生多次 start/stop 信号，若在 weixin 端响应会导致输入指示器反复闪烁，
	// 因此这里直接忽略。
	kind := outboundMsg.Context.Raw["message_kind"]
	if kind == "typing_start" || kind == "typing_stop" {
		return
	}

	// 屏蔽 agent 的工作过程类消息：思考/推理、工具调用、工具反馈等只在 finclaw（Web UI）展示，
	// 微信用户只接收最终回复（kind 为空）。
	// 注意：finclaw 频道走 Channel!="weixin" 分支，不受此处理影响。
	if isWorkProcessKind(kind) {
		logger.DebugCF("weixin", "Skipping work-process message for weixin", map[string]any{
			"chat_id": outboundMsg.ChatID,
			"kind":    kind,
		})
		return
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
	msg := OutboundMessage{
		Channel: outboundMsg.Channel,
		ChatID:  outboundMsg.ChatID,
		Content: outboundMsg.Content,
	}
	if _, err := c.Send(ctx, msg); err != nil {
		logger.WarnCF("weixin", "Send failed, queuing for retry", map[string]any{
			"chat_id": outboundMsg.ChatID,
			"error":   err.Error(),
		})
		c.enqueueRetry(outboundMsg.ChatID, msg, 0)
	}
}

// enqueueRetry 将消息放入待发送队列并安排下一次重试。
// retriesDone 是已经失败过的次数（0 表示首次失败）。
// 超过最大重试次数则丢弃并记错误日志。
func (c *WeixinChannel) enqueueRetry(userID string, msg OutboundMessage, retriesDone int) {
	nextRetries := retriesDone + 1
	if nextRetries > maxSendRetries {
		logger.ErrorCF("weixin", "Dropping message after max retries", map[string]any{
			"user_id":     userID,
			"retries":     retriesDone,
			"content_len": len(msg.Content),
		})
		return
	}

	// 指数退避：第 1 次 retryInitialWait，每次翻倍，封顶 retryMaxWait。
	nextWait := retryInitialWait
	for i := 1; i < nextRetries; i++ {
		nextWait *= 2
		if nextWait > retryMaxWait {
			nextWait = retryMaxWait
			break
		}
	}

	// 如果处于会话暂停，使用暂停剩余时间（取较大值）。
	if remaining := c.remainingPause(); remaining > nextWait {
		nextWait = remaining
	}

	c.queuePendingReply(userID, pendingReply{
		msg:      msg,
		retries:  nextRetries,
		nextWait: nextWait,
	})
	c.scheduleFlush(userID, nextWait)
}

// ============ 发送消息 ============

const (
	maxSendRetries   = 5               // 发送失败最大重试次数
	retryInitialWait = 2 * time.Second // 首次重试延迟
	retryMaxWait     = 2 * time.Minute // 最大重试延迟
)

// OutboundMessage 出站消息结构
type OutboundMessage struct {
	Channel string
	ChatID  string
	Content string
}

// pendingReply 待发送队列中的一条消息，附带重试信息。
type pendingReply struct {
	msg      OutboundMessage
	retries  int           // 已重试次数（0 表示首次发送）
	nextWait time.Duration // 下次重试的延迟（指数退避使用）
}

// stripMarkdown 去除 markdown 格式，转换为纯文本
// 微信不支持 markdown 渲染，转换以便阅读
func stripMarkdown(text string) string {
	lines := strings.Split(text, "\n")
	var out []string

	for _, line := range lines {
		// 跳过表格分隔行（如 |---|---|、:-- | ---:、| :---: | 等）
		if isTableSeparatorLine(line) {
			continue
		}

		// 去掉行首的标题标记 # / ## / ### 等
		trimmed := strings.TrimLeft(line, " ")
		if len(trimmed) > 0 && trimmed[0] == '#' {
			i := 0
			for i < len(trimmed) && trimmed[i] == '#' {
				i++
			}
			if i < len(trimmed) && trimmed[i] == ' ' {
				line = trimmed[i+1:]
			}
		}

		// 表格行的 | 替换为两个空格（只在含多个 | 的行做，避免误伤正文）
		if strings.Count(line, "|") >= 2 {
			line = strings.ReplaceAll(line, "|", "  ")
			line = strings.TrimSpace(line)
		}

		out = append(out, line)
	}

	result := strings.Join(out, "\n")

	// 行内格式：粗体
	result = strings.ReplaceAll(result, "**", "")
	// 行内格式：行内代码
	result = strings.ReplaceAll(result, "`", "")

	return strings.TrimSpace(result)
}

// isTableSeparatorLine 判断是否为 markdown 表格的分隔行（表头和内容之间的那行）。
// 特征：主要由 - | : 和空格组成，且至少包含 3 个连续的 -。
func isTableSeparatorLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return false
	}
	// 必须含有至少一组 "---"
	if !strings.Contains(trimmed, "---") {
		return false
	}
	// 所有字符都只能是 - | : 空格
	for _, r := range trimmed {
		if r != '-' && r != '|' && r != ':' && r != ' ' {
			return false
		}
	}
	return true
}

// Send 发送文本消息给微信用户
func (c *WeixinChannel) Send(ctx context.Context, msg OutboundMessage) ([]string, error) {
	logger.InfoCF("weixin", "Send called", map[string]any{
		"chat_id": msg.ChatID,
		"content": msg.Content,
		"running": c.IsRunning(),
	})
	if !c.IsRunning() {
		return nil, fmt.Errorf("weixin channel not running")
	}

	if msg.Content == "" {
		return nil, nil
	}

	// 获取目标用户 ID（就是 chat_id，即 from_user_id）
	toUserID := msg.ChatID

	// 会话暂停期间无法下发消息（通常是凭证过期触发的临时暂停）。
	// 若此时直接返回错误，dispatchOutbound 只会记日志并丢弃 agent 的回复，导致用户收不到任何答复。
	// 因此这里把回复放入待发送队列，并安排在暂停结束后自动重发，确保回复不丢失。
	if remaining := c.remainingPause(); remaining > 0 {
		c.queuePendingReply(toUserID, pendingReply{msg: msg})
		c.scheduleFlush(toUserID, remaining)
		logger.WarnCF("weixin", "Session paused, queued reply for retry after pause", map[string]any{
			"chat_id":       toUserID,
			"content_len":   len(msg.Content),
			"retry_in_secs": int(remaining.Seconds()) + 1,
		})
		return nil, nil
	}

	logger.InfoCF("weixin", "Send - looking up context token", map[string]any{
		"to_user_id": toUserID,
	})

	// 查找该用户的 context_token
	// context_token 是接收消息时保存的，用于告诉微信这条回复属于哪个会话
	// token 有有效期，过期后视为无 token，走 pending 队列等用户下一条消息刷新。
	contextToken := ""
	if ct, ok := c.contextTokens.Load(toUserID); ok {
		if entry, ok := ct.(contextTokenEntry); ok {
			if entry.UpdatedAt > 0 && time.Since(time.Unix(entry.UpdatedAt, 0)) > weixinContextTokenTTL {
				c.contextTokens.Delete(toUserID)
				logger.InfoCF("weixin", "Context token expired, waiting for user message", map[string]any{
					"to_user_id": toUserID,
				})
			} else {
				contextToken = entry.Token
			}
		}
	}

	logger.InfoCF("weixin", "Send - context token lookup result", map[string]any{
		"to_user_id":  toUserID,
		"has_context": contextToken != "",
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
		c.queuePendingReply(toUserID, pendingReply{msg: msg})
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
		return nil, fmt.Errorf("weixin send: %w", err)
	}

	return nil, nil
}

// queuePendingReply 将一条回复加入指定用户的待发送队列。
func (c *WeixinChannel) queuePendingReply(userID string, pr pendingReply) {
	c.pendingRepliesMu.Lock()
	c.pendingReplies[userID] = append(c.pendingReplies[userID], pr)
	c.pendingRepliesMu.Unlock()
}

// popPendingReply 从队首弹出一条待发送消息。没有更多消息返回 false。
func (c *WeixinChannel) popPendingReply(userID string) (pendingReply, bool) {
	c.pendingRepliesMu.Lock()
	defer c.pendingRepliesMu.Unlock()

	queue := c.pendingReplies[userID]
	if len(queue) == 0 {
		return pendingReply{}, false
	}
	pr := queue[0]
	c.pendingReplies[userID] = queue[1:]
	if len(c.pendingReplies[userID]) == 0 {
		delete(c.pendingReplies, userID)
	}
	return pr, true
}

// scheduleFlush 安排延迟后自动重发该用户积压的待回复消息。
// 同一用户同一时间只保留一个定时器，避免重复创建。
// 若重发时仍失败，Send 内部会再次入队并安排下一轮重试。
func (c *WeixinChannel) scheduleFlush(userID string, delay time.Duration) {
	c.flushMu.Lock()
	if c.flushScheduled[userID] {
		c.flushMu.Unlock()
		return
	}
	c.flushScheduled[userID] = true
	c.flushMu.Unlock()

	wait := delay + 500*time.Millisecond

	go func() {
		timer := time.NewTimer(wait)
		defer timer.Stop()

		select {
		case <-c.ctx.Done():
			c.clearFlushScheduled(userID)
			return
		case <-timer.C:
		}

		c.clearFlushScheduled(userID)
		c.flushPendingReplies(c.ctx, userID)
	}()
}

// clearFlushScheduled 清除某用户的重发定时器标记。
func (c *WeixinChannel) clearFlushScheduled(userID string) {
	c.flushMu.Lock()
	delete(c.flushScheduled, userID)
	c.flushMu.Unlock()
}

// flushPendingReplies 发送积压的待回复消息。
// 逐条从队首弹出并发送，失败的通过 enqueueRetry 重新入队尾并安排下一轮重试（指数退避）。
// 逐条弹出保证 FIFO 顺序，且与并发入队的新消息不冲突。
func (c *WeixinChannel) flushPendingReplies(ctx context.Context, userID string) {
	sent := 0
	total := 0
	for {
		pr, ok := c.popPendingReply(userID)
		if !ok {
			break
		}
		total++

		if pr.retries >= maxSendRetries {
			logger.ErrorCF("weixin", "Dropping reply after max retries", map[string]any{
				"user_id":     userID,
				"retries":     pr.retries,
				"content_len": len(pr.msg.Content),
			})
			continue
		}

		if _, err := c.Send(ctx, pr.msg); err != nil {
			logger.WarnCF("weixin", "Flush send failed, will retry", map[string]any{
				"user_id": userID,
				"retries": pr.retries,
				"error":   err.Error(),
			})
			c.enqueueRetry(userID, pr.msg, pr.retries)
			continue
		}
		sent++
	}

	if total > 0 {
		logger.InfoCF("weixin", "Flushed pending replies", map[string]any{
			"user_id": userID,
			"sent":    sent,
			"total":   total,
		})
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
