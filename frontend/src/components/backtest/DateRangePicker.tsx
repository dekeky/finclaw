import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type DateRangePreset = {
  id: string;
  label: string;
  range: () => { start: string; end: string } | null;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default function DateRangePicker({
  start,
  end,
  min,
  max,
  allowEmpty = false,
  disabled = false,
  presets = [],
  placeholder = "全部日期",
  onChange,
}: {
  start: string;
  end: string;
  min?: string;
  max?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  presets?: DateRangePreset[];
  placeholder?: string;
  onChange: (start: string, end: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const [hover, setHover] = useState("");
  const [view, setView] = useState(() => monthOf(start || end || max || today()));
  const [box, setBox] = useState({ top: 0, left: 0, width: 0 });
  const [dual, setDual] = useState(true);

  useEffect(() => {
    if (!open) return;
    setDraftStart(start);
    setDraftEnd(end);
    setHover("");
    setView(monthOf(start || end || max || today()));
  }, [open, start, end, max]);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = dual ? 492 : 256;
      const height = 336;
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
      setBox({ top, left, width });
      setDual(window.innerWidth >= 560);
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, dual]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onDown(event: MouseEvent) {
      const node = event.target as Node;
      if (triggerRef.current?.contains(node) || popRef.current?.contains(node)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const preview = useMemo(() => previewRange(draftStart, draftEnd, hover), [draftStart, draftEnd, hover]);
  const months = dual ? [view, shiftMonth(view, 1)] : [view];
  const label = start && end ? `${start} 至 ${end}` : placeholder;
  const activePreset = presets.find((item) => {
    const range = item.range();
    if (!range) return !start && !end;
    return range.start === start && range.end === end;
  });

  function pick(day: string) {
    if (isDisabled(day, min, max)) return;
    if (!draftStart || draftEnd) {
      setDraftStart(day);
      setDraftEnd("");
      setHover("");
      return;
    }
    const nextStart = draftStart < day ? draftStart : day;
    const nextEnd = draftStart < day ? day : draftStart;
    onChange(nextStart, nextEnd);
    setOpen(false);
  }

  function applyPreset(preset: DateRangePreset) {
    const range = preset.range();
    if (!range) {
      onChange("", "");
      setOpen(false);
      return;
    }
    onChange(clampDay(range.start, min, max), clampDay(range.end, min, max));
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`date-range-trigger${open ? " open" : ""}${!start || !end ? " empty" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarIcon />
        <span>{label}</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={popRef}
              className={`fquant-ui date-range-pop${dual ? " dual" : ""}`}
              role="dialog"
              aria-label="选择日期区间"
              style={{ top: box.top, left: box.left, width: box.width || undefined }}
            >
              {presets.length ? (
                <div className="date-range-presets">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={activePreset?.id === preset.id ? "active" : ""}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="date-range-months">
                {months.map((month, index) => (
                  <MonthGrid
                    key={`${month.y}-${month.m}`}
                    year={month.y}
                    month={month.m}
                    min={min}
                    max={max}
                    start={preview.start}
                    end={preview.end}
                    picking={!draftEnd}
                    onPick={pick}
                    onHover={setHover}
                    showPrev={index === 0}
                    showNext={index === months.length - 1}
                    onPrev={() => setView((current) => shiftMonth(current, -1))}
                    onNext={() => setView((current) => shiftMonth(current, 1))}
                  />
                ))}
              </div>
              <div className="date-range-foot">
                <span>
                  {preview.start && preview.end
                    ? `${preview.start} 至 ${preview.end}`
                    : preview.start
                      ? `${preview.start} 至 …`
                      : "先选开始日，再选结束日"}
                </span>
                {allowEmpty && (start || end) ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      onChange("", "");
                      setOpen(false);
                    }}
                  >
                    清除
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function backtestPresets(): DateRangePreset[] {
  const end = today();
  const year = new Date().getFullYear();
  return [
    { id: "1y", label: "近1年", range: () => ({ start: addYears(end, -1), end }) },
    { id: "3y", label: "近3年", range: () => ({ start: addYears(end, -3), end }) },
    { id: "5y", label: "近5年", range: () => ({ start: addYears(end, -5), end }) },
    { id: "ytd", label: "今年", range: () => ({ start: `${year}-01-01`, end }) },
    { id: "2010", label: "2010至今", range: () => ({ start: "2010-01-01", end }) },
  ];
}

export function filterPresets(min?: string, max?: string): DateRangePreset[] {
  const end = clampDay(today(), min, max);
  const year = new Date().getFullYear();
  const clip = (start: string) => ({
    start: clampDay(start, min, max),
    end,
  });
  return [
    { id: "all", label: "全部", range: () => null },
    { id: "1m", label: "近1月", range: () => clip(addMonths(end, -1)) },
    { id: "3m", label: "近3月", range: () => clip(addMonths(end, -3)) },
    { id: "1y", label: "近1年", range: () => clip(addYears(end, -1)) },
    { id: "ytd", label: "今年", range: () => clip(`${year}-01-01`) },
  ];
}

function MonthGrid({
  year,
  month,
  min,
  max,
  start,
  end,
  picking,
  onPick,
  onHover,
  showPrev,
  showNext,
  onPrev,
  onNext,
}: {
  year: number;
  month: number;
  min?: string;
  max?: string;
  start: string;
  end: string;
  picking: boolean;
  onPick: (day: string) => void;
  onHover: (day: string) => void;
  showPrev: boolean;
  showNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const cells = monthCells(year, month);
  const current = today();
  return (
    <div className="date-range-month">
      <div className="date-range-month-head">
        {showPrev ? (
          <button type="button" className="date-range-nav" aria-label="上个月" onClick={onPrev}>
            ‹
          </button>
        ) : (
          <span />
        )}
        <strong>
          {year}年{month}月
        </strong>
        {showNext ? (
          <button type="button" className="date-range-nav" aria-label="下个月" onClick={onNext}>
            ›
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="date-range-week">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="date-range-grid">
        {cells.map((day, index) => {
          if (!day) return <span key={`pad-${index}`} />;
          const disabled = isDisabled(day, min, max);
          const inRange = Boolean(start && end && day >= start && day <= end);
          const isStart = day === start;
          const isEnd = day === end;
          const isToday = day === current;
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              className={[
                inRange ? "in-range" : "",
                isStart ? "is-start" : "",
                isEnd ? "is-end" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onPick(day)}
              onMouseEnter={() => {
                if (picking && start) onHover(day);
              }}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 6h13M5 1.5v2.5M11 1.5v2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function today(): string {
  const now = new Date();
  return toDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function toDay(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function monthOf(day: string): { y: number; m: number } {
  const match = day.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  }
  return { y: Number(match[1]), m: Number(match[2]) };
}

function shiftMonth(month: { y: number; m: number }, delta: number): { y: number; m: number } {
  const date = new Date(month.y, month.m - 1 + delta, 1);
  return { y: date.getFullYear(), m: date.getMonth() + 1 };
}

function addMonths(day: string, delta: number): string {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return day;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const last = new Date(year, month - 1 + delta + 1, 0).getDate();
  const next = new Date(year, month - 1 + delta, Math.min(date, last));
  return toDay(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

function addYears(day: string, years: number): string {
  return addMonths(day, years * 12);
}

function clampDay(day: string, min?: string, max?: string): string {
  if (min && day < min) return min;
  if (max && day > max) return max;
  return day;
}

function isDisabled(day: string, min?: string, max?: string): boolean {
  return Boolean((min && day < min) || (max && day > max));
}

function monthCells(year: number, month: number): (string | null)[] {
  const padStart = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let index = 0; index < padStart; index += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) cells.push(toDay(year, month, day));
  return cells;
}

function previewRange(start: string, end: string, hover: string): { start: string; end: string } {
  if (start && end) return { start, end };
  if (start && hover) {
    return start < hover ? { start, end: hover } : { start: hover, end: start };
  }
  return { start, end: "" };
}
