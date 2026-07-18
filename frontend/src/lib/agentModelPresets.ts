/**
 * 模型配置快捷预设（默认使用各厂商 Coding Plan OpenAI 兼容接口，2026-07 核对）。
 *
 * @see https://api-docs.deepseek.com/
 * @see https://docs.bigmodel.cn/cn/coding-plan/quick-start
 * @see https://www.kimi.com/code/docs/en/
 * @see https://help.aliyun.com/zh/model-studio/coding-plan
 * @see https://platform.minimaxi.com/docs/guides/models-intro
 */

export type AgentModelPreset = {
  label: string;
  model: string;
  /** 默认 Coding Plan Base URL（DeepSeek / MiniMax 无独立端点时使用通用地址）。 */
  apiBase: string;
};

export const AGENT_MODEL_PRESETS: AgentModelPreset[] = [
  // DeepSeek — https://api-docs.deepseek.com/（无独立 Coding Plan 端点）
  { label: 'DeepSeek V4 Flash', model: 'deepseek/deepseek-v4-flash', apiBase: 'https://api.deepseek.com/v1' },
  { label: 'DeepSeek V4 Pro', model: 'deepseek/deepseek-v4-pro', apiBase: 'https://api.deepseek.com/v1' },

  // 智谱 GLM Coding Plan — https://docs.bigmodel.cn/cn/coding-plan/quick-start
  { label: 'GLM-5.2', model: 'zhipu/glm-5.2', apiBase: 'https://open.bigmodel.cn/api/coding/paas/v4' },
  { label: 'GLM-5.1', model: 'zhipu/glm-5.1', apiBase: 'https://open.bigmodel.cn/api/coding/paas/v4' },

  // Kimi Code — https://api.kimi.com/coding/v1
  { label: 'Kimi K2.6', model: 'moonshot/kimi-k2.6', apiBase: 'https://api.kimi.com/coding/v1' },
  { label: 'Kimi K2.7 Code', model: 'moonshot/kimi-k2.7-code', apiBase: 'https://api.kimi.com/coding/v1' },

  // 百炼 Coding Plan — https://help.aliyun.com/zh/model-studio/coding-plan
  { label: 'Qwen 3.7 Plus', model: 'qwen/qwen3.7-plus', apiBase: 'https://coding.dashscope.aliyuncs.com/v1' },
  { label: 'Qwen 3.7 Max', model: 'qwen/qwen3.7-max', apiBase: 'https://coding.dashscope.aliyuncs.com/v1' },

  // MiniMax Token Plan — 与按量计费共用 OpenAI 兼容端点
  { label: 'MiniMax M3', model: 'minimax/MiniMax-M3', apiBase: 'https://api.minimaxi.com/v1' },
  { label: 'MiniMax M2.7 高速', model: 'minimax/MiniMax-M2.7-highspeed', apiBase: 'https://api.minimaxi.com/v1' },
];
