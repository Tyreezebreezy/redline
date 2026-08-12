import { type Editor, useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";
import { countText } from "./editor";
import { ThemeControl } from "./ThemeControl";

type IconName =
  | "document"
  | "folder"
  | "history"
  | "message"
  | "settings"
  | "info";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    document: (
      <>
        <path d="M6 2.75h7l5 5V21.25H6z" />
        <path d="M13 2.75v5h5" />
      </>
    ),
    folder: <path d="M2.75 6.5h7l2-2h9.5v15H2.75z" />,
    history: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    message: <path d="M4 4.5h16v11H11l-4.5 4v-4H4z" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.75v2.5M12 18.75v2.5M2.75 12h2.5M18.75 12h2.5M5.46 5.46l1.77 1.77M16.77 16.77l1.77 1.77M18.54 5.46l-1.77 1.77M7.23 16.77l-1.77 1.77" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10.5v6M12 7.25h.01" />
      </>
    ),
  };

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function TopBar() {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          R
        </span>
        <span className="brand-word">REDLINE</span>
        <span className="brand-version">0.0.2</span>
      </div>

      <div className="profile">
        <span>Profile</span>
        <strong>General</strong>
      </div>

      <div className="app-state" role="status">
        <span className="state-dot" aria-hidden="true" />
        Ready
      </div>

      <div className="top-actions">
        <ThemeControl />
        <span
          className="future-action"
          title="Settings arrive in a later milestone"
        >
          <Icon name="settings" />
          <span>Settings</span>
        </span>
      </div>
    </header>
  );
}

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Document navigation">
      <p className="section-label">Workspace</p>
      <ul className="nav-list">
        <li className="nav-item nav-item-active" aria-current="page">
          <Icon name="document" />
          <span>New document</span>
        </li>
        <li className="nav-item">
          <Icon name="folder" />
          <span>Documents</span>
        </li>
        <li className="nav-item">
          <Icon name="history" />
          <span>Recent</span>
        </li>
      </ul>
      <p className="sidebar-note">
        Document tools arrive in a later milestone.
      </p>
    </nav>
  );
}

export function AnalysisPanel() {
  return (
    <aside className="analysis-panel" aria-labelledby="analysis-title">
      <header className="panel-header">
        <div>
          <p className="section-label">Review</p>
          <h2 id="analysis-title">Analysis</h2>
        </div>
        <span className="panel-state">Empty</span>
      </header>
      <div className="analysis-empty">
        <div className="empty-icon" aria-hidden="true">
          <Icon name="message" />
        </div>
        <h3>Nothing to review yet</h3>
        <p>Suggestions will appear when writing tools are added.</p>
      </div>
    </aside>
  );
}

export function StatusBar({ editor }: { editor: Editor | null }) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current ? countText(current.getText({ blockSeparator: "\n" })) : null,
  });

  return (
    <footer className="status-bar">
      <span className="draft-warning">
        <Icon name="info" />
        Temporary draft — closing REDLINE clears this text.
      </span>
      <span className="status-separator" aria-hidden="true" />
      <span className="editor-counts" aria-live="polite">
        <span>
          {counts?.words ?? 0} {counts?.words === 1 ? "word" : "words"}
        </span>
        <span>
          {counts?.characters ?? 0}{" "}
          {counts?.characters === 1 ? "character" : "characters"}
        </span>
      </span>
      <span className="privacy-note">Private by default</span>
    </footer>
  );
}
