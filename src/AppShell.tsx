import { type Editor, useEditorState } from "@tiptap/react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  type AxiomSuggestion,
  isDictionaryEligible,
  type WritingProfile,
} from "./axiom/axiom";
import type { EditorIssue } from "./axiom/projection";
import type { EditorClarityFinding } from "./clarity/clarity";
import type {
  DictionaryEntry,
  DocumentSummary,
  RecoveryPoint,
  VoiceLane,
  VoiceSettings,
} from "./documents";
import { countText } from "./editor";
import { VOICE_LANES } from "./humanizer";
import { ThemeControl } from "./ThemeControl";
import type {
  RewritePreset,
  TransformPreset,
  TransformWorkflowState,
} from "./transform";

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

export function TopBar({
  dictionary,
  onProfileChange,
  onRemoveDictionaryTerm,
  onVoiceSettingsChange,
  profile,
  saveState,
  voiceSettings,
}: {
  dictionary: DictionaryEntry[];
  onProfileChange: (profile: WritingProfile) => void;
  onRemoveDictionaryTerm: (normalizedTerm: string) => Promise<void>;
  onVoiceSettingsChange: (
    enabled: boolean,
    defaultLane: VoiceLane,
  ) => Promise<void>;
  profile: WritingProfile;
  saveState: SaveState;
  voiceSettings: VoiceSettings;
}) {
  const dictionaryDialog = useRef<HTMLDialogElement>(null);
  const dictionaryButton = useRef<HTMLButtonElement>(null);
  const dictionaryCloseButton = useRef<HTMLButtonElement>(null);
  const focusDictionaryIndex = (index: number) => {
    window.requestAnimationFrame(() => {
      const buttons =
        dictionaryDialog.current?.querySelectorAll<HTMLButtonElement>(
          "[data-dictionary-remove]",
        );
      const target = buttons?.[Math.min(index, buttons.length - 1)];
      (target ?? dictionaryCloseButton.current)?.focus();
    });
  };

  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          R
        </span>
        <span className="brand-word">REDLINE</span>
        <span className="brand-version">0.6.0</span>
      </div>
      <label className="profile">
        <span>Writing Context</span>
        <select
          aria-label="Writing Context"
          onChange={(event) =>
            onProfileChange(event.target.value as WritingProfile)
          }
          value={profile}
        >
          <option value="general">General</option>
          <option value="academic">Academic</option>
          <option value="professional">Professional</option>
        </select>
        {profile === "professional" ? (
          <small>Uses General rules for now</small>
        ) : null}
      </label>
      <div className="app-state" role="status">
        <span
          className={`state-dot state-${saveState.toLowerCase().replace(" ", "-")}`}
          aria-hidden="true"
        />
        {saveState}
      </div>
      <div className="top-actions">
        <ThemeControl />
        <button
          aria-label="Settings"
          className="dictionary-button"
          onClick={() => dictionaryDialog.current?.showModal()}
          ref={dictionaryButton}
          type="button"
        >
          <Icon name="settings" />
          <span>Settings</span>
        </button>
      </div>
      <dialog
        aria-describedby="settings-description"
        aria-labelledby="settings-title"
        className="dictionary-dialog"
        onClose={() => dictionaryButton.current?.focus()}
        ref={dictionaryDialog}
      >
        <header>
          <div>
            <p className="section-label">Local preferences</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            aria-label="Close settings"
            onClick={() => dictionaryDialog.current?.close()}
            ref={dictionaryCloseButton}
            type="button"
          >
            Close
          </button>
        </header>
        <p className="dictionary-description" id="settings-description">
          These preferences stay on this device.
        </p>
        <section
          className="voice-settings"
          aria-labelledby="voice-settings-title"
        >
          <div>
            <p className="section-label">Personalization</p>
            <h3 id="voice-settings-title">My Voice</h3>
          </div>
          <label className="voice-enabled">
            <input
              checked={voiceSettings.enabled}
              onChange={(event) =>
                void onVoiceSettingsChange(
                  event.target.checked,
                  voiceSettings.defaultLane,
                )
              }
              type="checkbox"
            />
            Enable My Voice
          </label>
          <label className="voice-default">
            <span>Default Voice</span>
            <select
              aria-label="Default Voice"
              disabled={!voiceSettings.enabled}
              onChange={(event) =>
                void onVoiceSettingsChange(
                  voiceSettings.enabled,
                  event.target.value as VoiceLane,
                )
              }
              value={voiceSettings.defaultLane}
            >
              {VOICE_LANES.map((lane) => (
                <option key={lane.id} value={lane.id}>
                  {lane.label}
                </option>
              ))}
            </select>
          </label>
          <p className="voice-summary">
            {
              VOICE_LANES.find(({ id }) => id === voiceSettings.defaultLane)
                ?.summary
            }
          </p>
        </section>
        <section aria-labelledby="dictionary-title">
          <div className="settings-section-heading">
            <div>
              <p className="section-label">Proofreading</p>
              <h3 id="dictionary-title">Personal dictionary</h3>
            </div>
            <p className="dictionary-count">
              {dictionary.length} {dictionary.length === 1 ? "term" : "terms"}
            </p>
          </div>
          <p className="dictionary-description" id="dictionary-description">
            Words here are always allowed in spelling checks on this device.
          </p>
          {dictionary.length ? (
            <ul className="dictionary-list">
              {dictionary.map((entry) => (
                <li key={entry.normalizedTerm}>
                  <span>{entry.term}</span>
                  <button
                    aria-label={`Remove ${entry.term} from personal dictionary`}
                    data-dictionary-remove
                    onClick={async () => {
                      const index = dictionary.findIndex(
                        ({ normalizedTerm }) =>
                          normalizedTerm === entry.normalizedTerm,
                      );
                      await onRemoveDictionaryTerm(entry.normalizedTerm);
                      focusDictionaryIndex(index);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dictionary-empty">
              Allow eligible spelling words from an issue card.
            </p>
          )}
        </section>
      </dialog>
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

export type AnalysisState =
  | { status: "ready" }
  | { status: "pending" }
  | { status: "analyzing" }
  | {
      status: "complete";
      generation: number;
      issues: EditorIssue[];
      clarity: EditorClarityFinding[];
      session: number;
      text: string;
    }
  | { status: "error"; message: string };

function suggestionLabel(suggestion: AxiomSuggestion) {
  if (suggestion.kind === "remove" || !suggestion.text) return "Remove";
  return `${suggestion.kind === "insert-after" ? "Insert" : "Replace with"} “${suggestion.text}”`;
}

const CATEGORY_LABELS: Record<EditorIssue["category"], string> = {
  formatting: "Formatting",
  grammar: "Grammar",
  other: "Writing",
  punctuation: "Punctuation",
  readability: "Clarity",
  spelling: "Spelling",
  style: "Style",
  "word-choice": "Word choice",
};

const CLARITY_LABELS: Record<EditorClarityFinding["category"], string> = {
  "long-sentence": "Long sentence",
  "repeated-opener": "Repeated opener",
  "wordy-phrase": "Wordy phrase",
};

const contextSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

function contextBoundaries(text: string) {
  const boundaries = [0];
  for (const segment of contextSegmenter.segment(text)) {
    boundaries.push(segment.index + segment.segment.length);
  }
  return boundaries;
}

function boundaryIndex(boundaries: number[], offset: number) {
  let low = 0;
  let high = boundaries.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (boundaries[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, high);
}

function issueContext(
  text: string,
  boundaries: number[],
  from: number,
  to: number,
) {
  const issueStart = boundaryIndex(boundaries, from);
  const issueEnd = boundaryIndex(boundaries, to);
  const issueLength = Math.max(0, issueEnd - issueStart);
  const shownIssueLength = Math.min(60, issueLength);
  const remaining = 120 - shownIssueLength;
  const beforeLength = Math.floor(remaining / 2);
  const afterLength = remaining - beforeLength;
  const start = Math.max(0, issueStart - beforeLength);
  const shownIssueEnd = Math.min(issueEnd, issueStart + shownIssueLength);
  const end = Math.min(boundaries.length - 1, issueEnd + afterLength);
  const clean = (value: string) => value.replace(/\s+/gu, " ");

  return {
    after: clean(text.slice(to, boundaries[end])).trimEnd(),
    before: clean(text.slice(boundaries[start], from)).trimStart(),
    issue: clean(text.slice(from, boundaries[shownIssueEnd])),
    issueTruncated: shownIssueEnd < issueEnd,
    leadingEllipsis: start > 0,
    trailingEllipsis: end < boundaries.length - 1,
  };
}

export function AnalysisPanel({
  analysis,
  canApplySuggestion,
  disabled,
  onAnalyze,
  onAddToDictionary,
  onApplyClarity,
  onApplySuggestion,
  onIgnoreIssue,
  onSelectIssue,
  selectedIssueId,
}: {
  analysis: AnalysisState;
  canApplySuggestion: (
    issue: EditorIssue,
    suggestion: AxiomSuggestion,
  ) => boolean;
  disabled: boolean;
  onAnalyze: () => void;
  onAddToDictionary: (issueId: string) => void;
  onApplyClarity: (findingId: string) => void;
  onApplySuggestion: (issueId: string, suggestionIndex: number) => void;
  onIgnoreIssue: (issueId: string) => void;
  onSelectIssue: (issueId: string) => void;
  selectedIssueId: string | null;
}) {
  const issues = analysis.status === "complete" ? analysis.issues : [];
  const selectedIndex = issues.findIndex(({ id }) => id === selectedIssueId);
  const analysisTitle = useRef<HTMLHeadingElement>(null);
  const analyzeButton = useRef<HTMLButtonElement>(null);
  const pendingFocusIndex = useRef<number | null>(null);
  const analysisText = analysis.status === "complete" ? analysis.text : "";
  const boundaries = useMemo(
    () => contextBoundaries(analysisText),
    [analysisText],
  );

  useEffect(() => {
    const pending = pendingFocusIndex.current;
    if (pending === null) return;
    if (analysis.status === "error") {
      pendingFocusIndex.current = null;
      analyzeButton.current?.focus();
      return;
    }
    if (analysis.status !== "complete") return;
    pendingFocusIndex.current = null;
    const next = analysis.issues[Math.min(pending, analysis.issues.length - 1)];
    if (next) onSelectIssue(next.id);
    const frame = window.requestAnimationFrame(() => {
      const target = next
        ? document.querySelector<HTMLButtonElement>(
            `#issue-${next.id} .issue-select`,
          )
        : null;
      (target ?? analyzeButton.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [analysis, onSelectIssue]);

  const afterAction = (index: number, action: () => void) => {
    pendingFocusIndex.current = index;
    analysisTitle.current?.focus();
    action();
  };
  const selectPrevious = () => {
    const index = selectedIndex < 0 ? issues.length - 1 : selectedIndex - 1;
    if (issues[index]) onSelectIssue(issues[index].id);
  };
  const selectNext = () => {
    const index = selectedIndex < 0 ? 0 : selectedIndex + 1;
    if (issues[index]) onSelectIssue(issues[index].id);
  };
  const panelState =
    analysis.status === "complete"
      ? `${analysis.issues.length} ${analysis.issues.length === 1 ? "issue" : "issues"}`
      : analysis.status === "analyzing"
        ? "Checking locally…"
        : analysis.status === "pending"
          ? "Waiting for pause"
          : analysis.status === "error"
            ? "Failed"
            : "Ready to check";
  const settledAnnouncement =
    analysis.status === "complete"
      ? `${analysis.issues.length} ${analysis.issues.length === 1 ? "issue" : "issues"} found.`
      : analysis.status === "error"
        ? "Writing check failed. Your document is unchanged."
        : "";

  return (
    <aside
      aria-busy={
        analysis.status === "pending" || analysis.status === "analyzing"
      }
      aria-labelledby="analysis-title"
      className="analysis-panel"
    >
      <header className="panel-header">
        <div>
          <p className="section-label">Review</p>
          <h2 id="analysis-title" ref={analysisTitle} tabIndex={-1}>
            Analysis
          </h2>
        </div>
        <span className="panel-state">{panelState}</span>
      </header>
      <span aria-atomic="true" aria-live="polite" className="sr-only">
        {settledAnnouncement}
      </span>
      <div className="analysis-content">
        {analysis.status === "complete" && analysis.issues.length ? (
          <>
            <nav className="issue-navigation" aria-label="Issue navigation">
              <button
                disabled={!issues.length || selectedIndex === 0}
                onClick={selectPrevious}
                type="button"
              >
                Previous
              </button>
              <span>
                {selectedIndex < 0 ? "—" : selectedIndex + 1} / {issues.length}
              </span>
              <button
                disabled={!issues.length || selectedIndex === issues.length - 1}
                onClick={selectNext}
                type="button"
              >
                Next
              </button>
            </nav>
            <ol className="issue-list">
              {analysis.issues.map((issue, issueIndex) => {
                const selected = selectedIssueId === issue.id;
                const category = CATEGORY_LABELS[issue.category];
                const context = issueContext(
                  analysisText,
                  boundaries,
                  issue.from,
                  issue.to,
                );
                const safeSuggestions = issue.suggestions.map((suggestion) =>
                  canApplySuggestion(issue, suggestion),
                );
                const manualNoteId = `manual-${issue.id}`;
                return (
                  <li
                    className={`issue-card${selected ? " issue-card-selected" : ""}`}
                    data-category={issue.category}
                    id={`issue-${issue.id}`}
                    key={issue.id}
                  >
                    <button
                      aria-label={`${category}: ${issue.message}${issue.originalText ? `. Text: ${issue.originalText}` : ". Insertion point"}`}
                      aria-current={selected ? "true" : undefined}
                      className="issue-select"
                      onClick={() => onSelectIssue(issue.id)}
                      type="button"
                    >
                      <span className="issue-meta">
                        <span>{category}</span>
                      </span>
                      <strong>{issue.message}</strong>
                      <span className="issue-context">
                        {context.leadingEllipsis ? "…" : null}
                        {context.before}
                        {issue.originalText ? (
                          <mark>
                            {context.issue}
                            {context.issueTruncated ? "…" : null}
                          </mark>
                        ) : (
                          <mark>Insertion point</mark>
                        )}
                        {context.after}
                        {context.trailingEllipsis ? "…" : null}
                      </span>
                    </button>
                    {issue.explanation &&
                    issue.explanation !== issue.message ? (
                      <details className="issue-explanation">
                        <summary>Why?</summary>
                        <p>{issue.explanation}</p>
                      </details>
                    ) : null}
                    {issue.suggestions.length ? (
                      <fieldset className="suggestion-actions">
                        <legend className="sr-only">Corrections</legend>
                        {issue.suggestions.map((suggestion, index) => (
                          <button
                            aria-describedby={
                              safeSuggestions[index] ? undefined : manualNoteId
                            }
                            disabled={!safeSuggestions[index]}
                            key={`${suggestion.kind}-${suggestion.text}`}
                            onClick={() =>
                              afterAction(issueIndex, () =>
                                onApplySuggestion(issue.id, index),
                              )
                            }
                            type="button"
                          >
                            {suggestionLabel(suggestion)}
                          </button>
                        ))}
                      </fieldset>
                    ) : (
                      <p className="manual-edit-note" id={manualNoteId}>
                        No automatic change is available. Edit the highlighted
                        text manually.
                      </p>
                    )}
                    {safeSuggestions.some((safe) => !safe) ? (
                      <p className="manual-edit-note" id={manualNoteId}>
                        No automatic change is safe here. Edit the highlighted
                        text manually.
                      </p>
                    ) : null}
                    <div className="issue-secondary-actions">
                      <button
                        onClick={() =>
                          afterAction(issueIndex, () => onIgnoreIssue(issue.id))
                        }
                        type="button"
                      >
                        Ignore once
                      </button>
                      {isDictionaryEligible(issue) ? (
                        <button
                          onClick={() =>
                            afterAction(issueIndex, () =>
                              onAddToDictionary(issue.id),
                            )
                          }
                          type="button"
                        >
                          Always allow word
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <div className="analysis-empty">
            <div className="empty-icon" aria-hidden="true">
              <Icon name="message" />
            </div>
            <h3>
              {analysis.status === "analyzing"
                ? "Checking locally…"
                : analysis.status === "pending"
                  ? "Writing changed"
                  : analysis.status === "complete"
                    ? "No issues found"
                    : analysis.status === "error"
                      ? "Analysis failed"
                      : "Ready to check"}
            </h3>
            <p>
              {analysis.status === "analyzing"
                ? "Your writing stays on this device."
                : analysis.status === "pending"
                  ? "Checking after you pause."
                  : analysis.status === "complete"
                    ? "No issues found in this check."
                    : analysis.status === "error"
                      ? `Your document is unchanged. ${analysis.message}`
                      : "Run a private, local writing check when you are ready."}
            </p>
          </div>
        )}
        {analysis.status === "complete" && analysis.clarity.length ? (
          <section className="clarity-section">
            <h3 className="clarity-title">Clarity suggestions</h3>
            <ul className="clarity-list">
              {analysis.clarity.map((finding) => (
                <li className="clarity-item" key={finding.id}>
                  <div className="clarity-meta">
                    <span>{CLARITY_LABELS[finding.category]}</span>
                    {finding.replacement ? (
                      <button
                        onClick={() => onApplyClarity(finding.id)}
                        type="button"
                      >
                        Apply
                      </button>
                    ) : null}
                  </div>
                  <p>{finding.message}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <button
          className="analyze-button"
          disabled={disabled}
          onClick={onAnalyze}
          ref={analyzeButton}
          type="button"
        >
          {analysis.status === "error" ? "Check again" : "Check Writing"}
        </button>
      </div>
    </aside>
  );
}

const TRANSFORM_LABELS: Record<TransformPreset, string> = {
  academic: "Academic",
  concise: "Concise",
  professional: "Professional",
};

const VOICE_LABELS = Object.fromEntries(
  VOICE_LANES.map(({ id, label }) => [id, label]),
) as Record<VoiceLane, string>;

export function TransformPanel({
  onAccept,
  onCancel,
  onCheckAgain,
  onGenerate,
  onPresetChange,
  onRefreshSelection,
  state,
}: {
  onAccept: () => void;
  onCancel: () => void;
  onCheckAgain: () => void;
  onGenerate: () => void;
  onPresetChange: (preset: RewritePreset) => void;
  onRefreshSelection: () => void;
  state: Exclude<TransformWorkflowState, { status: "idle" }>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const acceptButton = useRef<HTMLButtonElement>(null);
  const regenerateButton = useRef<HTMLButtonElement>(null);
  const acceptBlockedReason =
    state.status === "preview" ? state.acceptBlockedReason : null;
  const humanizer = state.mode === "humanizer";
  const title = humanizer ? "My Voice" : "Transform";
  const toolbarId = humanizer ? "humanize" : "transform";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (state.status === "preview") {
        (acceptBlockedReason
          ? regenerateButton.current
          : acceptButton.current
        )?.focus();
      } else {
        heading.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.status, acceptBlockedReason]);

  const cancel = () => {
    onCancel();
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-toolbar-id="${toolbarId}"]`)
        ?.focus();
    });
  };
  const panelState =
    state.status === "checking"
      ? "Checking setup…"
      : state.status === "unavailable"
        ? "Model not installed"
        : state.status === "generating"
          ? "Generating locally…"
          : state.status === "preview"
            ? state.stale
              ? "Source changed"
              : "Preview ready"
            : state.status === "error"
              ? "Generation failed"
              : state.status === "stale"
                ? "Source changed"
                : "Ready";
  const announcement =
    state.status === "unavailable"
      ? `${title} unavailable. ${state.message}`
      : state.status === "preview"
        ? state.acceptBlockedReason
          ? `${title} preview ready. ${state.acceptBlockedReason}`
          : `${title} preview ready. Review it before accepting.`
        : state.status === "error"
          ? `${title} failed. ${state.message}`
          : state.status === "stale"
            ? `${title} source changed. ${state.message}`
            : "";

  return (
    <aside
      aria-busy={state.status === "generating"}
      aria-labelledby="rewrite-title"
      className="analysis-panel transform-panel"
    >
      <header className="panel-header">
        <div>
          <p className="section-label">
            {humanizer ? "Voice suggestion" : "Rewrite"}
          </p>
          <h2 id="rewrite-title" ref={heading} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <span className="panel-state">{panelState}</span>
      </header>
      <span aria-atomic="true" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <div className="analysis-content transform-content">
        <label className="transform-preset">
          <span>{humanizer ? "Voice" : "Preset"}</span>
          <select
            disabled={
              state.status === "generating" ||
              state.status === "checking" ||
              state.status === "unavailable"
            }
            onChange={(event) =>
              onPresetChange(event.target.value as RewritePreset)
            }
            value={state.preset}
          >
            {humanizer ? (
              VOICE_LANES.map((lane) => (
                <option key={lane.id} value={lane.id}>
                  {lane.label}
                </option>
              ))
            ) : (
              <>
                <option value="concise">Concise</option>
                <option value="professional">Professional</option>
                <option value="academic">Academic</option>
              </>
            )}
          </select>
        </label>
        {humanizer ? (
          <p className="transform-guidance">
            {VOICE_LANES.find(({ id }) => id === state.preset)?.summary}
          </p>
        ) : state.preset === "professional" ? (
          <p className="transform-guidance">
            Conservative workplace rewrite · meaning over formality
          </p>
        ) : null}

        <section className="transform-preview" aria-labelledby="original-title">
          <h3 id="original-title">Original</h3>
          <p>{state.original}</p>
        </section>

        {state.status === "preview" ? (
          <section
            className="transform-preview transform-preview-result"
            aria-labelledby="transformed-title"
          >
            <h3 id="transformed-title">
              {humanizer
                ? VOICE_LABELS[state.preset as VoiceLane]
                : TRANSFORM_LABELS[state.preset as TransformPreset]}{" "}
              preview
            </h3>
            <p>{state.response.text}</p>
          </section>
        ) : null}

        {state.status === "generating" ? (
          <div className="transform-progress" role="status">
            <span aria-hidden="true" />
            {humanizer
              ? "Applying your Voice on this device…"
              : "Loading and rewriting on this device…"}
          </div>
        ) : null}

        {state.status === "checking" ? (
          <div className="transform-progress" role="status">
            <span aria-hidden="true" />
            Checking the local rewrite model…
          </div>
        ) : null}

        {state.status === "unavailable" ? (
          <div className="transform-setup" role="status">
            <p>{state.message} Your original text is unchanged.</p>
            <p>
              Extract the offline Transform package into
              <code>%LOCALAPPDATA%\com.tyree.redline</code>, then check again.
            </p>
            <p>
              Expected model:
              <code>
                %LOCALAPPDATA%\com.tyree.redline\models\qwen2.5-1.5b-instruct-q4_k_m.gguf
              </code>
            </p>
          </div>
        ) : null}

        {state.status === "error" ? (
          <p className="transform-message transform-message-error" role="alert">
            {state.message} Your original text is unchanged.
          </p>
        ) : null}

        {state.status === "stale" ? (
          <p
            className="transform-message transform-message-blocked"
            role="status"
          >
            {state.message} Your original text is unchanged.
          </p>
        ) : null}

        {state.status === "preview" && state.acceptBlockedReason ? (
          <p
            className="transform-message transform-message-blocked"
            role="status"
          >
            {state.acceptBlockedReason} Your original text is unchanged.
          </p>
        ) : state.acceptReason ? (
          <p className="transform-message">{state.acceptReason}</p>
        ) : null}

        <div className="transform-actions">
          {state.status === "ready" ? (
            <button
              className="analyze-button"
              onClick={onGenerate}
              type="button"
            >
              Generate preview
            </button>
          ) : null}
          {state.status === "unavailable" ? (
            <button
              className="analyze-button"
              onClick={onCheckAgain}
              type="button"
            >
              Check again
            </button>
          ) : null}
          {state.status === "preview" && !state.stale ? (
            <>
              <button
                className="analyze-button"
                disabled={Boolean(state.acceptBlockedReason)}
                onClick={onAccept}
                ref={acceptButton}
                type="button"
              >
                Accept
              </button>
              <button onClick={onGenerate} ref={regenerateButton} type="button">
                Regenerate
              </button>
            </>
          ) : null}
          {state.status === "error" ? (
            <button onClick={onGenerate} ref={regenerateButton} type="button">
              Regenerate
            </button>
          ) : null}
          {state.status === "preview" && state.stale ? (
            <button onClick={onRefreshSelection} type="button">
              Use current selection
            </button>
          ) : null}
          {state.status === "stale" ? (
            <button onClick={onRefreshSelection} type="button">
              Use current selection
            </button>
          ) : null}
          <button onClick={cancel} type="button">
            Cancel
          </button>
        </div>
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
