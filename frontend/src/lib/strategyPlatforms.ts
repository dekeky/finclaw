export type StrategyPlatform = 'joinquant';

export interface StrategyPlatformConfig {
  id: StrategyPlatform;
  label: string;
  shortLabel: string;
  promptHint: string;
  defaultScript: string;
}

export const STRATEGY_PLATFORMS: Record<StrategyPlatform, StrategyPlatformConfig> = {
  joinquant: {
    id: 'joinquant',
    label: '聚宽',
    shortLabel: '聚宽',
    promptHint:
      '使用聚宽（JoinQuant）平台 API，如 initialize、handle_data、order_target、g 等；'
      + '股票代码格式如 000001.XSHE。',
    defaultScript: `# 聚宽量化策略脚本
# 可通过 AI 对话生成或手动编辑

def initialize(context):
    """策略初始化"""
    g.security = '000001.XSHE'
    set_benchmark('000300.XSHG')
    set_option('use_real_price', True)


def handle_data(context, data):
    """每个交易日调用"""
    pass
`,
  },
};

export const STRATEGY_PLATFORM_LIST = Object.values(STRATEGY_PLATFORMS);

export const DEFAULT_STRATEGY_PLATFORM: StrategyPlatform = 'joinquant';

export function isStrategyPlatform(value: string): value is StrategyPlatform {
  return value === 'joinquant';
}

export function normalizeStrategyPlatform(value?: string | null): StrategyPlatform {
  if (value && isStrategyPlatform(value)) return value;
  return DEFAULT_STRATEGY_PLATFORM;
}

export function getStrategyPlatformConfig(platform: StrategyPlatform): StrategyPlatformConfig {
  return STRATEGY_PLATFORMS[platform];
}

export function defaultScriptForPlatform(platform: StrategyPlatform): string {
  return STRATEGY_PLATFORMS[platform].defaultScript;
}

/** Build the user message sent to Agent with platform context and strategy file path. */
export function buildStrategyAgentPrompt(
  platform: StrategyPlatform,
  userRequest: string,
  options?: { strategyPath?: string },
): string {
  const trimmed = userRequest.trim();
  if (!trimmed) return trimmed;

  const config = getStrategyPlatformConfig(platform);
  const lines: string[] = [
    `【策略平台】${config.label}`,
    config.promptHint,
  ];

  const strategyPath = options?.strategyPath?.trim();
  if (strategyPath) {
    lines.push(
      '',
      `【策略文件】${strategyPath}`,
      '请直接读取并修改上述策略文件，将改动写入文件；不要只在对话中贴出完整代码。',
    );
  }

  lines.push('', `用户需求：${trimmed}`);
  return lines.join('\n');
}

const STRATEGY_USER_REQUEST_MARKERS = ['用户需求：', '我的需求：'] as const;

/** Extract the original user text from a strategy agent prompt (for display / legacy messages). */
export function extractStrategyUserRequest(content: string): string {
  if (!content.includes('【策略平台】')) return content;
  for (const marker of STRATEGY_USER_REQUEST_MARKERS) {
    const idx = content.lastIndexOf(marker);
    if (idx >= 0) return content.slice(idx + marker.length).trim();
  }
  return content;
}
