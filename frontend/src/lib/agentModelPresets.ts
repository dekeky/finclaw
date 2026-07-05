/**
 * 模型配置快捷预设（各厂商官网 OpenAI 兼容接口，2026-07 核对）。
 *
 * @see https://api-docs.deepseek.com/
 * @see https://docs.bigmodel.cn/cn/guide/start/model-overview
 * @see https://platform.moonshot.cn/docs/guide/kimi-k2-6-quickstart
 * @see https://help.aliyun.com/zh/model-studio/text-generation-model
 * @see https://platform.minimaxi.com/docs/guides/models-intro
 */
export const AGENT_MODEL_PRESETS = [
  // DeepSeek — https://api-docs.deepseek.com/
  { label: 'DeepSeek V4 Flash', model: 'deepseek/deepseek-v4-flash', apiBase: 'https://api.deepseek.com/v1' },
  { label: 'DeepSeek V4 Pro', model: 'deepseek/deepseek-v4-pro', apiBase: 'https://api.deepseek.com/v1' },

  // 智谱 GLM — https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2
  { label: 'GLM-5.2', model: 'zhipu/glm-5.2', apiBase: 'https://open.bigmodel.cn/api/paas/v4' },
  { label: 'GLM-5.1', model: 'zhipu/glm-5.1', apiBase: 'https://open.bigmodel.cn/api/paas/v4' },

  // Kimi / Moonshot — https://platform.moonshot.cn/
  { label: 'Kimi K2.6', model: 'moonshot/kimi-k2.6', apiBase: 'https://api.moonshot.cn/v1' },
  { label: 'Kimi K2.7 Code', model: 'moonshot/kimi-k2.7-code', apiBase: 'https://api.moonshot.cn/v1' },

  // 通义千问 Qwen — https://help.aliyun.com/zh/model-studio/text-generation-model
  { label: 'Qwen 3.7 Plus', model: 'qwen/qwen3.7-plus', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: 'Qwen 3.7 Max', model: 'qwen/qwen3.7-max', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },

  // MiniMax — https://platform.minimaxi.com/docs/guides/models-intro
  { label: 'MiniMax M3', model: 'minimax/MiniMax-M3', apiBase: 'https://api.minimaxi.com/v1' },
  { label: 'MiniMax M2.7 高速', model: 'minimax/MiniMax-M2.7-highspeed', apiBase: 'https://api.minimaxi.com/v1' },
] as const;

export type AgentModelPreset = (typeof AGENT_MODEL_PRESETS)[number];
