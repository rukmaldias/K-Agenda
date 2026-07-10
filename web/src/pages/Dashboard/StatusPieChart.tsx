import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SnapshotData } from "../../types/snapshot";

interface StatusPieChartProps {
  snapshot: SnapshotData;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  payload: { fill: string };
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="k-pie__tooltip">
      <span className="k-pie__tooltip-swatch" style={{ background: item.payload.fill }} />
      {item.name}: <strong>{item.value}</strong>
    </div>
  );
}

export function StatusPieChart({ snapshot }: StatusPieChartProps) {
  const { stats, todoKeywords } = snapshot;
  const total = Object.values(stats.counts).reduce((sum, n) => sum + n, 0);

  const data = todoKeywords.map((kw) => ({
    name: kw.label,
    value: stats.counts[kw.name] ?? 0,
    fill: kw.faceHex ?? "#898781",
  }));

  return (
    <div className="k-card k-pie">
      <div className="k-card__title">
        Task Status Distribution
        <span className="k-card__subtitle">(Task counts)</span>
      </div>
      <div className="k-pie__body">
        <div className="k-pie__chart">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={90}
                paddingAngle={2}
                stroke="var(--surface-1)"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="k-pie__center">
            <div className="k-pie__center-value">{total}</div>
            <div className="k-pie__center-label">Total</div>
          </div>
        </div>
        <ul className="k-pie__legend">
          {data.map((entry) => (
            <li key={entry.name} className="k-pie__legend-item">
              <span className="k-pie__legend-swatch" style={{ background: entry.fill }} />
              <span className="k-pie__legend-label">{entry.name}</span>
              <span className="k-pie__legend-value">{entry.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
