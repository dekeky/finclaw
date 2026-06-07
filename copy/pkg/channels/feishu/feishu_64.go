//go:build amd64 || arm64 || riscv64 || mips64 || ppc64

package feishu

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	lark "github.com/larksuite/oapi-sdk-go/v3"
	larkcore "github.com/larksuite/oapi-sdk-go/v3/core"
	larkdispatcher "github.com/larksuite/oapi-sdk-go/v3/event/dispatcher"
	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"
	larkws "github.com/larksuite/oapi-sdk-go/v3/ws"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/identity"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/media"
	"github.com/sipeed/picoclaw/pkg/utils"
)

// errCodeTenantTokenInvalid 是飞书 API 返回的错误码，表示 tenant_access_token 已过期或被撤销。
// Lark SDK 内置的重试机制不会在此错误时清除缓存，所以我们自己处理。
const errCodeTenantTokenInvalid = 99991663

// FeishuChannel 飞书频道实现
// 通过 WebSocket 长连接接收消息，使用 REST API 发送消息
type FeishuChannel struct {
	*channels.BaseChannel                       // 继承基础频道功能（白名单、媒体存储等）
	bc         *config.Channel                  // 原始频道配置
	config     *config.FeishuSettings           // 飞书专用配置（AppID、AppSecret 等）
	client     *lark.Client                    // 飞书 SDK HTTP 客户端
	wsClient   *larkws.Client                 // WebSocket 长连接客户端（接收消息）
	tokenCache *tokenCache                    // 自定义 token 缓存，支持失效时自动清除

	botOpenID    atomic.Value // 机器人 OpenID，用于 @mention 检测（懒加载）
	messageCache sync.Map     // 消息缓存，key=messageID，value=*larkim.Message，TTL=30秒

	mu     sync.Mutex  // 保护 cancel 函数
	cancel context.CancelFunc // 取消函数，用于停止 WebSocket 连接

	progress        *channels.ToolFeedbackAnimator // 工具反馈动画（渐进式更新消息）
	deleteMessageFn func(context.Context, string, string) error // 删除消息函数（可替换为模拟版本）
}

// cachedMessage 缓存的消息结构
type cachedMessage struct {
	msg    *larkim.Message // 飞书消息对象
	expiry time.Time       // 过期时间
}

// NewFeishuChannel 创建飞书频道实例
// bc: 频道配置（名称、白名单、群触发设置等）
// cfg: 飞书专用配置（AppID、AppSecret、Token 等）
// bus: 消息总线，用于与 Agent 通信
func NewFeishuChannel(bc *config.Channel, cfg *config.FeishuSettings, bus *bus.MessageBus) (*FeishuChannel, error) {
	// 创建基础频道（处理白名单、群聊触发等通用逻辑）
	base := channels.NewBaseChannel("feishu", cfg, bus, bc.AllowFrom,
		channels.WithGroupTrigger(bc.GroupTrigger),
		channels.WithReasoningChannelID(bc.ReasoningChannelID),
	)

	// 创建自定义 token 缓存（支持失效时清除）
	tc := newTokenCache()
	opts := []lark.ClientOptionFunc{lark.WithTokenCache(tc)}

	// 根据配置选择飞书或 Lark 域名
	if cfg.IsLark {
		opts = append(opts, lark.WithOpenBaseUrl(lark.LarkBaseUrl))
	}

	ch := &FeishuChannel{
		BaseChannel: base,
		bc:          bc,
		config:      cfg,
		tokenCache:  tc,
		client:      lark.NewClient(cfg.AppID, cfg.AppSecret.String(), opts...), // 初始化飞书 SDK 客户端
	}

	// 设置删除消息函数（默认使用 API 删除）
	ch.deleteMessageFn = ch.deleteMessageAPI

	// 初始化工具反馈动画器（用于显示工具执行进度）
	ch.progress = channels.NewToolFeedbackAnimator(ch.EditMessage)

	ch.SetOwner(ch) // 设置频道所有者（用于工具反馈回调）
	return ch, nil
}

// Start 启动飞书频道
// 建立 WebSocket 长连接，接收来自飞书的消息
func (c *FeishuChannel) Start(ctx context.Context) error {
	// 检查配置完整性
	if c.config.AppID == "" || c.config.AppSecret.String() == "" {
		return fmt.Errorf("feishu app_id or app_secret is empty")
	}

	// 获取机器人 OpenID，用于后续的 @mention 检测
	if err := c.fetchBotOpenID(ctx); err != nil {
		logger.ErrorCF("feishu", "Failed to fetch bot open_id, @mention detection may not work", map[string]any{
			"error": err.Error(),
		})
	}

	// 创建事件分发器，注册消息接收处理函数
	// VerificationToken 和 EncryptKey 用于验证飞书服务端的身份
	dispatcher := larkdispatcher.NewEventDispatcher(c.config.VerificationToken.String(), c.config.EncryptKey.String()).
		OnP2MessageReceiveV1(c.handleMessageReceive)

	runCtx, cancel := context.WithCancel(ctx) // 创建可取消的上下文

	c.mu.Lock()
	c.cancel = cancel // 保存取消函数

	// 根据配置选择飞书或 Lark 域名
	domain := lark.FeishuBaseUrl
	if c.config.IsLark {
		domain = lark.LarkBaseUrl
	}

	// 创建 WebSocket 客户端
	c.wsClient = larkws.NewClient(
		c.config.AppID,
		c.config.AppSecret.String(),
		larkws.WithEventHandler(dispatcher), // 事件处理器
		larkws.WithDomain(domain),           // API 域名
	)
	wsClient := c.wsClient // 复制到局部变量，避免锁竞争
	c.mu.Unlock()

	c.SetRunning(true)
	logger.InfoC("feishu", "Feishu channel started (websocket mode)")

	// 在后台启动 WebSocket 连接
	go func() {
		if err := wsClient.Start(runCtx); err != nil {
			logger.ErrorCF("feishu", "Feishu websocket stopped with error", map[string]any{
				"error": err.Error(),
			})
		}
	}()

	return nil
}

