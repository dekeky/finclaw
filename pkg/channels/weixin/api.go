package weixin

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
)

// ============ 常量定义 ============

const (
	weixinChannelVersion = "2.1.1"        // 微信渠道协议版本
	weixinIlinkAppID     = "bot"          // iLink 应用 ID（固定为 bot）
	// weixinClientVersion 将 2.1.1 编码为 0x00MMNNPP => 0x00020101 => 131329
	weixinClientVersion = 131329
)

// ============ ApiClient 结构体 ============

// ApiClient iLink API HTTP 客户端
// 封装了与腾讯 iLink API 通信的所有方法
type ApiClient struct {
	BaseURL    string        // API 服务器地址
	Token      string        // Bot Token 认证凭证
	HttpClient *http.Client  // HTTP 客户端（可配置代理）
}

// NewApiClient 创建新的 API 客户端
func NewApiClient(baseURL, token string, proxy string) (*ApiClient, error) {
	// 设置默认 API 地址
	if baseURL == "" {
		baseURL = "https://ilinkai.weixin.qq.com/"
	}

	// No global timeout: getupdates long-polls up to ~35s; per-request ctx controls deadlines.
	client := &http.Client{}

	// 如果配置了代理，则设置代理
	if proxy != "" {
		proxyURL, err := url.Parse(proxy)
		if err != nil {
			return nil, fmt.Errorf("invalid proxy URL %q: %w", proxy, err)
		}

		// 克隆默认 transport 以保留所有默认设置（TLS、HTTP/2、超时、keep-alive）
		if defaultTransport, ok := http.DefaultTransport.(*http.Transport); ok {
			transport := defaultTransport.Clone()
			transport.Proxy = http.ProxyURL(proxyURL)
			client.Transport = transport
		} else {
			// 后备方案：创建新的 Transport
			client.Transport = &http.Transport{
				Proxy: http.ProxyURL(proxyURL),
			}
		}
	}

	return &ApiClient{
		BaseURL:    baseURL,
		Token:      token,
		HttpClient: client,
	}, nil
}

// ============ 工具函数 ============

// randomWechatUIN 生成随机的微信 UIN
// 用于模拟微信客户端请求

func randomWechatUIN() string {
	var b [4]byte
	_, _ = rand.Read(b[:])
	uint32Val := binary.BigEndian.Uint32(b[:])
	return base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%d", uint32Val)))
}

// ============ HTTP 请求封装 ============

// post 发送 POST 请求到 iLink API
// 自动处理：URL 构建、JSON 序列化、请求头设置、响应反序列化
func (c *ApiClient) post(ctx context.Context, endpoint string, body any, responseObj any) error {
	// 构建完整的 URL
	u, err := url.Parse(c.BaseURL)
	if err != nil {
		return err
	}
	u.Path = path.Join(u.Path, endpoint)

	// 序列化请求体为 JSON
	jsonData, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request body: %w", err)
	}

	// 创建 HTTP 请求
	req, err := http.NewRequestWithContext(ctx, "POST", u.String(), bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// 设置请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header["iLink-App-Id"] = []string{weixinIlinkAppID}
	req.Header["iLink-App-ClientVersion"] = []string{strconv.Itoa(weixinClientVersion)}

	// 认证头（部分接口不需要）
	if endpoint != "ilink/bot/get_bot_qrcode" && endpoint != "ilink/bot/get_qrcode_status" {
		req.Header["AuthorizationType"] = []string{"ilink_bot_token"}
		req.Header["X-WECHAT-UIN"] = []string{randomWechatUIN()} // 随机 UIN 模拟微信客户端
		if c.Token != "" {
			req.Header.Set("Authorization", "Bearer "+c.Token)
		}
	}

	// 发送请求
	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http POST %s failed: %w", endpoint, err)
	}
	defer resp.Body.Close()

	// 读取响应体
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	// 检查 HTTP 状态码
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("http %d %s: %s", resp.StatusCode, resp.Status, string(respBody))
	}

	// 反序列化响应 JSON
	if responseObj != nil {
		if err := json.Unmarshal(respBody, responseObj); err != nil {
			return fmt.Errorf("failed to unmarshal response: %w, body: %s", err, string(respBody))
		}
	}

	return nil
}

