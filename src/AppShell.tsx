import { type Editor, useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";
import type { DocumentSummary, RecoveryPoint } from "./documents";
import { countText } from "./editor";
import { ThemeControl } from "./ThemeControl";

export type SaveState = "Saved" | "Saving" | "Unsaved" | "Save failed";

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

export function TopBar({ saveState }: { saveState: SaveState }) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          R
        </span>
        <span className="brand-word">REDLINE</span>
        <span className="brand-version">0.0.3</span>
      </div>
      <div className="profile">
        <span>Profile</span>
        <strong>General</strong>
      </div>
      <div className="app-state" role="status">
        <span
          className={`state-dot state-${saveState.toLowerCase().replace(" ", "-")}`}
          aria-hidden="true"
        />
        {saveState}
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

function DocumentButton({
  active,
  document,
  onOpen,
}: {
  active: boolean;
  document: DocumentSummary;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button
        className={`document-button${active ? " document-button-active" : ""}`}
        onClick={() => onOpen(document.id)}
        type="button"
      >
        <Icon name="document" />
        <span>{document.title}</span>
      </button>
    </li>
  );
}

type SidebarProps = {
  activeId: string | null;
  documents: DocumentSummary[];
  recent: DocumentSummary[];
  revisions: RecoveryPoint[];
  trash: DocumentSummary[];
  onDelete: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRestore: (id: string) => void;
  onRestoreRevision: (revision: RecoveryPoint) => void;
};

export function Sidebar({
  activeId,
  documents,
  recent,
  revisions,
  trash,
  onDelete,
  onNew,
  onOpen,
  onRestore,
  onRestoreRevision,
}: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Document navigation">
      <button className="new-document-button" onClick={onNew} type="button">
        <Icon name="document" />
        New document
      </button>

      <details open>
        <summary>
          <Icon name="folder" />
          Documents <span>{documents.length}</span>
        </summary>
        {documents.length ? (
          <ul className="document-list">
            {documents.map((document) => (
              <DocumentButton
                active={activeId === document.id}
                document={document}
                key={document.id}
                onOpen={onOpen}
              />
            ))}
          </ul>
        ) : (
          <p className="sidebar-empty">No saved documents</p>
        )}
      </details>

      <details>
        <summary>
          <Icon name="history" />
          Recent <span>{recent.length}</span>
        </summary>
        <ul className="document-list">
          {recent.map((document) => (
            <DocumentButton
              active={activeId === document.id}
              document={document}
              key={document.id}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </details>

      <details>
        <summary>
          <Icon name="history" />
          History <span>{revisions.length}</span>
        </summary>
        {revisions.length ? (
          <ul className="document-list">
            {revisions.map((revision) => (
              <li key={revision.id}>
                <button
                  className="recovery-button"
                  onClick={() => onRestoreRevision(revision)}
                  type="button"
                >
                  <span>{revision.title}</span>
                  <time dateTime={new Date(revision.createdAt).toISOString()}>
                    {new Date(revision.createdAt).toLocaleString()}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sidebar-empty">No recovery points</p>
        )}
      </details>

      <details>
        <summary>
          <Icon name="folder" />
          Trash <span>{trash.length}</span>
        </summary>
        {trash.length ? (
          <ul className="document-list">
            {trash.map((document) => (
              <li key={document.id}>
                <button
                  className="recovery-button"
                  onClick={() => onRestore(document.id)}
                  type="button"
                >
                  <span>{document.title}</span>
                  <small>Restore</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sidebar-empty">Trash is empty</p>
        )}
      </details>

      <button
        className="trash-button"
        disabled={!activeId}
        onClick={onDelete}
        type="button"
      >
        Move current document to Trash
      </button>
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
        <span className="panel-state">Inactive</span>
      </header>
      <div className="analysis-empty">
        <div className="empty-icon" aria-hidden="true">
          <Icon name="message" />
        </div>
        <h3>Nothing to review yet</h3>
        <p>Analysis remains inactive until AXIOM is introduced.</p>
      </div>
    </aside>
  );
}

type StatusBarProps = {
  editor: Editor | null;
  error: string | null;
  onSave: () => void;
  onTitleChange: (title: string) => void;
  saveState: SaveState;
  title: string;
};

export function StatusBar({
  editor,
  error,
  onSave,
  onTitleChange,
  saveState,
  title,
}: StatusBarProps) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current && !current.isDestroyed
        ? countText(current.getText({ blockSeparator: "\n" }))
        : null,
  });
  return (
    <footer className="status-bar">
      <label className="title-control">
        <span className="sr-only">Document title</span>
        <input
          aria-label="Document title"
          maxLength={200}
          onChange={(event) => onTitleChange(event.target.value)}
          value={title}
        />
      </label>
      <button
        className="save-button"
        disabled={saveState === "Saving"}
        onClick={onSave}
        type="button"
      >
        Save
      </button>
      <span
        className={`save-status save-status-${saveState.toLowerCase().replace(" ", "-")}`}
        role="status"
        title={error ?? undefined}
      >
        <Icon name="info" />
        {error ? `${saveState}: ${error}` : saveState}
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
      <span className="privacy-note">Local only · Private by default</span>
    </footer>
  );
}
