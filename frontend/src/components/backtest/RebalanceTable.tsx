import { type ReactNode, useEffect, useMemo, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import DateRangePicker, { filterPresets } from "./DateRangePicker";
import Hint from "./Hint";
import { dayKey, formatMetric, formatSymbolLabel, SIDE_LABEL, translate } from "./format";
import { virtualWindow } from "./VirtualList";

const ROW_HEIGHT = 34;
const LOG_PAGE_SIZE = 100;

export type StrategyLog = { time?: string; message?: string; level?: number };

export function filterStrategyLogs(rows: StrategyLog[], from = "", to = ""): StrategyLog[] {
  if (!from && !to) return rows;
  return rows.filter((row) => {
    const day = dayKey(row.time);
    if (!day) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

export type LogEntryKind = "strategy" | "rebalance" | "fill" | "reject";

export type LogEntry = {
  key: string;
  time: string;
  day: string;
  kind: LogEntryKind;
  tag: string;
  message: string;
  symbols: string[];
  level?: number;
  haystack: string;
};

const LOG_TAG: Record<LogEntryKind, string> = {
  strategy: "日志",
  rebalance: "调仓",
  fill: "成交",
  reject: "拒单",
};

function makeLogEntry(
  key: string,
  time: string,
  kind: LogEntryKind,
  message: string,
  symbols: string[],
  names: Record<string, string>,
  level?: number,
): LogEntry {
  const day = dayKey(time);
  const haystack = [
    time,
    day,
    LOG_TAG[kind],
    message,
    ...symbols.flatMap((code) => [code, formatSymbolLabel(code, names)]),
  ]
    .join(" ")
    .toLowerCase();
  return { key, time, day, kind, tag: LOG_TAG[kind], message, symbols, level, haystack };
}

/** 把策略日志、调仓事件、成交明细与拒单合并成一条按时间倒序的原始日志流。 */
export function buildLogEntries(
  rows: RebalanceEvent[] = [],
  rejects: RejectRow[] = [],
  orders: Record<string, unknown>[] = [],
  logs: StrategyLog[] = [],
  names: Record<string, string> = {},
): LogEntry[] {
  const entries: LogEntry[] = [];
  mergeLogEvents(rows, rejects, orders, logs).forEach((row, index) => {
    const time = String(row.time || "");
    if (isStrategyLog(row)) {
      entries.push(makeLogEntry(`strategy-${index}`, time, "strategy", eventReason(row) || "—", [], names, row.level));
      return;
    }
    const symbols = involvedSymbols(row);
    if (String(row.status || "").toLowerCase() === "rejected") {
      const plan = row.plan ?? {};
      const parts = [
        "拒单",
        plan.side ? translate(SIDE_LABEL, plan.side) : "",
        symbols.length ? formatSymbolsText(symbols, names) : "",
        formatOrderQuantity(plan.quantity),
        eventReason(row),
      ].filter(Boolean);
      entries.push(makeLogEntry(`reject-${index}`, time, "reject", parts.join(" "), symbols, names));
      return;
    }
    const parts = [
      METHOD_LABEL[String(row.method || "")] || row.method || "调仓",
      symbols.length ? formatSymbolsText(symbols, names) : "",
      eventReason(row),
      statusText(row),
    ].filter(Boolean);
    entries.push(makeLogEntry(`rebalance-${index}`, time, "rebalance", parts.join(" · "), symbols, names));
  });

  orders.forEach((order, index) => {
    if (String(order.status ?? "filled").toLowerCase() !== "filled") return;
    const quantity = Number(order.filled_quantity ?? order.quantity);
    if (Number.isFinite(quantity) && quantity <= 0) return;
    const symbol = String(order.symbol ?? "");
    const time = String(order.updated_at ?? order.created_at ?? order.time ?? "");
    const fill = toFill(order);
    const parts = [
      "成交",
      fill.side ? translate(SIDE_LABEL, fill.side) : "",
      symbol ? formatSymbolLabel(symbol, names) : "",
      fill.quantity != null ? `${formatQuantity(fill.quantity)}股` : "",
      fill.price != null ? `@ ${formatMetric(fill.price, "money")}` : "",
      fill.value != null ? `金额 ${formatMetric(fill.value, "money")}` : "",
      ...formatFeeParts(fill),
      fillReasonForOrder(order, rows),
    ].filter(Boolean);
    entries.push(makeLogEntry(`fill-${index}`, time, "fill", parts.join(" "), symbol ? [symbol] : [], names));
  });

  return entries.sort((left, right) => {
    const byDay = (right.day || "").localeCompare(left.day || "");
    if (byDay !== 0) return byDay;
    return right.time.localeCompare(left.time);
  });
}

export function filterLogEntries(
  entries: LogEntry[],
  options: { from?: string; to?: string; symbol?: string; query?: string } = {},
): LogEntry[] {
  const { from = "", to = "", symbol = "", query = "" } = options;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (from || to) {
      if (!entry.day) return false;
      if (from && entry.day < from) return false;
      if (to && entry.day > to) return false;
    }
    if (symbol && !entry.symbols.includes(symbol)) return false;
    if (terms.length && !terms.every((term) => entry.haystack.includes(term))) return false;
    return true;
  });
}

function collectLogSymbols(entries: LogEntry[], names: Record<string, string>): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const symbol of entry.symbols) seen.add(symbol);
  }
  return [...seen].sort((a, b) => formatSymbolLabel(a, names).localeCompare(formatSymbolLabel(b, names), "zh-CN"));
}

