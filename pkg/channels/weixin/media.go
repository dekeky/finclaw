package weixin

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/md5"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/h2non/filetype"

	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/media"
)

// ============ 常量定义 ============

const (
	weixinMediaMaxBytes         = 100 << 20       // 媒体文件最大 100MB
	weixinTypingKeepAlive       = 3 * time.Second // "正在输入"状态刷新间隔（微信侧有效期较短，需要 ≤4 秒续期）
	weixinUploadRetryMax        = 3               // 上传最大重试次数
	weixinDownloadRetryMax      = 2               // 下载最大重试次数
	weixinDownloadRetryDelay    = 300 * time.Millisecond
	weixinVoiceTranscodeTimeout = 15 * time.Second // 语音转码超时时间
)

// ============ 类型定义 ============

// uploadedFileInfo 上传成功的文件信息
type uploadedFileInfo struct {
	downloadParam string // 下载参数（加密的查询参数）
	aesKeyHex     string // AES 密钥（十六进制）
	fileSize      int64  // 原始文件大小
	cipherSize    int64  // 加密后文件大小
	filename      string // 文件名
}

// ============ AES 加解密工具函数 ============

// pkcs7Pad 对数据进行 PKCS7 填充
// AES 加密要求数据长度是 16 的倍数
func pkcs7Pad(src []byte, blockSize int) []byte {
	padding := blockSize - len(src)%blockSize
	if padding == 0 {
		padding = blockSize
	}
	out := make([]byte, len(src)+padding)
	copy(out, src)
	for i := len(src); i < len(out); i++ {
		out[i] = byte(padding)
	}
	return out
}

// pkcs7Unpad 去除 PKCS7 填充
func pkcs7Unpad(src []byte, blockSize int) ([]byte, error) {
	if len(src) == 0 || len(src)%blockSize != 0 {
		return nil, fmt.Errorf("invalid padded data size %d", len(src))
	}
	padding := int(src[len(src)-1])
	if padding <= 0 || padding > blockSize || padding > len(src) {
		return nil, fmt.Errorf("invalid padding size %d", padding)
	}
	for i := len(src) - padding; i < len(src); i++ {
		if src[i] != byte(padding) {
			return nil, fmt.Errorf("invalid padding content")
		}
	}
	return src[:len(src)-padding], nil
}

// encryptAESECB 使用 AES-128-ECB 模式加密数据
// 微信 CDN 使用此方式加密媒体文件
func encryptAESECB(plaintext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	padded := pkcs7Pad(plaintext, block.BlockSize())
	out := make([]byte, len(padded))
	for i := 0; i < len(padded); i += block.BlockSize() {
		block.Encrypt(out[i:i+block.BlockSize()], padded[i:i+block.BlockSize()])
	}
	return out, nil
}

// decryptAESECB 使用 AES-128-ECB 模式解密数据
func decryptAESECB(ciphertext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	if len(ciphertext)%block.BlockSize() != 0 {
		return nil, fmt.Errorf("invalid ciphertext size %d", len(ciphertext))
	}
	out := make([]byte, len(ciphertext))
	for i := 0; i < len(ciphertext); i += block.BlockSize() {
		block.Decrypt(out[i:i+block.BlockSize()], ciphertext[i:i+block.BlockSize()])
	}
	return pkcs7Unpad(out, block.BlockSize())
}

// parseWeixinMediaAESKey 解析微信媒体 AES 密钥
// 支持 base64 编码（16字节）或十六进制编码（32字符=16字节）
func parseWeixinMediaAESKey(aesKeyBase64 string) ([]byte, error) {
	decoded, err := base64.StdEncoding.DecodeString(aesKeyBase64)
	if err != nil {
		return nil, err
	}
	if len(decoded) == 16 {
		return decoded, nil
	}
	if len(decoded) == 32 {
		// 可能是十六进制编码的 32 字符
		if raw, err := hex.DecodeString(string(decoded)); err == nil && len(raw) == 16 {
			return raw, nil
		}
	}
	return nil, fmt.Errorf("unsupported aes_key length %d", len(decoded))
}

// imageAESKey 从图片项中提取 AES 密钥
func imageAESKey(img *ImageItem) ([]byte, bool, error) {
	if img == nil {
		return nil, false, nil
	}
	if img.Aeskey != "" {
		raw, err := hex.DecodeString(img.Aeskey)
		if err != nil {
			return nil, false, err
		}
		return raw, true, nil
	}
	if img.Media != nil && img.Media.AesKey != "" {
		raw, err := parseWeixinMediaAESKey(img.Media.AesKey)
		if err != nil {
			return nil, false, err
		}
		return raw, true, nil
	}
	return nil, false, nil
}

// genericMediaAESKey 从 CDNMedia 中提取 AES 密钥
func genericMediaAESKey(mediaRef *CDNMedia) ([]byte, error) {
	if mediaRef == nil || mediaRef.AesKey == "" {
		return nil, fmt.Errorf("missing aes_key")
	}
	return parseWeixinMediaAESKey(mediaRef.AesKey)
}

