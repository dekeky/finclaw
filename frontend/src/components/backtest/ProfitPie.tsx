import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMetric } from './format';
import type { SymbolStat } from './symbolStats';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/cn';

const TOP_N = 6;
const PROFIT_COLORS = ['#e64545', '#f06a5a', '#c43a3a', '#ef7a70', '#b83232', '#d45a52'];
const LOSS_COLORS = ['#00a870', '#26bd88', '#008f60', '#4cc99a', '#007a52', '#1aa87a'];

export type ProfitSlice = {
  name: string;
  value: number;
  pnl: number;
  selectable: boolean;
  color: string;
};

function buildSideSlices(stats: SymbolStat[], profit: boolean): ProfitSlice[] {
  const side = stats
    .filter((item) => (profit ? item.pnl > 0 : item.pnl < 0))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  const top = side.slice(0, TOP_N);
  const rest = side.slice(TOP_N).reduce((sum, item) => sum + item.pnl, 0);
  const palette = profit ? PROFIT_COLORS : LOSS_COLORS;
  const slices = top.map((item, index) => ({
    name: item.symbol,
    value: Math.abs(item.pnl),
    pnl: item.pnl,
    selectable: true,
    color: palette[index % palette.length],
  }));
  if ((profit && rest > 0) || (!profit && rest < 0)) {
    slices.push({
      name: profit ? '其他盈利' : '其他亏损',
      value: Math.abs(rest),
      pnl: rest,
      selectable: false,
      color: palette[palette.length - 1],
    });
  }
  return slices;
}

function DonutRing({
  slices,
  total,
  tone,
  onSelect,
}: {
  slices: ProfitSlice[];
  total: number;
  tone: 'profit' | 'loss';
  onSelect?: (symbol: string) => void;
}) {
  const { scheme } = useTheme();
  const tooltipStyle = {
    background: scheme === 'dark' ? '#1a1a1a' : '#ffffff',
    border: '1px solid var(--border)',
  };
  if (slices.length === 0) return null;
  return (
    <div className="relative mx-auto h-40 w-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={3}
            stroke="transparent"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            onClick={(entry) => {
              const name = String(entry?.name ?? '');
              if (name && !name.startsWith('其他')) onSelect?.(name);
            }}
          >
            {slices.map((slice) => (
              <Cell key={slice.name} fill={slice.color} cursor={slice.selectable ? 'pointer' : 'default'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(_value, name, item) => [formatMetric(item.payload.pnl, 'money'), String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] text-muted-foreground">{tone === 'profit' ? '盈利' : '亏损'}</span>
        <span className={cn('text-sm font-medium', tone === 'profit' ? 'text-[#e64545]' : 'text-[#00a870]')}>
          {formatMetric(total, 'money')}
        </span>
      </div>
    </div>
  );
}

function RankList({
  slices,
  total,
  tone,
  onSelect,
}: {
  slices: ProfitSlice[];
  total: number;
  tone: 'profit' | 'loss';
  onSelect?: (symbol: string) => void;
}) {
  const absTotal = Math.abs(total) || slices.reduce((sum, item) => sum + item.value, 0);
  const amountClass = tone === 'profit' ? 'text-[#e64545]' : 'text-[#00a870]';
  return (
    <ul className="space-y-1">
      {slices.map((slice) => {
        const share = absTotal ? (slice.value / absTotal) * 100 : 0;
        return (
          <li key={slice.name}>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs',
                slice.selectable ? 'hover:bg-muted' : 'cursor-default',
              )}
              disabled={!slice.selectable}
              onClick={() => slice.selectable && onSelect?.(slice.name)}
            >
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: slice.color }} />
              <span className="min-w-0 flex-1 truncate" title={slice.name}>{slice.name}</span>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <i className="block h-full" style={{ width: `${Math.max(share, 4)}%`, background: slice.color }} />
              </span>
              <span className="w-10 text-right tabular-nums text-muted-foreground">{share.toFixed(1)}%</span>
              <span className={cn('w-16 text-right tabular-nums', amountClass)}>{formatMetric(slice.pnl, 'money')}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ProfitPie({
  stats,
  onSelect,
}: {
  stats: SymbolStat[];
  onSelect?: (symbol: string) => void;
}) {
  const profitSlices = buildSideSlices(stats, true);
  const lossSlices = buildSideSlices(stats, false);
  const totalProfit = stats.reduce((sum, item) => sum + Math.max(0, item.pnl), 0);
  const totalLoss = stats.reduce((sum, item) => sum + Math.min(0, item.pnl), 0);
  const net = totalProfit + totalLoss;

  if (profitSlices.length === 0 && lossSlices.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">没有个股盈亏，无法绘制贡献图。</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] text-muted-foreground">盈利合计</div>
          <div className="text-sm font-medium text-[#e64545]">{formatMetric(totalProfit, 'money')}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] text-muted-foreground">亏损合计</div>
          <div className="text-sm font-medium text-[#00a870]">{formatMetric(totalLoss, 'money')}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] text-muted-foreground">净盈亏</div>
          <div className={cn('text-sm font-medium', net >= 0 ? 'text-[#e64545]' : 'text-[#00a870]')}>
            {formatMetric(net, 'money')}
          </div>
        </div>
      </div>
      <div className={cn('grid gap-6', profitSlices.length && lossSlices.length ? 'md:grid-cols-2' : 'grid-cols-1')}>
        {profitSlices.length > 0 ? (
          <section>
            <h5 className="mb-2 text-xs font-medium">盈利构成</h5>
            <DonutRing slices={profitSlices} total={totalProfit} tone="profit" onSelect={onSelect} />
            <RankList slices={profitSlices} total={totalProfit} tone="profit" onSelect={onSelect} />
          </section>
        ) : null}
        {lossSlices.length > 0 ? (
          <section>
            <h5 className="mb-2 text-xs font-medium">亏损构成</h5>
            <DonutRing slices={lossSlices} total={totalLoss} tone="loss" onSelect={onSelect} />
            <RankList slices={lossSlices} total={totalLoss} tone="loss" onSelect={onSelect} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
