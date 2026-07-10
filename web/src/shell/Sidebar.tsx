import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "▦" },
  { to: "/agenda", label: "My Agenda", icon: "📅" },
  { to: "/projects", label: "Projects", icon: "📁" },
  { to: "/inbox", label: "Inbox", icon: "📥" },
  { to: "/board", label: "K Board", icon: "🗂" },
  { to: "/calendar", label: "Calendar", icon: "🗓" },
];

export function Sidebar() {
  return (
    <aside className="k-sidebar">
      <div className="k-sidebar__brand">
        <span className="k-sidebar__brand-icon" aria-hidden="true">
          📋
        </span>
        <div>
          <div className="k-sidebar__brand-title">ORG TASKS</div>
          <div className="k-sidebar__brand-subtitle">(Emacs-inspired)</div>
        </div>
      </div>
      <nav className="k-sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              "k-sidebar__link" + (isActive ? " k-sidebar__link--active" : "")
            }
          >
            <span className="k-sidebar__link-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