// aesEcbPaddedSize 计算 AES ECB 模式填充后的数据大小
func aesEcbPaddedSize(size int64) int64 {
	return (size/16 + 1) * 16
}

// randomHex 生成指定长度的随机十六进制字符串
func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// ============ CDN URL 构建工具 ============

// buildCDNDownloadURL 构建 CDN 下载 URL
func buildCDNDownloadURL(base, encryptedQueryParam string) string {
	return strings.TrimRight(base, "/") +
		"/download?encrypted_query_param=" + url.QueryEscape(encryptedQueryParam)
}

// shouldRetryCDNDownload 判断是否应该重试下载
// 5xx 错误、429（过多请求）或网络错误需要重试
func shouldRetryCDNDownload(statusCode int) bool {
	// statusCode=0 表示网络/构建错误
	return statusCode == 0 || statusCode >= 500 || statusCode == http.StatusTooManyRequests
}

// buildCDNUploadURL 构建 CDN 上传 URL
func buildCDNUploadURL(base, uploadParam, filekey string) string {
	return strings.TrimRight(base, "/") +
		"/upload?encrypted_query_param=" + url.QueryEscape(uploadParam) +
		"&filekey=" + url.QueryEscape(filekey)
}

// uniqCDNURLs 去重 CDN URL 列表
func uniqCDNURLs(urls []string) []string {
	seen := make(map[string]struct{}, len(urls))
	out := make([]string, 0, len(urls))
	for _, raw := range urls {
		u := strings.TrimSpace(raw)
		if u == "" {
			continue
		}
		if _, ok := seen[u]; ok {
			continue
		}
		seen[u] = struct{}{}
		out = append(out, u)
	}
	return out
}

// ============ 媒体下载（入站） ============

// downloadCDNBufferOnce 单次下载 CDN 内容
func (c *WeixinChannel) downloadCDNBufferOnce(ctx context.Context, downloadURL string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return nil, 0, err
	}
	resp, err := c.api.HttpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, resp.StatusCode, fmt.Errorf("cdn download HTTP %d: %s", resp.StatusCode, string(body))
	}

	// 限制读取大小防止过大
	data, err := io.ReadAll(io.LimitReader(resp.Body, weixinMediaMaxBytes+1))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if len(data) > weixinMediaMaxBytes {
		return nil, resp.StatusCode, fmt.Errorf("cdn media too large: %d bytes", len(data))
	}
	return data, resp.StatusCode, nil
}

// downloadCDNBuffer 从 CDN 下载内容（支持多个候选 URL 和重试）
func (c *WeixinChannel) downloadCDNBuffer(
	ctx context.Context,
	encryptedQueryParam string,
	fullURL string,
) ([]byte, error) {
	// 构建候选 URL 列表
	candidates := uniqCDNURLs([]string{
		strings.TrimSpace(fullURL),
		func() string {
			if strings.TrimSpace(encryptedQueryParam) == "" {
				return ""
			}
			return buildCDNDownloadURL(c.cdnBaseURL(), encryptedQueryParam)
		}(),
	})
	if len(candidates) == 0 {
		return nil, fmt.Errorf("missing CDN download URL")
	}

	var lastErr error
	// 尝试每个候选 URL
	for _, downloadURL := range candidates {
		for attempt := 1; attempt <= weixinDownloadRetryMax; attempt++ {
			data, statusCode, err := c.downloadCDNBufferOnce(ctx, downloadURL)
			if err == nil {
				return data, nil
			}
			lastErr = fmt.Errorf("%w (attempt=%d url=%s)", err, attempt, downloadURL)
			// 如果是客户端错误，不重试
			if !shouldRetryCDNDownload(statusCode) {
				break
			}
			// 等待后重试
			if attempt < weixinDownloadRetryMax {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(weixinDownloadRetryDelay):
				}
			}
		}
	}
	return nil, lastErr
}

// downloadAndDecryptCDNBuffer 下载并解密 CDN 内容
func (c *WeixinChannel) downloadAndDecryptCDNBuffer(
	ctx context.Context,
	encryptedQueryParam string,
	fullURL string,
	key []byte,
) ([]byte, error) {
	data, err := c.downloadCDNBuffer(ctx, encryptedQueryParam, fullURL)
	if err != nil {
		return nil, err
	}
	// 如果没有密钥，直接返回原始数据
	if len(key) == 0 {
		return data, nil
	}
	// AES 解密
	return decryptAESECB(data, key)
}

