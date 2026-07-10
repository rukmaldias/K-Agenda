import type { SnapshotData, Task } from "../../types/snapshot";
import { earliestDueDate, humanizeDueDate } from "../../lib/date";

interface UpcomingTasksTableProps {
  snapshot: SnapshotData;
}

const UPCOMING_LIMIT = 8;

function faceHexFor(snapshot: SnapshotData, todoState: string): string {
  return snapshot.todoKeywords.find((k) => k.name === todoState)?.faceHex ?? "#898781";
}

function labelFor(snapshot: SnapshotData, todoState: string): string {
  return snapshot.todoKeywords.find((k) => k.name === todoState)?.label ?? todoState;
}

function upcomingTasks(snapshot: SnapshotData): Task[] {
  const doneStates = new Set(
    snapshot.todoKeywords.filter((k) => k.done).map((k) => k.name)
  );
  return snapshot.tasks
    .filter((t) => !doneStates.has(t.todoState) && earliestDueDate(t))
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
        <p className="k-upcoming__empty">No scheduled or deadlined tasks upcoming.</p>
      ) : (
        <table className="k-table">
          <thead>
            <tr>
              <th>State</th>
              <th>Title</th>
              <th>Project</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <span
                    className="k-badge"
                    style={{ ["--badge-color" as string]: faceHexFor(snapshot, task.todoState) }}
                  >
                    {labelFor(snapshot, task.todoState)}
                  </span>
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
