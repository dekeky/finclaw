export type MetricKind =
  | 'percent'
  | 'percent100'
  | 'drawdown'
  | 'ratio'
  | 'number'
  | 'integer'
  | 'money'
  | 'text';

export type MetricSpec = {
  key: string;
  label: string;
  kind: MetricKind;
  signed?: boolean;
  hint: string;
};

export const HEAD_KPIS: MetricSpec[] = [
  {
    key: 'total_return_pct',
    label: '累计收益率',
    kind: 'percent',
    signed: true,
    hint: '期末净值相对初始资金的总收益率。',
  },
  {
    key: 'annualized_return',
    label: '年化收益率',
    kind: 'percent100',
    signed: true,
    hint: '把区间收益折算成一年的复合收益率。',
  },
  {
    key: 'max_drawdown_pct',
    label: '最大回撤',
    kind: 'drawdown',
    hint: '净值从阶段性高点回落到最低点的最大跌幅。',
  },
  {
    key: 'sharpe_ratio',
    label: '夏普比率',
    kind: 'ratio',
    signed: true,
    hint: '每承担一单位波动获得的超额收益。',
  },
  {
    key: 'win_rate',
    label: '胜率',
    kind: 'percent',
    hint: '已平仓交易中盈利笔数占比。',
  },
  {
    key: 'trade_count',
    label: '交易次数',
    kind: 'integer',
    hint: '每笔成交计一次，买入和卖出各算一次。',
  },
];

export const STAT_GROUPS: { title: string; items: MetricSpec[] }[] = [
  {
    title: '收益',
    items: [
      { key: 'total_return_pct', label: '累计收益率', kind: 'percent', signed: true, hint: '期末净值相对初始资金的收益率。' },
      { key: 'annualized_return', label: '年化收益率', kind: 'percent100', signed: true, hint: '区间收益折算的年化复合收益率。' },
      { key: 'total_pnl', label: '总盈亏', kind: 'money', signed: true, hint: '账户盈亏合计。' },
      { key: 'end_market_value', label: '期末净值', kind: 'money', hint: '结束时现金加持仓市值。' },
      { key: 'total_profit', label: '盈利交易额', kind: 'money', signed: true, hint: '所有盈利平仓交易的盈亏合计。' },
      { key: 'total_loss', label: '亏损交易额', kind: 'money', signed: true, hint: '所有亏损平仓交易的盈亏合计。' },
    ],
  },
  {
    title: '风险',
    items: [
      { key: 'max_drawdown_pct', label: '最大回撤', kind: 'drawdown', hint: '净值高点到低点的最大跌幅。' },
      { key: 'max_drawdown_value', label: '回撤金额', kind: 'money', hint: '最大回撤对应的绝对金额。' },
      { key: 'volatility', label: '年化波动率', kind: 'percent100', hint: '日收益率的年化标准差。' },
      { key: 'sharpe_ratio', label: '夏普比率', kind: 'ratio', signed: true, hint: '收益相对波动的性价比。' },
      { key: 'sortino_ratio', label: '索提诺比率', kind: 'ratio', signed: true, hint: '只惩罚向下波动的收益风险比。' },
      { key: 'calmar_ratio', label: '卡玛比率', kind: 'ratio', signed: true, hint: '年化收益 / 最大回撤。' },
      { key: 'var_95', label: 'VaR 95%', kind: 'percent100', hint: '95% 置信水平下的单日亏损下限。' },
      { key: 'ulcer_index', label: 'Ulcer 指数', kind: 'number', hint: '回撤深度与持续时间的综合压力。' },
    ],
  },
  {
    title: '交易',
    items: [
      { key: 'trade_count', label: '交易次数', kind: 'integer', hint: '每笔成交计一次，买入和卖出各算一次。' },
      { key: 'winning_trades', label: '盈利次数', kind: 'integer', hint: '净盈亏大于 0 的平仓笔数。' },
      { key: 'losing_trades', label: '亏损次数', kind: 'integer', hint: '净盈亏小于 0 的平仓笔数。' },
      { key: 'win_rate', label: '胜率', kind: 'percent', hint: '盈利次数 / 完整开平仓轮数。' },
      { key: 'profit_factor', label: '盈亏比', kind: 'ratio', hint: '盈利交易额 / |亏损交易额|。' },
      { key: 'avg_pnl', label: '笔均盈亏', kind: 'money', signed: true, hint: '每笔已平仓交易的平均盈亏。' },
      { key: 'avg_profit', label: '平均盈利', kind: 'money', signed: true, hint: '盈利交易的平均盈利额。' },
      { key: 'avg_loss', label: '平均亏损', kind: 'money', signed: true, hint: '亏损交易的平均亏损额。' },
      { key: 'largest_win', label: '最大单笔盈利', kind: 'money', signed: true, hint: '单笔平仓最大盈利。' },
      { key: 'largest_loss', label: '最大单笔亏损', kind: 'money', signed: true, hint: '单笔平仓最大亏损。' },
      { key: 'max_wins', label: '最大连胜', kind: 'integer', hint: '连续盈利的最长笔数。' },
      { key: 'max_losses', label: '最大连亏', kind: 'integer', hint: '连续亏损的最长笔数。' },
      { key: 'exposure_time_pct', label: '持仓时间占比', kind: 'percent', hint: '账户有持仓的时间占比。' },
      { key: 'open_position_count', label: '未平仓数', kind: 'integer', hint: '回测结束时仍持有的头寸数。' },
      { key: 'total_commission_fee', label: '佣金', kind: 'money', hint: '券商佣金，含最低佣金。' },
      { key: 'total_stamp_tax', label: '印花税', kind: 'money', hint: '卖出收取的印花税。' },
      { key: 'total_transfer_fee', label: '过户费', kind: 'money', hint: '买卖都收的过户费。' },
      { key: 'total_slippage', label: '滑点费', kind: 'money', hint: '成交价相对未滑点价格的不利差额。' },
    ],
  },
];

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