// downloadImageBuffer 下载图片（尝试下载高清，失败则下载缩略图）
func (c *WeixinChannel) downloadImageBuffer(
	ctx context.Context,
	img *ImageItem,
	key []byte,
) ([]byte, error) {
	if img == nil {
		return nil, fmt.Errorf("image item is nil")
	}
	// 优先下载高清图
	if img.Media != nil {
		data, err := c.downloadAndDecryptCDNBuffer(ctx, img.Media.EncryptQueryParam, img.Media.FullURL, key)
		if err == nil {
			return data, nil
		}
		// 高清下载失败，尝试缩略图
		if img.ThumbMedia == nil {
			return nil, fmt.Errorf("image download failed: %w", err)
		}
	}
	// 下载缩略图
	if img.ThumbMedia != nil {
		data, err := c.downloadAndDecryptCDNBuffer(ctx, img.ThumbMedia.EncryptQueryParam, img.ThumbMedia.FullURL, key)
		if err == nil {
			return data, nil
		}
		return nil, fmt.Errorf("image download failed: %w", err)
	}
	return nil, fmt.Errorf("image media is nil")
}

// ============ 文件元数据检测 ============

// detectMediaMetadata 检测媒体文件的文件名和 MIME 类型
func detectMediaMetadata(data []byte, fallbackName, fallbackContentType string) (string, string) {
	contentType := strings.TrimSpace(fallbackContentType)
	ext := filepath.Ext(fallbackName)

	// 使用 filetype 库检测文件类型
	if kind, err := filetype.Match(data); err == nil && kind != filetype.Unknown {
		contentType = kind.MIME.Value
		if kind.Extension != "" {
			ext = "." + kind.Extension
		}
	}

	// 根据扩展名获取 MIME 类型
	if contentType == "" && ext != "" {
		contentType = mime.TypeByExtension(strings.ToLower(ext))
	}

	// 最后的备用方案
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}

	// 根据 MIME 类型获取扩展名
	if ext == "" && contentType != "" {
		if exts, err := mime.ExtensionsByType(contentType); err == nil && len(exts) > 0 {
			ext = exts[0]
		}
	}

	// 处理文件名
	filename := sanitizeFilename(fallbackName)
	if filename == "" {
		filename = "media"
	}
	if filepath.Ext(filename) == "" && ext != "" {
		filename += ext
	}
	return filename, contentType
}

// sanitizeFilename 清理文件名，只保留基本名称
func sanitizeFilename(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "." || name == "/" || name == "" {
		return ""
	}
	return name
}

// ============ 临时文件管理 ============