// Stop 停止飞书频道
// 关闭 WebSocket 连接，停止所有工具反馈动画
func (c *FeishuChannel) Stop(ctx context.Context) error {
	c.mu.Lock()
	if c.cancel != nil {
		c.cancel() // 触发 WebSocket 断开
		c.cancel = nil
	}
	c.wsClient = nil // 清除 WebSocket 客户端引用
	c.mu.Unlock()

	// 停止所有工具反馈动画
	if c.progress != nil {
		c.progress.StopAll()
	}

	c.SetRunning(false)
	logger.InfoC("feishu", "Feishu channel stopped")
	return nil
}

// Send 发送消息
// 优先使用交互式卡片（支持 Markdown 渲染），失败时降级为纯文本
// msg: 出站消息，包含 ChatID、Content 等
// 返回发送成功的消息 ID 列表
func (c *FeishuChannel) Send(ctx context.Context, msg bus.OutboundMessage) ([]string, error) {
	// 检查频道是否运行中
	if !c.IsRunning() {
		return nil, channels.ErrNotRunning
	}

	// 检查 ChatID 是否有效
	if msg.ChatID == "" {
		return nil, fmt.Errorf("chat ID is empty: %w", channels.ErrSendFailed)
	}

	// 判断是否为工具反馈消息（用于动画更新）
	isToolFeedback := outboundMessageIsToolFeedback(msg)

	// 如果是工具反馈，尝试更新现有动画消息
	if isToolFeedback {
		if msgID, handled, err := c.progress.Update(ctx, msg.ChatID, msg.Content); handled {
			if err != nil {
				// 飞书可能对之前的进度消息降级为纯文本，这些消息无法通过卡片编辑 API 修改
				// 丢弃旧的追踪器并重新创建进度消息，以免阻塞后续的工具反馈
				c.resetTrackedToolFeedbackAfterEditFailure(ctx, msg.ChatID)
			} else {
				return []string{msgID}, nil // 更新成功
			}
		}
	} else {
		// 非工具反馈消息，尝试完成并清除追踪的工具反馈消息
		if msgIDs, handled := c.FinalizeToolFeedbackMessage(ctx, msg); handled {
			return msgIDs, nil
		}
	}

	// 获取当前追踪的工具反馈消息 ID（如果有）
	trackedMsgID, hasTrackedMsg := c.currentToolFeedbackMessage(msg.ChatID)

	// 准备发送的内容
	sendContent := msg.Content
	if isToolFeedback {
		// 工具反馈使用初始动画内容
		sendContent = channels.InitialAnimatedToolFeedbackContent(msg.Content)
	}

	// 尝试构建 Markdown 卡片
	cardContent, err := buildMarkdownCard(sendContent)
	if err != nil {
		// 卡片构建失败，降级为纯文本
		msgID, sendErr := c.sendText(ctx, msg.ChatID, sendContent)
		if sendErr != nil {
			return nil, sendErr
		}
		if isToolFeedback {
			c.RecordToolFeedbackMessage(msg.ChatID, msgID, msg.Content)
		} else if hasTrackedMsg {
			c.dismissTrackedToolFeedbackMessage(ctx, msg.ChatID, trackedMsgID)
		}
		return []string{msgID}, nil
	}

	// 第一次尝试：发送交互式卡片
	msgID, err := c.sendCard(ctx, msg.ChatID, cardContent)
	if err == nil {
		// 发送成功
		if isToolFeedback {
			c.RecordToolFeedbackMessage(msg.ChatID, msgID, msg.Content)
		} else if hasTrackedMsg {
			c.dismissTrackedToolFeedbackMessage(ctx, msg.ChatID, trackedMsgID)
		}
		return []string{msgID}, nil
	}

	// 检查是否是卡片数量限制错误（错误码 11310）
	// 参考: https://open.feishu.cn/document/server-docs/im-api/message-content-description/create_json
	errMsg := err.Error()
	isCardLimitError := strings.Contains(errMsg, "11310")

	if isCardLimitError {
		logger.WarnCF("feishu", "Card send failed (table limit), falling back to text message", map[string]any{
			"chat_id": msg.ChatID,
			"error":   errMsg,
		})

		// 第二次尝试：降级为纯文本消息
		msgID, textErr := c.sendText(ctx, msg.ChatID, sendContent)
		if textErr == nil {
			if isToolFeedback {
				c.RecordToolFeedbackMessage(msg.ChatID, msgID, msg.Content)
			} else if hasTrackedMsg {
				c.dismissTrackedToolFeedbackMessage(ctx, msg.ChatID, trackedMsgID)
			}
			return []string{msgID}, nil
		}
		// 如果文本也失败，返回文本错误
		return nil, textErr
	}

	// 其他错误，返回原始卡片错误
	return nil, err
}

// EditMessage implements channels.MessageEditor.
// Uses Message.Patch to update an interactive card message.
func (c *FeishuChannel) EditMessage(ctx context.Context, chatID, messageID, content string) error {
	cardContent, err := buildMarkdownCard(content)
	if err != nil {
		return fmt.Errorf("feishu edit: card build failed: %w", err)
	}

	req := larkim.NewPatchMessageReqBuilder().
		MessageId(messageID).
		Body(larkim.NewPatchMessageReqBodyBuilder().Content(cardContent).Build()).
		Build()

	resp, err := c.client.Im.V1.Message.Patch(ctx, req)
	if err != nil {
		return fmt.Errorf("feishu edit: %w", err)
	}
	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		return fmt.Errorf("feishu edit api error (code=%d msg=%s)", resp.Code, resp.Msg)
	}
	return nil
}

