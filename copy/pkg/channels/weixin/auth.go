package weixin

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/mdp/qrterminal/v3"

	"github.com/sipeed/picoclaw/pkg/logger"
)

// ============ 扫码登录配置 ============

// AuthFlowOpts 扫码登录流程的可配置选项
type AuthFlowOpts struct {
	BaseURL string        // iLink API 服务器地址
	BotType string        // Bot 类型（默认 "3"）
	Timeout time.Duration // 登录超时时间（默认 5 分钟）
	Proxy   string        // 代理服务器地址
}

// ============ 核心登录函数 ============

// PerformLoginInteractive 执行交互式微信扫码登录
// 在终端打印二维码，用户用微信扫描后登录
// 成功返回: botToken, userID, accountID, baseUrl
// 失败返回: error
//
// 登录流程:
// 1. 请求二维码
// 2. 在终端打印 ASCII 二维码
// 3. 每 2 秒轮询扫码状态
// 4. 状态变化: wait -> scanned -> confirmed/expired
func PerformLoginInteractive(
	ctx context.Context,
	opts AuthFlowOpts,
) (botToken, userID, accountID, baseUrl string, err error) {
	// 设置默认值
	if opts.BaseURL == "" {
		opts.BaseURL = "https://ilinkai.weixin.qq.com/"
	}
	if opts.BotType == "" {
		opts.BotType = "3" // 默认 iLink Bot 类型
	}
	if opts.Timeout == 0 {
		opts.Timeout = 5 * time.Minute
	}

	// 创建 API 客户端（登录时不需要 Token）
	api, err := NewApiClient(opts.BaseURL, "", opts.Proxy)
	if err != nil {
		return "", "", "", "", fmt.Errorf("failed to create api client: %w", err)
	}
	pollAPI := api // 轮询用的 API 客户端（后续可能会切换）

	logger.InfoC("weixin", "Requesting Weixin QR code...")

	// 步骤1: 请求二维码
	qrResp, err := api.GetQRCode(ctx, opts.BotType)
	if err != nil {
		return "", "", "", "", fmt.Errorf("failed to get qrcode: %w", err)
	}

	// 步骤2: 在终端打印二维码
	fmt.Println("\n=======================================================")
	fmt.Println("Please scan the following QR code with WeChat to login:")
	fmt.Println("=======================================================")
	fmt.Println()

	// 生成 ASCII 艺术二维码
	qrconfig := qrterminal.Config{
		Level:      qrterminal.L, // 最低纠错级别
		Writer:     os.Stdout,    // 输出到标准输出
		HalfBlocks: true,         // 使用半块字符美化显示
	}
	qrterminal.GenerateWithConfig(qrResp.QrcodeImgContent, qrconfig)

	fmt.Printf("\nQR Code Link: %s\n\n", qrResp.QrcodeImgContent)
	fmt.Println("Waiting for scan...")

	// 步骤3: 创建超时上下文和轮询定时器
	timeoutCtx, cancel := context.WithTimeout(ctx, opts.Timeout)
	defer cancel()

	pollTicker := time.NewTicker(2 * time.Second) // 每 2 秒轮询一次
	defer pollTicker.Stop()

	scannedPrinted := false // 是否已打印"已扫码"提示

	// 步骤4: 轮询扫码状态
	for {
		select {
		case <-timeoutCtx.Done():
			return "", "", "", "", fmt.Errorf("login timeout")
		case <-pollTicker.C:
			statusResp, err := pollAPI.GetQRCodeStatus(timeoutCtx, qrResp.Qrcode)
			if err != nil {
				// 长轮询超时或临时错误，继续等待
				continue
			}

			// 根据状态处理
			switch statusResp.Status {
			case "wait":
				// 等待中，用户还没扫码
			case "scaned":
				// 已扫码，等待用户在微信中确认
				if !scannedPrinted {
					fmt.Println("QR Code scanned! Please confirm login on your WeChat app...")
					scannedPrinted = true
				}
			case "confirmed":
				// 登录成功！获取凭证
				if statusResp.BotToken == "" || statusResp.IlinkBotID == "" {
					return "", "", "", "", fmt.Errorf("login confirmed but missing bot_token or ilink_bot_id")
				}
				logger.InfoCF("weixin", "Login successful", map[string]any{
					"account_id": statusResp.IlinkBotID,
				})

				// 返回登录结果
				// botToken: API 调用凭证
				// userID: 微信用户 ID
				// accountID: iLink Bot ID
				// baseUrl: API 服务器地址
				return statusResp.BotToken, statusResp.IlinkUserID, statusResp.IlinkBotID, statusResp.Baseurl, nil

			case "scaned_but_redirect":
				// 已扫码，但服务器负载均衡需要切换到另一台服务器
				if statusResp.RedirectHost == "" {
					logger.WarnC(
						"weixin",
						"scaned_but_redirect received without redirect_host; continuing on current host",
					)
					continue
				}
				// 切换到新的 API 服务器
				nextBaseURL := "https://" + statusResp.RedirectHost + "/"
				nextAPI, nextErr := NewApiClient(nextBaseURL, "", opts.Proxy)
				if nextErr != nil {
					logger.WarnCF("weixin", "Failed to switch QR polling host", map[string]any{
						"redirect_host": statusResp.RedirectHost,
						"error":         nextErr.Error(),
					})
					continue
				}
				pollAPI = nextAPI // 后续轮询使用新服务器
				logger.InfoCF("weixin", "Switched QR polling host", map[string]any{
					"redirect_host": statusResp.RedirectHost,
				})
			case "expired":
				// 二维码过期
				return "", "", "", "", fmt.Errorf("qrcode expired, please try again")
			default:
				logger.WarnCF("weixin", "Unknown QR code status", map[string]any{
					"status": statusResp.Status,
				})
			}
		}
	}
}
