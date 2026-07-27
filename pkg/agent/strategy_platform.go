package agentruntime

import (
	"fmt"
	"strings"
)

const StrategyPlatformJoinQuant = "joinquant"

func normalizeStrategyPlatform(platform string) (string, error) {
	platform = strings.TrimSpace(strings.ToLower(platform))
	if platform == "" || platform == "ths" {
		return StrategyPlatformJoinQuant, nil
	}
	if platform == StrategyPlatformJoinQuant {
		return platform, nil
	}
	return "", fmt.Errorf("invalid strategy platform %q (supported: joinquant)", platform)
}

func defaultStrategyScript(platform string) string {
	return `# 聚宽量化策略脚本
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
}
