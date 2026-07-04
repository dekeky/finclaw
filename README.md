# Finclaw · 多 Agent 投研平台

<p align="center">
  <a href="http://159.75.51.78:8082/chat">
    <img src="assets/finclaw-readme-hero.jpg" alt="Finclaw — AI × 金融 · 多 Agent 投研平台" width="560" />
  </a>
</p>

<p align="center">
  <a href="http://159.75.51.78:8082/chat" style="display:inline-block;padding:10px 26px;margin:0 8px;background-color:#18181b;color:#fafafa;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;border:1px solid #18181b;">在线体验</a>
  <a href="https://dekeky.github.io/finclaw" style="display:inline-block;padding:10px 26px;margin:0 8px;background-color:#fafafa;color:#18181b;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;border:1px solid #e4e4e7;">项目主页</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/dekeky/finclaw?style=flat-square&logo=github" alt="Stars" />
  <img src="https://img.shields.io/github/license/dekeky/finclaw?style=flat-square&logo=apache&logoColor=white" alt="License" />
  <img src="https://img.shields.io/badge/平台-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="平台" />
</p>

Finclaw — AI+金融多 Agent 投研平台，致力于让投资更智能。
绑定 灵根（API Key），凝聚 金丹（模型），化身多位 Agent 分身，各修一道、共参市场：
一尊览财报，一尊观大势，一尊算量化……
道友，归队的时候到了 👉 关注微信公众号 finclaw实验室

<p align="center">
  <img src="assets/readme/wechat-official-account.jpg" alt="微信公众号 finclaw实验室" width="200" />
  <br />
  <sub>扫码关注微信公众号 <strong>finclaw实验室</strong></sub>
</p>

---

## ✨ 神通一览

### 💬 问道 · 对话

- ⚡ 流式回复，展示推理过程与工具调用
- 📝 支持 Markdown、代码高亮、Mermaid 图表与图片附件
- ⌨️ 支持 `/stop` 中止回复、`/clear` 清空历史
- 📂 侧边栏可查看 Skills、工作区文档与历史对话
- 🌓 深色 / 浅色主题

<p align="center">
  <img src="assets/readme/chat.jpg" alt="流式对话" width="720" />
</p>

### 🤖 分身 · Agent

- 🎭 创建、管理多个 Agent，自定义头像与人设
- ✍️ 编辑角色定位、沟通风格与用户偏好；管理 Skills 与工作区文档，支持 AI 辅助生成与润色
- 📊 各修一道：财报研读、行情跟踪、量化推演……按需分派，协同投研

<p align="center">
  <img src="assets/readme/agent.jpg" alt="Agent 创建与管理" width="720" />
</p>

### 🏪 藏经阁 · Agent 市场

- 已蒸馏多位投资大师的方法论，包括格雷厄姆、巴菲特等，一键安装即可拥有对应风格的投研助手
- 也欢迎大家沉淀自己的 Agent，上传分享；从市场安装模板后，绑定模型即可开始对话

<p align="center">
  <img src="assets/readme/agent-market.jpg" alt="Agent 市场" width="720" />
</p>

### 🧠 凝丹 · 模型

- ⚙️ **模型中心**集中管理 API Key 与模型信息，多个 Agent 可复用同一份配置
- 🔄 对话页顶栏随时切换当前 Agent 使用的模型
- 📡 一键检测模型是否连通

<p align="center">
  <img src="assets/readme/model.jpg" alt="模型中心" width="720" />
</p>

### 📱 传音 · 微信

- 📲 扫码绑定微信，指定 Agent 自动回复消息——分身随身，路上不断线

<p align="center">
  <img src="assets/readme/weixin.jpg" alt="微信绑定" width="720" />
</p>

### 🔐 道籍 · 账号

- 📧 支持多租户，邮箱注册 / 登录，每位道友数据相互隔离

<p align="center">
  <img src="assets/readme/account.jpg" alt="多账户登录与数据隔离" width="720" />
</p>

---

## 🚀 即将破境 · 未来开发计划

| | 神通 | 说明 |
|:---:|:---|:---|
| 📰 | **金融资讯** | 行业研报、公司财报、实时热点与要闻，支持行业追踪与 AI 分析 |
| 📈 | **量化回测** | AI 辅助生成量化策略并完成回测验证 |

---

## 📦 入道指南

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

### 🧭 4. 飞升流程

| 步骤 | 修行 | 操作 |
|:---:|:---|:---|
| 1️⃣ | **立籍** | 注册并登录 |
| 2️⃣ | **绑灵根 · 凝金丹** | 进入 **模型**，添加 LLM（如 DeepSeek、OpenAI 兼容接口等），配置 API Key 并做连通性检测 |
| 3️⃣ | **分化身** | 进入 **Agent**，新建 Agent，或从 **Agent 市场** 安装格雷厄姆、巴菲特等大师模板，并绑定刚配置的模型 |
| 4️⃣ | **问道** | 进入 **对话**，选择 Agent 开始问道 |
| 5️⃣ | **传音随身**（可选） | 在 **微信** 页扫码绑定，在微信里与 Agent 对话 |

### 💾 5. 洞府与升级

- 📁 数据目录：默认 `~/.finclaw`（Windows 为 `C:\Users\<用户名>\.finclaw`）
- 🔧 可通过环境变量 `FINCLAW_HOME` 指定其他目录
- ⚙️ 服务端配置：`~/.finclaw/finclaw.toml`（首次启动自动生成，一般无需手动修改）
- ⬆️ 升级版本时**直接替换可执行文件**即可，模型、Agent 与对话数据均会保留

---

## ❓ 渡劫 FAQ

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
