import { useMemo, useState, type CSSProperties } from "react";
import { useSnapshot } from "../../lib/ws";
import { sectionFor } from "../../lib/effort";
import { SECTION_COLORS } from "../../lib/color";
import { useTaskDetail } from "../../state/taskDetail";
import { isMilestone } from "../Projects/ProjectDetail";
import { barPosition, buildTimeline, monthBoundaryPercents, pctForDate, startOfDay } from "./roadmapDate";
import type { Timeline } from "./roadmapDate";
import type { SnapshotData, Task } from "../../types/snapshot";

interface DatedTask {
  task: Task;
  start: Date;
  end: Date;
}

function colorForSection(name: string, allNames: string[]): string {
  const idx = allNames.indexOf(name);
  return SECTION_COLORS[(idx < 0 ? 0 : idx) % SECTION_COLORS.length];
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

  const projectName = useMemo(() => {
    if (selectedProject && snapshot.projects.some((p) => p.name === selectedProject)) return selectedProject;
    return snapshot.projects[0]?.name ?? null;
  }, [snapshot, selectedProject]);

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

  const sections = useMemo(() => {
    const groups = new Map<string, DatedTask[]>();
    for (const d of datedTasks) {
      const key = sectionFor(d.task);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    for (const items of groups.values()) items.sort((a, b) => a.start.getTime() - b.start.getTime());
    return sectionNames
      .map((name) => ({ name, tasks: groups.get(name) ?? [] }))
      .sort((a, b) => a.tasks[0].start.getTime() - b.tasks[0].start.getTime());
  }, [datedTasks, sectionNames]);

  if (!projectName) {
    return (
      <div className="k-roadmap">
        <p className="k-empty-note">No projects found in your org-agenda-files yet.</p>
      </div>
    );
  }

  const monthBoundaries = timeline ? monthBoundaryPercents(timeline) : [];
  const todayPct = timeline ? pctForDate(timeline, startOfDay(new Date())) : null;
  const showToday = todayPct !== null && todayPct >= 0 && todayPct <= 100;

  return (
    <div className="k-roadmap">
      <div className="k-project-detail__header">
        <h1 className="k-project-detail__title">PROJECT ROADMAP: {projectName}</h1>
        <select
          className="k-page-toolbar__select"
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

      {!timeline ? (
        <div className="k-card">
          <p className="k-empty-note">No scheduled or deadlined tasks in this project yet.</p>
        </div>
      ) : (
        <div className="k-card k-roadmap-chart">
          <div className="k-roadmap-chart__legend">
            {sectionNames.map((name) => (
              <div key={name} className="k-roadmap-chart__legend-item">
                <span
                  className="k-roadmap-chart__legend-swatch"
                  style={{ background: colorForSection(name, sectionNames) }}
                />
                {name}
              </div>
            ))}
          </div>

          <div className="k-roadmap-chart__scroll">
            <div
              className="k-roadmap-chart__timeline"
              style={{ minWidth: `${Math.max(640, timeline.months.length * 130)}px` }}
            >
              <div className="k-roadmap-chart__header-row">
                {timeline.months.map((m, i) => (
                  <div key={i} className="k-roadmap-chart__month" style={{ flex: `0 0 ${m.widthPct}%` }}>
                    {m.label}
                  </div>
                ))}
              </div>

              <div className="k-roadmap-chart__body">
                {sections.map((section) => (
                  <div key={section.name} className="k-roadmap-chart__section">
                    <div className="k-roadmap-chart__section-header">{section.name}</div>
                    {section.tasks.map((d) => (
                      <RoadmapRow
                        key={d.task.id}
                        dated={d}
                        timeline={timeline}
                        color={colorForSection(section.name, sectionNames)}
                        onOpen={() => openTask(d.task)}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div className="k-roadmap-chart__gridlines" aria-hidden="true">
                {monthBoundaries.map((pct, i) => (
                  <div key={i} className="k-roadmap-chart__gridline" style={{ left: `${pct}%` }} />
                ))}
                {showToday && (
                  <div className="k-roadmap-chart__today" style={{ left: `${todayPct}%` }} title="Today" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {undatedCount > 0 && (
        <p className="k-roadmap__undated-note">
          {undatedCount} task{undatedCount === 1 ? "" : "s"} in this project{" "}
          {undatedCount === 1 ? "has" : "have"} no scheduled or deadline date and{" "}
          {undatedCount === 1 ? "isn't" : "aren't"} shown on the roadmap.
        </p>
      )}
    </div>
  );
}

interface RoadmapRowProps {
  dated: DatedTask;
  timeline: Timeline;
  color: string;
  onOpen: () => void;
}

function RoadmapRow({ dated, timeline, color, onOpen }: RoadmapRowProps) {
  const { leftPct, widthPct } = barPosition(timeline, dated.start, dated.end);
  const milestone = isMilestone(dated.task);
  const markerStyle: CSSProperties = {
    left: `${leftPct}%`,
    width: `${widthPct}%`,
    background: color,
  };
  const labelStyle: CSSProperties = { left: `calc(${leftPct}% + 20px)` };

  return (
    <div className="k-roadmap-chart__row" title={dated.task.title} onClick={onOpen}>
      <span
        className={"k-roadmap-chart__marker" + (milestone ? " k-roadmap-chart__marker--milestone" : "")}
        style={markerStyle}
      />
      <span className="k-roadmap-chart__label" style={labelStyle}>
        {milestone && <span className="k-roadmap-chart__label-icon">◆</span>}
        {dated.task.title}
      </span>
    </div>
  );
}