// writeManagedTempFile 写入托管的临时文件
// 文件创建在 media.TempDir() 目录，权限 0o700
func writeManagedTempFile(prefix, filename string, data []byte) (string, error) {
	if err := os.MkdirAll(media.TempDir(), 0o700); err != nil {
		return "", err
	}
	pattern := prefix + "-*"
	if ext := filepath.Ext(filename); ext != "" {
		pattern += ext
	}
	f, err := os.CreateTemp(media.TempDir(), pattern)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

// ============ 入站媒体存储 ============

// storeInboundBytes 存储收到的媒体文件
// 返回媒体引用（file://...），用于后续访问
// TODO: 集成 finclaw 媒体存储系统后支持 media:// 引用
func (c *WeixinChannel) storeInboundBytes(
	chatID, messageID, filename, contentType string, data []byte,
) (string, error) {
	// 检测文件元数据
	filename, contentType = detectMediaMetadata(data, filename, contentType)
	// 写入临时文件
	tmpPath, err := writeManagedTempFile("weixin-inbound", filename, data)
	if err != nil {
		return "", err
	}
	return "file://" + tmpPath, nil
}

// ============ 入站媒体选择 ============

// isDownloadableMediaItem 判断消息项是否为可下载的媒体
func isDownloadableMediaItem(item *MessageItem) bool {
	if item == nil {
		return false
	}

	switch item.Type {
	case MessageItemTypeImage:
		return item.ImageItem != nil && item.ImageItem.Media != nil &&
			(item.ImageItem.Media.EncryptQueryParam != "" || item.ImageItem.Media.FullURL != "")
	case MessageItemTypeVideo:
		return item.VideoItem != nil && item.VideoItem.Media != nil &&
			(item.VideoItem.Media.EncryptQueryParam != "" || item.VideoItem.Media.FullURL != "")
	case MessageItemTypeFile:
		return item.FileItem != nil && item.FileItem.Media != nil &&
			(item.FileItem.Media.EncryptQueryParam != "" || item.FileItem.Media.FullURL != "")
	case MessageItemTypeVoice:
		// 语音：如果服务器没有转文字，则可下载；否则不需要下载（已有文本）
		return item.VoiceItem != nil &&
			item.VoiceItem.Media != nil &&
			(item.VoiceItem.Media.EncryptQueryParam != "" || item.VoiceItem.Media.FullURL != "") &&
			strings.TrimSpace(item.VoiceItem.Text) == ""
	default:
		return false
	}
}

// selectInboundMediaItem 从消息中选择要下载的媒体项
// 优先级：图片 > 视频 > 文件 > 语音
func selectInboundMediaItem(msg WeixinMessage) *MessageItem {
	// 按优先级查找
	priorities := []int{
		MessageItemTypeImage,
		MessageItemTypeVideo,
		MessageItemTypeFile,
		MessageItemTypeVoice,
	}

	for _, want := range priorities {
		for i := range msg.ItemList {
			item := &msg.ItemList[i]
			if item.Type == want && isDownloadableMediaItem(item) {
				return item
			}
		}
	}

	// 查找引用消息中的媒体（文本消息可能引用图片等）
	for i := range msg.ItemList {
		item := &msg.ItemList[i]
		if item.Type != MessageItemTypeText || item.RefMsg == nil || item.RefMsg.MessageItem == nil {
			continue
		}
		if isDownloadableMediaItem(item.RefMsg.MessageItem) {
			return item.RefMsg.MessageItem
		}
	}

	return nil
}

// ============ 语音转码 ============

// tryTranscodeSilkToWAV 尝试将 SILK 格式语音转换为 WAV
// 微信语音使用 SILK 编码，需要转换后才能被大多数播放器播放
// 尝试多种解码器：silk_v3_decoder > silk_decoder > ffmpeg
func tryTranscodeSilkToWAV(ctx context.Context, silk []byte) ([]byte, error) {
	decoders := []struct {
		name string
		args func(inputPath, outputPath string) []string
	}{
		{
			name: "silk_v3_decoder",
			args: func(inputPath, outputPath string) []string { return []string{inputPath, outputPath, "24000"} },
		},
		{
			name: "silk_decoder",
			args: func(inputPath, outputPath string) []string { return []string{inputPath, outputPath, "24000"} },
		},
		{
			name: "ffmpeg",
			args: func(inputPath, outputPath string) []string {
				return []string{"-y", "-i", inputPath, outputPath}
			},
		},
	}

	for _, decoder := range decoders {
		// 查找解码器
		bin, err := exec.LookPath(decoder.name)
		if err != nil {
			continue
		}

		// 创建临时文件
		tmpIn, err := writeManagedTempFile("weixin-voice", "voice.silk", silk)
		if err != nil {
			return nil, err
		}
		tmpOut := filepath.Join(media.TempDir(), "weixin-voice-"+uuid.New().String()+".wav")

		// 执行转码
		wav, ok := func() ([]byte, bool) {
			defer os.Remove(tmpIn)
			defer os.Remove(tmpOut)

			runCtx, cancel := context.WithTimeout(ctx, weixinVoiceTranscodeTimeout)
			cmd := exec.CommandContext(runCtx, bin, decoder.args(tmpIn, tmpOut)...)
			out, runErr := cmd.CombinedOutput()
			cancel()
			if runErr != nil {
				logger.DebugCF("weixin", "SILK transcode command failed", map[string]any{
					"decoder": decoder.name,
					"error":   runErr.Error(),
					"output":  strings.TrimSpace(string(out)),
				})
				return nil, false
			}

			wav, readErr := os.ReadFile(tmpOut)
			if readErr != nil {
				logger.DebugCF("weixin", "Failed to read transcoded WAV", map[string]any{
					"decoder": decoder.name,
					"error":   readErr.Error(),
				})
				return nil, false
			}
			return wav, len(wav) > 0
		}()
		if ok {
			return wav, nil
		}
	}

	return nil, fmt.Errorf("no SILK decoder available")
}

// ============ 下载并存储入站媒体 ============

// downloadMediaFromItem 下载并存储入站媒体
// 根据媒体类型调用不同的下载方法
func (c *WeixinChannel) downloadMediaFromItem(
	ctx context.Context,
	chatID, messageID string,
	item *MessageItem,
) (string, error) {
	if item == nil {
		return "", nil
	}

	switch item.Type {
	case MessageItemTypeImage:
		if item.ImageItem == nil {
			return "", fmt.Errorf("image media is nil")
		}
		key, ok, err := imageAESKey(item.ImageItem)
		if err != nil {
			return "", err
		}
		decryptKey := func() []byte {
			if ok {
				return key
			}
			return nil
		}()
		data, err := c.downloadImageBuffer(ctx, item.ImageItem, decryptKey)
		if err != nil {
			return "", err
		}
		return c.storeInboundBytes(chatID, messageID, "image", "", data)

	case MessageItemTypeVoice:
		key, err := genericMediaAESKey(item.VoiceItem.Media)
		if err != nil {
			return "", err
		}
		// 下载 SILK 格式语音
		silk, err := c.downloadAndDecryptCDNBuffer(
			ctx,
			item.VoiceItem.Media.EncryptQueryParam,
			item.VoiceItem.Media.FullURL,
			key,
		)
		if err != nil {
			return "", err
		}
		// 尝试转码为 WAV
		if wav, err := tryTranscodeSilkToWAV(ctx, silk); err == nil && len(wav) > 0 {
			return c.storeInboundBytes(chatID, messageID, "voice.wav", "audio/wav", wav)
		}
		// 转码失败，保存原始 SILK
		return c.storeInboundBytes(chatID, messageID, "voice.silk", "audio/silk", silk)

	case MessageItemTypeFile:
		key, err := genericMediaAESKey(item.FileItem.Media)
		if err != nil {
			return "", err
		}
		data, err := c.downloadAndDecryptCDNBuffer(
			ctx,
			item.FileItem.Media.EncryptQueryParam,
			item.FileItem.Media.FullURL,
			key,
		)
		if err != nil {
			return "", err
		}
		filename := item.FileItem.FileName
		if filename == "" {
			filename = "file.bin"
		}
		contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(filename)))
		return c.storeInboundBytes(chatID, messageID, filename, contentType, data)

	case MessageItemTypeVideo:
		key, err := genericMediaAESKey(item.VideoItem.Media)
		if err != nil {
			return "", err
		}
		data, err := c.downloadAndDecryptCDNBuffer(
			ctx,
			item.VideoItem.Media.EncryptQueryParam,
			item.VideoItem.Media.FullURL,
			key,
		)
		if err != nil {
			return "", err
		}
		return c.storeInboundBytes(chatID, messageID, "video.mp4", "video/mp4", data)
	}

	return "", nil
}

