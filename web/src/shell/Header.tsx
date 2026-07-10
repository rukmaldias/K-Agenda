import { useConnectionStatus } from "../lib/ws";

interface HeaderProps {
  title: string;
  subtitle: string;
}

const STATUS_LABEL: Record<ReturnType<typeof useConnectionStatus>, string> = {
  connecting: "Connecting…",
  open: "Live",
  closed: "Reconnecting…",
};

export function Header({ title, subtitle }: HeaderProps) {
  const status = useConnectionStatus();

  return (
    <header className="k-header">
      <div>
        <h1 className="k-header__title">{title}</h1>
        <div className="k-header__subtitle">{subtitle}</div>
      </div>
      <div className="k-header__actions">
        <input
          className="k-header__search"
          type="search"
          placeholder="Search"
          aria-label="Search"
          disabled
        />
        <span
          className={`k-header__status k-header__status--${status}`}
          title={STATUS_LABEL[status]}
        >
          <span className="k-header__status-dot" aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
        <button className="k-header__icon-button" aria-label="Notifications" disabled>
          🔔
        </button>
        <div className="k-header__avatar" aria-hidden="true">
          🧑
        </div>
      </div>
    </header>
  );
}
