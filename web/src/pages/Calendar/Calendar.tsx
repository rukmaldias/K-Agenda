import { useState } from "react";
import { useSnapshot } from "../../lib/ws";
import { addDays } from "../../lib/date";
import { DayTaskTable } from "../../components/DayTaskTable";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { ListView } from "./ListView";

type ViewMode = "month" | "week" | "day" | "list";

const VIEW_LABELS: { mode: ViewMode; label: string }[] = [
  { mode: "month", label: "Month" },
  { mode: "week", label: "Week" },
  { mode: "day", label: "Day" },
  { mode: "list", label: "List" },
];

function shiftAnchor(anchor: Date, mode: ViewMode, direction: 1 | -1): Date {
  if (mode === "month") {
    return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  }
  if (mode === "week") return addDays(anchor, 7 * direction);
  if (mode === "day") return addDays(anchor, direction);
  return anchor;
}

export function Calendar() {
  const snapshot = useSnapshot();
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());

  if (!snapshot) {
    return <div className="k-dashboard-loading">Waiting for the first snapshot…</div>;
  }

  const headerLabel =
    mode === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : mode === "list"
        ? "All scheduled tasks"
        : anchor.toLocaleDateString(undefined, {
            weekday: mode === "day" ? "long" : undefined,
            month: "long",
            day: "numeric",
            year: "numeric",
          });

  return (
    <div className="k-calendar">
      <div className="k-page-toolbar">
        {mode !== "list" && (
          <div className="k-cal-nav">
            <button
              className="k-cal-nav__button"
              aria-label="Previous"
              onClick={() => setAnchor((a) => shiftAnchor(a, mode, -1))}
            >
              ‹
            </button>
            <button className="k-cal-nav__today" onClick={() => setAnchor(new Date())}>
              Today
            </button>
            <button
              className="k-cal-nav__button"
              aria-label="Next"
              onClick={() => setAnchor((a) => shiftAnchor(a, mode, 1))}
            >
              ›
            </button>
          </div>
        )}
        <div className="k-cal-header-label">{headerLabel}</div>
        <div className="k-page-toolbar__tabs k-cal-view-tabs">
          {VIEW_LABELS.map((v) => (
            <button
              key={v.mode}
              className={
                "k-page-toolbar__tab" + (mode === v.mode ? " k-page-toolbar__tab--active" : "")
              }
              onClick={() => setMode(v.mode)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "month" && (
        <MonthView
          snapshot={snapshot}
          anchor={anchor}
          onSelectDay={(day) => {
            setAnchor(day);
            setMode("day");
          }}
        />
      )}
      {mode === "week" && (
        <WeekView
          snapshot={snapshot}
          anchor={anchor}
          onSelectDay={(day) => {
            setAnchor(day);
            setMode("day");
          }}
        />
      )}
      {mode === "day" && (
        <div className="k-card">
          <DayTaskTable snapshot={snapshot} day={anchor} />
        </div>
      )}
      {mode === "list" && (
        <div className="k-card">
          <ListView snapshot={snapshot} />
        </div>
      )}
    </div>
  );
}
