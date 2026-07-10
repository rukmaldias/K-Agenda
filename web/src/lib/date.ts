// Human-readable due-date labels are computed here, client-side, against
// the viewer's local clock -- k-agenda-protocol.el intentionally sends
// only ISO 8601 timestamps, to keep timezone/locale logic out of Lisp.

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** A task "occurs" on DAY if its scheduled or deadline date falls on it. */
export function taskOccursOn(
  task: { scheduled: string | null; deadline: string | null },
  day: Date
): boolean {
  return [task.scheduled, task.deadline].some((iso) => iso && isSameDay(new Date(iso), day));
}

export function formatTimeIfPresent(iso: string): string | null {
  const date = new Date(iso);
  const hasTime = iso.includes("T") && (date.getHours() !== 0 || date.getMinutes() !== 0);
  return hasTime ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
}

export function humanizeDueDate(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const dayDiff = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
  const hasTime = iso.includes("T") && (date.getHours() !== 0 || date.getMinutes() !== 0);
  const timeSuffix = hasTime
    ? `, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : "";

  if (dayDiff === 0) return `Due Today${timeSuffix}`;
  if (dayDiff === 1) return `Tomorrow${timeSuffix}`;
  if (dayDiff === -1) return `Yesterday${timeSuffix}`;
  if (dayDiff < 0) return `${Math.abs(dayDiff)}d overdue`;

  const sameYear = date.getFullYear() === now.getFullYear();
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return `${datePart}${timeSuffix}`;
}

/** Nearest of scheduled/deadline, preferring whichever is sooner; used to sort the upcoming table. */
export function earliestDueDate(task: { scheduled: string | null; deadline: string | null }): string | null {
  const candidates = [task.scheduled, task.deadline].filter((d): d is string => Boolean(d));
  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, current) =>
    new Date(current).getTime() < new Date(earliest).getTime() ? current : earliest
  );
}
