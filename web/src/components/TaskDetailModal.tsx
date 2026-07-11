import { useEffect } from "react";
import { useTaskDetail } from "../state/taskDetail";
import { useSnapshot } from "../lib/ws";
import { StateBadge } from "./StateBadge";
import { TypeBadge } from "./TypeBadge";

function formatAbsolute(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hasTime = iso.includes("T") && (date.getHours() !== 0 || date.getMinutes() !== 0);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function TaskDetailModal() {
  const { selectedTask, closeTask } = useTaskDetail();
  const snapshot = useSnapshot();

  useEffect(() => {
    if (!selectedTask) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTask();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedTask, closeTask]);

  if (!selectedTask || !snapshot) return null;

  const task = selectedTask;
  const breadcrumb = [task.file, ...task.olp].join(" › ");
  const rows: { label: string; value: string }[] = [];
  if (task.project) rows.push({ label: "Project", value: task.project });
  if (task.priority) rows.push({ label: "Priority", value: task.priority });
  if (task.tags.length > 0) rows.push({ label: "Tags", value: task.tags.join(", ") });
  const scheduled = formatAbsolute(task.scheduled);
  if (scheduled) rows.push({ label: "Scheduled", value: scheduled });
  const deadline = formatAbsolute(task.deadline);
  if (deadline) rows.push({ label: "Deadline", value: deadline });
  const closed = formatAbsolute(task.closed);
  if (closed) rows.push({ label: "Closed", value: closed });

  return (
    <div className="k-modal-backdrop" onClick={closeTask}>
      <div
        className="k-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="k-modal__header">
          <div>
            <div className="k-modal__eyebrow">Task Details</div>
            <h2 className="k-modal__title">{task.title}</h2>
            <div className="k-modal__breadcrumb">{breadcrumb}</div>
          </div>
          <button className="k-modal__close" onClick={closeTask} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="k-modal__badges">
          <StateBadge snapshot={snapshot} todoState={task.todoState} />
          <TypeBadge type={task.type} />
        </div>

        {rows.length > 0 && (
          <table className="k-modal__table">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="k-modal__note">
          Read-only — editing still happens in Emacs.
        </p>
      </div>
    </div>
  );
}
