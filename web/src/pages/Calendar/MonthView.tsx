import type { SnapshotData } from "../../types/snapshot";
import { isSameDay, taskOccursOn } from "../../lib/date";
import { faceHexFor } from "../../lib/todoKeywords";
import { monthGrid } from "./calendarDate";

interface MonthViewProps {
  snapshot: SnapshotData;
  anchor: Date;
  onSelectDay: (day: Date) => void;
}

const MAX_CHIPS_PER_DAY = 3;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({ snapshot, anchor, onSelectDay }: MonthViewProps) {
  const days = monthGrid(anchor);
  const today = new Date();

  return (
    <div className="k-cal-month">
      <div className="k-cal-month__weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="k-cal-month__weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="k-cal-month__grid">
        {days.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const tasks = snapshot.tasks.filter((t) => taskOccursOn(t, day));
          const visible = tasks.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = tasks.length - visible.length;
          return (
            <button
              key={day.toISOString()}
              className={
                "k-cal-month__cell" +
                (inMonth ? "" : " k-cal-month__cell--muted") +
                (isSameDay(day, today) ? " k-cal-month__cell--today" : "")
              }
              onClick={() => onSelectDay(day)}
            >
              <div className="k-cal-month__cell-date">{day.getDate()}</div>
              <div className="k-cal-month__cell-chips">
                {visible.map((task) => (
                  <div
                    key={task.id}
                    className="k-cal-month__chip"
                    style={{
                      ["--chip-color" as string]: faceHexFor(snapshot, task.todoState),
                    }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))}
                {overflow > 0 && <div className="k-cal-month__more">+{overflow} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