// DeleteMessage implements channels.MessageDeleter.
func (c *FeishuChannel) DeleteMessage(ctx context.Context, chatID, messageID string) error {
	deleteFn := c.deleteMessageFn
	if deleteFn == nil {
		deleteFn = c.deleteMessageAPI
	}
	return deleteFn(ctx, chatID, messageID)
}

func (c *FeishuChannel) deleteMessageAPI(ctx context.Context, chatID, messageID string) error {
	req := larkim.NewDeleteMessageReqBuilder().
		MessageId(messageID).
		Build()

	resp, err := c.client.Im.V1.Message.Delete(ctx, req)
	if err != nil {
		return fmt.Errorf("feishu delete: %w", err)
	}
	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		return fmt.Errorf("feishu delete api error (code=%d msg=%s)", resp.Code, resp.Msg)
	}
	return nil
}

// SendPlaceholder implements channels.PlaceholderCapable.
// Sends an interactive card with placeholder text and returns its message ID.
func (c *FeishuChannel) SendPlaceholder(ctx context.Context, chatID string) (string, error) {
	if !c.bc.Placeholder.Enabled {
		logger.DebugCF("feishu", "Placeholder disabled, skipping", map[string]any{
			"chat_id": chatID,
		})
		return "", nil
	}

	text := c.bc.Placeholder.GetRandomText()

	cardContent, err := buildMarkdownCard(text)
	if err != nil {
		return "", fmt.Errorf("feishu placeholder: card build failed: %w", err)
	}

	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType(larkim.ReceiveIdTypeChatId).
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).
			MsgType(larkim.MsgTypeInteractive).
			Content(cardContent).
			Build()).
		Build()

	resp, err := c.client.Im.V1.Message.Create(ctx, req)
	if err != nil {
		return "", fmt.Errorf("feishu placeholder send: %w", err)
	}
	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		return "", fmt.Errorf("feishu placeholder api error (code=%d msg=%s)", resp.Code, resp.Msg)
	}

	if resp.Data != nil && resp.Data.MessageId != nil {
		return *resp.Data.MessageId, nil
	}
	return "", nil
}

func outboundMessageIsToolFeedback(msg bus.OutboundMessage) bool {
	if len(msg.Context.Raw) == 0 {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(msg.Context.Raw["message_kind"]), "tool_feedback")
}

func (c *FeishuChannel) currentToolFeedbackMessage(chatID string) (string, bool) {
	if c.progress == nil {
		return "", false
	}
	return c.progress.Current(chatID)
}

func (c *FeishuChannel) takeToolFeedbackMessage(chatID string) (string, string, bool) {
	if c.progress == nil {
		return "", "", false
	}
	return c.progress.Take(chatID)
}

func (c *FeishuChannel) RecordToolFeedbackMessage(chatID, messageID, content string) {
	if c.progress == nil {
		return
	}
	c.progress.Record(chatID, messageID, content)
}

func (c *FeishuChannel) ClearToolFeedbackMessage(chatID string) {
	if c.progress == nil {
		return
	}
	c.progress.Clear(chatID)
}

func (c *FeishuChannel) DismissToolFeedbackMessage(ctx context.Context, chatID string) {
	msgID, ok := c.currentToolFeedbackMessage(chatID)
	if !ok {
		return
	}
	c.dismissTrackedToolFeedbackMessage(ctx, chatID, msgID)
}

func (c *FeishuChannel) resetTrackedToolFeedbackAfterEditFailure(ctx context.Context, chatID string) {
	msgID, ok := c.currentToolFeedbackMessage(chatID)
	if !ok {
		return
	}
	c.dismissTrackedToolFeedbackMessage(ctx, chatID, msgID)
}

func (c *FeishuChannel) dismissTrackedToolFeedbackMessage(ctx context.Context, chatID, messageID string) {
	if strings.TrimSpace(chatID) == "" || strings.TrimSpace(messageID) == "" {
		return
	}
	c.ClearToolFeedbackMessage(chatID)
	deleteFn := c.deleteMessageFn
	if deleteFn == nil {
		deleteFn = c.deleteMessageAPI
	}
	_ = deleteFn(ctx, chatID, messageID)
}

func (c *FeishuChannel) finalizeTrackedToolFeedbackMessage(
	ctx context.Context,
	chatID string,
	content string,
	editFn func(context.Context, string, string, string) error,
) ([]string, bool) {
	msgID, baseContent, ok := c.takeToolFeedbackMessage(chatID)
	if !ok || editFn == nil {
		return nil, false
	}
	if err := editFn(ctx, chatID, msgID, content); err != nil {
		c.RecordToolFeedbackMessage(chatID, msgID, baseContent)
		return nil, false
	}
	return []string{msgID}, true
}

func (c *FeishuChannel) FinalizeToolFeedbackMessage(ctx context.Context, msg bus.OutboundMessage) ([]string, bool) {
	if outboundMessageIsToolFeedback(msg) {
		return nil, false
	}
	return c.finalizeTrackedToolFeedbackMessage(ctx, msg.ChatID, msg.Content, c.EditMessage)
}

