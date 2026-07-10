import { useMemo } from "react";
import type { SnapshotData, Task } from "../types/snapshot";
import { formatTimeIfPresent, isSameDay, taskOccursOn } from "../lib/date";
import { StateBadge } from "./StateBadge";

interface DayTaskTableProps {
  snapshot: SnapshotData;
  day: Date;
}

function dayTime(task: Task, day: Date): string | null {
  for (const iso of [task.scheduled, task.deadline]) {
    if (iso && isSameDay(new Date(iso), day)) {
      const t = formatTimeIfPresent(iso);
      if (t) return t;
    }
  }
  return null;
}

export function DayTaskTable({ snapshot, day }: DayTaskTableProps) {
  const tasks = useMemo(
    () =>
      snapshot.tasks
        .filter((t) => taskOccursOn(t, day))
        .sort((a, b) => {
          const ta = dayTime(a, day);
          const tb = dayTime(b, day);
          if (ta && tb) return ta.localeCompare(tb);
          if (ta) return -1;
          if (tb) return 1;
          return a.title.localeCompare(b.title);
        }),
    [snapshot, day]
  );

  if (tasks.length === 0) {
    return <p className="k-empty-note">Nothing scheduled or due on this day.</p>;
  }

  return (
    <table className="k-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>State</th>
          <th>Title</th>
          <th>Project</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.id}>
            <td className="k-table__muted">{dayTime(task, day) ?? "—"}</td>
            <td>
              <StateBadge snapshot={snapshot} todoState={task.todoState} />
            </td>
            <td className="k-table__title-cell">{task.title}</td>
            <td className="k-table__muted">{task.project ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
