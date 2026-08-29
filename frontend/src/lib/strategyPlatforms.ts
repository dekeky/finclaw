export type StrategyPlatform = 'joinquant' | 'finclaw';

export interface StrategyPlatformConfig {
  id: StrategyPlatform;
  label: string;
  shortLabel: string;
  /** 外部回测控制台；FinClaw 原生回测为空 */
  backtestUrl: string;
  nativeBacktest: boolean;
  promptHint: string;
  defaultScript: string;
  badgeClassName: string;
}

export const STRATEGY_PLATFORMS: Record<StrategyPlatform, StrategyPlatformConfig> = {
  finclaw: {
    id: 'finclaw',
    label: 'FinClaw',
    shortLabel: 'FinClaw',
    backtestUrl: '',
    nativeBacktest: true,
    promptHint:
      '使用 FinClaw / akquant 策略 API：必须定义且仅定义一个 akquant.Strategy 子类，实现 on_bar；'
      + '标的在点击回测时选择，不必写在策略里；'
      + '可用 from fquant.indicators import pe_ttm 等字段，写进 extra，在 on_bar 里用 bar.extra.get 读取；不写 extra 则只有 OHLCV；'
      + '不要写 if __name__ == "__main__"；不要使用聚宽的 initialize / handle_data。',
    defaultScript: `from akquant import Bar, Strategy
from fquant.indicators import pe_ttm


class DualMAStrategy(Strategy):
    """示例策略。标的在点击回测时选择。"""

    extra = [pe_ttm]  # 可选。平台按名单加载，on_bar 里 bar.extra.get(同名) 读取；不写则只有 OHLCV

    def __init__(self) -> None:
        super().__init__()
        self.short_window = 5
        self.long_window = 20
        self.warmup_period = self.long_window

    def on_bar(self, bar: Bar) -> None:
        closes = self.get_history(count=self.long_window, symbol=bar.symbol, field="close")
        if len(closes) < self.long_window:
            return

        pe = bar.extra.get(pe_ttm)
        if pe is None:
            return

        ma_short = closes[-self.short_window :].mean()
        ma_long = closes[-self.long_window :].mean()
        position = self.get_position(bar.symbol)

        if ma_short > ma_long and pe < 40 and position == 0:
            self.order_target_percent(symbol=bar.symbol, target_percent=0.95)
        elif ma_short < ma_long and position > 0:
            self.order_target_percent(symbol=bar.symbol, target_percent=0.0)
`,
    badgeClassName:
      'border-teal-500/25 bg-teal-500/8 text-teal-700 dark:text-teal-300',
  },
  joinquant: {
    id: 'joinquant',
    label: '聚宽',
    shortLabel: '聚宽',
    backtestUrl: 'https://www.joinquant.com/algorithm/index/list',
    nativeBacktest: false,
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
    badgeClassName:
      'border-violet-500/25 bg-violet-500/8 text-violet-700 dark:text-violet-300',
  },
};

export const STRATEGY_PLATFORM_LIST = Object.values(STRATEGY_PLATFORMS);

export const DEFAULT_STRATEGY_PLATFORM: StrategyPlatform = 'finclaw';

export function isStrategyPlatform(value: string): value is StrategyPlatform {
  return value === 'joinquant' || value === 'finclaw';
}

export function normalizeStrategyPlatform(value?: string | null): StrategyPlatform {
  if (value && isStrategyPlatform(value)) return value;
  return 'finclaw';
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