// ReactToMessage implements channels.ReactionCapable.
// Adds a reaction (randomly chosen from config) and returns an undo function to remove it.
func (c *FeishuChannel) ReactToMessage(ctx context.Context, chatID, messageID string) (func(), error) {
	// Get emoji list from config (Feishu emoji_type keys, e.g. Pin, THUMBSUP).
	// Ignore empty entries so a list like ["", "Pin"] does not randomly pick "" (API 231001).
	var candidates []string
	for _, e := range c.config.RandomReactionEmoji {
		e = strings.TrimSpace(e)
		if e != "" {
			candidates = append(candidates, e)
		}
	}
	chosenEmoji := "Pin"
	if len(candidates) > 0 {
		chosenEmoji = candidates[rand.Intn(len(candidates))]
	}

	req := larkim.NewCreateMessageReactionReqBuilder().
		MessageId(messageID).
		Body(larkim.NewCreateMessageReactionReqBodyBuilder().
			ReactionType(larkim.NewEmojiBuilder().EmojiType(chosenEmoji).Build()).
			Build()).
		Build()

	resp, err := c.client.Im.V1.MessageReaction.Create(ctx, req)
	if err != nil {
		logger.ErrorCF("feishu", "Failed to add reaction", map[string]any{
			"emoji":      chosenEmoji,
			"message_id": messageID,
			"error":      err.Error(),
		})
		return func() {}, fmt.Errorf("feishu react: %w", err)
	}
	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		logger.ErrorCF("feishu", "Reaction API error", map[string]any{
			"emoji":      chosenEmoji,
			"message_id": messageID,
			"code":       resp.Code,
			"msg":        resp.Msg,
		})
		return func() {}, fmt.Errorf("feishu react api error (code=%d msg=%s)", resp.Code, resp.Msg)
	}

	var reactionID string
	if resp.Data != nil && resp.Data.ReactionId != nil {
		reactionID = *resp.Data.ReactionId
	}
	if reactionID == "" {
		return func() {}, nil
	}

	var undone atomic.Bool
	undo := func() {
		if !undone.CompareAndSwap(false, true) {
			return
		}
		delReq := larkim.NewDeleteMessageReactionReqBuilder().
			MessageId(messageID).
			ReactionId(reactionID).
			Build()
		_, _ = c.client.Im.V1.MessageReaction.Delete(context.Background(), delReq)
	}
	return undo, nil
}

// SendMedia implements channels.MediaSender.
// Uploads images/files via Feishu API then sends as messages.
func (c *FeishuChannel) SendMedia(ctx context.Context, msg bus.OutboundMediaMessage) ([]string, error) {
	if !c.IsRunning() {
		return nil, channels.ErrNotRunning
	}
	trackedMsgID, hasTrackedMsg := c.currentToolFeedbackMessage(msg.ChatID)

	if msg.ChatID == "" {
		return nil, fmt.Errorf("chat ID is empty: %w", channels.ErrSendFailed)
	}

	store := c.GetMediaStore()
	if store == nil {
		return nil, fmt.Errorf("no media store available: %w", channels.ErrSendFailed)
	}

	for _, part := range msg.Parts {
		if err := c.sendMediaPart(ctx, msg.ChatID, part, store); err != nil {
			return nil, err
		}
	}

	if hasTrackedMsg {
		c.dismissTrackedToolFeedbackMessage(ctx, msg.ChatID, trackedMsgID)
	}

	return nil, nil
}

// sendMediaPart resolves and sends a single media part.
func (c *FeishuChannel) sendMediaPart(
	ctx context.Context,
	chatID string,
	part bus.MediaPart,
	store media.MediaStore,
) error {
	localPath, err := store.Resolve(part.Ref)
	if err != nil {
		logger.ErrorCF("feishu", "Failed to resolve media ref", map[string]any{
			"ref":   part.Ref,
			"error": err.Error(),
		})
		return nil // skip this part
	}

	file, err := os.Open(localPath)
	if err != nil {
		logger.ErrorCF("feishu", "Failed to open media file", map[string]any{
			"path":  localPath,
			"error": err.Error(),
		})
		return nil // skip this part
	}
	defer file.Close()

	switch part.Type {
	case "image":
		err = c.sendImage(ctx, chatID, file)
	default:
		filename := part.Filename
		if filename == "" {
			filename = "file"
		}
		err = c.sendFile(ctx, chatID, file, filename, part.Type)
	}

	if err != nil {
		logger.ErrorCF("feishu", "Failed to send media", map[string]any{
			"type":  part.Type,
			"error": err.Error(),
		})
		return fmt.Errorf("feishu send media: %w", channels.ErrTemporary)
	}
	return nil
}

// --- 入站消息处理 ---

