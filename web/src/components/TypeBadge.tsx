interface TypeBadgeProps {
  type: string | null;
}

const KNOWN_TYPE_CLASSES: Record<string, string> = {
  TODO: "k-type-badge--todo",
  Meeting: "k-type-badge--meeting",
  Diary: "k-type-badge--diary",
  Idea: "k-type-badge--idea",
  Task: "k-type-badge--task",
};

export function TypeBadge({ type }: TypeBadgeProps) {
  if (!type) {
    return <span className="k-table__muted">—</span>;
  }
  const className = KNOWN_TYPE_CLASSES[type] ?? "k-type-badge--other";
  return <span className={`k-type-badge ${className}`}>{type}</span>;
}