// ============ 出站媒体类型判断 ============

// outboundMediaKind 根据媒体类型和文件名判断上传媒体类型
func outboundMediaKind(partType, filename, contentType string) int {
	// 优先根据 partType 判断
	switch strings.ToLower(strings.TrimSpace(partType)) {
	case "image":
		return UploadMediaTypeImage
	case "video":
		return UploadMediaTypeVideo
	}

	// 根据 MIME 类型判断
	ct := strings.ToLower(contentType)
	switch {
	case strings.HasPrefix(ct, "image/"):
		return UploadMediaTypeImage
	case strings.HasPrefix(ct, "video/"):
		return UploadMediaTypeVideo
	default:
		return UploadMediaTypeFile
	}
}

// detectLocalContentType 检测本地文件的 MIME 类型
func detectLocalContentType(localPath, hintContentType string) string {
	// 优先使用提示的类型
	if strings.TrimSpace(hintContentType) != "" {
		return hintContentType
	}
	// 使用 filetype 库检测
	if kind, err := filetype.MatchFile(localPath); err == nil && kind != filetype.Unknown {
		return kind.MIME.Value
	}
	// 根据扩展名判断
	if ext := filepath.Ext(localPath); ext != "" {
		if ct := mime.TypeByExtension(strings.ToLower(ext)); ct != "" {
			return ct
		}
	}
	return "application/octet-stream"
}

// downloadFilenameFromURL 从 URL 中提取文件名
func downloadFilenameFromURL(rawURL, fallback string) string {
	if fallback = sanitizeFilename(fallback); fallback != "" {
		return fallback
	}
	parsed, err := url.Parse(rawURL)
	if err == nil {
		if base := sanitizeFilename(path.Base(parsed.Path)); base != "" {
			return base
		}
	}
	return "remote-media"
}

// ============ 出站媒体解析 ============

// resolveOutboundPart 解析出站媒体引用，返回本地文件路径
// 支持：http://, https://, file://, 本地路径
// TODO: 集成 finclaw 媒体系统后支持 media:// 引用
func (c *WeixinChannel) resolveOutboundPart(
	ctx context.Context,
	part struct {
		Ref         string
		Filename    string
		ContentType string
	},
) (string, string, string, func(), error) {
	cleanup := func() {}
	filename := sanitizeFilename(part.Filename)
	contentType := strings.TrimSpace(part.ContentType)

	switch {
	// 远程 URL，需要先下载
	case strings.HasPrefix(part.Ref, "http://") || strings.HasPrefix(part.Ref, "https://"):
		localPath, name, ct, err := c.downloadRemoteMediaToTemp(ctx, part.Ref, filename)
		if err != nil {
			return "", "", "", cleanup, err
		}
		return localPath, name, ct, func() { os.Remove(localPath) }, nil

	// 文件协议引用（file://...）
	case strings.HasPrefix(part.Ref, "file://"):
		u, err := url.Parse(part.Ref)
		if err != nil {
			return "", "", "", cleanup, err
		}
		localPath := u.Path
		if filename == "" {
			filename = sanitizeFilename(filepath.Base(localPath))
		}
		if contentType == "" {
			contentType = detectLocalContentType(localPath, "")
		}
		return localPath, filename, contentType, cleanup, nil

	// 本地文件路径
	default:
		localPath := part.Ref
		if filename == "" {
			filename = sanitizeFilename(filepath.Base(localPath))
		}
		if contentType == "" {
			contentType = detectLocalContentType(localPath, "")
		}
		return localPath, filename, contentType, cleanup, nil
	}
}

