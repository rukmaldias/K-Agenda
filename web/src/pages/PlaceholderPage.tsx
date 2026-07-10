interface PlaceholderPageProps {
  label: string;
}

export function PlaceholderPage({ label }: PlaceholderPageProps) {
  return (
    <div className="k-placeholder">
      <div className="k-placeholder__icon" aria-hidden="true">
        🚧
      </div>
      <h2 className="k-placeholder__title">{label} is coming soon</h2>
      <p className="k-placeholder__body">
        This view isn't wired up yet — the Dashboard is the only live screen so far.
      </p>
    </div>
  );
}
