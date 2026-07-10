import { useMemo, useState } from "react";
import { useSnapshot } from "../../lib/ws";
import { earliestDueDate, humanizeDueDate } from "../../lib/date";
import { StateBadge } from "../../components/StateBadge";
import type { Task } from "../../types/snapshot";

const ALL = "__all__";

function sortByDueDate(a: Task, b: Task): number {
  const dueA = earliestDueDate(a);
  const dueB = earliestDueDate(b);
  if (dueA && dueB) return new Date(dueA).getTime() - new Date(dueB).getTime();
  if (dueA) return -1;
  if (dueB) return 1;
  return a.title.localeCompare(b.title);
}

export function Inbox() {
  const snapshot = useSnapshot();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState(ALL);
  const [projectFilter, setProjectFilter] = useState(ALL);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const q = query.trim().toLowerCase();
    return snapshot.tasks
      .filter((t) => (stateFilter === ALL ? true : t.todoState === stateFilter))
      .filter((t) => (projectFilter === ALL ? true : t.project === projectFilter))
      .filter((t) => (q === "" ? true : t.title.toLowerCase().includes(q)))
      .sort(sortByDueDate);
  }, [snapshot, query, stateFilter, projectFilter]);

  if (!snapshot) {
    return <div className="k-dashboard-loading">Waiting for the first snapshot…</div>;
  }

  return (
    <div className="k-inbox">
      <div className="k-page-toolbar">
        <input
          className="k-page-toolbar__input"
          type="search"
          placeholder="Filter by title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="k-page-toolbar__select"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
        >
          <option value={ALL}>All states</option>
          {snapshot.todoKeywords.map((k) => (
            <option key={k.name} value={k.name}>
              {k.label}
            </option>
          ))}
        </select>
        <select
          className="k-page-toolbar__select"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value={ALL}>All projects</option>
          {snapshot.projects.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="k-card">
        <div className="k-card__title">
          Tasks
          <span className="k-card__subtitle">({filtered.length})</span>
        </div>
        {filtered.length === 0 ? (
          <p className="k-empty-note">No tasks match this filter.</p>
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
              {filtered.map((task) => (
                <tr key={task.id}>
                  <td>
                    <StateBadge snapshot={snapshot} todoState={task.todoState} />
                  </td>
                  <td className="k-table__title-cell">{task.title}</td>
                  <td className="k-table__muted">{task.project ?? "—"}</td>
                  <td className="k-table__muted">
                    {humanizeDueDate(earliestDueDate(task)) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
