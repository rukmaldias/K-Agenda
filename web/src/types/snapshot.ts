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
  todoState: string;
  priority: string | null;
  tags: string[];
  project: string | null;
  file: string;
  level: number;
  olp: string[];
  scheduled: string | null;
  deadline: string | null;
  closed: string | null;
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
