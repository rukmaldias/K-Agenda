import { useMemo, useState } from "react";
import { useSnapshot } from "../../lib/ws";
import { earliestDueDate, humanizeDueDate } from "../../lib/date";
import type { Task } from "../../types/snapshot";

const ALL = "__all__";

export function KBoard() {
  const snapshot = useSnapshot();
  const [projectFilter, setProjectFilter] = useState(ALL);

  const tasksByState = useMemo(() => {
    if (!snapshot) return new Map<string, Task[]>();
    const filtered = snapshot.tasks.filter((t) =>
      projectFilter === ALL ? true : t.project === projectFilter
    );
    const map = new Map<string, Task[]>();
    for (const kw of snapshot.todoKeywords) {
      map.set(
        kw.name,
        filtered
          .filter((t) => t.todoState === kw.name)
          .sort((a, b) => {
            const dueA = earliestDueDate(a);
            const dueB = earliestDueDate(b);
            if (dueA && dueB) return new Date(dueA).getTime() - new Date(dueB).getTime();
            if (dueA) return -1;
            if (dueB) return 1;
            return 0;
          })
      );
    }
    return map;
  }, [snapshot, projectFilter]);

  if (!snapshot) {
    return <div className="k-dashboard-loading">Waiting for the first snapshot…</div>;
  }

  return (
    <div className="k-board">
      <div className="k-page-toolbar">
        <label className="k-board__filter-label" htmlFor="k-board-project-filter">
          Project Filter
        </label>
        <select
          id="k-board-project-filter"
          className="k-page-toolbar__select"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value={ALL}>All Projects</option>
          {snapshot.projects.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="k-board__readonly-note">Read-only — drag-and-drop isn't wired up yet.</span>
      </div>

      <div className="k-board__columns">
        {snapshot.todoKeywords.map((kw) => {
          const tasks = tasksByState.get(kw.name) ?? [];
          return (
            <div key={kw.name} className="k-board__column">
              <div
                className="k-board__column-header"
                style={{ ["--column-accent" as string]: kw.faceHex ?? "var(--text-muted)" }}
              >
                <span className="k-board__column-title">{kw.label}</span>
                <span className="k-board__column-count">{tasks.length}</span>
              </div>
              <div className="k-board__column-body">
                {tasks.length === 0 ? (
                  <p className="k-board__column-empty">No tasks</p>
                ) : (
                  tasks.map((task) => (
                    <div key={task.id} className="k-board__card">
                      <div className="k-board__card-title">{task.title}</div>
                      {task.project && (
                        <div className="k-board__card-project">{task.project}</div>
                      )}
                      {earliestDueDate(task) && (
                        <div className="k-board__card-due">
                          {humanizeDueDate(earliestDueDate(task))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
