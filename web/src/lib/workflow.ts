// Mirrors k-agenda-workflow.el's transition rules. Kept in sync by hand
// (small, stable domain) -- used here for immediate client-side
// feedback (no round trip needed to reject an invalid drag), but the
// backend re-validates independently and is the actual authority; never
// trust this alone for the mutating request.

const VALID_TRANSITIONS: ReadonlySet<string> = new Set(
  [
    ["INACTIVE", "TODO"],
    ["TODO", "NEXT"],
    ["NEXT", "WAITING"],
    ["WAITING", "TODO"],
    ["WAITING", "NEXT"],
    ["NEXT", "DONE"],
    ["TODO", "DONE"],
    ["MEETING", "DONE"],
    ["TODO", "CANCELLED"],
    ["NEXT", "CANCELLED"],
    ["WAITING", "CANCELLED"],
    ["INACTIVE", "CANCELLED"],
    ["MEETING", "CANCELLED"],
  ].map(([from, to]) => `${from}->${to}`)
);

const ANTI_PATTERN_MESSAGES: Readonly<Record<string, string>> = {
  "NEXT->INACTIVE":
    "Jumps backwards: if a task was urgent enough to be NEXT and you want to shelve it long-term, move it back to TODO first (or split it). Going straight to INACTIVE usually means hiding a failed commitment.",
  "DONE->WAITING":
    "The zombie task: a task can't be done and blocked at the same time. If new work comes up from a finished task, create a new heading instead of reviving this one.",
  "CANCELLED->DONE":
    "Contradictory: a task can't be abandoned and finished at the same time.",
  "TODO->MEETING":
    "MEETING is an event, not a process — headings don't turn into meetings by changing state. Create a new MEETING heading directly instead.",
  "NEXT->MEETING":
    "MEETING is an event, not a process — headings don't turn into meetings by changing state. Create a new MEETING heading directly instead.",
  "WAITING->MEETING":
    "MEETING is an event, not a process — headings don't turn into meetings by changing state. Create a new MEETING heading directly instead.",
  "INACTIVE->MEETING":
    "MEETING is an event, not a process — headings don't turn into meetings by changing state. Create a new MEETING heading directly instead.",
  "MEETING->TODO":
    "MEETING is an event, not a process: it only ever resolves to Completed or Cancelled. If a meeting generates action items, add them as separate TODO sub-tasks under the meeting heading.",
  "MEETING->NEXT":
    "MEETING is an event, not a process: it only ever resolves to Completed or Cancelled. If a meeting generates action items, add them as separate TODO sub-tasks under the meeting heading.",
  "MEETING->WAITING":
    "MEETING is an event, not a process: it only ever resolves to Completed or Cancelled. If a meeting generates action items, add them as separate TODO sub-tasks under the meeting heading.",
};

function displayWord(state: string): string {
  return state === "DONE" ? "Completed" : state;
}

export function isValidTransition(from: string, to: string): boolean {
  return from === to || VALID_TRANSITIONS.has(`${from}->${to}`);
}

export function rejectionMessage(from: string, to: string): string {
  return (
    ANTI_PATTERN_MESSAGES[`${from}->${to}`] ??
    `${displayWord(from)} → ${displayWord(to)} isn't part of the standard workflow.`
  );
}
