import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./shell/AppShell";
import { Dashboard } from "./pages/Dashboard/Dashboard";
import { MyAgenda } from "./pages/Agenda/MyAgenda";
import { Projects } from "./pages/Projects/Projects";
import { Inbox } from "./pages/Inbox/Inbox";
import { KBoard } from "./pages/Board/KBoard";
import { Calendar } from "./pages/Calendar/Calendar";

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
      <Route
        path="/agenda"
        element={
          <AppShell title="My Agenda">
            <MyAgenda />
          </AppShell>
        }
      />
      <Route
        path="/projects"
        element={
          <AppShell title="Projects">
            <Projects />
          </AppShell>
        }
      />
      <Route
        path="/inbox"
        element={
          <AppShell title="Inbox">
            <Inbox />
          </AppShell>
        }
      />
      <Route
        path="/board"
        element={
          <AppShell title="K Board">
            <KBoard />
          </AppShell>
        }
      />
      <Route
        path="/calendar"
        element={
          <AppShell title="Calendar">
            <Calendar />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