function formatSymbolsText(symbols: string[], names: Record<string, string>): string {
  const shown = symbols.slice(0, 8).map((code) => formatSymbolLabel(code, names));
  return symbols.length > shown.length ? `${shown.join("、")} 等${symbols.length}只` : shown.join("、");
}

function formatOrderQuantity(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `${formatQuantity(number)}股`;
}

function formatFeeParts(fill: ActionFill): string[] {
  const parts: string[] = [];
  if (fill.commission) parts.push(`佣金 ${formatFee(fill.commission)}`);
  if (fill.stampTax) parts.push(`印花税 ${formatFee(fill.stampTax)}`);
  if (fill.transferFee) parts.push(`过户费 ${formatFee(fill.transferFee)}`);
  if (fill.slippage) parts.push(`滑点 ${formatFee(fill.slippage)}`);
  return parts;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 日线行情的时间戳固定落在 00:00 UTC（北京 08:00），不是真实成交时刻，日志里只保留日期。 */
function dailyStampDate(text: string): string | null {
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  if (!match) return null;
  return match[2] === "00:00:00" || match[2] === "08:00:00" ? match[1] : null;
}

/** 服务日志风格的时间：去掉 ISO 的 T、毫秒与时区后缀，保留原始日期/时间。 */
export function formatLogTime(raw: string): string {
  if (!raw) return "—";
  const text = raw.replace("T", " ").replace(/(\.\d+)?([+-]\d{2}:?\d{2}|Z)$/, "");
  const trimmed = text.trim() || raw;
  return dailyStampDate(trimmed) ?? trimmed;
}

function renderLogMessage(
  entry: LogEntry,
  names: Record<string, string>,
  onSelectSymbol: (symbol: string) => void,
): ReactNode {
  const labelToCode = new Map<string, string>();
  for (const code of entry.symbols) {
    const label = formatSymbolLabel(code, names);
    if (label && label !== code) labelToCode.set(label, code);
  }
  if (!labelToCode.size) return entry.message;
  const pattern = [...labelToCode.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|");
  return entry.message.split(new RegExp(`(${pattern})`)).map((part, index) => {
    const code = labelToCode.get(part);
    if (!code) return <span key={index}>{part}</span>;
    return (
      <button key={index} type="button" className="symbol-link" onClick={() => onSelectSymbol(code)}>
        {part}
      </button>
    );
  });
}

function LogLine({
  entry,
  names,
  onSelectSymbol,
}: {
  entry: LogEntry;
  names: Record<string, string>;
  onSelectSymbol: (symbol: string) => void;
}) {
  const warn = entry.level != null && entry.level >= 30;
  const error = entry.level != null && entry.level >= 40;
  return (
    <div className={`log-line log-${entry.kind}${error ? " log-error" : warn ? " log-warn" : ""}`}>
      <span className="log-time">{formatLogTime(entry.time)}</span>
      <span className="log-tag">{entry.tag}</span>
      <span className="log-text">{renderLogMessage(entry, names, onSelectSymbol)}</span>
    </div>
  );
}

export type RebalanceEvent = {
  time?: string;
  method?: string;
  reason?: string;
  level?: number;
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
  logs = [],
  names,
  onSelectSymbol,
}: {
  rows: RebalanceEvent[];
  rejects?: RejectRow[];
  orders?: Record<string, unknown>[];
  logs?: StrategyLog[];
  names: Record<string, string>;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [symbol, setSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);

  const entries = useMemo(
    () => buildLogEntries(rows, rejects, orders, logs, names),
    [rows, rejects, orders, logs, names],
  );
  const symbols = useMemo(() => collectLogSymbols(entries, names), [entries, names]);
  const bounds = useMemo(() => dateBounds(entries), [entries]);
  const datePresets = useMemo(() => filterPresets(bounds.min, bounds.max), [bounds.min, bounds.max]);
  const filtered = useMemo(
    () => filterLogEntries(entries, { from, to, symbol, query }),
    [entries, from, to, symbol, query],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageEntries = useMemo(
    () => filtered.slice(safePage * LOG_PAGE_SIZE, safePage * LOG_PAGE_SIZE + LOG_PAGE_SIZE),
    [filtered, safePage],
  );
  const filterActive = Boolean(from || to || symbol || query.trim());

  useEffect(() => {
    setPage(0);
  }, [from, to, symbol, query]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLogs() {
    const text = filtered
      .map((entry) => `${formatLogTime(entry.time)}\t${entry.tag}\t${entry.message}`)
      .join("\n");
    try {
      await copyToClipboard(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setSymbol("");
    setQuery("");
  }

  if (!entries.length) {
    return <div className="empty muted">这次回测没有日志。</div>;
  }

  return (
    <div className="rebalance-pane">
      <div className="blotter-filter">
        <label className="blotter-filter-search">
          搜索
          <input
            value={query}
            placeholder="时间 / 标的 / 原因 / 内容"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
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
        <label>
          标的
          <select value={symbol} onChange={(event) => setSymbol(event.target.value)}>
            <option value="">全部</option>
            {symbols.map((code) => (
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
        {filtered.length ? (
          <button type="button" className="btn ghost" onClick={copyLogs}>
            {copied ? "已复制" : "复制"}
          </button>
        ) : null}
        <span className="blotter-filter-count">
          {filterActive ? `筛选 ${filtered.length} / ${entries.length} 条` : `共 ${entries.length} 条`}
        </span>
      </div>
      {filtered.length ? (
        <div className="log-stream" role="log" aria-label="日志">
          {pageEntries.map((entry) => (
            <LogLine key={entry.key} entry={entry} names={names} onSelectSymbol={onSelectSymbol} />
          ))}
        </div>
      ) : (
        <div className="empty muted">没有符合筛选条件的日志。</div>
      )}
      {filtered.length > LOG_PAGE_SIZE ? (
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
            if (isStrategyLog(row)) {
              const message = eventReason(row) || "—";
              return (
                <tr key={`${row.time}-log-${eventIndex}-${index}`}>
                  {hideDate ? null : <td>{row.time || "—"}</td>}
                  {hideDate ? null : <td>{METHOD_LABEL.rebalance_log}</td>}
                  <td className="reason-cell log-message" colSpan={hideDate ? columns : columns - 2} title={message}>
                    {message}
                  </td>
                </tr>
              );
            }
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
  logs: StrategyLog[] = [],
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
  const notes = logs
    .filter((row) => String(row.message ?? "").trim() || row.time)
    .map((row): RebalanceEvent => ({
      time: row.time,
      method: "rebalance_log",
      reason: String(row.message ?? ""),
      level: row.level,
    }));
  const merged = [...rows, ...extra, ...notes].sort((left, right) => {
    const byDay = dayKey(right.time).localeCompare(dayKey(left.time));
    if (byDay !== 0) return byDay;
    return String(right.time || "").localeCompare(String(left.time || ""));
  });
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

function dateBounds(rows: { time?: string }[]): { min?: string; max?: string } {
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

export function involvedSymbols(row: RebalanceEvent): string[] {
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

function isStrategyLog(row: RebalanceEvent): boolean {
  return String(row.method || "") === "rebalance_log";
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
