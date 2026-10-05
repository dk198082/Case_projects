// Pure helpers for the production Gantt. All dates are ERP calendar dates:
// we read UTC components only and work in integer "day numbers" since epoch.

export const DAY_MS = 86_400_000;

export type ScheduleKind = "complete" | "reversed" | "start-only" | "end-only" | "undated";

export type GanttZoom = "fit" | "week" | "month" | "quarter";

export const ZOOM_PX_PER_DAY: Record<Exclude<GanttZoom, "fit">, number> = {
  week: 22,
  month: 6,
  quarter: 2,
};

export const MAX_TIMELINE_WIDTH = 24_000;

/** Parse an ISO/date string into a UTC day number, or null when absent/invalid. */
export const toDayNumber = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS,
  );
};

/** Today's local calendar date expressed as a day number (matches date-utils past-due logic). */
export const todayDayNumber = (now = new Date()) =>
  Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);

export const dayToDate = (day: number) => new Date(day * DAY_MS);

export type ScheduleInfo = {
  kind: ScheduleKind;
  start: number | null;
  end: number | null;
  ship: number | null;
  /** Inclusive build duration in days, only for complete schedules. */
  durationDays: number | null;
};

export const classifySchedule = (o: {
  buildStartDate: string;
  buildEndDate: string;
  salesShipDate: string;
}): ScheduleInfo => {
  const start = toDayNumber(o.buildStartDate);
  const end = toDayNumber(o.buildEndDate);
  const ship = toDayNumber(o.salesShipDate);
  let kind: ScheduleKind;
  if (start !== null && end !== null) kind = end < start ? "reversed" : "complete";
  else if (start !== null) kind = "start-only";
  else if (end !== null) kind = "end-only";
  else kind = "undated";
  return {
    kind,
    start,
    end,
    ship,
    durationDays: kind === "complete" ? (end as number) - (start as number) + 1 : null,
  };
};

export type Domain = { start: number; end: number; days: number };

/** Domain spanning every known date (plus today), padded to whole months. */
export const computeDomain = (infos: ScheduleInfo[], today: number): Domain => {
  let min = today;
  let max = today;
  for (const i of infos) {
    for (const d of [i.start, i.end, i.ship]) {
      if (d === null) continue;
      if (d < min) min = d;
      if (d > max) max = d;
    }
  }
  const a = dayToDate(min);
  const b = dayToDate(max);
  const start = Math.floor(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1) / DAY_MS);
  const end = Math.floor(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1) / DAY_MS);
  return { start, end, days: Math.max(1, end - start) };
};

export const resolvePxPerDay = (zoom: GanttZoom, domain: Domain, availableWidth: number) => {
  const raw =
    zoom === "fit" ? Math.max(0.05, availableWidth / domain.days) : ZOOM_PX_PER_DAY[zoom];
  // Bound total width so very long ranges never produce gigantic canvases.
  return Math.min(raw, MAX_TIMELINE_WIDTH / domain.days);
};

export type Tick = { day: number; label: string; major: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Builds axis ticks. Unit is chosen from pixel density, so the number of ticks
 * is bounded by width (never one element per day for long ranges).
 */
export const buildTicks = (domain: Domain, pxPerDay: number) => {
  const top: Tick[] = [];
  const bottom: Tick[] = [];
  const s = dayToDate(domain.start);
  const e = dayToDate(domain.end);
  const yearStep = Math.max(1, Math.ceil(48 / (pxPerDay * 365)));
  const monthStep = pxPerDay * 30 >= 40 ? 1 : pxPerDay * 91 >= 40 ? 3 : 12 * yearStep;

  // Top band: years.
  for (let y = s.getUTCFullYear(); y <= e.getUTCFullYear(); y += yearStep) {
    const day = Math.max(domain.start, Math.floor(Date.UTC(y, 0, 1) / DAY_MS));
    if (day < domain.end) top.push({ day, label: String(y), major: true });
  }

  if (pxPerDay * 7 >= 34) {
    // Weekly ticks on Mondays.
    let d = domain.start;
    while (dayToDate(d).getUTCDay() !== 1) d++;
    for (; d < domain.end; d += 7) {
      const dt = dayToDate(d);
      bottom.push({
        day: d,
        label: `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`,
        major: dt.getUTCDate() <= 7,
      });
    }
  } else {
    for (let y = s.getUTCFullYear(), m = Math.floor(s.getUTCMonth() / monthStep) * monthStep; ; m += monthStep) {
      const boundary = Math.floor(Date.UTC(y, m, 1) / DAY_MS);
      const day = Math.max(domain.start, boundary);
      if (day >= domain.end) break;
      const dt = dayToDate(boundary);
      const label =
        monthStep >= 12
          ? String(dt.getUTCFullYear())
          : monthStep === 3
            ? `Q${Math.floor(dt.getUTCMonth() / 3) + 1}`
            : MONTHS[dt.getUTCMonth()];
      bottom.push({ day, label, major: dt.getUTCMonth() === 0 });
    }
  }
  return { top, bottom };
};
