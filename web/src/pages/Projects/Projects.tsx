import { Link } from "react-router-dom";
import { useSnapshot } from "../../lib/ws";

export function Projects() {
  const snapshot = useSnapshot();

  if (!snapshot) {
    return <div className="k-dashboard-loading">Waiting for the first snapshot…</div>;
  }

  const { projects } = snapshot;

  return (
    <div className="k-projects">
      <div className="k-card">
        <div className="k-card__title">
          All Projects
          <span className="k-card__subtitle">({projects.length})</span>
        </div>
        {projects.length === 0 ? (
          <p className="k-empty-note">No projects found in your org-agenda-files yet.</p>
        ) : (
          <ul className="k-progress-list k-projects__list">
            {projects.map((project) => (
              <li key={project.name} className="k-progress-row">
                <Link
                  to={`/projects/${encodeURIComponent(project.name)}`}
                  className="k-progress-row__name k-progress-row__name--link"
                >
                  {project.name}
                </Link>
                <div className="k-progress-row__meta">
                  {project.file} · {project.total} task{project.total === 1 ? "" : "s"}
                  {project.cancelled > 0 ? ` · ${project.cancelled} cancelled` : ""} ·{" "}
                  {project.done} done
                </div>
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
    </div>
  );
}
