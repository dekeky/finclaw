# PicoClaw 频道迁移指南

本文档说明如何将 PicoClaw 的所有频道从 PicoClaw 项目迁移到另一个 Agent 项目。

---

## 0. 迁移包文件清单

```
copy/
├── README.md                # 快速开始指南
├── migration_guide.md       # 本文档（详细迁移步骤）
├── migrate_imports.ps1       # Windows PowerShell 迁移脚本
├── migrate_imports.sh       # Linux/macOS Bash 迁移脚本
├── main.go.template         # 主程序初始化模板
├── go.mod.template          # Go 模块依赖模板
└── config.json.template     # 频道配置模板
```

---

## 1. 文件清单

### 1.1 频道实现（共 20 个频道）

```
copy/pkg/channels/
├── base.go              # 基础频道实现
├── manager.go           # Channel Manager（管理所有频道）
├── interfaces.go        # Channel 接口定义
├── errors.go            # 错误类型定义
├── registry.go         # 频道工厂注册
├── media.go            # 媒体处理工具
├── events.go          # 运行时事件
├── split.go           # 消息分割
│
├── dingtalk/           # 钉钉频道
├── discord/           # Discord 频道
├── feishu/            # 飞书频道（重点）
├── irc/               # IRC 频道
├── line/              # LINE 频道
├── maixcam/           # MaixCam 频道
├── matrix/            # Matrix 频道
├── mqtt/              # MQTT 频道
├── onebot/            # OneBot 频道
├── pico/              # Pico 内部频道
├── qq/                # QQ 频道
├── slack/             # Slack 频道
├── teams_webhook/      # Teams Webhook 频道
├── telegram/          # Telegram 频道
├── vk/                # VK 频道
├── wecom/             # 企业微信频道
├── weixin/            # 微信频道（重点）
├── whatsapp/          # WhatsApp 频道
└── whatsapp_native/    # WhatsApp Native 频道
```

### 1.2 基础设施依赖

```
copy/pkg/
├── bus/                    # 消息总线
│   ├── bus.go
│   ├── types.go
│   ├── inbound_context.go
│   ├── outbound_context.go
│   └── events.go
│
├── config/                 # 配置管理
│   ├── config.go          # 配置结构
│   └── config_channel.go  # 频道配置解析
│
├── media/                  # 媒体存储
│   ├── store.go
│   └── tempdir.go
│
├── identity/              # 身份标识
│   └── identity.go
│
├── logger/                # 日志
│   └── *.go
│
├── utils/                 # 工具函数
│   └── *.go
│
├── fileutil/               # 文件工具
│   └── file.go
│
├── audio/                  # 音频
│   └── tts/
│
├── commands/              # 命令
│
├── constants/            # 常量
│
├── events/              # 事件
│
└── health/              # 健康检查
```

---

## 2. 频道列表

| 频道 | 目录 | 说明 | 通信方式 |
|------|------|------|----------|
| **微信** | `weixin/` | 重点频道 | HTTP 长轮询 |
| **飞书** | `feishu/` | 重点频道 | WebSocket |
| 钉钉 | `dingtalk/` | - | - |
| Discord | `discord/` | - | WebSocket/REST |
| IRC | `irc/` | - | TCP |
| LINE | `line/` | - | Webhook |
| MaixCam | `maixcam/` | - | HTTP |
| Matrix | `matrix/` | - | WebSocket/REST |
| MQTT | `mqtt/` | - | MQTT |
| OneBot | `onebot/` | - | WebSocket |
| Pico | `pico/` | 内部频道 | WebSocket |
| QQ | `qq/` | - | - |
| Slack | `slack/` | - | WebSocket/REST |
| Teams Webhook | `teams_webhook/` | - | Webhook |
| Telegram | `telegram/` | - | Webhook |
| VK | `vk/` | - | Long Polling |
| 企业微信 | `wecom/` | - | HTTP |
| WhatsApp | `whatsapp/` | - | Webhook |
| WhatsApp Native | `whatsapp_native/` | - | - |

---

## 3. 必须修改的地方

### 3.1 import 路径修改

所有文件中的 import 路径需要从 `github.com/sipeed/picoclaw/pkg/` 修改为新项目的路径。

**需要替换的模式：**