// handleMessageReceive 处理接收到的飞书消息
// 由 WebSocket 事件分发器调用，是消息进入系统的入口点
func (c *FeishuChannel) handleMessageReceive(ctx context.Context, event *larkim.P2MessageReceiveV1) error {
	// 空事件检查
	if event == nil || event.Event == nil || event.Event.Message == nil {
		return nil
	}

	message := event.Event.Message   // 消息内容
	sender := event.Event.Sender     // 发送者信息

	// 提取 ChatID
	chatID := stringValue(message.ChatId)
	if chatID == "" {
		return nil
	}

	// 提取发送者 ID（优先 UserID，其次 OpenID，最后 UnionID）
	senderID := extractFeishuSenderID(sender)
	if senderID == "" {
		senderID = "unknown"
	}

	// 提取消息类型和内容
	messageType := stringValue(message.MessageType)
	messageID := stringValue(message.MessageId)
	rawContent := stringValue(message.Content)

	// 提前检查白名单，避免为无效发送者浪费网络 I/O
	// BaseChannel.HandleMessage 会再次检查，但提前返回可以节省资源
	senderInfo := bus.SenderInfo{
		Platform:    "feishu",
		PlatformID:  senderID,
		CanonicalID: identity.BuildCanonicalID("feishu", senderID),
	}
	if !c.IsAllowedSender(senderInfo) {
		return nil
	}

	// 根据消息类型提取文本内容
	content := extractContent(messageType, rawContent)

	// 处理媒体消息（下载并存储到 MediaStore）
	var mediaRefs []string
	if store := c.GetMediaStore(); store != nil && messageID != "" {
		mediaRefs = c.downloadInboundMedia(ctx, chatID, messageID, messageType, rawContent, store)
	}

	// 对于交互式卡片，将外部图片 URL 添加到媒体引用
	// 保持 content 为有效的原始 JSON 以供下游解析
	if messageType == larkim.MsgTypeInteractive {
		_, externalURLs := extractCardImageKeys(rawContent)
		if len(externalURLs) > 0 {
			mediaRefs = append(mediaRefs, externalURLs...)
		}
	}

	// 追加媒体标签到内容（如 Telegram 所做的那样）
	content = appendMediaTags(content, messageType, mediaRefs)

	if content == "" {
		content = "[empty message]"
	}

	chatType := stringValue(message.ChatType) // "p2p" 或 "group"
	metadata := buildInboundMetadata(message, sender) // 构建元数据

	var (
		inboundChatType string // "direct" 或 "group"
		isMentioned     bool   // 是否 @机器人
	)

	// 区分私聊和群聊
	if chatType == "p2p" {
		inboundChatType = "direct"
	} else {
		inboundChatType = "group"

		// 检查是否 @了机器人
		isMentioned = c.isBotMentioned(message)

		// 在群聊触发检查之前，去除 mention 占位符
		if len(message.Mentions) > 0 {
			content = stripMentionPlaceholders(content, message.Mentions)
		}

		// 在群聊中应用统一的群聊触发过滤
		respond, cleaned := c.ShouldRespondInGroup(isMentioned, content)
		if !respond {
			return nil // 不满足触发条件，忽略消息
		}
		content = cleaned
	}

	// 如果是回复消息，追加被回复消息的上下文
	if replyTargetID(message) != "" || stringValue(message.ThreadId) != "" {
		content, mediaRefs = c.prependReplyContext(ctx, message, chatID, content, mediaRefs)
	}
	if content == "" {
		content = "[empty message]"
	}

	// 记录日志
	logger.InfoCF("feishu", "Feishu message received", map[string]any{
		"sender_id":  senderID,
		"chat_id":    chatID,
		"message_id": messageID,
		"preview":    utils.Truncate(content, 80),
	})
	logger.InfoCF("feishu", "Feishu reply linkage", map[string]any{
		"message_id": messageID,
		"parent_id":  stringValue(message.ParentId),
		"root_id":    stringValue(message.RootId),
		"thread_id":  stringValue(message.ThreadId),
	})

	// 构建入站上下文
	inboundCtx := bus.InboundContext{
		Channel:   "feishu",
		ChatID:    chatID,
		ChatType:  inboundChatType,
		SenderID:  senderID,
		MessageID: messageID,
		Mentioned: isMentioned,
		Raw:       metadata,
	}

	// 设置租户信息（用于多租户场景）
	if sender != nil && sender.TenantKey != nil && *sender.TenantKey != "" {
		inboundCtx.SpaceType = "tenant"
		inboundCtx.SpaceID = *sender.TenantKey
	}

	// 发送到消息总线，触发 Agent 处理
	c.HandleInboundContext(ctx, chatID, content, mediaRefs, inboundCtx, senderInfo)
	return nil
}

// --- Internal helpers ---

// fetchBotOpenID 获取机器人的 OpenID
// OpenID 用于检测消息中是否 @ 了机器人
// 需要调用飞书 API: GET /open-apis/bot/v3/info
func (c *FeishuChannel) fetchBotOpenID(ctx context.Context) error {
	resp, err := c.client.Do(ctx, &larkcore.ApiReq{
		HttpMethod:                http.MethodGet,
		ApiPath:                   "/open-apis/bot/v3/info",
		SupportedAccessTokenTypes: []larkcore.AccessTokenType{larkcore.AccessTokenTypeTenant},
	})
	if err != nil {
		return fmt.Errorf("bot info request: %w", err)
	}

	// 解析响应
	var result struct {
		Code int `json:"code"`
		Bot  struct {
			OpenID string `json:"open_id"`
		} `json:"bot"`
	}
	if err := json.Unmarshal(resp.RawBody, &result); err != nil {
		return fmt.Errorf("bot info parse: %w", err)
	}
	if result.Code != 0 {
		c.invalidateTokenOnAuthError(result.Code)
		return fmt.Errorf("bot info api error (code=%d)", result.Code)
	}
	if result.Bot.OpenID == "" {
		return fmt.Errorf("bot info: empty open_id")
	}

	// 存储 OpenID 到 atomic.Value，供后续 @ 检测使用
	c.botOpenID.Store(result.Bot.OpenID)
	logger.InfoCF("feishu", "Fetched bot open_id from API", map[string]any{
		"open_id": result.Bot.OpenID,
	})
	return nil
}

// isBotMentioned 检测消息中是否 @ 了机器人
// 通过比对消息中的提及列表与机器人的 OpenID
func (c *FeishuChannel) isBotMentioned(message *larkim.EventMessage) bool {
	if message.Mentions == nil {
		return false
	}

	// 从缓存中加载机器人的 OpenID
	knownID, _ := c.botOpenID.Load().(string)
	if knownID == "" {
		logger.DebugCF("feishu", "Bot open_id unknown, cannot detect @mention", nil)
		return false
	}

	// 遍历消息中的提及列表
	for _, m := range message.Mentions {
		if m.Id == nil {
			continue
		}
		// 检查是否提到了机器人
		if m.Id.OpenId != nil && *m.Id.OpenId == knownID {
			return true
		}
	}
	return false
}

