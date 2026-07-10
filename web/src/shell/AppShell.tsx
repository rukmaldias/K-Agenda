import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface AppShellProps {
  title: string;
  children: ReactNode;
}

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function AppShell({ title, children }: AppShellProps) {
  return (
    <div className="k-shell">
      <Sidebar />
      <div className="k-shell__content">
        <Header title={title} subtitle={TODAY_LABEL} />
        <main className="k-shell__main">{children}</main>
      </div>
    </div>
  );
}
