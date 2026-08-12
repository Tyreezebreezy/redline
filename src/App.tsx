import {
  AnalysisPanel,
  Sidebar,
  StatusBar,
  TopBar,
  Workspace,
} from "./AppShell";
import "./styles.css";

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <Workspace />
        <AnalysisPanel />
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
