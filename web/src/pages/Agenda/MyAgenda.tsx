import { useMemo, useState } from "react";
import { useSnapshot } from "../../lib/ws";
import { addDays, isSameDay, taskOccursOn } from "../../lib/date";
import { DayTaskTable } from "../../components/DayTaskTable";

const STRIP_RADIUS = 3; // 3 days either side of the selected day = 7 total

export function MyAgenda() {
  const snapshot = useSnapshot();
  const [selected, setSelected] = useState(() => new Date());

  const strip = useMemo(() => {
    const days: Date[] = [];
    for (let i = -STRIP_RADIUS; i <= STRIP_RADIUS; i++) days.push(addDays(selected, i));
    return days;
  }, [selected]);

  if (!snapshot) {
    return <div className="k-dashboard-loading">Waiting for the first snapshot…</div>;
  }

  return (
    <div className="k-agenda-page">
      <div className="k-agenda-strip">
        <button
          className="k-agenda-strip__nav"
          aria-label="Previous week"
          onClick={() => setSelected((d) => addDays(d, -7))}
        >
          ‹
        </button>
        {strip.map((day) => {
          const tasksOnDay = snapshot.tasks.filter((t) => taskOccursOn(t, day));
          const states = [...new Set(tasksOnDay.map((t) => t.todoState))].slice(0, 3);
          return (
            <button
              key={day.toISOString()}
              className={
                "k-agenda-strip__day" +
                (isSameDay(day, selected) ? " k-agenda-strip__day--selected" : "")
              }
              onClick={() => setSelected(day)}
            >
              <div className="k-agenda-strip__weekday">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="k-agenda-strip__date">{day.getDate()}</div>
              <div className="k-agenda-strip__dots">
                {states.map((s) => (
                  <span
                    key={s}
                    className="k-agenda-strip__dot"
                    style={{
                      background:
                        snapshot.todoKeywords.find((k) => k.name === s)?.faceHex ?? "#898781",
                    }}
                  />
                ))}
              </div>
            </button>
          );
        })}
        <button
          className="k-agenda-strip__nav"
          aria-label="Next week"
          onClick={() => setSelected((d) => addDays(d, 7))}
        >
          ›
        </button>
      </div>

      <div className="k-card">
        <div className="k-card__title">
          {selected.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </div>
        <DayTaskTable snapshot={snapshot} day={selected} />
      </div>
    </div>
  );
}
