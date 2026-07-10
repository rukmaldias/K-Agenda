import type { SnapshotData } from "../../types/snapshot";

interface TopProjectsProgressProps {
  snapshot: SnapshotData;
}

export function TopProjectsProgress({ snapshot }: TopProjectsProgressProps) {
  const { projects } = snapshot;

  return (
    <div className="k-card k-top-projects">
      <div className="k-card__title">Top Projects Progress</div>
      {projects.length === 0 ? (
        <p className="k-upcoming__empty">No projects found yet.</p>
      ) : (
        <ul className="k-top-projects__list">
          {projects.map((project) => (
            <li key={project.name} className="k-top-projects__row">
              <div className="k-top-projects__name">{project.name}</div>
              <div className="k-top-projects__bar-track">
                <div
                  className="k-top-projects__bar-fill"
                  style={{ width: `${project.percent}%` }}
                />
              </div>
              <div className="k-top-projects__percent">{project.percent}%</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
