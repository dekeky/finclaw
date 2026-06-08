//go:build amd64 || arm64 || riscv64 || mips64 || ppc64

package feishu

import (
	"context"
	"fmt"
	"strings"
	"time"

	larkim "github.com/larksuite/oapi-sdk-go/v3/service/im/v1"

	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/utils"
)

const messageCacheTTL = 30 * time.Second

const (
	maxReplyContextLen = 600
)

// prependReplyContext 追加被回复消息的上下文
// 当用户回复某条消息时，获取该消息的内容并追加到当前消息前
// 这样 AI 可以理解对话的完整上下文
func (c *FeishuChannel) prependReplyContext(
	ctx context.Context,
	message *larkim.EventMessage, // 当前消息（可能是回复）
	chatID string,
	content string,           // 当前消息的内容
	mediaRefs []string,       // 当前消息的媒体引用
) (string, []string) {
	if message == nil {
		return content, mediaRefs
	}

	// 创建 5 秒超时上下文，避免长时间等待
	lookupCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// 解析被回复消息的 ID
	targetMessageID := c.resolveReplyTargetMessageID(lookupCtx, message)
	if targetMessageID == "" {
		logger.DebugCF("feishu", "No reply target resolved; skip reply context", map[string]any{
			"message_id": stringValue(message.MessageId),
			"parent_id":  stringValue(message.ParentId),
			"root_id":    stringValue(message.RootId),
			"thread_id":  stringValue(message.ThreadId),
		})
		return content, mediaRefs
	}

	// 获取被回复消息的详情
	repliedMessage, err := c.fetchMessageByID(lookupCtx, targetMessageID)
	if err != nil {
		logger.DebugCF("feishu", "Failed to fetch replied message context", map[string]any{
			"target_message_id": targetMessageID,
			"error":             err.Error(),
		})
		return content, mediaRefs
	}

	// 提取被回复消息的类型和内容
	messageType := stringValue(repliedMessage.MsgType)
	rawContent := ""
	if repliedMessage.Body != nil {
		rawContent = stringValue(repliedMessage.Body.Content)
	}

	// 下载被回复消息的媒体（如果有）
	var repliedMediaRefs []string
	if store := c.GetMediaStore(); store != nil {
		repliedMediaRefs = c.downloadInboundMedia(lookupCtx, chatID, targetMessageID, messageType, rawContent, store)
		// 交互式卡片的外部图片 URL 也需要传递
		if messageType == larkim.MsgTypeInteractive {
			_, externalURLs := extractCardImageKeys(rawContent)
			if len(externalURLs) > 0 {
				repliedMediaRefs = append(repliedMediaRefs, externalURLs...)
			}
		}
	}

	// 规范化被回复内容（处理特殊占位符、媒体标签等）
	repliedContent := normalizeRepliedContent(messageType, rawContent, repliedMediaRefs)
	if len(repliedMediaRefs) > 0 {
		mediaRefs = append(repliedMediaRefs, mediaRefs...)
	}

	// 格式化为统一的回复上下文格式
	return formatReplyContext(targetMessageID, repliedContent, content), mediaRefs
}

