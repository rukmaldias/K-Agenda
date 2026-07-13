import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import "./shell/shell.css";
import "./components/components.css";
import "./pages/Dashboard/dashboard.css";
import "./pages/Projects/projects.css";
import "./pages/Inbox/inbox.css";
import "./pages/Board/board.css";
import "./pages/Agenda/agenda.css";
import "./pages/Calendar/calendar.css";
import "./pages/Roadmap/roadmap.css";
import "./pages/References/references.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);