export function formatMetric(value: unknown, kind: MetricKind): string {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'text') return String(value);
  const number = asNumber(value);
  if (number === null) return String(value);
  switch (kind) {
    case 'percent':
      return `${number.toFixed(2)}%`;
    case 'percent100':
      return `${(number * 100).toFixed(2)}%`;
    case 'drawdown':
      return `${(-Math.abs(number)).toFixed(2)}%`;
    case 'ratio':
      return number.toFixed(2);
    case 'integer':
      return Math.round(number).toLocaleString('zh-CN');
    case 'money':
      return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    default:
      return number.toFixed(4);
  }
}

export function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function signedClass(value: unknown, signed = false): string {
  if (!signed) return '';
  const number = asNumber(value);
  if (number === null || number === 0) return '';
  return number > 0 ? 'pos' : 'neg';
}

export function signedTone(value: unknown, signed = false): 'pos' | 'neg' | '' {
  if (!signed) return '';
  const number = asNumber(value);
  if (number === null || number === 0) return '';
  return number > 0 ? 'pos' : 'neg';
}

export function metricClass(value: unknown, spec: MetricSpec): string {
  if (spec.kind === 'drawdown') {
    const number = asNumber(value);
    return number && number !== 0 ? 'neg' : '';
  }
  return signedClass(value, spec.signed);
}

export function metricTone(value: unknown, spec: MetricSpec): 'pos' | 'neg' | '' {
  if (spec.kind === 'drawdown') {
    const number = asNumber(value);
    return number && number !== 0 ? 'neg' : '';
  }
  return signedTone(value, spec.signed);
}

export function toneClass(tone: 'pos' | 'neg' | ''): string {
  if (tone === 'pos') return 'pos';
  if (tone === 'neg') return 'neg';
  return '';
}

export function translate(map: Record<string, string>, value: unknown): string {
  const key = String(value ?? '');
  if (!key || key === 'undefined' || key === 'null') return '—';
  return map[key] ?? map[key.toLowerCase()] ?? key;
}

export const SIDE_LABEL: Record<string, string> = {
  Long: '多',
  Short: '空',
  long: '多',
  short: '空',
  buy: '买入',
  sell: '卖出',
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  filled: '成交',
  rejected: '拒绝',
  cancelled: '撤销',
  canceled: '撤销',
  pending: '待报',
  submitted: '已报',
};

export const POSITION_EFFECT_LABEL: Record<string, string> = {
  open: '开仓',
  close: '平仓',
  reduce: '减仓',
};

export function formatSymbolLabel(code: string, names?: Record<string, string>): string {
  const name = names?.[code];
  return name ? `${name}（${code}）` : code;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('zh-CN');
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN');
}

export function formatDateMinute(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return minutes ? `${hours}小时${minutes}分` : `${hours}小时`;
  if (minutes > 0) return secs ? `${minutes}分${secs}秒` : `${minutes}分`;
  return `${secs}秒`;
}

export function elapsedSince(from?: string | null, now = Date.now()): number | null {
  if (!from) return null;
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.round((now - start) / 1000));
}

export function dayKey(value?: string | number | null): string {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return text.slice(0, 10);
}

export const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
};