// ============ 远程媒体下载 ============

// downloadRemoteMediaToTemp 下载远程媒体到临时文件
func (c *WeixinChannel) downloadRemoteMediaToTemp(
	ctx context.Context,
	rawURL, fallbackName string,
) (string, string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", "", "", err
	}
	resp, err := c.api.HttpClient.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return "", "", "", fmt.Errorf("remote media HTTP %d: %s", resp.StatusCode, string(body))
	}

	// 限制大小
	data, err := io.ReadAll(io.LimitReader(resp.Body, weixinMediaMaxBytes+1))
	if err != nil {
		return "", "", "", err
	}
	if len(data) > weixinMediaMaxBytes {
		return "", "", "", fmt.Errorf("remote media too large: %d bytes", len(data))
	}

	// 检测元数据
	filename, contentType := detectMediaMetadata(
		data,
		downloadFilenameFromURL(rawURL, fallbackName),
		resp.Header.Get("Content-Type"),
	)
	tmpPath, err := writeManagedTempFile("weixin-remote", filename, data)
	if err != nil {
		return "", "", "", err
	}
	return tmpPath, filename, contentType, nil
}

// ============ 上传媒体到微信 CDN ============

// uploadLocalFile 上传本地文件到微信 CDN
// 返回上传后的文件信息（downloadParam 和 aesKey）
func (c *WeixinChannel) uploadLocalFile(
	ctx context.Context,
	localPath, filename, toUserID string,
	mediaType int,
) (*uploadedFileInfo, error) {
	// 读取文件
	data, err := os.ReadFile(localPath)
	if err != nil {
		return nil, err
	}
	if len(data) > weixinMediaMaxBytes {
		return nil, fmt.Errorf("media too large: %d bytes", len(data))
	}

	// 生成文件 key 和 AES 密钥
	filekey, err := randomHex(16)
	if err != nil {
		return nil, err
	}
	aesKey := make([]byte, 16)
	if _, readErr := rand.Read(aesKey); readErr != nil {
		return nil, readErr
	}
	aesKeyHex := hex.EncodeToString(aesKey)
	rawMD5 := md5.Sum(data)

	// 获取上传 URL
	resp, err := c.api.GetUploadUrl(ctx, GetUploadUrlReq{
		Filekey:     filekey,
		MediaType:   mediaType,
		ToUserID:    toUserID,
		Rawsize:     int64(len(data)),
		RawfileMD5:  hex.EncodeToString(rawMD5[:]),
		Filesize:    aesEcbPaddedSize(int64(len(data))),
		NoNeedThumb: true,
		Aeskey:      aesKeyHex,
	})
	if err != nil {
		return nil, err
	}
	if resp == nil {
		return nil, fmt.Errorf("getuploadurl returned nil response")
	}
	if resp.Ret != 0 || resp.Errcode != 0 {
		if isSessionExpiredStatus(resp.Ret, resp.Errcode) {
			c.pauseSession("getuploadurl", resp.Ret, resp.Errcode, resp.Errmsg)
		}
		return nil, fmt.Errorf("getuploadurl failed: ret=%d errcode=%d errmsg=%s", resp.Ret, resp.Errcode, resp.Errmsg)
	}
	uploadParam := strings.TrimSpace(resp.UploadParam)
	uploadFullURL := strings.TrimSpace(resp.UploadFullURL)
	if uploadParam == "" && uploadFullURL == "" {
		return nil, fmt.Errorf("getuploadurl returned no upload URL")
	}

	// 上传到 CDN
	downloadParam, err := c.uploadBufferToCDN(ctx, data, uploadParam, uploadFullURL, filekey, aesKey)
	if err != nil {
		return nil, err
	}

	return &uploadedFileInfo{
		downloadParam: downloadParam,
		aesKeyHex:     aesKeyHex,
		fileSize:      int64(len(data)),
		cipherSize:    aesEcbPaddedSize(int64(len(data))),
		filename:      filename,
	}, nil
}

