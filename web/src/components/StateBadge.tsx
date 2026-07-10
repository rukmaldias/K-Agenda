import type { SnapshotData } from "../types/snapshot";
import { faceHexFor, labelFor } from "../lib/todoKeywords";
import { readableTextColor } from "../lib/color";

interface StateBadgeProps {
  snapshot: SnapshotData;
  todoState: string | null;
}

export function StateBadge({ snapshot, todoState }: StateBadgeProps) {
  if (!todoState) {
    return <span className="k-table__muted">—</span>;
  }
  const hex = faceHexFor(snapshot, todoState);
  return (
    <span
      className="k-badge"
      style={{
        ["--badge-color" as string]: hex,
        ["--badge-text" as string]: readableTextColor(hex),
      }}
    >
      {labelFor(snapshot, todoState)}
    </span>
  );
}
