package agentruntime

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/providers"
)

const modelProbeHTTPTimeout = 30 * time.Second

// ModelProbeResult is returned by POST /api/v1/agents/model-probe.
type ModelProbeResult struct {
	Ok        bool   `json:"ok"`
	Message   string `json:"message"`
	LatencyMs int64  `json:"latency_ms"`
}

// ProbeModelConfig checks connectivity for a model provider configuration.
func ProbeModelConfig(ctx context.Context, mc *picoclawconfig.ModelConfig) ModelProbeResult {
	start := time.Now()
	if mc == nil {
		return modelProbeFail(start, "model_provider is required")
	}
	if err := mc.Validate(); err != nil {
		return modelProbeFail(start, fmt.Sprintf("配置无效：%v", err))
	}

	protocol, modelID := providers.ExtractProtocol(mc)
	if strings.TrimSpace(modelID) == "" {
		return modelProbeFail(start, "model 格式无效")
	}

	apiKey := strings.TrimSpace(mc.APIKey())
	if apiKey == "" && !providers.IsEmptyAPIKeyAllowedForProtocol(protocol) {
		return modelProbeFail(start, "请填写 API Key")
	}

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, modelProbeHTTPTimeout)
	defer cancel()

	apiBase := providers.ResolveAPIBase(mc)
	if apiBase != "" && probeSupportsModelsList(protocol) {
		if ok, msg := probeViaModelsList(ctx, apiBase, modelID, apiKey); ok {
			return modelProbeOK(start, msg)
		}
	}

	return probeViaChat(ctx, start, mc, modelID)
}

func probeSupportsModelsList(protocol string) bool {
	switch strings.ToLower(strings.TrimSpace(protocol)) {
	case "ollama", "claude-cli", "claudecli", "codex-cli", "codexcli",
		"github-copilot", "copilot", "claude", "anthropic", "anthropic-messages":
		return false
	default:
		return true
	}
}

func probeViaModelsList(ctx context.Context, apiBase, modelID, apiKey string) (bool, string) {
	url := strings.TrimRight(strings.TrimSpace(apiBase), "/") + "/models"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false, ""
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, ""
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return false, ""
	}
	if resp.StatusCode != http.StatusOK {
		return false, ""
	}

	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, ""
	}

	want := strings.TrimSpace(modelID)
	for _, m := range body.Data {
		if strings.EqualFold(strings.TrimSpace(m.ID), want) {
			return true, "已连接，并在模型列表中找到该模型"
		}
	}
	return false, ""
}

func probeViaChat(ctx context.Context, start time.Time, mc *picoclawconfig.ModelConfig, modelID string) ModelProbeResult {
	cfg := *mc
	cfg.RequestTimeout = int(modelProbeHTTPTimeout / time.Second)

	provider, resolvedModelID, err := providers.CreateProviderFromConfig(&cfg)
	if err != nil {
		return modelProbeFail(start, fmt.Sprintf("无法创建模型客户端：%v", err))
	}
	if stateful, ok := provider.(providers.StatefulProvider); ok {
		defer stateful.Close()
	}

	if resolvedModelID != "" {
		modelID = resolvedModelID
	}

	messages := []providers.Message{{Role: "user", Content: "ping"}}
	opts := map[string]any{
		"max_tokens":     1,
		"thinking_level": "off",
	}

	if _, err := provider.Chat(ctx, messages, nil, modelID, opts); err != nil {
		return modelProbeFail(start, friendlyProbeChatError(err))
	}
	return modelProbeOK(start, "已连接，模型可正常响应")
}

func friendlyProbeChatError(err error) string {
	msg := strings.TrimSpace(err.Error())
	lower := strings.ToLower(msg)
	switch {
	case strings.Contains(lower, "401"), strings.Contains(lower, "unauthorized"), strings.Contains(lower, "invalid api key"):
		return "API Key 无效或未授权"
	case strings.Contains(lower, "403"), strings.Contains(lower, "forbidden"):
		return "访问被拒绝，请检查 API Key 权限"
	case strings.Contains(lower, "404"), strings.Contains(lower, "not found"):
		return "模型或接口地址不存在，请检查 model 与 api_base"
	case strings.Contains(lower, "timeout"), strings.Contains(lower, "deadline"):
		return "连接超时，请检查网络或 api_base"
	case strings.Contains(lower, "connection refused"), strings.Contains(lower, "no such host"):
		return "无法连接到 api_base，请检查地址与网络"
	default:
		return fmt.Sprintf("模型请求失败：%s", msg)
	}
}

func modelProbeOK(start time.Time, message string) ModelProbeResult {
	return ModelProbeResult{
		Ok:        true,
		Message:   message,
		LatencyMs: time.Since(start).Milliseconds(),
	}
}

func modelProbeFail(start time.Time, message string) ModelProbeResult {
	return ModelProbeResult{
		Ok:        false,
		Message:   message,
		LatencyMs: time.Since(start).Milliseconds(),
	}
}
