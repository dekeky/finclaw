# Finclaw

<p align="center">
  <a href="http://159.75.51.78:8082/chat">
    <img src="assets/finclaw-readme-hero.jpg" alt="Finclaw — AI × 金融 · 多 Agent 投研平台" width="560" />
  </a>
</p>

<p align="center">
  <a href="http://159.75.51.78:8082/chat"><img src="https://img.shields.io/badge/在线体验-2468f2?style=for-the-badge&logo=googlechrome&logoColor=white" alt="在线体验" /></a>
  <a href="https://github.com/dekeky/finclaw/releases"><img src="https://img.shields.io/badge/下载%20Release-2ea44f?style=for-the-badge&logo=github&logoColor=white" alt="下载 Release" /></a>
  <a href="https://dekeky.github.io/finclaw"><img src="https://img.shields.io/badge/项目主页-1a1a2e?style=for-the-badge&logo=readthedocs&logoColor=white" alt="项目主页" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/dekeky/finclaw?style=flat-square&logo=github" alt="Stars" />
  <img src="https://img.shields.io/github/license/dekeky/finclaw?style=flat-square&logo=apache&logoColor=white" alt="License" />
  <img src="https://img.shields.io/badge/平台-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="平台" />
</p>

> 🤖 **AI × 金融** · 面向金融与投研场景的多 Agent 平台。下载一个可执行文件即可本地运行，自带 Web 控制台；也支持接入微信，在手机上与你的 Agent 对话。

---

## ✨ 现已支持

### 💬 对话

- ⚡ 流式回复，展示推理过程与工具调用
- 📝 支持 Markdown、代码高亮、Mermaid 图表与图片附件
- ⌨️ 支持 `/stop` 中止回复、`/clear` 清空历史
- 📂 侧边栏可查看 Skills、工作区文档与历史对话
- 🌓 深色 / 浅色主题

<p align="center">
  <img src="assets/readme/chat.jpg" alt="流式对话" width="720" />
</p>

### 🤖 Agent

- 🎭 创建、管理多个 Agent，自定义头像与人设
- ✍️ 编辑角色定位、沟通风格与用户偏好；管理 Skills 与工作区文档，支持 AI 辅助生成与润色

<p align="center">
  <img src="assets/readme/agent.jpg" alt="Agent 创建与管理" width="720" />
</p>

### 🏪 Agent 市场

- 已蒸馏多位投资大师的方法论，包括格雷厄姆、巴菲特等，一键安装即可拥有对应风格的投研助手
- 也欢迎大家沉淀自己的 Agent，上传分享；从市场安装模板后，绑定模型即可开始对话

<p align="center">
  <img src="assets/readme/agent-market.jpg" alt="Agent 市场" width="720" />
</p>

### 🧠 模型

- ⚙️ **模型中心**集中管理 API Key 与模型信息，多个 Agent 可复用同一份配置
- 🔄 对话页顶栏随时切换当前 Agent 使用的模型
- 📡 一键检测模型是否连通

<p align="center">
  <img src="assets/readme/model.jpg" alt="模型中心" width="720" />
</p>

### 📱 微信

- 📲 扫码绑定微信，指定 Agent 自动回复消息

<p align="center">
  <img src="assets/readme/weixin.jpg" alt="微信绑定" width="720" />
</p>

### 🔐 账号

- 📧 支持多租户，邮箱注册 / 登录，每位用户数据相互隔离

<p align="center">
  <img src="assets/readme/account.jpg" alt="多账户登录与数据隔离" width="720" />
</p>
---

## 🚀 即将上线

| | 功能 | 说明 |
|:---:|:---|:---|
| 📰 | **金融资讯** | 行业研报、公司财报、实时热点与要闻，支持行业追踪与 AI 分析 |
| 📈 | **量化回测** | AI 辅助生成量化策略并完成回测验证 |

---

## 📦 如何使用

### ⬇️ 1. 下载

前往 [Releases](https://github.com/dekeky/finclaw/releases)，按系统下载对应压缩包并解压：

| | 平台 | 文件名示例 |
|:---:|:---|:---|
| 🪟 | Windows | `finclaw-windows-amd64.zip` |
| 🍎 | macOS（Apple 芯片） | `finclaw-darwin-arm64.tar.gz` |
| 🍎 | macOS（Intel） | `finclaw-darwin-amd64.tar.gz` |
| 🐧 | Linux | `finclaw-linux-amd64.tar.gz` |

解压后得到 `finclaw`（Windows 为 `finclaw.exe`），**无需安装 Go 或 Node.js**。

### ▶️ 2. 启动

**Windows**：

```powershell
.\finclaw.exe
```

**macOS / Linux**：

```bash
chmod +x finclaw
./finclaw
```

首次启动会在用户目录自动创建数据文件夹（默认 `~/.finclaw`）和配置文件，服务监听 **8082** 端口。

### 🌐 3. 打开控制台

浏览器访问：

```
http://127.0.0.1:8082
```

### 🧭 4. 建议上手流程

| 步骤 | 操作 |
|:---:|:---|
| 1️⃣ | **注册并登录** |
| 2️⃣ | 进入 **模型**，添加你使用的 LLM（如 DeepSeek、OpenAI 兼容接口等），做一次连通性检测 |
| 3️⃣ | 进入 **Agent**，新建 Agent，或从 **Agent 市场** 安装格雷厄姆、巴菲特等大师模板，并绑定刚配置的模型 |
| 4️⃣ | 进入 **对话**，选择 Agent 开始聊天 |
| 5️⃣ | （可选）在 **微信** 页扫码绑定，在微信里与你的 Agent 对话 |

### 💾 5. 数据与升级

- 📁 数据目录：默认 `~/.finclaw`（Windows 为 `C:\Users\<用户名>\.finclaw`）
- 🔧 可通过环境变量 `FINCLAW_HOME` 指定其他目录
- ⚙️ 服务端配置：`~/.finclaw/finclaw.toml`（首次启动自动生成，一般无需手动修改）
- ⬆️ 升级版本时**直接替换可执行文件**即可，模型、Agent 与对话数据均会保留

---

## ❓ 常见问题

<details>
<summary><strong>🔌 端口被占用</strong></summary>

修改 `~/.finclaw/finclaw.toml` 中的 `serverAddr`，例如改为 `":9090"`，重启后访问对应端口。

</details>

<details>
<summary><strong>🤖 Agent 无法回复</strong></summary>

先在「模型」页确认 API Key 与接口地址正确，并使用「连通性检测」验证。

</details>

<details>
<summary><strong>📱 微信绑定后无响应</strong></summary>

确认「微信」页已选择要绑定的 Agent，且该 Agent 的模型配置正常。

</details>

---

## 👨‍💻 开发者

如需从源码构建，请参阅仓库内 `frontend/` 与 `cmd/agent/`。基于 [PicoClaw](https://github.com/sipeed/picoclaw) 运行时。

```bash
cd frontend && npm install && npm run build && cd ..
go build -o finclaw ./cmd/agent
```

---

## ⭐ Star 趋势

[![Star 趋势](https://api.star-history.com/svg?repos=dekeky/finclaw&type=Date&v=3)](https://star-history.com/#dekeky/finclaw&Date)

---

## 📄 开源协议

本项目基于 [Apache License 2.0](LICENSE) 开源。
