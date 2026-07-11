import { useEffect, useMemo, useState, type DragEvent } from "react";
import { requestChangeState, useSnapshot } from "../../lib/ws";
import { earliestDueDate, humanizeDueDate } from "../../lib/date";
import { isValidTransition, rejectionMessage } from "../../lib/workflow";
import { useTaskDetail } from "../../state/taskDetail";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { Task } from "../../types/snapshot";

const ALL = "__all__";

type PendingAction =
  | { kind: "confirm"; task: Task; fromState: string; toState: string }
  | { kind: "block"; message: string };

export function KBoard() {
  const snapshot = useSnapshot();
  const [projectFilter, setProjectFilter] = useState(ALL);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const { openTask } = useTaskDetail();

  // Once the next authoritative snapshot confirms an optimistic override,
  // drop it -- avoids the override map growing unbounded and avoids it
  // ever overriding a *later, unrelated* change to the same task.
  useEffect(() => {
    if (!snapshot) return;
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const real = snapshot.tasks.find((t) => t.id === id);
        if (real && real.todoState === next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [snapshot]);

  const effectiveTasks = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.tasks.map((t) =>
      overrides[t.id] ? { ...t, todoState: overrides[t.id] } : t
    );
  }, [snapshot, overrides]);

  const tasksByState = useMemo(() => {
    const filtered = effectiveTasks.filter((t) =>
      projectFilter === ALL ? true : t.project === projectFilter
    );
    const map = new Map<string, Task[]>();
    for (const kw of snapshot?.todoKeywords ?? []) {
      map.set(
        kw.name,
        filtered
          .filter((t) => t.todoState === kw.name)
          .sort((a, b) => {
            const dueA = earliestDueDate(a);
            const dueB = earliestDueDate(b);
            if (dueA && dueB) return new Date(dueA).getTime() - new Date(dueB).getTime();
            if (dueA) return -1;
            if (dueB) return 1;
            return 0;
          })
      );
    }
    return map;
  }, [effectiveTasks, projectFilter, snapshot]);

  if (!snapshot) {
    return <div className="k-dashboard-loading">Waiting for the first snapshot…</div>;
  }

  function labelFor(state: string): string {
    return snapshot!.todoKeywords.find((k) => k.name === state)?.label ?? state;
  }

  function handleDragStart(e: DragEvent, task: Task) {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: DragEvent, toState: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    const task = effectiveTasks.find((t) => t.id === taskId);
    if (!task || !task.todoState || task.todoState === toState) return;
    const fromState = task.todoState;
    if (!isValidTransition(fromState, toState)) {
      setPendingAction({ kind: "block", message: rejectionMessage(fromState, toState) });
      return;
    }
    setPendingAction({ kind: "confirm", task, fromState, toState });
  }

  async function handleConfirmMove() {
    if (!pendingAction || pendingAction.kind !== "confirm") return;
    const { task, fromState, toState } = pendingAction;
    setBusy(true);
    setOverrides((prev) => ({ ...prev, [task.id]: toState }));
    try {
      const response = await requestChangeState(task.id, fromState, toState);
      if (!response.ok) {
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
        setPendingAction({
          kind: "block",
          message: response.message ?? "Couldn't change the task's state.",
        });
        setBusy(false);
        return;
      }
      setPendingAction(null);
      setBusy(false);
    } catch (err) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      setPendingAction({
        kind: "block",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
      setBusy(false);
    }
  }

  return (
    <div className="k-board">
      <div className="k-page-toolbar">
        <label className="k-board__filter-label" htmlFor="k-board-project-filter">
          Project Filter
        </label>
        <select
          id="k-board-project-filter"
          className="k-page-toolbar__select"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value={ALL}>All Projects</option>
          {snapshot.projects.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="k-board__readonly-note">
          Drag a card to a new column to change its state — the only screen that writes back to
          your org files.
        </span>
      </div>

      <div className="k-board__columns">
        {snapshot.todoKeywords.map((kw) => {
          const tasks = tasksByState.get(kw.name) ?? [];
          return (
            <div
              key={kw.name}
              className="k-board__column"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, kw.name)}
            >
              <div
                className="k-board__column-header"
                style={{ ["--column-accent" as string]: kw.faceHex ?? "var(--text-muted)" }}
              >
                <span className="k-board__column-title">{kw.label}</span>
                <span className="k-board__column-count">{tasks.length}</span>
              </div>
              <div className="k-board__column-body">
                {tasks.length === 0 ? (
                  <p className="k-board__column-empty">No tasks</p>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className="k-board__card k-board__card--clickable"
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onClick={() => openTask(task)}
                    >
                      <div className="k-board__card-title">{task.title}</div>
                      {task.project && (
                        <div className="k-board__card-project">{task.project}</div>
                      )}
                      {earliestDueDate(task) && (
                        <div className="k-board__card-due">
                          {humanizeDueDate(earliestDueDate(task))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pendingAction?.kind === "confirm" && (
        <ConfirmDialog
          variant="confirm"
          title="Move task?"
          message={`Move "${pendingAction.task.title}" from ${labelFor(
            pendingAction.fromState
          )} to ${labelFor(pendingAction.toState)}?`}
          confirmLabel="Move"
          busy={busy}
          onConfirm={handleConfirmMove}
          onClose={() => setPendingAction(null)}
        />
      )}
      {pendingAction?.kind === "block" && (
        <ConfirmDialog
          variant="block"
          title="That move isn't allowed"
          message={pendingAction.message}
          onClose={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