// resolveReplyTargetMessageID 解析被回复消息的 ID
// 优先从事件 payload 中提取 parent_id/root_id
// 如果没有，则查询当前消息详情来获取回复目标
func (c *FeishuChannel) resolveReplyTargetMessageID(ctx context.Context, message *larkim.EventMessage) string {
	// 第一步：直接从事件 payload 提取（最常见的情况）
	if targetID := replyTargetID(message); targetID != "" {
		logger.DebugCF("feishu", "Resolved reply target from event payload", map[string]any{
			"message_id": stringValue(message.MessageId),
			"parent_id":  stringValue(message.ParentId),
			"root_id":    stringValue(message.RootId),
			"target_id":  targetID,
		})
		return targetID
	}

	currentMessageID := stringValue(message.MessageId)
	if currentMessageID == "" {
		return ""
	}

	// 如果消息不在 thread 中，则没有回复目标
	if stringValue(message.ThreadId) == "" {
		logger.DebugCF("feishu", "No reply target found; message is not in a thread", map[string]any{
			"message_id": stringValue(message.MessageId),
		})
		return ""
	}

	// 第二步：查询当前消息详情来获取回复信息
	msg, err := c.fetchMessageByID(ctx, currentMessageID)
	if err != nil {
		logger.DebugCF("feishu", "Failed to query current message detail for reply info", map[string]any{
			"message_id": currentMessageID,
			"error":      err.Error(),
		})
		return ""
	}

	// 从消息详情中提取回复目标
	targetID := replyTargetIDFromMessage(msg)
	if targetID != "" {
		logger.DebugCF("feishu", "Resolved reply target from message detail", map[string]any{
			"message_id": currentMessageID,
			"parent_id":  stringValue(msg.ParentId),
			"root_id":    stringValue(msg.RootId),
			"target_id":  targetID,
		})
	}
	return targetID
}

// fetchMessageByID 根据消息 ID 获取消息详情
// 使用 30 秒缓存避免重复请求
func (c *FeishuChannel) fetchMessageByID(ctx context.Context, messageID string) (*larkim.Message, error) {
	// 检查缓存
	if cached, ok := c.messageCache.Load(messageID); ok {
		cm := cached.(*cachedMessage)
		if time.Now().Before(cm.expiry) {
			return cm.msg, nil // 缓存命中
		}
		c.messageCache.Delete(messageID) // 缓存过期，删除
	}

	// 调用飞书 API 获取消息
	req := larkim.NewGetMessageReqBuilder().
		MessageId(messageID).
		Build()

	resp, err := c.client.Im.V1.Message.Get(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("feishu get message: %w", err)
	}
	if !resp.Success() {
		c.invalidateTokenOnAuthError(resp.Code)
		return nil, fmt.Errorf("feishu get message api error (code=%d msg=%s)", resp.Code, resp.Msg)
	}
	if resp.Data == nil || len(resp.Data.Items) == 0 || resp.Data.Items[0] == nil {
		return nil, fmt.Errorf("feishu get message: empty response")
	}

	// 飞书 API 返回列表，但我们按 ID 查询，所以最多只有一个元素
	msg := resp.Data.Items[0]

	// 存入缓存，30 秒后过期
	c.messageCache.Store(messageID, &cachedMessage{msg: msg, expiry: time.Now().Add(messageCacheTTL)})
	return msg, nil
}

func replyTargetID(message *larkim.EventMessage) string {
	if message == nil {
		return ""
	}
	if parentID := stringValue(message.ParentId); parentID != "" {
		return parentID
	}
	return stringValue(message.RootId)
}

func replyTargetIDFromMessage(message *larkim.Message) string {
	if message == nil {
		return ""
	}
	if parentID := stringValue(message.ParentId); parentID != "" {
		return parentID
	}
	return stringValue(message.RootId)
}

func buildInboundMetadata(message *larkim.EventMessage, sender *larkim.EventSender) map[string]string {
	metadata := map[string]string{}
	if message == nil {
		return metadata
	}

	messageID := stringValue(message.MessageId)
	if messageID != "" {
		metadata["message_id"] = messageID
	}

	messageType := stringValue(message.MessageType)
	if messageType != "" {
		metadata["message_type"] = messageType
	}

	chatType := stringValue(message.ChatType)
	if chatType != "" {
		metadata["chat_type"] = chatType
	}

	parentID := stringValue(message.ParentId)
	if parentID != "" {
		metadata["parent_id"] = parentID
	}

	rootID := stringValue(message.RootId)
	if rootID != "" {
		metadata["root_id"] = rootID
	}

	if replyTo := replyTargetID(message); replyTo != "" {
		metadata["reply_to_message_id"] = replyTo
	}

	threadID := stringValue(message.ThreadId)
	if threadID != "" {
		metadata["thread_id"] = threadID
	}

	if sender != nil && sender.TenantKey != nil && *sender.TenantKey != "" {
		metadata["tenant_key"] = *sender.TenantKey
	}

	return metadata
}

