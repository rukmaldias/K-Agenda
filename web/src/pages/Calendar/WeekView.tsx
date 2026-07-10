import type { SnapshotData } from "../../types/snapshot";
import { isSameDay, taskOccursOn } from "../../lib/date";
import { faceHexFor } from "../../lib/todoKeywords";
import { weekDays } from "./calendarDate";

interface WeekViewProps {
  snapshot: SnapshotData;
  anchor: Date;
  onSelectDay: (day: Date) => void;
}

export function WeekView({ snapshot, anchor, onSelectDay }: WeekViewProps) {
  const days = weekDays(anchor);
  const today = new Date();

  return (
    <div className="k-cal-week">
      {days.map((day) => {
        const tasks = snapshot.tasks.filter((t) => taskOccursOn(t, day));
        return (
          <button
            key={day.toISOString()}
            className={
              "k-cal-week__day" + (isSameDay(day, today) ? " k-cal-week__day--today" : "")
            }
            onClick={() => onSelectDay(day)}
          >
            <div className="k-cal-week__day-header">
              <span className="k-cal-week__weekday">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span className="k-cal-week__date">{day.getDate()}</span>
            </div>
            <div className="k-cal-week__tasks">
              {tasks.length === 0 ? (
                <div className="k-cal-week__empty">—</div>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="k-cal-week__task"
                    style={{ ["--chip-color" as string]: faceHexFor(snapshot, task.todoState) }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
