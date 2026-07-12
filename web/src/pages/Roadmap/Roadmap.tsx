import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSnapshot } from "../../lib/ws";
import { sectionFor, parseEffortMinutes, formatMinutes } from "../../lib/effort";
import { SECTION_COLORS } from "../../lib/color";
import { isDoneState } from "../../lib/todoKeywords";
import { useTaskDetail } from "../../state/taskDetail";
import { isMilestone } from "../Projects/ProjectDetail";
import { StateBadge } from "../../components/StateBadge";
import { buildTimeline, pctForDate, startOfDay } from "./roadmapDate";
import type { ProjectProgress, SnapshotData, Task } from "../../types/snapshot";

interface DatedTask {
  task: Task;
  start: Date;
  end: Date;
}

interface Phase {
  name: string;
  color: string;
  tasks: DatedTask[];
  start: Date;
  end: Date;
  done: number;
  percent: number;
}

const TYPE_ICONS: Record<string, string> = {
  Todo: "☑️",
  Meeting: "🗓️",
  Diary: "📔",
  Idea: "💡",
  Task: "📌",
};

function iconFor(type: string | null): string {
  return type ? (TYPE_ICONS[type] ?? "•") : "•";
}

function colorForSection(name: string, allNames: string[]): string {
  const idx = allNames.indexOf(name);
  return SECTION_COLORS[(idx < 0 ? 0 : idx) % SECTION_COLORS.length];
}

// A repeating cascade of top offsets so successive phase cards don't all
// start at the same height -- purely visual, unrelated to card content.
const CARD_STAGGER_PX = [0, 30, 12, 42, 6, 36];

function staggerFor(index: number): number {
  return CARD_STAGGER_PX[index % CARD_STAGGER_PX.length];
}

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startLabel = start.toLocaleDateString(undefined, opts);
  const endLabel = end.toLocaleDateString(undefined, opts);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function Roadmap() {
  const snapshot = useSnapshot();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  if (!snapshot) {
    return <div className="k-dashboard-loading">Waiting for the first snapshot…</div>;
  }

  return (
    <RoadmapBody snapshot={snapshot} selectedProject={selectedProject} onSelectProject={setSelectedProject} />
  );
}

interface RoadmapBodyProps {
  snapshot: SnapshotData;
  selectedProject: string | null;
  onSelectProject: (name: string) => void;
}

