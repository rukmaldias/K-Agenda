import type { SnapshotData } from "../types/snapshot";
import { faceHexFor, labelFor } from "../lib/todoKeywords";

interface StateBadgeProps {
  snapshot: SnapshotData;
  todoState: string;
}

export function StateBadge({ snapshot, todoState }: StateBadgeProps) {
  return (
    <span
      className="k-badge"
      style={{ ["--badge-color" as string]: faceHexFor(snapshot, todoState) }}
    >
      {labelFor(snapshot, todoState)}
    </span>
  );
}
