import { useMemo } from "react";
import type { SnapshotData } from "../../types/snapshot";
import { earliestDueDate } from "../../lib/date";
import { StateBadge } from "../../components/StateBadge";
import { TypeBadge } from "../../components/TypeBadge";
import { useTaskDetail } from "../../state/taskDetail";

interface ListViewProps {
  snapshot: SnapshotData;
}

export function ListView({ snapshot }: ListViewProps) {
  const { openTask } = useTaskDetail();
  const groups = useMemo(() => {
    const dated = snapshot.tasks
      .map((t) => ({ task: t, due: earliestDueDate(t) }))
      .filter((x): x is { task: (typeof snapshot.tasks)[number]; due: string } => Boolean(x.due))
      .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

    const byDay = new Map<string, typeof dated>();
    for (const item of dated) {
      const key = new Date(item.due).toDateString();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(item);
    }
    return [...byDay.entries()];
  }, [snapshot]);

  if (groups.length === 0) {
    return <p className="k-empty-note">No scheduled or deadlined tasks found.</p>;
  }

  return (
    <div className="k-cal-list">
      {groups.map(([dayKey, items]) => (
        <div key={dayKey} className="k-cal-list__group">
          <div className="k-cal-list__group-header">
            {new Date(dayKey).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <table className="k-table">
            <tbody>
              {items.map(({ task }) => (
                <tr key={task.id} className="k-table__row--clickable" onClick={() => openTask(task)}>
                  <td>
                    <StateBadge snapshot={snapshot} todoState={task.todoState} />
                  </td>
                  <td>
                    <TypeBadge type={task.type} />
                  </td>
                  <td className="k-table__title-cell">{task.title}</td>
                  <td className="k-table__muted">{task.project ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