// extractContent 根据消息类型提取文本内容
// 不同类型的消息有不同的提取策略
func extractContent(messageType, rawContent string) string {
	if rawContent == "" {
		return ""
	}

	switch messageType {
	case larkim.MsgTypeText:
		// 文本消息：解析 JSON 提取 text 字段
		var textPayload struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal([]byte(rawContent), &textPayload); err == nil {
			return textPayload.Text
		}
		return rawContent

	case larkim.MsgTypePost:
		// 富文本消息：传递原始 JSON 给 LLM
		// 结构化的富文本比扁平化的纯文本更有信息量
		return rawContent

	case larkim.MsgTypeInteractive:
		// 交互式卡片：传递原始 JSON 给 LLM
		// 结构化的卡片比扁平化的文本更有信息量
		return rawContent

	case larkim.MsgTypeImage:
		// 图片消息：没有文本内容
		return ""

	case larkim.MsgTypeFile, larkim.MsgTypeAudio, larkim.MsgTypeMedia:
		// 文件/音频/视频消息：尝试提取文件名
		name := extractFileName(rawContent)
		if name != "" {
			return name
		}
		return ""

	default:
		// 其他类型：返回原始内容
		return rawContent
	}
}

// downloadInboundMedia 下载入站消息中的媒体文件
// 根据消息类型选择不同的下载策略
// 返回存储的媒体引用列表
func (c *FeishuChannel) downloadInboundMedia(
	ctx context.Context,
	chatID, messageID, messageType, rawContent string,
	store media.MediaStore,
) []string {
	var refs []string
	scope := channels.BuildMediaScope("feishu", chatID, messageID) // 构建媒体作用域

	switch messageType {
	case larkim.MsgTypeImage:
		// 图片消息：提取 image_key 并下载
		imageKey := extractImageKey(rawContent)
		if imageKey == "" {
			return nil
		}
		ref := c.downloadResource(ctx, messageID, imageKey, "image", ".jpg", store, scope)
		if ref != "" {
			refs = append(refs, ref)
		}

	case larkim.MsgTypePost:
		// 富文本消息：提取所有图片并下载
		for _, imageKey := range extractPostImageKeys(rawContent) {
			ref := c.downloadResource(ctx, messageID, imageKey, "image", ".jpg", store, scope)
			if ref != "" {
				refs = append(refs, ref)
			}
		}

	case larkim.MsgTypeInteractive:
		// 交互式卡片：下载嵌入的图片
		feishuKeys, _ := extractCardImageKeys(rawContent)
		// 下载飞书托管的图片
		for _, imageKey := range feishuKeys {
			ref := c.downloadResource(ctx, messageID, imageKey, "image", ".jpg", store, scope)
			if ref != "" {
				refs = append(refs, ref)
			}
		}
		// 外部 URL 直接传递给 LLM，不下载

	case larkim.MsgTypeFile, larkim.MsgTypeAudio, larkim.MsgTypeMedia:
		// 文件/音频/视频消息：提取 file_key 并下载
		fileKey := extractFileKey(rawContent)
		if fileKey == "" {
			return nil
		}
		// 根据消息类型设置默认扩展名
		var ext string
		switch messageType {
		case larkim.MsgTypeAudio:
			ext = ".ogg"
		case larkim.MsgTypeMedia:
			ext = ".mp4"
		default:
			ext = "" // 通用文件：依赖响应的文件名
		}
		ref := c.downloadResource(ctx, messageID, fileKey, "file", ext, store, scope)
		if ref != "" {
			refs = append(refs, ref)
		}
	}

	return refs
}

// downloadResource downloads a message resource (image/file) from Feishu,
// writes it to the project media directory, and stores the reference in MediaStore.
// fallbackExt (e.g. ".jpg") is appended when the resolved filename has no extension.
//
// For image resources, if the primary MessageResource.Get API fails (which
// requires im:message or im:message:readonly scope), a fallback to the
// Image.Get API (which requires im:resource scope) is attempted. This ensures
// image downloads succeed regardless of which permission the user has granted.
func (c *FeishuChannel) downloadResource(
	ctx context.Context,
	messageID, fileKey, resourceType, fallbackExt string,
	store media.MediaStore,
	scope string,
) string {
	file, filename := c.fetchResourceData(ctx, messageID, fileKey, resourceType)
	if file == nil {
		return ""
	}
	if closer, ok := file.(io.Closer); ok {
		defer closer.Close()
	}

	if filename == "" {
		filename = fileKey
	}
	if filepath.Ext(filename) == "" && fallbackExt != "" {
		filename += fallbackExt
	}

	return c.storeResourceFile(ctx, messageID, fileKey, filename, file, store, scope)
}

// fetchResourceData tries to download a resource from Feishu, first via
// MessageResource.Get, then falling back to Image.Get for image resources.
func (c *FeishuChannel) fetchResourceData(
	ctx context.Context,
	messageID, fileKey, resourceType string,
) (io.Reader, string) {
	req := larkim.NewGetMessageResourceReqBuilder().
		MessageId(messageID).
		FileKey(fileKey).
		Type(resourceType).
		Build()

	resp, err := c.client.Im.V1.MessageResource.Get(ctx, req)
	if err == nil && resp.Success() && resp.File != nil {
		return resp.File, resp.FileName
	}

	if err != nil {
		logger.WarnCF("feishu", "MessageResource.Get failed", map[string]any{
			"message_id": messageID,
			"file_key":   fileKey,
			"error":      err.Error(),
		})
	} else if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		logger.WarnCF("feishu", "MessageResource.Get api error", map[string]any{
			"message_id": messageID,
			"file_key":   fileKey,
			"code":       resp.Code,
			"msg":        resp.Msg,
		})
	} else {
		logger.WarnCF("feishu", "MessageResource.Get returned empty file body", map[string]any{
			"message_id": messageID,
			"file_key":   fileKey,
		})
	}

	if resourceType != "image" {
		return nil, ""
	}

	return c.fetchImageDirect(ctx, fileKey)
}

