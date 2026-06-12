package router

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	finclawconfig "github.com/finclaw/internal/config"
	"github.com/finclaw/pkg/channels/weixin"
	"github.com/gin-gonic/gin"
)

// weixinAuthState 存储扫码登录状态
type weixinAuthState struct {
	QRCode   string    `json:"qrcode"`
	Status   string    `json:"status"`   // wait, scaned, confirmed, expired
	BotToken string    `json:"bot_token"`
	IlinkUserID string `json:"ilink_user_id"`
	UpdatedAt time.Time `json:"updated_at"`
}

// weixinAuthManager 管理微信扫码登录状态
type weixinAuthManager struct {
	mu    sync.RWMutex
	state map[string]*weixinAuthState // qrcode -> state
}

func newWeixinAuthManager() *weixinAuthManager {
	return &weixinAuthManager{
		state: make(map[string]*weixinAuthState),
	}
}

var authManager = newWeixinAuthManager()

// weixinRouter 配置微信相关路由
func (fr *FinClawRouter) weixinRouter() {
	weixinCfg := fr.getWeixinConfig()
	if weixinCfg == nil {
		log.Println("⚠️ No weixin config found, using defaults for QR login routes")
		weixinCfg = &finclawconfig.WeixinSettings{
			BaseURL: "https://ilinkai.weixin.qq.com/",
		}
	}

	// 创建临时的 ApiClient 用于获取二维码（不依赖 msgBus）
	apiClient, err := weixin.NewApiClient(weixinCfg.BaseURL, weixinCfg.Token, weixinCfg.Proxy)
	if err != nil {
		log.Printf("⚠️ Failed to create weixin API client: %v", err)
		return
	}

	weixinGroup := fr.r.Group("/api/weixin/auth")
	{
		weixinGroup.GET("/qrcode", fr.makeQRCodeHandler(apiClient))
		weixinGroup.GET("/qrcode/status", fr.makeQRCodeStatusHandler(apiClient))
	}

	// 设置保存接口
	weixinGroup.PUT("/settings", fr.makeSaveWeixinSettingsHandler())

	log.Printf("📡 Weixin auth routes initialized (base_url: %s)", weixinCfg.BaseURL)
}

// getWeixinConfig 获取微信配置
func (fr *FinClawRouter) getWeixinConfig() *finclawconfig.WeixinSettings {
	if fr.finclawConf == nil {
		log.Printf("DEBUG: finclawConf is nil")
		return nil
	}
	if fr.finclawConf.Channels == nil {
		log.Printf("DEBUG: finclawConf.Channels is nil")
		return nil
	}

	log.Printf("DEBUG: Channels map keys = %v", fmt.Sprintf("%v", mapKeys(fr.finclawConf.Channels)))

	// 只要有 weixin 配置就返回（不要求 enabled），用于二维码登录等基础功能
	for _, chConfig := range fr.finclawConf.Channels {
		if chConfig != nil && chConfig.Weixin != nil {
			log.Printf("DEBUG: found weixin config, enabled=%v", chConfig.Enabled)
			return chConfig.Weixin
		}
	}
	return nil
}

func mapKeys[M ~map[K]V, K comparable, V any](m M) []K {
	keys := make([]K, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// makeQRCodeHandler 创建获取二维码的处理器
func (fr *FinClawRouter) makeQRCodeHandler(apiClient *weixin.ApiClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 调用 iLink API 获取二维码
		resp, err := apiClient.GetQRCode(c.Request.Context(), "3")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("failed to get QR code: %v", err),
			})
			return
		}

		// 存储状态用于后续轮询
		authManager.mu.Lock()
		authManager.state[resp.Qrcode] = &weixinAuthState{
			QRCode:   resp.Qrcode,
			Status:   "wait",
			UpdatedAt: time.Now(),
		}
		authManager.mu.Unlock()

		c.JSON(http.StatusOK, gin.H{
			"qrcode":          resp.Qrcode,
			"qrcode_img_content": resp.QrcodeImgContent,
		})
	}
}

// makeQRCodeStatusHandler 创建查询二维码状态的处理器（支持 SSE）
func (fr *FinClawRouter) makeQRCodeStatusHandler(apiClient *weixin.ApiClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		qrcode := c.Query("qrcode")
		if qrcode == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "qrcode parameter required"})
			return
		}

		// 检查是否是 SSE 请求
		accept := c.GetHeader("Accept")
		if accept == "text/event-stream" {
			fr.handleSSEQRCodeStatus(c, apiClient, qrcode)
			return
		}

		// 普通 HTTP 轮询
		fr.handleHTTPQRCodeStatus(c, apiClient, qrcode)
	}
}

