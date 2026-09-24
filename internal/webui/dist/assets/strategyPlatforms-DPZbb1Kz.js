const d={finclaw:{id:"finclaw",label:"FinClaw",shortLabel:"FinClaw",backtestUrl:"",nativeBacktest:!0,promptHint:'使用 FinClaw / akquant 策略 API：必须定义且仅定义一个 akquant.Strategy 子类，实现 on_bar；标的在点击回测时选择，不必写在策略里；可用 self.log("...") 写入回测报告「日志」页；可用 from fquant.indicators import pe_ttm 等字段，写进 extra，在 on_bar 里用 bar.extra.get 读取；不写 extra 则只有 OHLCV；不要写 if __name__ == "__main__"；不要使用聚宽的 initialize / handle_data。',defaultScript:`from akquant import Bar, Strategy
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
`,badgeClassName:"border-violet-500/25 bg-violet-500/8 text-violet-700 dark:text-violet-300"}},b="finclaw";function _(e){return e==="joinquant"||e==="finclaw"}function p(e){return e&&_(e)?e:"finclaw"}function u(e){return d[e]}function m(e){const a=e==null?void 0:e.trim();if(!a)return;const t=a.includes("\\")?"\\":"/",n=a.replace(/[\\/]strategies[\\/]([^\\/]+)\.py$/i,`${t}backtests${t}$1`);if(n!==a)return n}function w(e){return e==="succeeded"||e==="failed"||e==="cancelled"||e==="canceled"}function y(e,a,t){var c,f;const n=a.trim();if(!n)return n;const o=u(e),i=[`【策略平台】${o.label}`,o.promptHint],r=(c=t==null?void 0:t.analysisRun)!=null&&c.id?t.analysisRun:null,l=(f=t==null?void 0:t.strategyPath)==null?void 0:f.trim();if(l){i.push("",`【策略文件】${l}`,r?"用户正在定向分析下方指定的回测。先阅读该回测的结果文件再回答；不要改策略文件，除非用户明确要求修改。":"请直接读取并修改上述策略文件，将改动写入文件；不要只在对话中贴出完整代码。");const s=e==="finclaw"?m(l):void 0;s&&r?i.push("",`【定向回测】${r.name}`,`回测 ID：${r.id}`,`状态：${r.status}`,`【回测结果目录】${s}`,`请只分析这一次回测。它的子目录在上述目录下，文件夹名通常就是回测名称「${r.name}」（重名时带 -2 等后缀）。先打开候选目录的 result.json，确认其中 id 等于 ${r.id}，再 read_file 阅读同目录的 summary.md；需要成交、持仓或净值细节再读 blotter.json / result.json。不要改用其他回测，不要凭记忆编造指标。`):s&&i.push("",`【回测结果目录】${s}`,"该策略的回测结果以本地文件保存在上述目录：每个回测名称一个子目录，内含 summary.md（摘要与关键指标）、result.json（完整结果）、request.json、source.py，以及 blotter.json（成交明细，若已拉取）。分析回测请先 read_file 阅读最新的 summary.md，需要细节再读 JSON；不要凭记忆编造指标。")}return i.push("",`用户需求：${n}`),i.join(`
`)}const g=["用户需求：","我的需求："];function S(e){if(!e.includes("【策略平台】"))return e;for(const a of g){const t=e.lastIndexOf(a);if(t>=0)return e.slice(t+a.length).trim()}return e}export{b as D,y as b,w as c,S as e,u as g,p as n};
