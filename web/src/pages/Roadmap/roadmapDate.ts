const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

export interface TimelineMonth {
  label: string;
  widthPct: number;
}

export interface Timeline {
  rangeStart: Date;
  totalMs: number;
  months: TimelineMonth[];
}

/** Builds a month-aligned timeline spanning every dated task's start..end,
 * so the chart's month header and its swimlane gridlines share one source
 * of truth for column widths. */
export function buildTimeline(starts: Date[], ends: Date[]): Timeline {
  const rangeStart = startOfMonth(new Date(Math.min(...starts.map((d) => d.getTime()))));
  const rangeEnd = addMonths(startOfMonth(new Date(Math.max(...ends.map((d) => d.getTime())))), 1);
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  const months: TimelineMonth[] = [];
  let cursor = rangeStart;
  while (cursor.getTime() < rangeEnd.getTime()) {
    const next = addMonths(cursor, 1);
    months.push({
      label: cursor.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
      widthPct: ((next.getTime() - cursor.getTime()) / totalMs) * 100,
    });
    cursor = next;
  }

  return { rangeStart, totalMs, months };
}

/** Cumulative percentage offsets of each internal month boundary (excludes
 * 0% and 100%, which the chart's own border already marks). */
export function monthBoundaryPercents(timeline: Timeline): number[] {
  const bounds: number[] = [];
  let acc = 0;
  for (let i = 0; i < timeline.months.length - 1; i++) {
    acc += timeline.months[i].widthPct;
    bounds.push(acc);
  }
  return bounds;
}

export function pctForDate(timeline: Timeline, date: Date): number {
  return ((date.getTime() - timeline.rangeStart.getTime()) / timeline.totalMs) * 100;
}

/** End is treated as inclusive of its whole day, so a same-day
 * scheduled/deadline pair still renders as a visible one-day bar. */
export function barPosition(timeline: Timeline, start: Date, end: Date): { leftPct: number; widthPct: number } {
  const leftPct = pctForDate(timeline, start);
  const widthPct = ((end.getTime() - start.getTime() + DAY_MS) / timeline.totalMs) * 100;
  return { leftPct, widthPct };
}
