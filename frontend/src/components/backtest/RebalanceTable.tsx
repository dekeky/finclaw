import { type ReactNode, useEffect, useMemo, useState } from "react";
import DateRangePicker, { filterPresets } from "./DateRangePicker";
import Hint from "./Hint";
import { dayKey, formatMetric, formatSymbolLabel, SIDE_LABEL, translate } from "./format";
import { virtualWindow } from "./VirtualList";

const ROW_HEIGHT = 34;
const PAGE_SIZE = 20;

export type RebalanceEvent = {
  time?: string;
  method?: string;
  reason?: string;
  targets?: Record<string, unknown> | null;
  selected?: string[] | null;
  scores?: Record<string, unknown> | null;
  order_ids?: string[] | null;
  status?: string | null;
  plan?: Record<string, unknown> | null;
};

export type RejectRow = {
  time?: string;
  symbol?: string;
  side?: string;
  quantity?: number | null;
  reject_reason?: string | null;
  status?: string;
};

type IndicatorPoint = {
  name?: string;
  symbol?: string;
  time?: string;
  timestamp?: string;
  value?: number | string | null;
};

const METHOD_LABEL: Record<string, string> = {
  rebalance_weights: "权重调仓",
  rebalance_positions: "数量调仓",
  rebalance_to_topn: "TopN 调仓",
  order_target: "目标数量",
  order_target_percent: "目标仓位",
  order_target_value: "目标金额",
  close_position: "清仓",
  record_rebalance: "记录",
  rebalance_log: "策略日志",
  rejected: "下单",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "已下单",
  noop: "无需交易",
  rejected: "拒绝",
  noted: "已记录",
};

export function orderFillDay(order: Record<string, unknown>): string {
  return dayKey(String(order.updated_at ?? order.created_at ?? ""));
}

export function actionFillDay(
  row: RebalanceEvent,
  filledOrders: Record<string, unknown>[] = [],
): string {
  const signal = dayKey(row.time);
  const symbols = new Set(involvedSymbols(row));
  const fill = filledOrders.find((order) => {
    if (String(order.status ?? "filled").toLowerCase() !== "filled") return false;
    if (dayKey(String(order.created_at ?? "")) !== signal) return false;
    if (!symbols.size) return true;
    return symbols.has(String(order.symbol ?? ""));
  });
  return fill ? orderFillDay(fill) || signal : signal;
}

export function hasActualFill(
  row: RebalanceEvent,
  orders: Record<string, unknown>[] = [],
): boolean {
  return expandActionRows([row], orders, true).length > 0;
}

export function isSuccessfulAction(
  row: RebalanceEvent,
  filledOrders: Record<string, unknown>[] = [],
): boolean {
  const status = String(row.status || "").toLowerCase();
  if (status === "rejected") return false;
  if (!(row.order_ids?.length ?? 0)) return true;
  const day = dayKey(row.time);
  const filled = filledOrders.filter((order) => {
    if (String(order.status ?? "filled").toLowerCase() !== "filled") return false;
    return dayKey(String(order.created_at ?? "")) === day;
  });
  if (!filled.length) return false;
  const symbols = involvedSymbols(row);
  if (!symbols.length) return true;
  const filledSymbols = new Set(filled.map((order) => String(order.symbol ?? "")));
  return symbols.some((symbol) => filledSymbols.has(symbol));
}

export function fillReasonForOrder(
  order: Record<string, unknown>,
  events: RebalanceEvent[] = [],
): string {
  const symbol = String(order.symbol ?? "");
  const signal = dayKey(String(order.created_at ?? ""));
  const filledAt = orderFillDay(order);
  const side = String(order.side ?? "").toLowerCase();
  if (!symbol || !events.length) return "";
  const hits = events.filter((row) => {
    const day = dayKey(row.time);
    if (day !== signal && day !== filledAt) return false;
    const symbols = involvedSymbols(row);
    return !symbols.length || symbols.includes(symbol);
  });
  if (!hits.length) return "";
  const sided = hits.find((row) => {
    const want = preferredSide(row);
    return !want || want === side;
  });
  return String((sided ?? hits[0]).reason ?? "").trim();
}

