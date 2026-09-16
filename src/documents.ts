import { invoke, isTauri } from "@tauri-apps/api/core";
import { normalizeDictionaryTerm, type WritingProfile } from "./axiom/axiom";

export type DocumentSummary = {
  id: string;
  title: string;
  updatedAt: number;
  lastOpenedAt: number;
  revision: number;
  deletedAt: number | null;
};

export type DocumentRecord = DocumentSummary & {
  contentJson: string;
  createdAt: number;
  writingProfile: WritingProfile;
};

export type DictionaryEntry = {
  term: string;
  normalizedTerm: string;
  createdAt: number;
};

export type VoiceLane = "natural" | "professional" | "academic";

export type VoiceSettings = {
  enabled: boolean;
  defaultLane: VoiceLane;
  schemaVersion: number;
};

export type RecoveryPoint = {
  id: number;
  documentId: string;
  sourceRevision: number;
  title: string;
  createdAt: number;
};

export type WorkspaceData = {
  activeDocument: DocumentRecord | null;
  documents: DocumentSummary[];
  recent: DocumentSummary[];
  trash: DocumentSummary[];
  revisions: RecoveryPoint[];
  dictionary: DictionaryEntry[];
  voiceSettings: VoiceSettings;
};

export type SaveInput = {
  id: string | null;
  expectedRevision: number | null;
  title: string;
  contentJson: string;
  reason: "auto" | "manual";
  writingProfile: WritingProfile;
};

const EMPTY_WORKSPACE: WorkspaceData = {
  activeDocument: null,
  documents: [],
  recent: [],
  trash: [],
  revisions: [],
  dictionary: [],
  voiceSettings: {
    enabled: true,
    defaultLane: "natural",
    schemaVersion: 1,
  },
};

export const desktopAvailable = isTauri();

export const documents = {
  loadWorkspace: () =>
    desktopAvailable
      ? invoke<WorkspaceData>("load_workspace")
      : Promise.resolve(EMPTY_WORKSPACE),
  open: (id: string) => invoke<DocumentRecord>("open_document", { id }),
  save: (input: SaveInput) =>
    invoke<DocumentRecord>("save_document", { input }),
  delete: (id: string, expectedRevision: number) =>
    invoke<void>("delete_document", { id, expectedRevision }),
  restoreDeleted: (id: string) =>
    invoke<DocumentRecord>("restore_deleted_document", { id }),
  listRevisions: (documentId: string) =>
    invoke<RecoveryPoint[]>("list_document_revisions", { documentId }),
  restoreRevision: (
    documentId: string,
    revisionId: number,
    expectedRevision: number,
  ) =>
    invoke<DocumentRecord>("restore_document_revision", {
      documentId,
      revisionId,
      expectedRevision,
    }),
  addDictionaryTerm: (term: string) =>
    desktopAvailable
      ? invoke<DictionaryEntry>("add_dictionary_term", { term })
      : Promise.resolve({
          term: term.trim().normalize("NFC"),
          normalizedTerm: normalizeDictionaryTerm(term),
          createdAt: Date.now(),
        }),
  removeDictionaryTerm: (normalizedTerm: string) =>
    desktopAvailable
      ? invoke<void>("remove_dictionary_term", { normalizedTerm })
      : Promise.resolve(),
  updateVoiceSettings: (enabled: boolean, defaultLane: VoiceLane) =>
    desktopAvailable
      ? invoke<VoiceSettings>("update_voice_settings", {
          enabled,
          defaultLane,
        })
      : Promise.resolve({ enabled, defaultLane, schemaVersion: 1 }),
};
