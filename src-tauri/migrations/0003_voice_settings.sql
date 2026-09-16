CREATE TABLE voice_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  default_lane TEXT NOT NULL CHECK (default_lane IN ('natural', 'professional', 'academic')),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1)
) STRICT;

INSERT INTO voice_settings (id, enabled, default_lane, schema_version)
VALUES (1, 1, 'natural', 1);