export function RebalancePane({
  rows,
  rejects = [],
  orders = [],
  names,
  onSelectSymbol,
}: {
  rows: RebalanceEvent[];
  rejects?: RejectRow[];
  orders?: Record<string, unknown>[];
  names: Record<string, string>;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [symbol, setSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const merged = useMemo(() => mergeLogEvents(rows, rejects, orders), [rows, rejects, orders]);
  const symbols = useMemo(() => collectFilterSymbols(merged, names), [merged, names]);
  const bounds = useMemo(() => dateBounds(merged), [merged]);
  const datePresets = useMemo(() => filterPresets(bounds.min, bounds.max), [bounds.min, bounds.max]);
  const symbolOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return symbols;
    return symbols.filter((code) => {
      const label = formatSymbolLabel(code, names).toLowerCase();
      return code.toLowerCase().includes(needle) || label.includes(needle);
    });
  }, [symbols, query, names]);
  const selectOptions = symbol && !symbolOptions.includes(symbol) ? [symbol, ...symbolOptions] : symbolOptions;
  const filtered = useMemo(
    () => merged.filter((row) => matchesRebalance(row, from, to, symbol)),
    [merged, from, to, symbol],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage],
  );
  const filterActive = Boolean(from || to || symbol);

  useEffect(() => {
    setPage(0);
  }, [from, to, symbol]);

  if (!merged.length) {
    return <div className="empty muted">这次回测没有日志。</div>;
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setSymbol("");
    setQuery("");
  }

  return (
    <div className="rebalance-pane">
      <div className="blotter-filter">
        <label>
          日期
          <DateRangePicker
            start={from}
            end={to}
            min={bounds.min}
            max={bounds.max}
            allowEmpty
            presets={datePresets}
            placeholder="全部日期"
            onChange={(nextStart, nextEnd) => {
              setFrom(nextStart);
              setTo(nextEnd);
            }}
          />
        </label>
        <label className="blotter-filter-symbol">
          股票
          {symbols.length > 8 ? (
            <input value={query} placeholder="搜索名称或代码" onChange={(event) => setQuery(event.target.value)} />
          ) : null}
          <select value={symbol} onChange={(event) => setSymbol(event.target.value)}>
            <option value="">全部</option>
            {selectOptions.map((code) => (
              <option key={code} value={code}>
                {formatSymbolLabel(code, names)}
              </option>
            ))}
          </select>
        </label>
        {filterActive ? (
          <button type="button" className="btn ghost" onClick={clearFilters}>
            清除筛选
          </button>
        ) : null}
        <span className="blotter-filter-count">
          {filterActive ? `筛选 ${filtered.length} / ${merged.length} 条` : `共 ${merged.length} 条`}
        </span>
      </div>
      {filtered.length ? (
        <RebalanceTable rows={pageRows} names={names} orders={orders} onSelectSymbol={onSelectSymbol} />
      ) : (
        <div className="empty muted">没有符合筛选条件的记录。</div>
      )}
      {filtered.length > PAGE_SIZE ? (
        <Pager page={safePage} totalPages={totalPages} total={filtered.length} onChange={setPage} />
      ) : null}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="blotter-pager">
      <span>共 {total} 条</span>
      <button type="button" disabled={page <= 0} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      <label>
        第
        <input
          type="number"
          min={1}
          max={totalPages}
          value={page + 1}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onChange(Math.min(totalPages, Math.max(1, Math.round(next))) - 1);
          }}
        />
        / {totalPages} 页
      </label>
      <button type="button" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>
        下一页
      </button>
    </div>
  );
}

