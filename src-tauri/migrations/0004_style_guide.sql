CREATE TABLE style_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('preferred-term', 'preferred-capitalization')),
  from_text TEXT NOT NULL,
  to_text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE writing_goals (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  audience TEXT NOT NULL CHECK (audience IN ('general', 'friend', 'coworker', 'instructor', 'recruiter', 'public')),
  purpose TEXT NOT NULL CHECK (purpose IN ('inform', 'explain', 'request', 'persuade', 'argue', 'summarize')),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1)
) STRICT;

INSERT INTO writing_goals (id, audience, purpose, schema_version)
VALUES (1, 'general', 'inform', 1);
