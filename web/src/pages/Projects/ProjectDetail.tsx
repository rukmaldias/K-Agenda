import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useSnapshot } from "../../lib/ws";
import { earliestDueDate, humanizeDueDate } from "../../lib/date";
import { isDoneState } from "../../lib/todoKeywords";
import { formatMinutes, parseEffortMinutes, sectionFor } from "../../lib/effort";
import { KNOWN_CAPTURE_TYPES } from "../../lib/captureTypes";
import { SECTION_COLORS } from "../../lib/color";
import { useTaskDetail } from "../../state/taskDetail";
import { StateBadge } from "../../components/StateBadge";
import { TypeBadge } from "../../components/TypeBadge";
import type { SnapshotData, Task } from "../../types/snapshot";

const ALL = "__all__";
const UPCOMING_LIMIT = 10;

export function isMilestone(task: Task): boolean {
  return /^milestone\b/i.test(task.title) || task.tags.includes("milestone");
}

function isOverdue(task: Task, now: Date): boolean {
  const due = earliestDueDate(task);
  if (!due) return false;
  return new Date(due).getTime() < now.getTime();
}

export function ProjectDetail() {
  const { projectName } = useParams<{ projectName: string }>();
  const navigate = useNavigate();
  const snapshot = useSnapshot();
  const { openTask } = useTaskDetail();
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);

  const decodedName = decodeURIComponent(projectName ?? "");

  if (!snapshot) {
    return <div className="k-dashboard-loading">Waiting for the first snapshot…</div>;
  }

  return (
    <ProjectDetailBody
      snapshot={snapshot}
      projectName={decodedName}
      priorityFilter={priorityFilter}
      onPriorityFilterChange={setPriorityFilter}
      stateFilter={stateFilter}
      onStateFilterChange={setStateFilter}
      typeFilter={typeFilter}
      onTypeFilterChange={setTypeFilter}
      onOpenTask={openTask}
      onSwitchProject={(name) => navigate(`/projects/${encodeURIComponent(name)}`)}
    />
  );
}

interface ProjectDetailBodyProps {
  snapshot: SnapshotData;
  projectName: string;
  priorityFilter: string;
  onPriorityFilterChange: (value: string) => void;
  stateFilter: string;
  onStateFilterChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  onOpenTask: (task: Task) => void;
  onSwitchProject: (name: string) => void;
}

