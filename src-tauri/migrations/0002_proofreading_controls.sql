ALTER TABLE documents
ADD COLUMN writing_profile TEXT NOT NULL DEFAULT 'general'
CHECK (writing_profile IN ('general', 'academic', 'professional'));

CREATE TABLE personal_dictionary (
  normalized_term TEXT PRIMARY KEY NOT NULL,
  term TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (length(term) BETWEEN 2 AND 64),
  CHECK (length(normalized_term) BETWEEN 2 AND 64)
) STRICT;
