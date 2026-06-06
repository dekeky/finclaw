export const AGENT_MODEL_PRESETS = [
  { label: 'DeepSeek Chat', model: 'deepseek/deepseek-chat', apiBase: 'https://api.deepseek.com/v1' },
  { label: 'DeepSeek Reasoner', model: 'deepseek/deepseek-reasoner', apiBase: 'https://api.deepseek.com/v1' },
  { label: 'OpenAI GPT-4o', model: 'openai/gpt-4o', apiBase: 'https://api.openai.com/v1' },
  { label: 'Qwen Plus', model: 'qwen/qwen-plus', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
] as const;

export type AgentModelPreset = (typeof AGENT_MODEL_PRESETS)[number];
