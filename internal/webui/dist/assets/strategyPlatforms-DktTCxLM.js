const u={joinquant:{id:"joinquant",label:"聚宽",shortLabel:"聚宽",backtestUrl:"https://www.joinquant.com/algorithm/index/list",promptHint:"使用聚宽（JoinQuant）平台 API，如 initialize、handle_data、order_target、g 等；股票代码格式如 000001.XSHE。",defaultScript:`# 聚宽量化策略脚本
# 可通过 AI 对话生成或手动编辑

def initialize(context):
    """策略初始化"""
    g.security = '000001.XSHE'
    set_benchmark('000300.XSHG')
    set_option('use_real_price', True)


def handle_data(context, data):
    """每个交易日调用"""
    pass
`}},g=Object.values(u),c="joinquant";function l(t){return t==="joinquant"}function d(t){return t&&l(t)?t:c}function f(t){return u[t]}function m(t,e,r){var o;const n=e.trim();if(!n)return n;const i=f(t),a=[`【策略平台】${i.label}`,i.promptHint],s=(o=r==null?void 0:r.strategyPath)==null?void 0:o.trim();return s&&a.push("",`【策略文件】${s}`,"请直接读取并修改上述策略文件，将改动写入文件；不要只在对话中贴出完整代码。"),a.push("",`用户需求：${n}`),a.join(`
`)}const S=["用户需求：","我的需求："];function T(t){if(!t.includes("【策略平台】"))return t;for(const e of S){const r=t.lastIndexOf(e);if(r>=0)return t.slice(r+e.length).trim()}return t}export{c as D,g as S,m as b,T as e,f as g,d as n};
