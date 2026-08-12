CREATE TABLE documents (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)) CHECK (length(content_json) <= 5242880),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_opened_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  deleted_at INTEGER
) STRICT;

CREATE INDEX documents_recent ON documents(deleted_at, last_opened_at DESC, updated_at DESC);

CREATE TABLE document_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_revision INTEGER NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)) CHECK (length(content_json) <= 5242880),
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX document_revisions_recent ON document_revisions(document_id, created_at DESC, id DESC);
