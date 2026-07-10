import type { SnapshotData } from "../types/snapshot";
import { faceHexFor, labelFor } from "../lib/todoKeywords";
import { mutedFill, readableTextColor } from "../lib/color";

interface StateBadgeProps {
  snapshot: SnapshotData;
  todoState: string | null;
}

export function StateBadge({ snapshot, todoState }: StateBadgeProps) {
  if (!todoState) {
    return <span className="k-table__muted">—</span>;
  }
  const fill = mutedFill(faceHexFor(snapshot, todoState));
  return (
    <span
      className="k-badge"
      style={{
        ["--badge-color" as string]: fill,
        ["--badge-text" as string]: readableTextColor(fill),
      }}
    >
      {labelFor(snapshot, todoState)}
    </span>
  );
}
