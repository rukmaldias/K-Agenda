import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./shell/AppShell";
import { Dashboard } from "./pages/Dashboard/Dashboard";
import { PlaceholderPage } from "./pages/PlaceholderPage";

const PLACEHOLDER_ROUTES: { path: string; title: string }[] = [
  { path: "/agenda", title: "My Agenda" },
  { path: "/projects", title: "Projects" },
  { path: "/inbox", title: "Inbox" },
  { path: "/board", title: "K Board" },
  { path: "/calendar", title: "Calendar" },
];

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <AppShell title="My Org Agenda Dashboard">
            <Dashboard />
          </AppShell>
        }
      />
      {PLACEHOLDER_ROUTES.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={
            <AppShell title={route.title}>
              <PlaceholderPage label={route.title} />
            </AppShell>
          }
        />
      ))}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
