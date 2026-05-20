package picoclaw

import "fmt"

// PicoClaw AGENT.md parsing (pkg/agent/definition.go splitAgentFrontmatter):
//   - Line 1 must be exactly "---"
//   - Next "---" on its own line ends YAML frontmatter
//   - Everything after closing "---" is Body → injected as ## AGENT.md in system prompt
//   - Frontmatter is YAML only (name, description, model, tools, maxTurns, skills, mcpServers)
//
// SOUL.md / USER.md: entire file is injected; do NOT use --- frontmatter.

const agentMDFormatSpec = `
AGENT.md 必须符合 PicoClaw 解析格式（整文件输出，不要用外层代码块包裹）：

1. 第 1 行：单独一行 ` + "`---`" + `
2. 中间：YAML frontmatter（标准 YAML，不是 Markdown）
3. 再用单独一行 ` + "`---`" + ` 结束 frontmatter
4. 之后：Markdown 正文（Body），这部分会进入 system prompt；frontmatter 不会

Frontmatter 可选字段（YAML，键名区分大小写）：
- name: 字符串
- description: 字符串（单行）
- model: 字符串
- tools: 字符串列表
- maxTurns: 整数
- skills: 字符串列表
- mcpServers: 字符串列表

正文建议使用 ## Role / ## Mission / ## Capabilities 等 Markdown 标题。`

func agentMDGeneratePrompt(agentName string) string {
	name := agentName
	if name == "" {
		name = "assistant"
	}
	return fmt.Sprintf(`你是 PicoClaw / FinClaw 工作区配置助手。请为 Agent「%s」撰写完整的 AGENT.md 文件。%s

示例结构（frontmatter 的 name 请用 %q）：
---
name: %s
description: 一句话说明该 Agent 的用途
---

You are the assistant for this workspace.

## Role
...

## Mission
- ...

要求：
- description 用单行字符串，不要用 YAML 的 > 或 | 多行块
- 内容具体、可执行；可提及应阅读 SOUL.md
- 禁止输出思考过程、think/reasoning 标签`, agentName, agentMDFormatSpec, name, name)
}

const soulMDFormatSpec = `
SOUL.md 在 PicoClaw 中整文件注入 system prompt（## SOUL.md），不做 frontmatter 拆分。
因此：不要使用以 ` + "`---`" + ` 开头的 YAML frontmatter；直接从 Markdown 标题或正文开始。`

func soulMDGeneratePrompt(agentName string) string {
	label := agentName
	if label == "" {
		label = "assistant"
	}
	return fmt.Sprintf(`你是 PicoClaw / FinClaw 工作区配置助手。请为 Agent「%s」撰写完整的 SOUL.md。%s

建议结构：
# Soul

## Personality
- ...

## Values
- ...

要求：定义性格与沟通风格，不写具体任务步骤；禁止 think/reasoning 标签`, label, soulMDFormatSpec)
}

const userMDFormatSpec = `
USER.md 在 PicoClaw 中整文件注入 system prompt（## USER.md），不做 frontmatter 拆分。
因此：不要使用以 ` + "`---`" + ` 开头的 YAML frontmatter。`

func userMDGeneratePrompt() string {
	return `你是 PicoClaw / FinClaw 工作区配置助手。请撰写完整的 USER.md。` + userMDFormatSpec + `

建议结构：
# User

## Preferences
- Communication style:
- Timezone:
- Language:

## Personal Information
- Name:

要求：记录用户偏好与背景；禁止 think/reasoning 标签`
}
