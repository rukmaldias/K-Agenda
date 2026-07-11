// The fixed set of :CAPTURE_TYPE: values K-Agenda recognizes, matching
// k-agenda-protocol.el's `k-agenda-protocol--known-types`. Always shown
// in full in filter dropdowns, regardless of which types are actually
// present in the current snapshot -- so "Diary" is selectable even
// before any heading has been tagged with it.
export const KNOWN_CAPTURE_TYPES = ["Todo", "Meeting", "Diary", "Idea", "Task"] as const;