// fetchImageDirect downloads an image using the Image.Get API
// (/open-apis/im/v1/images/:image_key), which requires the im:resource scope.
func (c *FeishuChannel) fetchImageDirect(ctx context.Context, imageKey string) (io.Reader, string) {
	req := larkim.NewGetImageReqBuilder().
		ImageKey(imageKey).
		Build()

	resp, err := c.client.Im.V1.Image.Get(ctx, req)
	if err != nil {
		logger.ErrorCF("feishu", "Image.Get fallback failed", map[string]any{
			"image_key": imageKey,
			"error":     err.Error(),
		})
		return nil, ""
	}
	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		logger.ErrorCF("feishu", "Image.Get fallback api error", map[string]any{
			"image_key": imageKey,
			"code":      resp.Code,
			"msg":       resp.Msg,
		})
		return nil, ""
	}
	if resp.File == nil {
		return nil, ""
	}

	logger.DebugCF("feishu", "Image downloaded via Image.Get fallback", map[string]any{
		"image_key": imageKey,
	})
	return resp.File, resp.FileName
}

// storeResourceFile writes downloaded resource data to disk and registers it in the MediaStore.
func (c *FeishuChannel) storeResourceFile(
	ctx context.Context,
	messageID, fileKey, filename string,
	file io.Reader,
	store media.MediaStore,
	scope string,
) string {
	mediaDir := media.TempDir()
	if mkdirErr := os.MkdirAll(mediaDir, 0o700); mkdirErr != nil {
		logger.ErrorCF("feishu", "Failed to create media directory", map[string]any{
			"error": mkdirErr.Error(),
		})
		return ""
	}
	ext := filepath.Ext(filename)
	localPath := filepath.Join(mediaDir, utils.SanitizeFilename(messageID+"-"+fileKey+ext))

	out, err := os.Create(localPath)
	if err != nil {
		logger.ErrorCF("feishu", "Failed to create local file for resource", map[string]any{
			"error": err.Error(),
		})
		return ""
	}

	if _, copyErr := io.Copy(out, file); copyErr != nil {
		out.Close()
		os.Remove(localPath)
		logger.ErrorCF("feishu", "Failed to write resource to file", map[string]any{
			"error": copyErr.Error(),
		})
		return ""
	}
	out.Close()

	ref, err := store.Store(localPath, media.MediaMeta{
		Filename:      filename,
		Source:        "feishu",
		CleanupPolicy: media.CleanupPolicyDeleteOnCleanup,
	}, scope)
	if err != nil {
		logger.ErrorCF("feishu", "Failed to store downloaded resource", map[string]any{
			"file_key": fileKey,
			"error":    err.Error(),
		})
		os.Remove(localPath)
		return ""
	}

	return ref
}

// appendMediaTags appends media type tags to content (like Telegram's "[image: photo]").
// For interactive cards, media tags are not appended because content is raw JSON
// and appending would produce invalid JSON format.
func appendMediaTags(content, messageType string, mediaRefs []string) string {
	if len(mediaRefs) == 0 {
		return content
	}

	// Don't append tags to JSON content - would produce invalid JSON
	if messageType == larkim.MsgTypeInteractive || messageType == larkim.MsgTypePost {
		return content
	}

	var tag string
	switch messageType {
	case larkim.MsgTypeImage:
		tag = "[image: photo]"
	case larkim.MsgTypeAudio:
		tag = "[audio]"
	case larkim.MsgTypeMedia:
		tag = "[video]"
	case larkim.MsgTypeFile:
		tag = "[file]"
	default:
		tag = "[attachment]"
	}

	if content == "" {
		return tag
	}
	return content + " " + tag
}

// sendCard 发送交互式卡片消息
// 飞书的交互式卡片支持 Markdown 渲染，比纯文本更丰富
// 返回发送成功的消息 ID
func (c *FeishuChannel) sendCard(ctx context.Context, chatID, cardContent string) (string, error) {
	// 构建创建消息请求
	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType(larkim.ReceiveIdTypeChatId). // 使用 ChatID 定位会话
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).    // 接收者 ChatID
			MsgType(larkim.MsgTypeInteractive). // 消息类型：交互式卡片
			Content(cardContent). // 卡片 JSON 内容
			Build()).
		Build()

	resp, err := c.client.Im.V1.Message.Create(ctx, req)
	if err != nil {
		return "", fmt.Errorf("feishu send card: %w", channels.ErrTemporary)
	}

	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code) // token 失效时清除缓存
		return "", fmt.Errorf("feishu api error (code=%d msg=%s): %w", resp.Code, resp.Msg, channels.ErrTemporary)
	}

	logger.DebugCF("feishu", "Feishu card message sent", map[string]any{
		"chat_id": chatID,
	})

	// 返回消息 ID
	if resp.Data != nil && resp.Data.MessageId != nil {
		return *resp.Data.MessageId, nil
	}
	return "", nil
}

// sendText 发送纯文本消息
// 当卡片发送失败时的降级方案
// 返回发送成功的消息 ID
func (c *FeishuChannel) sendText(ctx context.Context, chatID, text string) (string, error) {
	// 构建文本消息内容
	content, _ := json.Marshal(map[string]string{"text": text})

	// 构建创建消息请求
	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType(larkim.ReceiveIdTypeChatId).
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).
			MsgType(larkim.MsgTypeText). // 消息类型：文本
			Content(string(content)).
			Build()).
		Build()

	resp, err := c.client.Im.V1.Message.Create(ctx, req)
	if err != nil {
		return "", fmt.Errorf("feishu send text: %w", channels.ErrTemporary)
	}

	if !resp.Success() {
		return "", fmt.Errorf("feishu text api error (code=%d msg=%s): %w", resp.Code, resp.Msg, channels.ErrTemporary)
	}

	logger.DebugCF("feishu", "Feishu text message sent (fallback)", map[string]any{
		"chat_id": chatID,
	})

	if resp.Data != nil && resp.Data.MessageId != nil {
		return *resp.Data.MessageId, nil
	}
	return "", nil
}

