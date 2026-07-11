import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Task } from "../types/snapshot";

interface TaskDetailContextValue {
  selectedTask: Task | null;
  openTask: (task: Task) => void;
  closeTask: () => void;
}

const TaskDetailContext = createContext<TaskDetailContextValue | null>(null);

export function TaskDetailProvider({ children }: { children: ReactNode }) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const openTask = useCallback((task: Task) => setSelectedTask(task), []);
  const closeTask = useCallback(() => setSelectedTask(null), []);
  const value = useMemo(() => ({ selectedTask, openTask, closeTask }), [selectedTask, openTask, closeTask]);

  return <TaskDetailContext.Provider value={value}>{children}</TaskDetailContext.Provider>;
}

export function useTaskDetail(): TaskDetailContextValue {
  const ctx = useContext(TaskDetailContext);
  if (!ctx) throw new Error("useTaskDetail must be used within a TaskDetailProvider");
  return ctx;
}