// handleHTTPQRCodeStatus 处理普通 HTTP 查询
func (fr *FinClawRouter) handleHTTPQRCodeStatus(c *gin.Context, apiClient *weixin.ApiClient, qrcode string) {
	// 每次轮询都查询 API 获取最新状态
	resp, err := apiClient.GetQRCodeStatus(c.Request.Context(), qrcode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("DEBUG: qrcode=%s, iLink API status=%s, bot_token=%s, ilink_user_id=%s",
		qrcode, resp.Status, resp.BotToken, resp.IlinkUserID)

	// 更新本地状态
	authManager.mu.Lock()
	authManager.state[qrcode] = &weixinAuthState{
		QRCode:     qrcode,
		Status:     resp.Status,
		BotToken:   resp.BotToken,
		IlinkUserID: resp.IlinkUserID,
		UpdatedAt:  time.Now(),
	}
	authManager.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"status":        resp.Status,
		"bot_token":     resp.BotToken,
		"ilink_user_id": resp.IlinkUserID,
	})
}

// handleSSEQRCodeStatus 处理 SSE 实时推送
func (fr *FinClawRouter) handleSSEQRCodeStatus(c *gin.Context, apiClient *weixin.ApiClient, qrcode string) {
	// 设置 SSE 头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	// 创建一个 context，用于在客户端断开时终止
	ctx := c.Request.Context()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	// 首先检查本地状态
	sendStatus := func(status string, botToken, ilinkUserID string) {
		data := map[string]string{
			"status":        status,
			"bot_token":     botToken,
			"ilink_user_id": ilinkUserID,
		}
		jsonData, _ := json.Marshal(data)
		c.Writer.Write([]byte("data: "))
		c.Writer.Write(jsonData)
		c.Writer.Write([]byte("\n\n"))
		flusher.Flush()
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// 查询 API
			resp, err := apiClient.GetQRCodeStatus(ctx, qrcode)
			if err != nil {
				// 发送错误状态但不中断连接
				sendStatus("error", "", "")
				continue
			}

			// 更新本地状态
			authManager.mu.Lock()
			authManager.state[qrcode] = &weixinAuthState{
				QRCode:     qrcode,
				Status:     resp.Status,
				BotToken:   resp.BotToken,
				IlinkUserID: resp.IlinkUserID,
				UpdatedAt:  time.Now(),
			}
			authManager.mu.Unlock()

			// 发送状态
			sendStatus(resp.Status, resp.BotToken, resp.IlinkUserID)

			// 如果已确认或过期，结束轮询
			if resp.Status == "confirmed" || resp.Status == "expired" {
				return
			}
		}
	}
}

// makeSaveWeixinSettingsHandler 保存微信设置
func (fr *FinClawRouter) makeSaveWeixinSettingsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var settings struct {
			Token     string `json:"token"`
			AccountID string `json:"account_id"`
			BaseURL   string `json:"base_url"`
			Proxy     string `json:"proxy"`
			Enabled   bool   `json:"enabled"`
		}

		if err := c.ShouldBindJSON(&settings); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 更新配置
		weixinCfg := fr.getWeixinConfig()
		if weixinCfg == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "weixin config not found"})
			return
		}

		weixinCfg.Token = settings.Token
		weixinCfg.AccountID = settings.AccountID
		weixinCfg.BaseURL = settings.BaseURL
		weixinCfg.Proxy = settings.Proxy

		// 更新 enabled 状态
		if fr.finclawConf.Channels != nil {
			for _, chConfig := range fr.finclawConf.Channels {
				if chConfig != nil && chConfig.Weixin != nil {
					chConfig.Enabled = settings.Enabled
					break
				}
			}
		}

		// 保存配置到文件
		if err := fr.finclawConf.Save(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save config: %v", err)})
			return
		}

		log.Printf("✅ Weixin settings saved: token=%s, account_id=%s, enabled=%v",
			settings.Token, settings.AccountID, settings.Enabled)

		// Restart polling so the new bot token takes effect without a full server restart.
		if fr.agentManager != nil {
			fr.agentManager.ReloadWeixinChannels(fr.finclawConf)
		}

		c.JSON(http.StatusOK, gin.H{"message": "settings saved"})
	}
}