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

/** Builds a month-aligned timeline spanning every dated task's start..end --
 * drives the roadmap's slim month rail and its "today" marker. */
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

export function pctForDate(timeline: Timeline, date: Date): number {
  return ((date.getTime() - timeline.rangeStart.getTime()) / timeline.totalMs) * 100;
}
