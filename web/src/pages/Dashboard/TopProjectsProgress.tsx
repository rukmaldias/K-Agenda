import type { SnapshotData } from "../../types/snapshot";

interface TopProjectsProgressProps {
  snapshot: SnapshotData;
}

const TOP_PROJECTS_LIMIT = 5;

export function TopProjectsProgress({ snapshot }: TopProjectsProgressProps) {
  const projects = snapshot.projects.slice(0, TOP_PROJECTS_LIMIT);

  return (
    <div className="k-card k-top-projects">
      <div className="k-card__title">Top Projects Progress</div>
      {projects.length === 0 ? (
        <p className="k-empty-note">No projects found yet.</p>
      ) : (
        <ul className="k-progress-list">
          {projects.map((project) => (
            <li key={project.name} className="k-progress-row">
              <div className="k-progress-row__name">{project.name}</div>
              <div className="k-progress-row__bar-track">
                <div
                  className="k-progress-row__bar-fill"
                  style={{ width: `${project.percent}%` }}
                />
              </div>
              <div className="k-progress-row__percent">{project.percent}%</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