```
github.com/sipeed/picoclaw/pkg/channels
github.com/sipeed/picoclaw/pkg/bus
github.com/sipeed/picoclaw/pkg/config
github.com/sipeed/picoclaw/pkg/media
github.com/sipeed/picoclaw/pkg/identity
github.com/sipeed/picoclaw/pkg/logger
github.com/sipeed/picoclaw/pkg/utils
github.com/sipeed/picoclaw/pkg/fileutil
github.com/sipeed/picoclaw/pkg/audio
github.com/sipeed/picoclaw/pkg/commands
github.com/sipeed/picoclaw/pkg/constants
github.com/sipeed/picoclaw/pkg/events
github.com/sipeed/picoclaw/pkg/health
```

**批量替换命令：**

```bash
# Linux/macOS
find . -name "*.go" -exec sed -i 's|github.com/sipeed/picoclaw/pkg|github.com/your-org/your-agent/pkg|g' {} \;

# Windows PowerShell
Get-ChildItem -Recurse -Filter "*.go" | ForEach-Object { (Get-Content $_.FullName -Raw) -replace 'github\.com/sipeed/picoclaw/pkg', 'github.com/your-org/your-agent/pkg' | Set-Content $_.FullName }
```

### 3.2 go.mod 依赖

#### 通用依赖

```go
golang.org/x/time/rate    // 限流
```

#### 微信依赖

```go
github.com/google/uuid         // UUID 生成
github.com/h2non/filetype     // 文件类型检测
github.com/mdp/qrterminal/v3  // QR Code 终端显示
```

#### 飞书依赖

```go
github.com/larksuite/oapi-sdk-go/v3  // 飞书 SDK
```

#### Discord 依赖

```go
github.com/bwmarrin/discordgo  // Discord API
```

#### Telegram 依赖

```go
github.com/go-telegram-bot-api/telegram-bot-api/v5
```

#### Slack 依赖

```go
github.com/slack-go/slack
```

#### Matrix 依赖

```go
github.com/mautrix/whatsapp
github.com/mautrix/go-sdk
```

#### VK 依赖

```go
github.com/go-vkbot/vkbot
```

#### WhatsApp 依赖

```go
github.com/Rhymen/go-whatsapp
```

#### QQ 依赖

```go
github.com/google/uuid
```

**添加到 go.mod：**

```bash
go get github.com/larksuite/oapi-sdk-go/v3@v3.x.x
go get github.com/mdp/qrterminal/v3@v3.x.x
# 根据需要添加其他依赖
go mod tidy
```

### 3.3 频道注册

每个频道通过 `init()` 函数自动注册到工厂。确保在主程序中导入频道包：

```go
import (
    // 微信
    _ "github.com/your-org/your-agent/pkg/channels/weixin"
    // 飞书
    _ "github.com/your-org/your-agent/pkg/channels/feishu"
    // 其他频道...
    _ "github.com/your-org/your-agent/pkg/channels/telegram"
    _ "github.com/your-org/your-agent/pkg/channels/discord"
)
```

---

## 4. 配置结构

### 4.1 微信配置 (WeixinSettings)

```go
type WeixinSettings struct {
    Token      SecureString  // Bot Token
    AccountID  string       // iLink Bot ID
    BaseURL    string       // API 地址
    CDNBaseURL string       // CDN 地址
    Proxy      string       // HTTP 代理
}
```

### 4.2 飞书配置 (FeishuSettings)

```go
type FeishuSettings struct {
    AppID               string              // App ID
    AppSecret           SecureString        // App Secret
    EncryptKey          SecureString        // 加密密钥
    VerificationToken   SecureString        // 验证 Token
    RandomReactionEmoji FlexibleStringSlice // 随机表情
    IsLark              bool               // 是否使用 Lark
}
```

### 4.3 其他频道配置

参考 `pkg/config/config.go` 中的完整配置结构定义。

---

## 5. 外部系统依赖

| 频道 | 外部系统 | 依赖 |
|------|----------|------|
| 微信 | 腾讯 iLink API | Token（扫码获取） |
| 飞书 | 飞书开放平台 | AppID + AppSecret |
| 钉钉 | 钉钉开放平台 | ClientID + ClientSecret |
| Discord | Discord API | Bot Token |
| Telegram | Telegram API | Bot Token |
| Slack | Slack API | Bot Token + App Token |
| 企业微信 | 微信 Work API | CorpID + CorpSecret |
| QQ | QQ 开放平台 | AppID + AppSecret |

---

## 6. 系统依赖

### 6.1 微信语音转码

微信语音使用 SILK 编码。需要安装解码器之一：

```bash
# SILK 解码器
silk_v3_decoder
silk_decoder
# 或
ffmpeg
```