func normalizeRepliedContent(messageType, rawContent string, mediaRefs []string) string {
	content := extractContent(messageType, rawContent)

	if containsFeishuUpgradePlaceholder(rawContent) || containsFeishuUpgradePlaceholder(content) {
		content = ""
	}

	content = appendMediaTags(content, messageType, mediaRefs)
	if strings.TrimSpace(content) != "" {
		return content
	}

	switch messageType {
	case larkim.MsgTypeImage:
		return "[replied image]"
	case larkim.MsgTypeFile:
		return "[replied file]"
	case larkim.MsgTypeAudio:
		return "[replied audio]"
	case larkim.MsgTypeMedia:
		return "[replied video]"
	case larkim.MsgTypeInteractive:
		return "[replied interactive card]"
	default:
		return "[replied message content unavailable]"
	}
}

func containsFeishuUpgradePlaceholder(s string) bool {
	upgradePrompt := "\u8bf7\u5347\u7ea7\u81f3\u6700\u65b0\u7248\u672c\u5ba2\u6237\u7aef"
	upgradePromptEscaped := "\\u8bf7\\u5347\\u7ea7\\u81f3\\u6700\\u65b0\\u7248\\u672c\\u5ba2\\u6237\\u7aef"
	return strings.Contains(s, upgradePrompt) || strings.Contains(s, upgradePromptEscaped)
}

// formatReplyContext 格式化回复上下文
// 输出格式：
//   [replied_message id="xxx"]
//   被回复内容
//   [/replied_message]
//
//   [current_message]
//   当前消息内容
//   [/current_message]
//
// 如果当前消息以命令前缀（/ 或 !）开头，则回复上下文放在后面
func formatReplyContext(parentID, repliedContent, content string) string {
	// 去除首尾空白
	parentID = strings.TrimSpace(parentID)
	repliedContent = strings.TrimSpace(repliedContent)
	content = strings.TrimSpace(content)

	// 如果没有回复目标或被回复内容为空，直接返回原内容
	if parentID == "" || repliedContent == "" {
		return content
	}

	// 截断过长的被回复内容
	repliedContent = utils.Truncate(repliedContent, maxReplyContextLen)

	// 转义特殊标签字符，防止注入
	repliedContent = sanitizeReplyContextContent(repliedContent)
	content = sanitizeReplyContextContent(content)

	// 构建回复消息头
	header := fmt.Sprintf("[replied_message id=%q]", parentID)
	footer := "[/replied_message]"

	// 如果当前消息为空，只返回回复上下文
	if content == "" {
		return header + "\n" + repliedContent + "\n" + footer
	}

	// 如果当前消息以命令前缀开头（/ 或 !），把回复上下文放后面
	// 这是因为命令通常需要独立成行
	if hasLeadingCommandPrefix(content) {
		return content + "\n\n" + header + "\n" + repliedContent + "\n" + footer
	}

	// 默认格式：回复上下文在前，当前消息在后
	return header + "\n" + repliedContent + "\n" + footer + "\n\n[current_message]\n" + content + "\n[/current_message]"
}

func hasLeadingCommandPrefix(s string) bool {
	tokens := strings.Fields(strings.TrimSpace(s))
	if len(tokens) == 0 {
		return false
	}
	first := tokens[0]
	return strings.HasPrefix(first, "/") || strings.HasPrefix(first, "!")
}

func sanitizeReplyContextContent(s string) string {
	tagEscaper := strings.NewReplacer(
		"[replied_message", `\[replied_message`,
		"[/replied_message]", `\[/replied_message]`,
		"[current_message]", `\[current_message]`,
		"[/current_message]", `\[/current_message]`,
	)
	return tagEscaper.Replace(s)
}