// uploadBufferToCDN 将数据加密后上传到 CDN
func (c *WeixinChannel) uploadBufferToCDN(
	ctx context.Context,
	plaintext []byte,
	uploadParam, uploadFullURL, filekey string,
	aesKey []byte,
) (string, error) {
	// AES 加密
	ciphertext, err := encryptAESECB(plaintext, aesKey)
	if err != nil {
		return "", err
	}

	// 构建上传 URL
	uploadURL := strings.TrimSpace(uploadFullURL)
	if uploadURL == "" {
		if strings.TrimSpace(uploadParam) == "" {
			return "", fmt.Errorf("missing CDN upload URL")
		}
		uploadURL = buildCDNUploadURL(c.cdnBaseURL(), uploadParam, filekey)
	}
	var lastErr error

	// 重试上传
	for attempt := 1; attempt <= weixinUploadRetryMax; attempt++ {
		req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(ciphertext))
		if reqErr != nil {
			return "", reqErr
		}
		req.Header.Set("Content-Type", "application/octet-stream")

		resp, doErr := c.api.HttpClient.Do(req)
		if doErr != nil {
			lastErr = doErr
		} else {
			func() {
				defer resp.Body.Close()
				// 4xx 客户端错误，不重试
				if resp.StatusCode >= 400 && resp.StatusCode < 500 {
					body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
					lastErr = fmt.Errorf(
						"cdn upload client error %d: %s",
						resp.StatusCode,
						strings.TrimSpace(string(body)),
					)
					return
				}
				// 非 200 错误
				if resp.StatusCode != http.StatusOK {
					body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
					lastErr = fmt.Errorf(
						"cdn upload server error %d: %s",
						resp.StatusCode,
						strings.TrimSpace(string(body)),
					)
					return
				}
				// 成功时从响应头获取加密参数
				if encrypted := strings.TrimSpace(resp.Header.Get("X-Encrypted-Param")); encrypted != "" {
					lastErr = nil
					uploadParam = encrypted
					return
				}
				lastErr = fmt.Errorf("cdn upload missing x-encrypted-param header")
			}()
		}

		if lastErr == nil {
			return uploadParam, nil
		}
		// 客户端错误不重试
		if strings.Contains(lastErr.Error(), "client error") || attempt == weixinUploadRetryMax {
			break
		}
	}

	return "", lastErr
}

// ============ 发送消息项 ============

// sendMessageItem 发送单个消息项到微信
func (c *WeixinChannel) sendMessageItem(
	ctx context.Context,
	toUserID, contextToken string,
	item MessageItem,
) error {
	resp, err := c.api.SendMessage(ctx, SendMessageReq{
		Msg: WeixinMessage{
			ToUserID:     toUserID,
			ClientID:     "picoclaw-" + uuid.New().String(),
			MessageType:  MessageTypeBot,
			MessageState: MessageStateFinish,
			ItemList:     []MessageItem{item},
			ContextToken: contextToken,
		},
	})
	if err != nil {
		return err
	}
	if resp == nil {
		return fmt.Errorf("sendmessage returned nil response")
	}
	if resp.Ret != 0 || resp.Errcode != 0 {
		if isSessionExpiredStatus(resp.Ret, resp.Errcode) {
			c.pauseSession("sendmessage", resp.Ret, resp.Errcode, resp.Errmsg)
		}
		return fmt.Errorf("sendmessage failed: ret=%d errcode=%d errmsg=%s", resp.Ret, resp.Errcode, resp.Errmsg)
	}
	return nil
}

// sendTextMessage 发送文本消息
func (c *WeixinChannel) sendTextMessage(
	ctx context.Context,
	toUserID, contextToken, text string,
) error {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	return c.sendMessageItem(ctx, toUserID, contextToken, MessageItem{
		Type: MessageItemTypeText,
		TextItem: &TextItem{
			Text: text,
		},
	})
}

// encodeWeixinOutboundAESKey 将 AES 密钥编码为微信期望的格式
func encodeWeixinOutboundAESKey(aesKeyHex string) string {
	return base64.StdEncoding.EncodeToString([]byte(aesKeyHex))
}

// sendUploadedMedia 发送已上传的媒体消息
func (c *WeixinChannel) sendUploadedMedia(
	ctx context.Context,
	toUserID, contextToken, caption string,
	mediaType int,
	uploaded *uploadedFileInfo,
) error {
	// 先发送文字说明（如果有）
	if err := c.sendTextMessage(ctx, toUserID, contextToken, caption); err != nil {
		return err
	}

	// 构建媒体引用
	mediaRef := &CDNMedia{
		EncryptQueryParam: uploaded.downloadParam,
		AesKey:            encodeWeixinOutboundAESKey(uploaded.aesKeyHex),
		EncryptType:       1,
	}

	// 根据媒体类型发送
	switch mediaType {
	case UploadMediaTypeImage:
		return c.sendMessageItem(ctx, toUserID, contextToken, MessageItem{
			Type: MessageItemTypeImage,
			ImageItem: &ImageItem{
				Media:   mediaRef,
				MidSize: uploaded.cipherSize,
			},
		})

	case UploadMediaTypeVideo:
		return c.sendMessageItem(ctx, toUserID, contextToken, MessageItem{
			Type: MessageItemTypeVideo,
			VideoItem: &VideoItem{
				Media:     mediaRef,
				VideoSize: uploaded.cipherSize,
			},
		})

	default:
		return c.sendMessageItem(ctx, toUserID, contextToken, MessageItem{
			Type: MessageItemTypeFile,
			FileItem: &FileItem{
				Media:    mediaRef,
				FileName: uploaded.filename,
				Len:      fmt.Sprintf("%d", uploaded.fileSize),
			},
		})
	}
}

// ============ "正在输入"状态 ============