export function RebalanceTable({
  rows,
  names,
  orders = [],
  onSelectSymbol,
  mode = "page",
  filledOnly = false,
}: {
  rows: RebalanceEvent[];
  names: Record<string, string>;
  orders?: Record<string, unknown>[];
  onSelectSymbol: (symbol: string) => void;
  mode?: "page" | "day";
  filledOnly?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const display = useMemo(
    () => expandActionRows(rows, orders, filledOnly),
    [filledOnly, orders, rows],
  );
  useEffect(() => {
    setOpen(null);
  }, [rows]);
  const hideDate = mode === "day";
  if (!display.length) {
    return <div className="empty muted">{hideDate ? (filledOnly ? "当日无成交调仓。" : "当日无调仓。") : "这次回测没有日志。"}</div>;
  }
  const columns = hideDate ? 10 : 13;
  return (
    <div className={`table-wrap blotter${hideDate ? "" : " analysis-table"}`}>
      <table className="blotter-table">
        <thead>
          <tr>
            {hideDate ? null : <th>日期</th>}
            {hideDate ? null : <th>动作</th>}
            <th>标的</th>
            <th>方向</th>
            <th className="num">价格</th>
            <th className="num">数量</th>
            <th className="num">金额</th>
            <th className="num">
              <span className="th-inner">
                佣金
                <Hint text="券商佣金，含最低佣金。" />
              </span>
            </th>
            <th className="num">
              <span className="th-inner">
                印花税
                <Hint text="卖出收取的印花税。" />
              </span>
            </th>
            <th className="num">
              <span className="th-inner">
                过户费
                <Hint text="买卖都收的过户费。" />
              </span>
            </th>
            <th className="num">
              <span className="th-inner">
                滑点费
                <Hint text="成交价相对未滑点价格的不利差额。" />
              </span>
            </th>
            <th>
              <span className="th-inner">
                原因
                <Hint text="策略里 reason= 或 record_rebalance 写入的说明，以及下单未成交时的原因；未写时由平台按目标仓位自动生成。" />
              </span>
            </th>
            {hideDate ? null : <th>结果</th>}
          </tr>
        </thead>
        <tbody>
          {display.map((item, index) => {
            const { event: row, eventIndex, fill } = item;
            const symbol = fill?.symbol || eventSymbols(row)[0];
            const symbols = symbol ? [symbol] : eventSymbols(row);
            const expandable = Boolean(row.scores || row.plan || (row.targets && Object.keys(row.targets).length > 1));
            const opened = open === eventIndex;
            const firstOfEvent = index === 0 || display[index - 1].eventIndex !== eventIndex;
            return (
              <RowPair
                key={`${row.time}-${row.method}-${eventIndex}-${index}`}
                opened={opened && firstOfEvent}
                expandable={expandable && firstOfEvent}
                colSpan={columns}
                onToggle={() => setOpen(opened ? null : eventIndex)}
                detail={<EventDetail row={row} names={names} onSelectSymbol={onSelectSymbol} />}
              >
                {hideDate ? null : <td>{row.time || "—"}</td>}
                {hideDate ? null : <td>{METHOD_LABEL[String(row.method || "")] || row.method || "调仓"}</td>}
                <td>
                  {symbols.length ? (
                    <SymbolList symbols={symbols} names={names} onSelectSymbol={onSelectSymbol} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className={sideClass(fill?.side)}>{fill?.side ? translate(SIDE_LABEL, fill.side) : "—"}</td>
                <td className="num">{fill?.price != null ? formatMetric(fill.price, "money") : "—"}</td>
                <td className="num">{formatQuantity(fill?.quantity)}</td>
                <td className="num">{fill?.value != null ? formatMetric(fill.value, "money") : "—"}</td>
                <td className="num">{formatFee(fill?.commission)}</td>
                <td className="num">{formatFee(fill?.stampTax)}</td>
                <td className="num">{formatFee(fill?.transferFee)}</td>
                <td className="num">{formatFee(fill?.slippage)}</td>
                <td className="reason-cell" title={eventReason(row)}>
                  {eventReason(row) || "—"}
                </td>
                {hideDate ? null : <td>{statusText(row)}</td>}
              </RowPair>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowPair({
  children,
  opened,
  expandable,
  colSpan,
  onToggle,
  detail,
}: {
  children: ReactNode;
  opened: boolean;
  expandable: boolean;
  colSpan: number;
  onToggle: () => void;
  detail: ReactNode;
}) {
  return (
    <>
      <tr className={expandable ? "clickable" : undefined} onClick={expandable ? onToggle : undefined}>
        {children}
      </tr>
      {opened ? (
        <tr className="analysis-detail">
          <td colSpan={colSpan}>{detail}</td>
        </tr>
      ) : null}
    </>
  );
}

function EventDetail({
  row,
  names,
  onSelectSymbol,
}: {
  row: RebalanceEvent;
  names: Record<string, string>;
  onSelectSymbol: (symbol: string) => void;
}) {
  const scores = row.scores ? Object.entries(row.scores) : [];
  const targets = row.targets ? Object.entries(row.targets) : [];
  return (
    <div className="analysis-detail-body">
      {targets.length ? (
        <div>
          <strong>目标</strong>
          <span>{formatTargets(row.targets, names)}</span>
        </div>
      ) : null}
      {scores.length ? (
        <div>
          <strong>分数</strong>
          <span>
            {scores
              .slice(0, 12)
              .map(([symbol, score]) => `${formatSymbolLabel(symbol, names)} ${formatScore(score)}`)
              .join(" · ")}
          </span>
        </div>
      ) : null}
      {row.plan ? (
        <div>
          <strong>计划</strong>
          <span>
            {planSummary(row.plan)}
            {typeof row.plan.reject_reason === "string" && row.plan.reject_reason
              ? `；拒绝：${row.plan.reject_reason}`
              : ""}
          </span>
        </div>
      ) : null}
      {row.selected?.length ? (
        <div>
          <strong>入选</strong>
          <SymbolList symbols={row.selected} names={names} onSelectSymbol={onSelectSymbol} />
        </div>
      ) : null}
    </div>
  );
}

export function LogTable({ rows }: { rows: { time?: string; message?: string; level?: number }[] }) {
  if (!rows.length) return <div className="empty">策略没有调用 self.log()。</div>;
  return (
    <div className="table-wrap blotter analysis-table">
      <table className="blotter-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>日志</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.time}-${index}`}>
              <td>{row.time || "—"}</td>
              <td className="reason-cell">{row.message || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IndicatorTable({
  points,
  names,
  onSelectSymbol,
}: {
  points: IndicatorPoint[];
  names: Record<string, string>;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const visible = useMemo(() => points, [points]);
  if (!points.length) return <div className="empty">策略没有调用 record_indicator()。</div>;
  const viewport = ROW_HEIGHT * 12;
  const { start, end } = virtualWindow(visible.length, scrollTop, viewport, ROW_HEIGHT);
  const pad: ReactNode[] = [];
  if (start > 0) {
    pad.push(
      <tr key="pad-top" className="virtual-pad">
        <td colSpan={4} style={{ height: start * ROW_HEIGHT }} />
      </tr>,
    );
  }
  for (let index = start; index < end; index += 1) {
    const point = visible[index];
    const symbol = String(point.symbol || "");
    pad.push(
      <tr key={`${point.name}-${symbol}-${point.time}-${index}`}>
        <td>{String(point.time || point.timestamp || "—").slice(0, 10)}</td>
        <td>
          {symbol ? (
            <button type="button" className="symbol-link" onClick={() => onSelectSymbol(symbol)}>
              {formatSymbolLabel(symbol, names)}
            </button>
          ) : (
            "—"
          )}
        </td>
        <td>{point.name || "—"}</td>
        <td className="num">{formatScore(point.value)}</td>
      </tr>,
    );
  }
  if (end < visible.length) {
    pad.push(
      <tr key="pad-bottom" className="virtual-pad">
        <td colSpan={4} style={{ height: (visible.length - end) * ROW_HEIGHT }} />
      </tr>,
    );
  }
  return (
    <div
      className="table-wrap blotter analysis-table virtual-blotter"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <table className="blotter-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>标的</th>
            <th>信号</th>
            <th className="num">值</th>
          </tr>
        </thead>
        <tbody>{pad}</tbody>
      </table>
    </div>
  );
}

function SymbolList({
  symbols,
  names,
  onSelectSymbol,
}: {
  symbols: string[];
  names: Record<string, string>;
  onSelectSymbol: (symbol: string) => void;
}) {
  const shown = symbols.slice(0, 6);
  return (
    <span className="symbol-list">
      {shown.map((symbol, index) => (
        <span key={symbol}>
          {index ? " · " : null}
          <button
            type="button"
            className="symbol-link"
            onClick={(event) => {
              event.stopPropagation();
              onSelectSymbol(symbol);
            }}
          >
            {formatSymbolLabel(symbol, names)}
          </button>
        </span>
      ))}
      {symbols.length > shown.length ? ` 等${symbols.length}只` : null}
    </span>
  );
}

const TARGET_META_KEYS = new Set(["top_n", "scores", "target_percent", "target_value", "target"]);

type ActionFill = {
  symbol: string;
  side: string;
  price: number | null;
  quantity: number | null;
  value: number | null;
  commission: number | null;
  stampTax: number | null;
  transferFee: number | null;
  slippage: number | null;
};

type DisplayRow = {
  event: RebalanceEvent;
  eventIndex: number;
  fill?: ActionFill;
};

function expandActionRows(
  rows: RebalanceEvent[],
  orders: Record<string, unknown>[],
  filledOnly = false,
): DisplayRow[] {
  const used = orders.map(() => false);
  const display: DisplayRow[] = [];
  rows.forEach((event, eventIndex) => {
    const fills = filledOnly
      ? takeFills(event, orders, used).filter((fill) => (fill.quantity ?? 0) > 0)
      : takeFills(event, orders, used);
    if (!fills.length) {
      if (filledOnly) return;
      display.push({ event, eventIndex, fill: rejectFill(event) });
      return;
    }
    for (const fill of fills) display.push({ event, eventIndex, fill });
  });
  return display;
}

export function mergeLogEvents(
  rows: RebalanceEvent[],
  rejects: RejectRow[],
  orders: Record<string, unknown>[] = [],
): RebalanceEvent[] {
  const covered = new Set<string>();
  for (const row of rows) {
    if (String(row.status || "").toLowerCase() !== "rejected") continue;
    const day = dayKey(row.time);
    for (const symbol of involvedSymbols(row)) covered.add(`${day}|${symbol}`);
  }
  const extra: RebalanceEvent[] = [];
  const rejectKeys = new Set(covered);
  for (const row of rejects) {
    const day = dayKey(row.time);
    const symbol = String(row.symbol || "");
    if (symbol) rejectKeys.add(`${day}|${symbol}`);
    if (symbol && covered.has(`${day}|${symbol}`)) continue;
    extra.push(toRejectEvent(row));
  }
  const merged = [...rows, ...extra].sort((left, right) => dayKey(right.time).localeCompare(dayKey(left.time)));
  if (!orders.length) return merged;
  return merged.filter((row) => {
    if (String(row.status || "").toLowerCase() !== "submitted") return true;
    if (!(row.order_ids?.length ?? 0)) return true;
    const fills = takeFills(row, orders, orders.map(() => false));
    if (fills.length) return true;
    const day = dayKey(row.time);
    const symbols = involvedSymbols(row);
    if (!symbols.length) return true;
    return !symbols.every((symbol) => rejectKeys.has(`${day}|${symbol}`));
  });
}

function toRejectEvent(row: RejectRow): RebalanceEvent {
  return {
    time: row.time,
    method: "rejected",
    reason: row.reject_reason || "",
    status: "rejected",
    selected: row.symbol ? [row.symbol] : [],
    plan: {
      reject_reason: row.reject_reason,
      side: row.side,
      quantity: row.quantity,
    },
  };
}

function rejectFill(event: RebalanceEvent): ActionFill | undefined {
  if (String(event.status || "").toLowerCase() !== "rejected") return undefined;
  const symbol = event.selected?.[0] || involvedSymbols(event)[0];
  if (!symbol) return undefined;
  const plan = event.plan ?? {};
  const quantity = Number(plan.quantity);
  return {
    symbol,
    side: String(plan.side || "").toLowerCase(),
    price: null,
    quantity: Number.isFinite(quantity) ? quantity : null,
    value: null,
    commission: null,
    stampTax: null,
    transferFee: null,
    slippage: null,
  };
}

function takeFills(
  row: RebalanceEvent,
  orders: Record<string, unknown>[],
  used: boolean[],
): ActionFill[] {
  const symbols = new Set(involvedSymbols(row).filter((symbol) => !TARGET_META_KEYS.has(symbol)));
  if (!symbols.size) return [];
  const day = dayKey(row.time);
  const side = preferredSide(row);
  const limit = fillLimit(row);
  const fills: ActionFill[] = [];
  for (let index = 0; index < orders.length && fills.length < limit; index += 1) {
    if (used[index]) continue;
    const order = orders[index];
    if (String(order.status ?? "filled").toLowerCase() !== "filled") continue;
    const created = dayKey(String(order.created_at ?? ""));
    const filledAt = orderFillDay(order);
    if (created !== day && filledAt !== day) continue;
    const symbol = String(order.symbol ?? "");
    if (!symbols.has(symbol)) continue;
    const orderSide = String(order.side ?? "").toLowerCase();
    if (side && orderSide && orderSide !== side) continue;
    used[index] = true;
    fills.push(toFill(order));
  }
  return fills;
}

function toFill(order: Record<string, unknown>): ActionFill {
  const quantity = Number(order.filled_quantity ?? order.quantity);
  const price = Number(order.avg_price);
  const filledValue = Number(order.filled_value);
  const value =
    Number.isFinite(filledValue) && filledValue > 0
      ? filledValue
      : Number.isFinite(price) && Number.isFinite(quantity)
        ? price * quantity
        : NaN;
  return {
    symbol: String(order.symbol ?? ""),
    side: String(order.side ?? "").toLowerCase(),
    price: Number.isFinite(price) && price > 0 ? price : null,
    quantity: Number.isFinite(quantity) ? quantity : null,
    value: Number.isFinite(value) && value > 0 ? value : null,
    commission: feeAmount(order.commission_fee ?? order.commission),
    stampTax: feeAmount(order.stamp_tax),
    transferFee: feeAmount(order.transfer_fee),
    slippage: feeAmount(order.slippage_cost),
  };
}

function feeAmount(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatFee(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatMetric(value, "money");
}

function preferredSide(row: RebalanceEvent): string | null {
  const targets = row.targets;
  if (!targets) return null;
  const values = Object.entries(targets)
    .filter(([key]) => !TARGET_META_KEYS.has(key))
    .map(([, value]) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 1 && Math.abs(values[0]) < 1e-12) return "sell";
  return null;
}

function fillLimit(row: RebalanceEvent): number {
  const ids = row.order_ids?.length ?? 0;
  if (ids > 0) return ids;
  const method = String(row.method || "");
  if (method.startsWith("order_target") || method === "close_position") return 1;
  return Number.POSITIVE_INFINITY;
}

function formatQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value - Math.round(value)) < 1e-6) {
    return Math.round(value).toLocaleString("zh-CN");
  }
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function sideClass(side?: string): string {
  if (side === "buy" || side === "long") return "pos";
  if (side === "sell" || side === "short") return "neg";
  return "";
}

function eventSymbols(row: RebalanceEvent): string[] {
  if (row.selected?.length) return row.selected.map(String);
  const targets = row.targets;
  if (!targets) return [];
  const entries = Object.entries(targets).filter(([key]) => !TARGET_META_KEYS.has(key));
  const held = entries.filter(([, value]) => isHeld(value)).map(([key]) => key);
  if (held.length) return held;
  return entries.filter(([, value]) => typeof value === "number").map(([key]) => key);
}

function collectFilterSymbols(rows: RebalanceEvent[], names: Record<string, string>): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const symbol of involvedSymbols(row)) seen.add(symbol);
  }
  return [...seen].sort((a, b) => formatSymbolLabel(a, names).localeCompare(formatSymbolLabel(b, names), "zh-CN"));
}

function dateBounds(rows: RebalanceEvent[]): { min?: string; max?: string } {
  let min = "";
  let max = "";
  for (const row of rows) {
    const day = dayKey(row.time);
    if (!day) continue;
    if (!min || day < min) min = day;
    if (!max || day > max) max = day;
  }
  return { min: min || undefined, max: max || undefined };
}

function matchesRebalance(row: RebalanceEvent, from: string, to: string, symbol: string): boolean {
  const day = dayKey(row.time);
  if (!day) return !(from || to);
  if (from && day < from) return false;
  if (to && day > to) return false;
  if (symbol && !involvedSymbols(row).includes(symbol)) return false;
  return true;
}

function involvedSymbols(row: RebalanceEvent): string[] {
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text && !TARGET_META_KEYS.has(text)) seen.add(text);
  };
  for (const symbol of row.selected ?? []) add(symbol);
  if (row.targets) {
    for (const key of Object.keys(row.targets)) add(key);
  }
  const plan = row.plan;
  if (plan) {
    for (const key of ["reduce_legs", "increase_legs", "skipped_legs"]) {
      const legs = plan[key];
      if (!Array.isArray(legs)) continue;
      for (const leg of legs) {
        if (leg && typeof leg === "object" && "symbol" in (leg as object)) {
          add((leg as { symbol?: unknown }).symbol);
        }
      }
    }
  }
  return [...seen];
}

function eventReason(row: RebalanceEvent): string {
  const reason = String(row.reason || "").trim();
  if (reason) return reason;
  const reject = row.plan && typeof row.plan.reject_reason === "string" ? row.plan.reject_reason.trim() : "";
  return reject;
}

function isHeld(value: unknown): boolean {
  if (typeof value === "number") return Math.abs(value) > 1e-12;
  if (value && typeof value === "object") return false;
  return Boolean(value);
}

function formatTargets(targets: Record<string, unknown> | null | undefined, names: Record<string, string>): string {
  if (!targets) return "—";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(targets)) {
    if (key === "scores" || key === "top_n") continue;
    if (typeof value === "number" && Math.abs(value) <= 1) {
      parts.push(`${formatSymbolLabel(key, names)} ${(value * 100).toFixed(0)}%`);
    } else {
      parts.push(`${formatSymbolLabel(key, names)} ${formatScore(value)}`);
    }
    if (parts.length >= 8) break;
  }
  if (typeof targets.top_n === "number") parts.unshift(`Top${targets.top_n}`);
  return parts.join(" · ") || "—";
}

function formatScore(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) >= 10 ? value.toFixed(2) : value.toFixed(4);
  }
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function statusText(row: RebalanceEvent): string {
  const status = STATUS_LABEL[String(row.status || "")] || row.status || "—";
  const n = row.order_ids?.length ?? 0;
  if (n > 0) return `${status} · ${n} 笔`;
  return status || "—";
}

function planSummary(plan: Record<string, unknown>): string {
  const reduce = Array.isArray(plan.reduce_legs) ? plan.reduce_legs.length : 0;
  const increase = Array.isArray(plan.increase_legs) ? plan.increase_legs.length : 0;
  const skipped = Array.isArray(plan.skipped_legs) ? plan.skipped_legs.length : 0;
  const parts = [];
  if (reduce) parts.push(`减仓 ${reduce}`);
  if (increase) parts.push(`加仓 ${increase}`);
  if (skipped) parts.push(`跳过 ${skipped}`);
  return parts.join(" · ") || String(plan.status || "计划");
}
