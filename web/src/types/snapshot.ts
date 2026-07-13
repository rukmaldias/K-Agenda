// Mirrors the JSON wire shape built by k-agenda-protocol.el's
// `k-agenda-protocol-build-snapshot`. Keep these two in lockstep.

export interface TodoKeywordSpec {
  name: string;
  label: string;
  faceHex: string | null;
  sequenceIndex: number;
  done: boolean;
}

export interface Stats {
  totalProjects: number;
  counts: Record<string, number>;
}

export interface ProjectProgress {
  name: string;
  file: string;
  total: number;
  done: number;
  cancelled: number;
  percent: number;
}

export interface Task {
  id: string;
  title: string;
  /** null for a Type-tagged heading with no TODO keyword (Diary/Idea). */
  todoState: string | null;
  /** One of TODO/Meeting/Diary/Idea/Task, matched from the heading's tags; null if none match. */
  type: string | null;
  priority: string | null;
  tags: string[];
  project: string | null;
  file: string;
  level: number;
  olp: string[];
  scheduled: string | null;
  deadline: string | null;
  closed: string | null;
  /** Org's :Effort: property, raw "H:MM" string (e.g. "4:00"), or null. */
  effort: string | null;
}

// A node in the References tree: either a file root (`level` 0, `id` the
// file's absolute path) or a heading nested under one, in document order.
export interface ReferenceNode {
  id: string;
  title: string;
  level: number;
  tags: string[];
  children: ReferenceNode[];
}

export interface SnapshotData {
  generatedAt: string;
  todoKeywords: TodoKeywordSpec[];
  stats: Stats;
  projects: ProjectProgress[];
  tasks: Task[];
}

export interface SnapshotMessage {
  type: "snapshot";
  data: SnapshotData;
}

// Sent by the browser when a task's detail modal opens -- a full body
// isn't worth including in every snapshot broadcast (some entries have
// long bodies), so it's fetched on demand instead.
export interface TaskBodyRequest {
  type: "task-body-request";
  id: string;
}

export interface TaskBodyMessage {
  type: "task-body";
  id: string;
  body: string | null;
}

// Sent by the browser when the References reader pane selects a tree
// node -- same on-demand-fetch reasoning as TaskBodyRequest above, applied
// to a ReferenceNode instead of a Task.
export interface ReferenceBodyRequest {
  type: "reference-body-request";
  id: string;
}

export interface ReferenceBodyMessage {
  type: "reference-body";
  id: string;
  body: string | null;
}

// Sent by the browser once, when the References page mounts -- the tree
// isn't part of the main snapshot (building it parses every reference
// file, expensive enough with 90+ docs that baking it into every
// snapshot broadcast noticeably stalled the app on unrelated edits).
// Also pushed unprompted by the backend after a reference file is
// edited, so the tree stays live without a re-request.
export interface ReferenceTreeRequest {
  type: "reference-tree-request";
}

export interface ReferenceTreeMessage {
  type: "reference-tree";
  tree: ReferenceNode[];
}

// Sent when a K Board drag-and-drop is confirmed -- the only mutating
// request type. The backend re-validates the transition independently;
// isValidTransition() client-side (lib/workflow.ts) is just so an
// invalid drop can be rejected instantly, without a round trip.
export interface ChangeStateRequest {
  type: "change-state-request";
  requestId: string;
  id: string;
  fromState: string;
  toState: string;
}

export interface ChangeStateResponse {
  type: "change-state-response";
  requestId: string;
  ok: boolean;
  reason?: "invalid-transition" | "stale" | "not-found";
  message?: string;
}