// sendTypingStatus 发送"正在输入"或"取消输入"状态
func (c *WeixinChannel) sendTypingStatus(
	ctx context.Context,
	chatID, typingTicket string,
	status int,
) error {
	resp, err := c.api.SendTyping(ctx, SendTypingReq{
		IlinkUserID:  chatID,
		TypingTicket: typingTicket,
		Status:       status,
	})
	if err != nil {
		return err
	}
	if resp == nil {
		return fmt.Errorf("sendtyping returned nil response")
	}
	if resp.Ret != 0 || resp.Errcode != 0 {
		if isSessionExpiredStatus(resp.Ret, resp.Errcode) {
			c.pauseSession("sendtyping", resp.Ret, resp.Errcode, resp.Errmsg)
		}
		return fmt.Errorf("sendtyping failed: ret=%d errcode=%d errmsg=%s", resp.Ret, resp.Errcode, resp.Errmsg)
	}
	return nil
}

// StartTyping 开始发送"正在输入"状态
// 返回一个停止函数，调用后取消"正在输入"状态。
// 整个过程（拉取 ticket、首次发送、周期刷新）都在后台 goroutine 执行，
// 调用方立即返回，避免阻塞收到消息后的主流程，输入指示器才能"立刻"出现。
func (c *WeixinChannel) StartTyping(ctx context.Context, chatID string) (func(), error) {
	if strings.TrimSpace(chatID) == "" {
		return func() {}, nil
	}
	if c.remainingPause() > 0 {
		return func() {}, nil
	}

	typingCtx, cancel := context.WithCancel(ctx)
	var once sync.Once
	stop := func() {
		once.Do(func() {
			cancel()
			// 异步发送取消状态，避免阻塞调用方（最终回复发送前会立即调用 stop）。
			go func() {
				stopCtx, stopCancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer stopCancel()
				ticket, err := c.getTypingTicket(stopCtx, chatID)
				if err != nil || ticket == "" {
					return
				}
				if err := c.sendTypingStatus(stopCtx, chatID, ticket, TypingStatusCancel); err != nil {
					logger.DebugCF("weixin", "Failed to cancel typing indicator", map[string]any{
						"chat_id": chatID,
						"error":   err.Error(),
					})
				}
			}()
		})
	}

	// 异步获取 ticket、首次发送 typing、并启动周期刷新。
	go func() {
		if typingCtx.Err() != nil {
			return
		}

		fetchCtx, fetchCancel := context.WithTimeout(context.Background(), 4*time.Second)
		ticket, err := c.getTypingTicket(fetchCtx, chatID)
		fetchCancel()
		if err != nil && ticket == "" {
			logger.WarnCF("weixin", "No typing ticket available", map[string]any{
				"chat_id": chatID,
				"error":   err.Error(),
			})
			return
		}
		if ticket == "" {
			logger.WarnCF("weixin", "Typing ticket is empty, cannot start typing", map[string]any{
				"chat_id": chatID,
			})
			return
		}

		// 在第一次发送前再检查一次是否已被取消（用户可能很快连发消息或回复已经返回）。
		if typingCtx.Err() != nil {
			return
		}

		logger.InfoCF("weixin", "Sending typing status to WeChat", map[string]any{
			"chat_id": chatID,
		})

		firstCtx, firstCancel := context.WithTimeout(context.Background(), 4*time.Second)
		err = c.sendTypingStatus(firstCtx, chatID, ticket, TypingStatusTyping)
		firstCancel()
		if err != nil {
			logger.WarnCF("weixin", "Failed to send initial typing status", map[string]any{
				"chat_id": chatID,
				"error":   err.Error(),
			})
			return
		}

		// 定时刷新"正在输入"状态（微信要求每 5 秒刷新一次）
		ticker := time.NewTicker(weixinTypingKeepAlive)
		defer ticker.Stop()
		for {
			select {
			case <-typingCtx.Done():
				return
			case <-ticker.C:
				// 会话暂停期间无法下发，继续刷新只会反复失败并刷屏，
				// 且会让用户一直看到"正在输入"却收不到回复，因此直接结束刷新循环。
				if c.remainingPause() > 0 {
					logger.InfoCF("weixin", "Stop refreshing typing indicator: session paused", map[string]any{
						"chat_id": chatID,
					})
					return
				}
				refreshCtx, refreshCancel := context.WithTimeout(context.Background(), 4*time.Second)
				rerr := c.sendTypingStatus(refreshCtx, chatID, ticket, TypingStatusTyping)
				refreshCancel()
				if rerr != nil {
					logger.WarnCF("weixin", "Failed to refresh typing indicator", map[string]any{
						"chat_id": chatID,
						"error":   rerr.Error(),
					})
				} else {
					logger.InfoCF("weixin", "Refreshed typing indicator", map[string]any{
						"chat_id": chatID,
					})
				}
			}
		}
	}()

	return stop, nil
}