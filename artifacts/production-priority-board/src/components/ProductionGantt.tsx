import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import type { ProductionOrder } from "@/lib/mock-data";
import { formatCalendarDate } from "@/lib/date-utils";
import {
  buildTicks,
  classifySchedule,
  computeDomain,
  resolvePxPerDay,
  todayDayNumber,
  type GanttZoom,
  type ScheduleInfo,
} from "@/lib/gantt-layout";
import { cn } from "@/lib/utils";

const LABEL_W = 300;
const ROW_H = 38;
const PAGE_SIZE = 60;

const ZOOMS: { value: GanttZoom; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
  { value: "quarter", label: "Quarters" },
];

const KIND_LABEL: Record<ScheduleInfo["kind"], string> = {
  complete: "Scheduled",
  reversed: "End before start",
  "start-only": "No build end",
  "end-only": "No build start",
  undated: "No build dates",
};

const fmtQty = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

export function ProductionGantt({
  orders,
  priorityById,
  onSelectOrder,
}: {
  orders: ProductionOrder[];
  priorityById: Map<string, number>;
  onSelectOrder: (order: ProductionOrder) => void;
}) {
  const [zoom, setZoom] = useState<GanttZoom>("fit");
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(900);
  const labelWidth = width < 640 ? 200 : LABEL_W;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [orders.length === 0]);

  const today = todayDayNumber();
  const rows = useMemo(
    () => orders.map((order) => ({ order, info: classifySchedule(order) })),
    [orders],
  );
  const counts = useMemo(() => {
    const c: Record<ScheduleInfo["kind"], number> = {
      complete: 0, reversed: 0, "start-only": 0, "end-only": 0, undated: 0,
    };
    rows.forEach((r) => c[r.info.kind]++);
    return c;
  }, [rows]);
  const domain = useMemo(() => computeDomain(rows.map((r) => r.info), today), [rows, today]);
  const pxPerDay = resolvePxPerDay(zoom, domain, Math.max(200, width - labelWidth - 16));
  const timelineW = Math.ceil(domain.days * pxPerDay);
  const ticks = useMemo(() => buildTicks(domain, pxPerDay), [domain, pxPerDay]);
  const x = (day: number) => (day - domain.start) * pxPerDay;

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  useEffect(() => setPage(0), [orders]);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const todayInRange = today >= domain.start && today < domain.end;

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: Math.max(0, x(today) - (width - labelWidth) / 2), behavior: "smooth" });
  };

  const onKey = (e: KeyboardEvent, order: ProductionOrder) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectOrder(order);
    }
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-sm border border-border/70 bg-card/30" data-testid="gantt-chart">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground" aria-label="Legend">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded-[1px] bg-primary/80" />Build window</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded-[1px] border border-red-400 bg-red-400/30" />Build end past due</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded-[1px] border border-dashed border-amber-300 bg-amber-300/10" />Incomplete / reversed</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 bg-sky-300" />Ship date</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 bg-red-400" />Ship past due</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-amber-200" />Today</span>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Timeline scale" className="flex rounded-sm border border-border">
            {ZOOMS.map((z) => (
              <button
                key={z.value}
                type="button"
                data-testid={`gantt-zoom-${z.value}`}
                aria-pressed={zoom === z.value}
                onClick={() => setZoom(z.value)}
                className={cn(
                  "px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                  zoom === z.value ? "bg-primary text-[#00281D]" : "text-muted-foreground hover:text-primary",
                )}
              >
                {z.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="gantt-scroll-today"
            onClick={scrollToToday}
            disabled={!todayInRange}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:border-primary/50 hover:text-primary disabled:opacity-40"
          >
            <Crosshair className="h-3 w-3" aria-hidden="true" /> Today
          </button>
        </div>
      </div>

      {/* Schedule quality summary */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border/50 bg-black/10 px-3 py-1.5 font-mono text-[10px] text-muted-foreground" data-testid="gantt-summary">
        <span><b className="text-foreground">{rows.length}</b> orders</span>
        <span><b className="text-primary">{counts.complete}</b> scheduled</span>
        {counts["start-only"] + counts["end-only"] > 0 && (
          <span><b className="text-amber-200">{counts["start-only"] + counts["end-only"]}</b> partial dates</span>
        )}
        {counts.reversed > 0 && <span><b className="text-amber-200">{counts.reversed}</b> end before start</span>}
        {counts.undated > 0 && <span><b className="text-amber-200">{counts.undated}</b> no build dates</span>}
        <span className="ml-auto">
          {formatCalendarDate(new Date(domain.start * 86_400_000).toISOString())} to{" "}
          {formatCalendarDate(new Date((domain.end - 1) * 86_400_000).toISOString())}
        </span>
      </div>

      {rows.length === 0 ? (
        <div ref={scrollRef} className="flex h-40 items-center justify-center font-mono text-xs text-muted-foreground">
          No active work orders match the current view.
        </div>
      ) : (
        <div ref={scrollRef} className="max-h-[68vh] overflow-auto" role="list" aria-label="Production schedule timeline">
          <div style={{ width: labelWidth + timelineW }} className="relative">
            {/* Axis */}
            <div className="sticky top-0 z-20 flex border-b border-border/80 bg-[#07392b]">
              <div style={{ width: labelWidth }} className="sticky left-0 z-10 flex shrink-0 items-end border-r border-border/80 bg-[#07392b] px-3 pb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Priority / Work order
              </div>
              <div className="relative h-11" style={{ width: timelineW }} aria-hidden="true">
                {ticks.top.map((t) => (
                  <span key={`y${t.day}`} className="absolute top-1 border-l border-border/80 pl-1 font-mono text-[10px] font-bold text-foreground/80" style={{ left: x(t.day) }}>
                    {t.label}
                  </span>
                ))}
                {ticks.bottom.map((t) => (
                  <span key={`b${t.day}`} className={cn("absolute bottom-1 whitespace-nowrap border-l pl-1 font-mono text-[9px]", t.major ? "border-border text-foreground/80" : "border-border/50 text-muted-foreground")} style={{ left: x(t.day) }}>
                    {t.label}
                  </span>
                ))}
                {todayInRange && (
                  <span className="absolute bottom-0 -translate-x-1/2 rounded-t-sm bg-amber-200 px-1 font-mono text-[8px] font-bold uppercase text-[#00281D]" style={{ left: x(today) + pxPerDay / 2 }}>
                    Today
                  </span>
                )}
              </div>
            </div>

            {/* Gridlines + today line */}
            <div className="pointer-events-none absolute bottom-0 top-11 z-0" style={{ left: labelWidth, width: timelineW }} aria-hidden="true">
              {ticks.bottom.map((t) => (
                <span key={`g${t.day}`} className={cn("absolute inset-y-0 w-px", t.major ? "bg-white/[0.08]" : "bg-white/[0.035]")} style={{ left: x(t.day) }} />
              ))}
              {todayInRange && <span className="absolute inset-y-0 w-px bg-amber-200/80" style={{ left: x(today) + pxPerDay / 2 }} />}
            </div>

            {pageRows.map(({ order, info }) => {
              const priority = priorityById.get(order.id);
              const buildPast = info.end !== null && info.end < today;
              const shipPast = info.ship !== null && info.ship < today;
              const dates = `Build start ${formatCalendarDate(order.buildStartDate)}, build end ${formatCalendarDate(order.buildEndDate)}, ship ${formatCalendarDate(order.salesShipDate)}`;
              const label = `Priority ${priority ?? "unranked"}, work order ${order.workOrder || "none"}, ${order.customer}. ${KIND_LABEL[info.kind]}. ${dates}. ${fmtQty(order.workOrderQty)} of ${fmtQty(order.scheduledWorkOrderQty)} remaining.`;
              return (
                <div
                  key={order.id}
                  role="listitem"
                  tabIndex={0}
                  data-testid={`gantt-row-${order.id}`}
                  aria-label={label}
                  title={`${order.workOrder || "No WO"} | ${order.itemNumber || "No item"} | ${dates} | ${order.status}${order.productionGroup ? ` | ${order.productionGroup}` : ""}`}
                  onClick={() => onSelectOrder(order)}
                  onKeyDown={(e) => onKey(e, order)}
                  className="group relative z-[1] flex cursor-pointer border-b border-border/40 outline-none transition-colors hover:bg-white/[0.035] focus-visible:bg-primary/[0.07] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                  style={{ height: ROW_H }}
                >
                  <div style={{ width: labelWidth }} className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-border/70 bg-[#033024] px-3 group-hover:bg-[#073a2c]">
                    <span className="w-8 shrink-0 text-right font-mono text-sm font-bold text-primary">{priority}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2 font-mono text-xs font-bold text-foreground">
                        {order.workOrder || "—"}
                        <span className="truncate font-normal text-[10px] text-muted-foreground">{order.itemNumber}</span>
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">{order.customer}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-foreground/80">{fmtQty(order.workOrderQty)}</span>
                  </div>
                  <div className="relative" style={{ width: timelineW }} aria-hidden="true">
                    <Bar info={info} x={x} pxPerDay={pxPerDay} buildPast={buildPast} />
                    {info.ship !== null && (
                      <span
                        className={cn("absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ring-2 ring-[#00281D]", shipPast ? "bg-red-400" : "bg-sky-300")}
                        style={{ left: x(info.ship) + pxPerDay / 2 }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border/70 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
          <span data-testid="gantt-page-info">
            Rows {safePage * PAGE_SIZE + 1}–{Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of {rows.length}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" data-testid="gantt-prev-page" aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded-sm border border-border p-1 hover:text-primary disabled:opacity-40">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2">Page {safePage + 1} / {pageCount}</span>
            <button type="button" data-testid="gantt-next-page" aria-label="Next page" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="rounded-sm border border-border p-1 hover:text-primary disabled:opacity-40">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bar({
  info,
  x,
  pxPerDay,
  buildPast,
}: {
  info: ScheduleInfo;
  x: (day: number) => number;
  pxPerDay: number;
  buildPast: boolean;
}) {
  const tag = "absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.06em] text-amber-200";
  if (info.kind === "complete") {
    const left = x(info.start as number);
    const w = Math.max(3, (info.durationDays as number) * pxPerDay);
    return (
      <span
        className={cn("absolute top-1/2 h-3.5 -translate-y-1/2 rounded-[2px]", buildPast ? "border border-red-400 bg-red-400/35" : "bg-primary/80 group-hover:bg-primary")}
        style={{ left, width: w }}
      />
    );
  }
  if (info.kind === "reversed") {
    // Draw the span between the two dates without implying a valid duration.
    const left = x(info.end as number);
    const w = Math.max(3, ((info.start as number) - (info.end as number) + 1) * pxPerDay);
    return (
      <>
        <span className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-[2px] border border-dashed border-amber-300 bg-amber-300/10" style={{ left, width: w }} />
        <span className={tag} style={{ left: left + w + 6 }}>End before start</span>
      </>
    );
  }
  if (info.kind === "start-only" || info.kind === "end-only") {
    const d = (info.start ?? info.end) as number;
    const left = x(d);
    return (
      <>
        <span className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-[1px] bg-amber-300" style={{ left }} />
        <span className={tag} style={{ left: left + 8 }}>
          {info.kind === "start-only" ? "Start only, no build end" : "End only, no build start"}
        </span>
      </>
    );
  }
  return <span className={cn(tag, "sticky left-3 inline-block")} style={{ position: "sticky" }}>No build dates</span>;
}
