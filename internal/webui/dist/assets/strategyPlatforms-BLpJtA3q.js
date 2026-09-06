import{c}from"./index-Bj62KU5F.js";/**
 * @license @tabler/icons-react v3.44.0 - MIT
 *
 * This source code is licensed under the MIT license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=[["path",{d:"M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6",key:"svg-0"}],["path",{d:"M11 13l9 -9",key:"svg-1"}],["path",{d:"M15 4h5v5",key:"svg-2"}]],b=c("outline","external-link","ExternalLink",_),f={finclaw:{id:"finclaw",label:"FinClaw",shortLabel:"FinClaw",backtestUrl:"",nativeBacktest:!0,promptHint:'使用 FinClaw / akquant 策略 API：必须定义且仅定义一个 akquant.Strategy 子类，实现 on_bar；标的在点击回测时选择，不必写在策略里；可用 from fquant.indicators import pe_ttm 等字段，写进 extra，在 on_bar 里用 bar.extra.get 读取；不写 extra 则只有 OHLCV；不要写 if __name__ == "__main__"；不要使用聚宽的 initialize / handle_data。',defaultScript:`from akquant import Bar, Strategy
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
`,badgeClassName:"border-teal-500/25 bg-teal-500/8 text-teal-700 dark:text-teal-300"},joinquant:{id:"joinquant",label:"聚宽",shortLabel:"聚宽",backtestUrl:"https://www.joinquant.com/algorithm/index/list",nativeBacktest:!1,promptHint:"使用聚宽（JoinQuant）平台 API，如 initialize、handle_data、order_target、g 等；股票代码格式如 000001.XSHE。",defaultScript:`# 聚宽量化策略脚本
# 可通过 AI 对话生成或手动编辑

def initialize(context):
    """策略初始化"""
    g.security = '000001.XSHE'
    set_benchmark('000300.XSHG')
    set_option('use_real_price', True)


def handle_data(context, data):
    """每个交易日调用"""
    pass
`,badgeClassName:"border-violet-500/25 bg-violet-500/8 text-violet-700 dark:text-violet-300"}},w="finclaw";function d(t){return t==="joinquant"||t==="finclaw"}function y(t){return t&&d(t)?t:"finclaw"}function m(t){return f[t]}function u(t){const e=t==null?void 0:t.trim();if(!e)return;const a=e.includes("\\")?"\\":"/",r=e.replace(/[\\/]strategies[\\/]([^\\/]+)\.py$/i,`${a}backtests${a}$1`);if(r!==e)return r}function h(t,e,a){var s;const r=e.trim();if(!r)return r;const o=m(t),n=[`【策略平台】${o.label}`,o.promptHint],i=(s=a==null?void 0:a.strategyPath)==null?void 0:s.trim();if(i){n.push("",`【策略文件】${i}`,"请直接读取并修改上述策略文件，将改动写入文件；不要只在对话中贴出完整代码。");const l=t==="finclaw"?u(i):void 0;l&&n.push("",`【回测结果目录】${l}`,"该策略的回测结果以本地文件保存在上述目录：每个回测名称一个子目录，内含 summary.md（摘要与关键指标）、result.json（完整结果）、request.json、source.py，以及 blotter.json（成交明细，若已拉取）。分析回测请先 read_file 阅读最新的 summary.md，需要细节再读 JSON；不要凭记忆编造指标。")}return n.push("",`用户需求：${r}`),n.join(`
`)}const g=["用户需求：","我的需求："];function S(t){if(!t.includes("【策略平台】"))return t;for(const e of g){const a=t.lastIndexOf(e);if(a>=0)return t.slice(a+e.length).trim()}return t}export{w as D,b as I,h as b,S as e,m as g,y as n};
