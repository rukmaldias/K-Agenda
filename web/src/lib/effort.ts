// Parses Org's :Effort: property, always an "H:MM" string (e.g. "4:00",
// "0:30"), never a bare number -- matches org-duration's own convention
// (the org-agenda-files' #+PROPERTY: Effort_ALL lines only ever list
// H:MM values), so no need to handle other formats.

export function parseEffortMinutes(effort: string | null): number {
  if (!effort) return 0;
  const match = /^(\d+):(\d{2})$/.exec(effort.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Task's "section" for grouping: the second outline-path entry (the
 * heading directly under the project root, e.g. "Phase 1 — Tier 0
 * Foundation") if there is one, else the project root itself, else
 * "Other" for a task with no outline ancestors at all. Generic on
 * purpose -- works for any project's heading structure, not just one
 * named "Phase". */
export function sectionFor(task: { olp: string[] }): string {
  return task.olp[1] ?? task.olp[0] ?? "Other";
}