function RoadmapBody({ snapshot, selectedProject, onSelectProject }: RoadmapBodyProps) {
  const { openTask } = useTaskDetail();
  const navigate = useNavigate();

  const projectName = useMemo(() => {
    if (selectedProject && snapshot.projects.some((p) => p.name === selectedProject)) return selectedProject;
    return snapshot.projects[0]?.name ?? null;
  }, [snapshot, selectedProject]);

  const project: ProjectProgress | undefined = snapshot.projects.find((p) => p.name === projectName);

  const projectTasks = useMemo(
    () => (projectName ? snapshot.tasks.filter((t) => t.project === projectName) : []),
    [snapshot, projectName]
  );

  const datedTasks = useMemo(() => {
    return projectTasks
      .map((t) => {
        const startIso = t.scheduled ?? t.deadline;
        const endIso = t.deadline ?? t.scheduled;
        if (!startIso || !endIso) return null;
        const a = startOfDay(new Date(startIso));
        const b = startOfDay(new Date(endIso));
        return { task: t, start: a <= b ? a : b, end: a <= b ? b : a };
      })
      .filter((x): x is DatedTask => x !== null);
  }, [projectTasks]);

  const undatedCount = projectTasks.length - datedTasks.length;

  const totalEffortMinutes = useMemo(
    () => projectTasks.reduce((sum, t) => sum + parseEffortMinutes(t.effort), 0),
    [projectTasks]
  );

  const timeline = useMemo(() => {
    if (datedTasks.length === 0) return null;
    return buildTimeline(
      datedTasks.map((d) => d.start),
      datedTasks.map((d) => d.end)
    );
  }, [datedTasks]);

  const sectionNames = useMemo(
    () => [...new Set(datedTasks.map((d) => sectionFor(d.task)))].sort(),
    [datedTasks]
  );

  const phases = useMemo((): Phase[] => {
    const groups = new Map<string, DatedTask[]>();
    for (const d of datedTasks) {
      const key = sectionFor(d.task);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    for (const items of groups.values()) items.sort((a, b) => a.start.getTime() - b.start.getTime());

    return sectionNames
      .map((name) => {
        const tasks = groups.get(name) ?? [];
        const done = tasks.filter((d) => isDoneState(snapshot, d.task.todoState)).length;
        return {
          name,
          color: colorForSection(name, sectionNames),
          tasks,
          start: tasks[0].start,
          end: tasks.reduce((latest, d) => (d.end > latest ? d.end : latest), tasks[0].end),
          done,
          percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [datedTasks, sectionNames, snapshot]);

  const completePhaseCount = phases.filter((p) => p.percent === 100).length;

  if (!projectName || !project) {
    return (
      <div className="k-roadmap">
        <p className="k-empty-note">No projects found in your org-agenda-files yet.</p>
      </div>
    );
  }

  const todayPct = timeline ? pctForDate(timeline, startOfDay(new Date())) : null;
  const showToday = todayPct !== null && todayPct >= 0 && todayPct <= 100;

  return (
    <div className="k-roadmap">
      <div className="k-roadmap__top">
        <div className="k-roadmap__title-row">
          <div className="k-roadmap__title-block">
            <div className="k-roadmap__eyebrow">PROJECT ROADMAP</div>
            <h1 className="k-roadmap__title">{projectName}</h1>
          </div>
          <select
            className="k-page-toolbar__select k-roadmap__project-select"
            value={projectName}
            onChange={(e) => onSelectProject(e.target.value)}
          >
            {snapshot.projects.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="k-roadmap__stats">
          <div className="k-roadmap-stat k-roadmap-stat--donut">
            <div className="k-roadmap-stat__label">Project Total Progress</div>
            <div className="k-roadmap-donut" style={{ ["--pct" as string]: project.percent }}>
              <div className="k-roadmap-donut__center">{project.percent}%</div>
            </div>
          </div>
          <div className="k-roadmap-stat">
            <div className="k-roadmap-stat__label">Total Phases</div>
            <div className="k-roadmap-stat__value">
              {completePhaseCount}/{phases.length}
              <span className="k-roadmap-stat__unit">Complete</span>
            </div>
          </div>
          <div className="k-roadmap-stat">
            <div className="k-roadmap-stat__label">Est. Total Time</div>
            <div className="k-roadmap-stat__value">{formatMinutes(totalEffortMinutes)}</div>
          </div>
          <div className="k-roadmap-stat">
            <div className="k-roadmap-stat__label">Completed Tasks</div>
            <div className="k-roadmap-stat__value">
              {project.done}/{project.total}
            </div>
            <div className="k-roadmap-stat__bar">
              <div className="k-roadmap-stat__bar-fill" style={{ width: `${project.percent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {phases.length === 0 ? (
        <div className="k-card">
          <p className="k-empty-note">No scheduled or deadlined tasks in this project yet.</p>
        </div>
      ) : (
        <>
          <div className="k-card">
            <div className="k-roadmap-legend__title">Phase Legend</div>
            <div className="k-roadmap-legend">
              {phases.map((phase) => (
                <div key={phase.name} className="k-roadmap-legend__item">
                  <span className="k-roadmap-legend__swatch" style={{ background: phase.color }} />
                  {phase.name}
                </div>
              ))}
            </div>
          </div>

          <div className="k-roadmap-canvas-scroll">
            <div
              className="k-roadmap-canvas"
              style={{ minWidth: `${Math.max(700, phases.length * 340)}px` }}
            >
              {timeline && (
                <div className="k-roadmap-canvas__months">
                  {timeline.months.map((m, i) => (
                    <div key={i} className="k-roadmap-canvas__month" style={{ flex: `0 0 ${m.widthPct}%` }}>
                      {m.label}
                    </div>
                  ))}
                </div>
              )}

              {showToday && (
                <>
                  <div className="k-roadmap-canvas__today-line" style={{ left: `${todayPct}%` }} />
                  <div className="k-roadmap-canvas__today-date" style={{ left: `${todayPct}%` }}>
                    {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                  </div>
                  <div className="k-roadmap-canvas__today-chip" style={{ left: `${todayPct}%` }}>
                    TODAY
                  </div>
                </>
              )}

              <div className="k-roadmap-flow">
                {phases.map((phase, i) => (
                  <div
                    className="k-roadmap-flow__item"
                    key={phase.name}
                    style={{ marginTop: `${staggerFor(i)}px` }}
                  >
                    <PhaseCard phase={phase} snapshot={snapshot} onOpenTask={openTask} />
                    {i < phases.length - 1 && (
                      <div
                        className="k-roadmap-flow__arrow"
                        style={{ marginTop: `${Math.max(0, staggerFor(i + 1) - staggerFor(i)) + 26}px` }}
                        aria-hidden="true"
                      >
                        →
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {undatedCount > 0 && (
        <p className="k-roadmap__undated-note">
          {undatedCount} task{undatedCount === 1 ? "" : "s"} in this project{" "}
          {undatedCount === 1 ? "has" : "have"} no scheduled or deadline date and{" "}
          {undatedCount === 1 ? "isn't" : "aren't"} shown on the roadmap.
        </p>
      )}

      <div className="k-roadmap__actions">
        <span className="k-roadmap__actions-label">Actions</span>
        <button type="button" className="k-roadmap__action-btn" onClick={() => window.print()}>
          Export Roadmap
        </button>
        <button
          type="button"
          className="k-roadmap__action-btn k-roadmap__action-btn--primary"
          onClick={() => navigate("/board")}
        >
          View Kanban
        </button>
      </div>
    </div>
  );
}

interface PhaseCardProps {
  phase: Phase;
  snapshot: SnapshotData;
  onOpenTask: (task: Task) => void;
}

function PhaseCard({ phase, snapshot, onOpenTask }: PhaseCardProps) {
  const maxEffort = Math.max(...phase.tasks.map((d) => parseEffortMinutes(d.task.effort)), 1);

  return (
    <div className="k-phase-card" style={{ borderColor: phase.color }}>
      <div className="k-phase-card__header" style={{ background: phase.color }}>
        <div className="k-phase-card__title">{phase.name}</div>
        <div className="k-phase-card__subtitle">
          {formatDateRange(phase.start, phase.end)} · {phase.tasks.length} task
          {phase.tasks.length === 1 ? "" : "s"}
        </div>
        <div className="k-phase-card__progress-track">
          <div className="k-phase-card__progress-fill" style={{ width: `${phase.percent}%` }} />
        </div>
      </div>
      <div className="k-phase-card__tasks">
        {phase.tasks.map((d) => {
          const milestone = isMilestone(d.task);
          const minutes = parseEffortMinutes(d.task.effort);
          return (
            <button
              key={d.task.id}
              type="button"
              className={"k-phase-card__task" + (milestone ? " k-phase-card__task--milestone" : "")}
              onClick={() => onOpenTask(d.task)}
            >
              <div className="k-phase-card__task-row">
                <span className="k-phase-card__task-icon">{milestone ? "◆" : iconFor(d.task.type)}</span>
                <span className="k-phase-card__task-title">{d.task.title}</span>
                <StateBadge snapshot={snapshot} todoState={d.task.todoState} />
              </div>
              {minutes > 0 && (
                <div className="k-phase-card__task-bar-track">
                  <div
                    className="k-phase-card__task-bar-fill"
                    style={{ width: `${(minutes / maxEffort) * 100}%`, background: phase.color }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
