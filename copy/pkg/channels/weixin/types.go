package weixin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	basechannels "github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/fileutil"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// ============ 常量定义 ============

// 微信 CDN 默认基础 URL，用于媒体文件下载
const (
	weixinDefaultCDNBaseURL    = "https://novac2c.cdn.weixin.qq.com/c2c"
	weixinConfigCacheTTL       = 24 * time.Hour      // typing_ticket 缓存有效期
	weixinConfigRetryInitial   = 2 * time.Second      // 获取配置失败后首次重试延迟
	weixinConfigRetryMax       = time.Hour            // 获取配置失败后最大重试延迟
	weixinSessionPauseDuration = time.Hour            // 会话过期后暂停时长
	weixinSessionExpiredCode   = -14                  // 会话过期的错误码
)

// ============ 类型定义 ============

// typingTicketCacheEntry 缓存 typing_ticket 的结构体
// typing_ticket 是微信用于标识"正在输入"状态的票据
type typingTicketCacheEntry struct {
	ticket      string        // 缓存的票据
	nextFetchAt time.Time     // 下次可以刷新票据的时间
	retryDelay  time.Duration // 刷新失败时的重试延迟
}

// syncCursorFile 轮询游标文件结构
// 用于持久化 getUpdatesBuf，实现重启后恢复消息同步位置
type syncCursorFile struct {
	GetUpdatesBuf string `json:"get_updates_buf"`
}

// contextTokensFile context_token 持久化文件结构
// 每个用户对应一个 context_token，用于发送回复时关联会话
type contextTokensFile struct {
	Tokens map[string]string `json:"tokens"`
}

// ============ 路径构建函数 ============

// picoclawHomeDir 获取 picoclaw 配置目录
func picoclawHomeDir() string {
	return config.GetHome()
}

// genWeixinAccountKey 根据配置生成唯一的账户标识
// 如果 token 为空则返回 "default"，否则取 baseURL+token 的 SHA256 前8字节的十六进制
func genWeixinAccountKey(cfg *config.WeixinSettings) string {
	token := strings.TrimSpace(cfg.Token.String())
	if token == "" {
		return "default"
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(cfg.BaseURL) + "|" + token))
	return hex.EncodeToString(sum[:8])
}

// buildWeixinSyncBufPath 获取轮询游标文件的存储路径
// 路径格式: ~/.picoclaw/channels/weixin/sync/<hash>.json
func buildWeixinSyncBufPath(cfg *config.WeixinSettings) string {
	return filepath.Join(picoclawHomeDir(), "channels", "weixin", "sync", genWeixinAccountKey(cfg)+".json")
}

// buildWeixinContextTokensPath 获取 context_token 文件的存储路径
// 路径格式: ~/.picoclaw/channels/weixin/context-tokens/<hash>.json
func buildWeixinContextTokensPath(cfg *config.WeixinSettings) string {
	return filepath.Join(picoclawHomeDir(), "channels", "weixin", "context-tokens", genWeixinAccountKey(cfg)+".json")
}

// ============ 持久化读写函数 ============

// loadGetUpdatesBuf 从文件加载轮询游标
func loadGetUpdatesBuf(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil // 文件不存在返回空字符串，不算错误
		}
		return "", err
	}

	var decoded syncCursorFile
	if err := json.Unmarshal(data, &decoded); err != nil {
		return "", err
	}

	return decoded.GetUpdatesBuf, nil
}

// saveGetUpdatesBuf 原子性保存轮询游标到文件
// 使用 fileutil.WriteFileAtomic 确保写入原子性（先写临时文件再 rename）
func saveGetUpdatesBuf(path, cursor string) error {
	data, err := json.Marshal(syncCursorFile{GetUpdatesBuf: cursor})
	if err != nil {
		return err
	}
	return fileutil.WriteFileAtomic(path, data, 0o600)
}

// loadContextTokens 从文件加载所有用户的 context_token
func loadContextTokens(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var decoded contextTokensFile
	if err := json.Unmarshal(data, &decoded); err != nil {
		return nil, err
	}
	return decoded.Tokens, nil
}

// saveContextTokens 原子性保存所有 context_token 到文件
func saveContextTokens(path string, tokens map[string]string) error {
	data, err := json.Marshal(contextTokensFile{Tokens: tokens})
	if err != nil {
		return err
	}
	return fileutil.WriteFileAtomic(path, data, 0o600)
}

// ============ CDN 相关函数 ============

// cdnBaseURL 获取 CDN 基础 URL
// 优先使用配置中的 CDNBaseURL，否则使用默认值
func (c *WeixinChannel) cdnBaseURL() string {
	if base := strings.TrimSpace(c.config.CDNBaseURL); base != "" {
		return strings.TrimRight(base, "/")
	}
	return weixinDefaultCDNBaseURL
}

// ============ 会话过期判断 ============

// isSessionExpiredStatus 判断是否为会话过期错误
// 错误码 -14 表示会话已过期，需要重新登录
func isSessionExpiredStatus(ret, errcode int) bool {
	return ret == weixinSessionExpiredCode || errcode == weixinSessionExpiredCode
}