// ============ API 方法 ============

// GetUpdates 长轮询获取新消息
// 这是微信频道接收消息的核心方法
// 服务器会保持请求直到有新消息或超时
func (c *ApiClient) GetUpdates(ctx context.Context, req GetUpdatesReq) (*GetUpdatesResp, error) {
	req.BaseInfo = BaseInfo{ChannelVersion: weixinChannelVersion}
	var resp GetUpdatesResp
	err := c.post(ctx, "ilink/bot/getupdates", req, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// SendMessage 发送消息给微信用户
func (c *ApiClient) SendMessage(ctx context.Context, req SendMessageReq) (*SendMessageResp, error) {
	req.BaseInfo = BaseInfo{ChannelVersion: weixinChannelVersion}
	var resp SendMessageResp
	if err := c.post(ctx, "ilink/bot/sendmessage", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// GetUploadUrl 获取媒体文件上传 URL
// 上传媒体文件需要先获取上传地址和参数
func (c *ApiClient) GetUploadUrl(ctx context.Context, req GetUploadUrlReq) (*GetUploadUrlResp, error) {
	req.BaseInfo = BaseInfo{ChannelVersion: weixinChannelVersion}
	var resp GetUploadUrlResp
	err := c.post(ctx, "ilink/bot/getuploadurl", req, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// GetConfig 获取 Bot 配置
// 包含 typing_ticket（用于发送"正在输入"状态）
func (c *ApiClient) GetConfig(ctx context.Context, req GetConfigReq) (*GetConfigResp, error) {
	req.BaseInfo = BaseInfo{ChannelVersion: weixinChannelVersion}
	var resp GetConfigResp
	if err := c.post(ctx, "ilink/bot/getconfig", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// SendTyping 发送"正在输入"状态
func (c *ApiClient) SendTyping(ctx context.Context, req SendTypingReq) (*SendTypingResp, error) {
	req.BaseInfo = BaseInfo{ChannelVersion: weixinChannelVersion}
	var resp SendTypingResp
	if err := c.post(ctx, "ilink/bot/sendtyping", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// ============ GET 请求封装 ============

// getQR 发送 GET 请求获取二维码或状态
func (c *ApiClient) getQR(ctx context.Context, endpoint string, query map[string]string, respObj any) error {
	// 构建 URL 和查询参数
	u, err := url.Parse(c.BaseURL)
	if err != nil {
		return err
	}
	u.Path = path.Join(u.Path, endpoint)
	q := u.Query()
	for key, value := range query {
		q.Set(key, value)
	}
	u.RawQuery = q.Encode()

	// 创建 GET 请求
	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return err
	}
	req.Header["iLink-App-Id"] = []string{weixinIlinkAppID}
	req.Header["iLink-App-ClientVersion"] = []string{strconv.Itoa(weixinClientVersion)}

	// 发送请求
	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 读取响应
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s failed: %d %s", endpoint, resp.StatusCode, string(respBody))
	}
	if err := json.Unmarshal(respBody, respObj); err != nil {
		return err
	}

	return nil
}

// GetQRCode 获取扫码登录二维码（GET 请求）
// 返回二维码内容和链接
func (c *ApiClient) GetQRCode(ctx context.Context, botType string) (*QRCodeResponse, error) {
	var qrcodeResp QRCodeResponse
	if err := c.getQR(ctx, "ilink/bot/get_bot_qrcode", map[string]string{
		"bot_type": botType,
	}, &qrcodeResp); err != nil {
		return nil, err
	}
	return &qrcodeResp, nil
}

// GetQRCodeStatus 查询二维码扫描状态（GET 请求）
// 轮询此接口可以知道用户是否扫码、是否确认登录
func (c *ApiClient) GetQRCodeStatus(ctx context.Context, qrcode string) (*StatusResponse, error) {
	var statusResp StatusResponse
	if err := c.getQR(ctx, "ilink/bot/get_qrcode_status", map[string]string{
		"qrcode": qrcode,
	}, &statusResp); err != nil {
		return nil, err
	}
	return &statusResp, nil
}