import { invoke, isTauri } from "@tauri-apps/api/core";

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
};

export type SaveInput = {
  id: string | null;
  expectedRevision: number | null;
  title: string;
  contentJson: string;
  reason: "auto" | "manual";
};

const EMPTY_WORKSPACE: WorkspaceData = {
  activeDocument: null,
  documents: [],
  recent: [],
  trash: [],
  revisions: [],
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
};