function ProjectDetailBody({
  snapshot,
  projectName,
  priorityFilter,
  onPriorityFilterChange,
  stateFilter,
  onStateFilterChange,
  typeFilter,
  onTypeFilterChange,
  onOpenTask,
  onSwitchProject,
}: ProjectDetailBodyProps) {
  const project = snapshot.projects.find((p) => p.name === projectName);
  const allTasks = useMemo(
    () => snapshot.tasks.filter((t) => t.project === projectName),
    [snapshot, projectName]
  );

  const now = useMemo(() => new Date(), []);

  const nextMilestone = useMemo(() => {
    return allTasks
      .filter((t) => isMilestone(t) && !isDoneState(snapshot, t.todoState))
      .filter((t) => earliestDueDate(t))
      .sort((a, b) => new Date(earliestDueDate(a)!).getTime() - new Date(earliestDueDate(b)!).getTime())[0];
  }, [allTasks, snapshot]);

  const effortBySection = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of allTasks) {
      const minutes = parseEffortMinutes(t.effort);
      if (minutes <= 0) continue;
      const section = sectionFor(t);
      totals.set(section, (totals.get(section) ?? 0) + minutes);
    }
    return [...totals.entries()]
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [allTasks]);

  const totalEffortMinutes = effortBySection.reduce((sum, s) => sum + s.minutes, 0);

  const priorities = useMemo(
    () => [...new Set(allTasks.map((t) => t.priority).filter((p): p is string => Boolean(p)))].sort(),
    [allTasks]
  );

  const upcomingTasks = useMemo(() => {
    return allTasks
      .filter((t) => !isDoneState(snapshot, t.todoState) && earliestDueDate(t))
      .filter((t) => (priorityFilter === ALL ? true : t.priority === priorityFilter))
      .filter((t) => (stateFilter === ALL ? true : t.todoState === stateFilter))
      .filter((t) => (typeFilter === ALL ? true : t.type === typeFilter))
      .sort((a, b) => new Date(earliestDueDate(a)!).getTime() - new Date(earliestDueDate(b)!).getTime())
      .slice(0, UPCOMING_LIMIT);
  }, [allTasks, snapshot, priorityFilter, stateFilter, typeFilter]);

  const overdueTasks = useMemo(() => {
    return allTasks
      .filter((t) => !isDoneState(snapshot, t.todoState) && isOverdue(t, now))
      .sort((a, b) => new Date(earliestDueDate(a)!).getTime() - new Date(earliestDueDate(b)!).getTime());
  }, [allTasks, snapshot, now]);

  if (!project) {
    return (
      <div className="k-project-detail">
        <p className="k-empty-note">
          No project named "{projectName}" was found — it may have been renamed or removed.
        </p>
      </div>
    );
  }

  return (
    <div className="k-project-detail">
      <div className="k-project-detail__header">
        <h1 className="k-project-detail__title">PROJECT DASHBOARD: {project.name}</h1>
        <select
          className="k-page-toolbar__select"
          value={project.name}
          onChange={(e) => onSwitchProject(e.target.value)}
        >
          {snapshot.projects.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="k-card k-project-detail__progress-card">
        <div className="k-project-detail__progress-track">
          <div
            className="k-project-detail__progress-fill"
            style={{ width: `${project.percent}%` }}
          >
            {project.percent >= 10 && <span>{project.percent}%</span>}
          </div>
        </div>
        <div className="k-project-detail__progress-label">{project.percent}% Complete</div>
        {nextMilestone ? (
          <div className="k-project-detail__milestone">
            <strong>NEXT MILESTONE:</strong> {nextMilestone.title}
            {earliestDueDate(nextMilestone) && (
              <> — {humanizeDueDate(earliestDueDate(nextMilestone))}</>
            )}
          </div>
        ) : (
          <div className="k-project-detail__milestone k-project-detail__milestone--muted">
            No upcoming milestone tagged for this project.
          </div>
        )}
      </div>

      <div className="k-project-detail__grid">
        <div className="k-project-detail__col">
          <div className="k-card">
            <div className="k-card__title">
              Estimated Effort (Overview)
              <span className="k-card__subtitle">by section</span>
            </div>
            {effortBySection.length === 0 ? (
              <p className="k-empty-note">No tasks in this project have an Effort estimate set.</p>
            ) : (
              <>
                <div className="k-project-detail__donut">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={effortBySection}
                        dataKey="minutes"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={90}
                        paddingAngle={2}
                        stroke="var(--surface-1)"
                        strokeWidth={2}
                      >
                        {effortBySection.map((s, i) => (
                          <Cell key={s.name} fill={SECTION_COLORS[i % SECTION_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const item = payload[0];
                          return (
                            <div className="k-pie__tooltip">
                              <span
                                className="k-pie__tooltip-swatch"
                                style={{ background: item.payload.fill }}
                              />
                              {item.name}: <strong>{formatMinutes(item.value as number)}</strong>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="k-pie__center">
                    <div className="k-pie__center-value">{formatMinutes(totalEffortMinutes)}</div>
                    <div className="k-pie__center-label">Total</div>
                  </div>
                </div>
                <ul className="k-pie__legend">
                  {effortBySection.map((s, i) => (
                    <li key={s.name} className="k-pie__legend-item">
                      <span
                        className="k-pie__legend-swatch"
                        style={{ background: SECTION_COLORS[i % SECTION_COLORS.length] }}
                      />
                      <span className="k-pie__legend-label">{s.name}</span>
                      <span className="k-pie__legend-value">{formatMinutes(s.minutes)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {effortBySection.length > 0 && (
            <div className="k-card">
              <strong>Key Insight:</strong> most estimated effort is in{" "}
              <strong>{effortBySection[0].name}</strong> ({formatMinutes(effortBySection[0].minutes)}).
            </div>
          )}
        </div>

        <div className="k-project-detail__col">
          <div className="k-card">
            <div className="k-page-toolbar">
              <div className="k-card__title" style={{ marginBottom: 0, marginRight: "auto" }}>
                Upcoming Tasks
              </div>
              <select
                className="k-page-toolbar__select"
                value={stateFilter}
                onChange={(e) => onStateFilterChange(e.target.value)}
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
                value={typeFilter}
                onChange={(e) => onTypeFilterChange(e.target.value)}
              >
                <option value={ALL}>All types</option>
                {KNOWN_CAPTURE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className="k-page-toolbar__select"
                value={priorityFilter}
                onChange={(e) => onPriorityFilterChange(e.target.value)}
              >
                <option value={ALL}>All priorities</option>
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    Priority {p}
                  </option>
                ))}
              </select>
            </div>
            {upcomingTasks.length === 0 ? (
              <p className="k-empty-note">Nothing scheduled or due.</p>
            ) : (
              <table className="k-table">
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Est. Time</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="k-table__row--clickable"
                      onClick={() => onOpenTask(task)}
                    >
                      <td>
                        <StateBadge snapshot={snapshot} todoState={task.todoState} />
                      </td>
                      <td>
                        <TypeBadge type={task.type} />
                      </td>
                      <td className="k-table__title-cell">{task.title}</td>
                      <td className="k-table__muted">{formatMinutes(parseEffortMinutes(task.effort))}</td>
                      <td className="k-table__muted">{humanizeDueDate(earliestDueDate(task))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {overdueTasks.length > 0 && (
            <div className="k-card k-project-detail__overdue">
              <div className="k-card__title">Overdue</div>
              <table className="k-table">
                <tbody>
                  {overdueTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="k-table__row--clickable"
                      onClick={() => onOpenTask(task)}
                    >
                      <td>
                        <StateBadge snapshot={snapshot} todoState={task.todoState} />
                      </td>
                      <td className="k-table__title-cell">{task.title}</td>
                      <td className="k-table__muted">{humanizeDueDate(earliestDueDate(task))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
