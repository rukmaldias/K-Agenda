import type { SnapshotData, Task } from "../../types/snapshot";
import { earliestDueDate, humanizeDueDate } from "../../lib/date";
import { isDoneState } from "../../lib/todoKeywords";
import { StateBadge } from "../../components/StateBadge";
import { TypeBadge } from "../../components/TypeBadge";

interface UpcomingTasksTableProps {
  snapshot: SnapshotData;
}

const UPCOMING_LIMIT = 8;

function upcomingTasks(snapshot: SnapshotData): Task[] {
  return snapshot.tasks
    .filter((t) => !isDoneState(snapshot, t.todoState) && earliestDueDate(t))
    .sort(
      (a, b) =>
        new Date(earliestDueDate(a)!).getTime() - new Date(earliestDueDate(b)!).getTime()
    )
    .slice(0, UPCOMING_LIMIT);
}

export function UpcomingTasksTable({ snapshot }: UpcomingTasksTableProps) {
  const tasks = upcomingTasks(snapshot);

  return (
    <div className="k-card k-upcoming">
      <div className="k-card__title">Upcoming Tasks &amp; Agenda</div>
      {tasks.length === 0 ? (
        <p className="k-empty-note">No scheduled or deadlined tasks upcoming.</p>
      ) : (
        <table className="k-table">
          <thead>
            <tr>
              <th>State</th>
              <th>Type</th>
              <th>Title</th>
              <th>Project</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <StateBadge snapshot={snapshot} todoState={task.todoState} />
                </td>
                <td>
                  <TypeBadge type={task.type} />
                </td>
                <td className="k-table__title-cell">{task.title}</td>
                <td className="k-table__muted">{task.project ?? "—"}</td>
                <td className="k-table__muted">{humanizeDueDate(earliestDueDate(task))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