// sendImage 上传图片并发送为消息
// 飞书图片消息需要先上传获取 image_key，再发送消息
func (c *FeishuChannel) sendImage(ctx context.Context, chatID string, file *os.File) error {
	// 第一步：上传图片到飞书，获取 image_key
	uploadReq := larkim.NewCreateImageReqBuilder().
		Body(larkim.NewCreateImageReqBodyBuilder().
			ImageType("message"). // 图片类型：消息图片
			Image(file).          // 图片文件
			Build()).
		Build()

	uploadResp, err := c.client.Im.V1.Image.Create(ctx, uploadReq)
	if err != nil {
		return fmt.Errorf("feishu image upload: %w", err)
	}
	if !uploadResp.Success() {
		c.invalidateTokenOnAuthError(uploadResp.Code)
		return fmt.Errorf("feishu image upload api error (code=%d msg=%s)", uploadResp.Code, uploadResp.Msg)
	}
	if uploadResp.Data == nil || uploadResp.Data.ImageKey == nil {
		return fmt.Errorf("feishu image upload: no image_key returned")
	}

	imageKey := *uploadResp.Data.ImageKey

	// 第二步：发送图片消息
	content, _ := json.Marshal(map[string]string{"image_key": imageKey})
	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType(larkim.ReceiveIdTypeChatId).
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).
			MsgType(larkim.MsgTypeImage). // 消息类型：图片
			Content(string(content)).
			Build()).
		Build()

	resp, err := c.client.Im.V1.Message.Create(ctx, req)
	if err != nil {
		return fmt.Errorf("feishu image send: %w", err)
	}
	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		return fmt.Errorf("feishu image send api error (code=%d msg=%s)", resp.Code, resp.Msg)
	}
	return nil
}

// sendFile 上传文件并发送为消息
// 支持音频、视频和普通文件
func (c *FeishuChannel) sendFile(ctx context.Context, chatID string, file *os.File, filename, fileType string) error {
	// 将文件类型映射到飞书的 file_type
	feishuFileType := "stream" // 默认：流文件
	switch fileType {
	case "audio":
		feishuFileType = "opus" // 音频
	case "video":
		feishuFileType = "mp4"  // 视频
	}

	// 第一步：上传文件到飞书，获取 file_key
	uploadReq := larkim.NewCreateFileReqBuilder().
		Body(larkim.NewCreateFileReqBodyBuilder().
			FileType(feishuFileType). // 文件类型
			FileName(filename).       // 文件名
			File(file).               // 文件内容
			Build()).
		Build()

	uploadResp, err := c.client.Im.V1.File.Create(ctx, uploadReq)
	if err != nil {
		return fmt.Errorf("feishu file upload: %w", err)
	}
	if !uploadResp.Success() {
		c.invalidateTokenOnAuthError(uploadResp.Code)
		return fmt.Errorf("feishu file upload api error (code=%d msg=%s)", uploadResp.Code, uploadResp.Msg)
	}
	if uploadResp.Data == nil || uploadResp.Data.FileKey == nil {
		return fmt.Errorf("feishu file upload: no file_key returned")
	}

	fileKey := *uploadResp.Data.FileKey

	// 第二步：发送文件消息
	content, _ := json.Marshal(map[string]string{"file_key": fileKey})
	req := larkim.NewCreateMessageReqBuilder().
		ReceiveIdType(larkim.ReceiveIdTypeChatId).
		Body(larkim.NewCreateMessageReqBodyBuilder().
			ReceiveId(chatID).
			MsgType(larkim.MsgTypeFile). // 消息类型：文件
			Content(string(content)).
			Build()).
		Build()

	resp, err := c.client.Im.V1.Message.Create(ctx, req)
	if err != nil {
		return fmt.Errorf("feishu file send: %w", err)
	}
	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		return fmt.Errorf("feishu file send api error (code=%d msg=%s)", resp.Code, resp.Msg)
	}
	return nil
}

// extractFeishuSenderID 提取飞书发送者 ID
// 优先级：UserID > OpenID > UnionID
// UserID: 应用内的用户 ID
// OpenID: 用户的开放平台 ID
// UnionID: 跨应用的用户唯一标识
func extractFeishuSenderID(sender *larkim.EventSender) string {
	if sender == nil || sender.SenderId == nil {
		return ""
	}

	// 优先使用 UserID
	if sender.SenderId.UserId != nil && *sender.SenderId.UserId != "" {
		return *sender.SenderId.UserId
	}
	// 其次使用 OpenID
	if sender.SenderId.OpenId != nil && *sender.SenderId.OpenId != "" {
		return *sender.SenderId.OpenId
	}
	// 最后使用 UnionID
	if sender.SenderId.UnionId != nil && *sender.SenderId.UnionId != "" {
		return *sender.SenderId.UnionId
	}

	return ""
}

// invalidateTokenOnAuthError 当飞书 API 返回认证错误时清除缓存的 token
// 当错误码为 99991663（token 无效）时，清除缓存的 tenant_access_token
// 这样下一次请求会获取新的 token
// 注意：Lark SDK 内置的重试机制不会在此错误时清除缓存，
// 会导致所有 API 调用失败直到 token 自然过期（约 2 小时）
func (c *FeishuChannel) invalidateTokenOnAuthError(code int) {
	if code == errCodeTenantTokenInvalid {
		c.tokenCache.InvalidateAll() // 清除所有缓存的 token
		logger.WarnCF("feishu", "Invalidated cached token due to auth error", nil)
	}
}