// ============ 会话暂停管理 ============

// pauseSession 暂停会话
// 当检测到会话过期时，暂停频道操作一小后自动恢复
// 返回剩余暂停时间
func (c *WeixinChannel) pauseSession(operation string, ret, errcode int, errmsg string) time.Duration {
	c.pauseMu.Lock()
	defer c.pauseMu.Unlock()

	// 计算暂停结束时间（当前时间 + 1小时，但不超过已有的暂停时间）
	until := time.Now().Add(weixinSessionPauseDuration)
	if until.After(c.pauseUntil) {
		c.pauseUntil = until
	}

	remaining := time.Until(c.pauseUntil)
	logger.ErrorCF("weixin", "Session expired; pausing Weixin channel", map[string]any{
		"operation": operation,
		"ret":       ret,
		"errcode":   errcode,
		"errmsg":    errmsg,
		"until":     c.pauseUntil.Format(time.RFC3339),
		"minutes":   int((remaining + time.Minute - 1) / time.Minute),
	})
	return remaining
}

// remainingPause 查询剩余暂停时间
func (c *WeixinChannel) remainingPause() time.Duration {
	c.pauseMu.Lock()
	defer c.pauseMu.Unlock()

	if c.pauseUntil.IsZero() {
		return 0
	}
	remaining := time.Until(c.pauseUntil)
	if remaining <= 0 {
		c.pauseUntil = time.Time{} // 暂停结束，清零
		return 0
	}
	return remaining
}

// waitWhileSessionPaused 如果会话正在暂停，则等待暂停结束或上下文取消
func (c *WeixinChannel) waitWhileSessionPaused(ctx context.Context) error {
	remaining := c.remainingPause()
	if remaining <= 0 {
		return nil
	}

	timer := time.NewTimer(remaining)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// ensureSessionActive 确保会话处于活跃状态
// 如果会话正在暂停，则返回错误
func (c *WeixinChannel) ensureSessionActive() error {
	remaining := c.remainingPause()
	if remaining <= 0 {
		return nil
	}
	return fmt.Errorf(
		"weixin session paused (%d min remaining): %w",
		int((remaining+time.Minute-1)/time.Minute),
		basechannels.ErrSendFailed,
	)
}

// ============ typing_ticket 获取与管理 ============

// getTypingTicket 获取用户的 typing_ticket
// typing_ticket 是微信用于"正在输入"功能的票据
// 结果会被缓存，缓存在 24 小时内有效
func (c *WeixinChannel) getTypingTicket(ctx context.Context, userID string) (string, error) {
	now := time.Now()

	// 先检查缓存
	c.typingMu.Lock()
	entry, ok := c.typingCache[userID]
	if ok && now.Before(entry.nextFetchAt) {
		ticket := entry.ticket
		c.typingMu.Unlock()
		return ticket, nil
	}
	cachedTicket := entry.ticket
	retryDelay := entry.retryDelay
	c.typingMu.Unlock()

	// 从 contextToken 获取用户的会话标识
	contextToken := ""
	if v, ok := c.contextTokens.Load(userID); ok {
		contextToken, _ = v.(string)
	}

	// 调用 API 获取配置（包含 typing_ticket）
	resp, err := c.api.GetConfig(ctx, GetConfigReq{
		IlinkUserID:  userID,
		ContextToken: contextToken,
	})
	if err == nil && resp != nil && resp.Ret == 0 && resp.Errcode == 0 {
		ticket := strings.TrimSpace(resp.TypingTicket)
		// 缓存结果，24小时后再刷新
		c.typingMu.Lock()
		c.typingCache[userID] = typingTicketCacheEntry{
			ticket:      ticket,
			nextFetchAt: now.Add(weixinConfigCacheTTL),
			retryDelay:  weixinConfigRetryInitial,
		}
		c.typingMu.Unlock()
		return ticket, nil
	}

	// 检查是否是会话过期
	if resp != nil && isSessionExpiredStatus(resp.Ret, resp.Errcode) {
		c.pauseSession("getconfig", resp.Ret, resp.Errcode, resp.Errmsg)
	}

	// 更新重试延迟（指数退避）
	if retryDelay <= 0 {
		retryDelay = weixinConfigRetryInitial
	} else {
		retryDelay *= 2
		if retryDelay > weixinConfigRetryMax {
			retryDelay = weixinConfigRetryMax
		}
	}

	// 更新缓存中的重试时间
	c.typingMu.Lock()
	c.typingCache[userID] = typingTicketCacheEntry{
		ticket:      cachedTicket,
		nextFetchAt: now.Add(retryDelay),
		retryDelay:  retryDelay,
	}
	c.typingMu.Unlock()

	if err != nil {
		return cachedTicket, err
	}
	if resp == nil {
		return cachedTicket, fmt.Errorf("getconfig returned nil response")
	}
	return cachedTicket, fmt.Errorf(
		"getconfig failed: ret=%d errcode=%d errmsg=%s",
		resp.Ret,
		resp.Errcode,
		resp.Errmsg,
	)
}
