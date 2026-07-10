import { useSnapshot } from "../../lib/ws";
import { StatTiles } from "./StatTiles";
import { StatusPieChart } from "./StatusPieChart";
import { UpcomingTasksTable } from "./UpcomingTasksTable";
import { TopProjectsProgress } from "./TopProjectsProgress";

export function Dashboard() {
  const snapshot = useSnapshot();

  if (!snapshot) {
    return (
      <div className="k-dashboard-loading">
        Waiting for k-agenda-mode in Emacs to push the first snapshot…
      </div>
    );
  }

  return (
    <div className="k-dashboard">
      <div className="k-dashboard__top">
        <StatTiles snapshot={snapshot} />
      </div>
      <div className="k-dashboard__grid">
        <div className="k-dashboard__main-col">
          <UpcomingTasksTable snapshot={snapshot} />
        </div>
        <div className="k-dashboard__side-col">
          <StatusPieChart snapshot={snapshot} />
          <TopProjectsProgress snapshot={snapshot} />
        </div>
      </div>
    </div>
  );
}
