package agentruntime

import (
	"fmt"
	"strings"
)

const (
	StrategyPlatformJoinQuant = "joinquant"
	StrategyPlatformFinClaw   = "finclaw"
)

func normalizeStrategyPlatform(platform string) (string, error) {
	platform = strings.TrimSpace(strings.ToLower(platform))
	if platform == "" || platform == "ths" {
		return StrategyPlatformJoinQuant, nil
	}
	switch platform {
	case StrategyPlatformJoinQuant, StrategyPlatformFinClaw:
		return platform, nil
	default:
		return "", fmt.Errorf("invalid strategy platform %q (supported: joinquant, finclaw)", platform)
	}
}

func defaultStrategyScript(platform string) string {
	if platform == StrategyPlatformFinClaw {
		return finclawDefaultStrategyScript
	}
	return joinquantDefaultStrategyScript
}

const joinquantDefaultStrategyScript = `# 聚宽量化策略脚本
# 可通过 AI 对话生成或手动编辑

def initialize(context):
    """策略初始化"""
    g.security = '000001.XSHE'
    set_benchmark('000300.XSHG')
    set_option('use_real_price', True)


def handle_data(context, data):
    """每个交易日调用"""
    pass
`

const finclawDefaultStrategyScript = `from akquant import Bar, Strategy


class DualMAStrategy(Strategy):
    """双均线：MA5 上穿 MA20 买入，下穿卖出。标的在点击回测时选择。"""

    def __init__(self) -> None:
        super().__init__()
        self.short_window = 5
        self.long_window = 20
        self.warmup_period = self.long_window

    def on_bar(self, bar: Bar) -> None:
        closes = self.get_history(count=self.long_window, symbol=bar.symbol, field="close")
        if len(closes) < self.long_window:
            return

        ma_short = closes[-self.short_window :].mean()
        ma_long = closes[-self.long_window :].mean()
        position = self.get_position(bar.symbol)

        if ma_short > ma_long and position == 0:
            self.order_target_percent(symbol=bar.symbol, target_percent=0.95)
        elif ma_short < ma_long and position > 0:
            self.order_target_percent(symbol=bar.symbol, target_percent=0.0)
`
