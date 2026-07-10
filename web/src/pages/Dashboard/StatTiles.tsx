import type { SnapshotData } from "../../types/snapshot";

interface StatTilesProps {
  snapshot: SnapshotData;
}

export function StatTiles({ snapshot }: StatTilesProps) {
  const { stats, todoKeywords } = snapshot;

  return (
    <div className="k-stat-tiles">
      <div className="k-stat-tile k-stat-tile--projects">
        <div className="k-stat-tile__label">Total Projects</div>
        <div className="k-stat-tile__value">{stats.totalProjects}</div>
      </div>
      {todoKeywords.map((kw) => (
        <div
          key={kw.name}
          className="k-stat-tile"
          style={{ ["--tile-accent" as string]: kw.faceHex ?? "var(--text-muted)" }}
        >
          <div className="k-stat-tile__label">{kw.label}</div>
          <div className="k-stat-tile__value">{stats.counts[kw.name] ?? 0}</div>
        </div>
      ))}
    </div>
  );
}