### 6.2 平台特定

- **Linux**: 可能需要 `gcc`、`make` 等编译工具
- **Windows**: 可能需要 `mingw` 或 `cygwin`
- **MQTT**: 需要 MQTT Broker（如 Mosquitto）

---

## 7. 接口定义

### 7.1 Channel 接口

```go
type Channel interface {
    Name() string
    Start(ctx context.Context) error
    Stop(ctx context.Context) error
    Send(ctx context.Context, msg bus.OutboundMessage) ([]string, error)
    IsRunning() bool
    IsAllowed(senderID string) bool
    IsAllowedSender(sender bus.SenderInfo) bool
    ReasoningChannelID() string
}
```

### 7.2 可选接口

```go
// 消息编辑
type MessageEditor interface {
    EditMessage(ctx context.Context, chatID, messageID, content string) error
}

// 消息删除
type MessageDeleter interface {
    DeleteMessage(ctx context.Context, chatID, messageID string) error
}

// 占位符发送
type PlaceholderCapable interface {
    SendPlaceholder(ctx context.Context, chatID string) (string, error)
}

// 打字状态
type TypingCapable interface {
    StartTyping(ctx context.Context, chatID string) (func(), error)
}

// 媒体发送
type MediaSender interface {
    SendMedia(ctx context.Context, msg bus.OutboundMediaMessage) ([]string, error)
}

// 消息反应
type ReactionCapable interface {
    ReactToMessage(ctx context.Context, chatID, messageID string) (func(), error)
}

// 流式处理
type StreamingCapable interface {
    BeginStream(ctx context.Context, chatID string) (Streamer, error)
}
```

---

## 8. 迁移检查清单

- [ ] 复制所有文件到目标项目
- [ ] 修改 import 路径（批量替换）
- [ ] 更新 go.mod 添加外部依赖
- [ ] 运行 `go mod tidy`
- [ ] 在主程序中导入所有频道包（触发 init() 注册）
- [ ] 添加频道配置到 config.json
- [ ] 验证编译通过 `go build ./...`
- [ ] 测试各频道功能

---

## 9. 模板文件使用

迁移包中提供了三个模板文件，可直接复制到目标项目使用：

### 9.1 main.go.template

主程序初始化示例，展示如何创建 ChannelManager 并启动频道：

```go
// 关键导入（空白导入触发 init 注册）
import (
    _ "github.com/你的项目/pkg/channels/feishu"
    _ "github.com/你的项目/pkg/channels/weixin"
    // ... 其他频道
)

// 创建 ChannelManager
channelManager, err := channels.NewManager(cfg, msgBus, mediaStore)
channelManager.StartAll(ctx)
```

### 9.2 go.mod.template

包含所有频道依赖的 go.mod 示例，复制到目标项目后根据需要取消注释。

### 9.3 config.json.template

频道配置示例，包含飞书、微信、Telegram、Discord、Slack 的配置模板。

---

## 10. 已知限制

### 10.1 飞书

- 仅支持 64 位架构（arm64, amd64, riscv64, mips64, ppc64）
- 32 位系统会返回 `errUnsupported`

### 10.2 微信

- 需要扫码登录获取 Token
- 语音需要转码（需要 SILK 解码器或 ffmpeg）

### 10.3 平台特定

- 部分频道需要特定平台的开发者账号和配置
- Webhook 方式需要公网可访问的回调地址

---

## 11. 文件对应关系

| 源目录 | 目标路径 | 说明 |
|--------|----------|------|
| `pkg/channels/*` | `pkg/channels/` | 所有频道实现 |
| `pkg/bus/*` | `pkg/bus/` | 消息总线 |
| `pkg/config/*` | `pkg/config/` | 配置管理 |
| `pkg/media/*` | `pkg/media/` | 媒体存储 |
| `pkg/identity/*` | `pkg/identity/` | 身份标识 |
| `pkg/logger/*` | `pkg/logger/` | 日志 |
| `pkg/utils/*` | `pkg/utils/` | 工具函数 |
| `pkg/fileutil/*` | `pkg/fileutil/` | 文件工具 |
| `pkg/audio/*` | `pkg/audio/` | 音频 |
| `pkg/commands/*` | `pkg/commands/` | 命令 |
| `pkg/constants/*` | `pkg/constants/` | 常量 |
| `pkg/events/*` | `pkg/events/` | 事件 |
| `pkg/health/*` | `pkg/health/` | 健康检查 |
