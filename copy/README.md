# PicoClaw 频道迁移包

此目录包含将 PicoClaw 频道迁移到其他 Agent 项目所需的所有文件。

## 文件清单

```
copy/
├── migrate_imports.ps1      # Windows PowerShell 迁移脚本
├── migrate_imports.sh      # Linux/macOS Bash 迁移脚本
├── migration_guide.md      # 详细迁移指南
├── main.go.template        # 主程序初始化模板
├── go.mod.template         # Go 模块依赖模板
└── config.json.template    # 频道配置模板
```

## 快速开始

### 1. 复制文件

将 `pkg/channels/` 整个目录复制到目标项目的 `pkg/` 下。

### 2. 替换 import 路径

**Windows PowerShell:**
```powershell
.\migrate_imports.ps1 -SourcePath "github.com/sipeed/picoclaw/pkg" -TargetPath "github.com/你的项目/pkg"
```

**Linux/macOS:**
```bash
chmod +x migrate_imports.sh
./migrate_imports.sh "github.com/sipeed/picoclaw/pkg" "github.com/你的项目/pkg"
```

### 3. 添加依赖

复制 `go.mod.template` 中的依赖到你的 `go.mod`，然后运行：

```bash
go mod tidy
```

### 4. 创建主程序

参考 `main.go.template` 创建主程序，确保导入所有频道包：

```go
import (
    _ "github.com/你的项目/pkg/channels/feishu"
    _ "github.com/你的项目/pkg/channels/weixin"
    // ... 其他频道
)
```

### 5. 配置

复制 `config.json.template` 到 `config.json`，填入实际的配置值。

### 6. 验证

```bash
go build ./...
```

## 频道列表

| 频道 | 目录 | 说明 |
|------|------|------|
| 飞书 | `pkg/channels/feishu/` | WebSocket 连接 |
| 微信 | `pkg/channels/weixin/` | HTTP 长轮询 |
| 钉钉 | `pkg/channels/dingtalk/` | - |
| Discord | `pkg/channels/discord/` | - |
| IRC | `pkg/channels/irc/` | - |
| LINE | `pkg/channels/line/` | - |
| MaixCam | `pkg/channels/maixcam/` | - |
| Matrix | `pkg/channels/matrix/` | - |
| MQTT | `pkg/channels/mqtt/` | - |
| OneBot | `pkg/channels/onebot/` | - |
| Pico | `pkg/channels/pico/` | 内部频道 |
| QQ | `pkg/channels/qq/` | - |
| Slack | `pkg/channels/slack/` | - |
| Teams Webhook | `pkg/channels/teams_webhook/` | - |
| Telegram | `pkg/channels/telegram/` | - |
| VK | `pkg/channels/vk/` | - |
| 企业微信 | `pkg/channels/wecom/` | - |
| WhatsApp | `pkg/channels/whatsapp/` | - |
| WhatsApp Native | `pkg/channels/whatsapp_native/` | - |

## 注意事项

1. **飞书仅支持 64 位架构**（arm64, amd64, riscv64, mips64, ppc64）
2. **微信需要扫码登录**获取 Token
3. **微信语音需要 SILK 解码器**（silk_v3_decoder 或 ffmpeg）
4. 部分频道需要公网可访问的 Webhook 回调地址

## 详细文档

参见 `migration_guide.md`
