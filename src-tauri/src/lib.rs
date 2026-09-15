use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

mod app;
pub mod dictation;
pub mod local_ai;
pub mod transform;

const MAX_CONTENT_BYTES: usize = 5 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 200;
const MAX_NODES: usize = 100_000;
const RECOVERY_INTERVAL_MS: i64 = 15 * 60 * 1_000;
const RECOVERY_LIMIT: i64 = 10;
const MIGRATION_1: &str = include_str!("../migrations/0001_documents.sql");
const MIGRATION_2: &str = include_str!("../migrations/0002_proofreading_controls.sql");

type CommandResult<T> = Result<T, String>;

struct DocumentStore(Mutex<Connection>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentSummary {
    id: String,
    title: String,
    updated_at: i64,
    last_opened_at: i64,
    revision: i64,
    deleted_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Document {
    id: String,
    title: String,
    content_json: String,
    created_at: i64,
    updated_at: i64,
    last_opened_at: i64,
    revision: i64,
    writing_profile: WritingProfile,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum WritingProfile {
    #[default]
    General,
    Academic,
    Professional,
}

impl WritingProfile {
    fn as_str(self) -> &'static str {
        match self {
            Self::General => "general",
            Self::Academic => "academic",
            Self::Professional => "professional",
        }
    }

    fn from_db(value: &str) -> Self {
        match value {
            "academic" => Self::Academic,
            "professional" => Self::Professional,
            _ => Self::General,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct DictionaryEntry {
    term: String,
    normalized_term: String,
    created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentRevision {
    id: i64,
    document_id: String,
    source_revision: i64,
    title: String,
    created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    active_document: Option<Document>,
    documents: Vec<DocumentSummary>,
    recent: Vec<DocumentSummary>,
    trash: Vec<DocumentSummary>,
    revisions: Vec<DocumentRevision>,
    dictionary: Vec<DictionaryEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDocumentInput {
    id: Option<String>,
    expected_revision: Option<i64>,
    title: String,
    content_json: String,
    reason: SaveReason,
    writing_profile: WritingProfile,
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum SaveReason {
    Auto,
    Manual,
}

fn now_ms() -> CommandResult<i64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis() as i64)
}

fn normalize_title(title: &str) -> CommandResult<String> {
    let title = title.trim();
    let title = if title.is_empty() { "Untitled" } else { title };
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(format!(
            "Titles are limited to {MAX_TITLE_CHARS} characters."
        ));
    }
    Ok(title.to_owned())
}

fn normalize_dictionary_term(term: &str) -> CommandResult<(String, String)> {
    let term: String = term.trim().nfc().collect();
    let length = term.chars().count();
    if !(2..=64).contains(&length) {
        return Err("Dictionary terms must contain 2 to 64 characters.".into());
    }
    if !term.chars().next().is_some_and(char::is_alphanumeric)
        || !term.chars().next_back().is_some_and(char::is_alphanumeric)
        || term.chars().any(|character| {
            character.is_whitespace()
                || character.is_control()
                || !(character.is_alphanumeric()
                    || is_combining_mark(character)
                    || matches!(character, '\'' | '\u{2019}' | '-'))
        })
    {
        return Err(
            "Dictionary terms may contain letters, numbers, apostrophes, and hyphens only.".into(),
        );
    }
    let normalized_term: String = term.to_lowercase().nfc().collect();
    Ok((term, normalized_term))
}

fn validate_content(content: &str) -> CommandResult<()> {
    if content.len() > MAX_CONTENT_BYTES {
        return Err("Documents are limited to 5 MiB.".into());
    }

    let value: Value =
        serde_json::from_str(content).map_err(|_| "Document content is not valid JSON.")?;
    if value.get("type").and_then(Value::as_str) != Some("doc") {
        return Err("Document content must have a doc root.".into());
    }

    let mut nodes = vec![&value];
    let mut count = 0;
    while let Some(node) = nodes.pop() {
        count += 1;
        if count > MAX_NODES {
            return Err("Document contains too many nodes.".into());
        }

        let node_type = node
            .get("type")
            .and_then(Value::as_str)
            .ok_or("Every document node must have a type.")?;
        if !matches!(
            node_type,
            "doc"
                | "paragraph"
                | "text"
                | "heading"
                | "bulletList"
                | "orderedList"
                | "listItem"
                | "hardBreak"
        ) {
            return Err(format!("Unsupported document node: {node_type}."));
        }
        if node_type == "heading"
            && !matches!(
                node.pointer("/attrs/level").and_then(Value::as_i64),
                Some(1..=3)
            )
        {
            return Err("Only heading levels 1 through 3 are supported.".into());
        }

        if let Some(marks) = node.get("marks") {
            for mark in marks.as_array().ok_or("Document marks must be an array.")? {
                let mark_type = mark.get("type").and_then(Value::as_str);
                if !matches!(mark_type, Some("bold" | "italic")) {
                    return Err("Only bold and italic marks are supported.".into());
                }
            }
        }
        if let Some(content) = node.get("content") {
            nodes.extend(content.as_array().ok_or("Node content must be an array.")?);
        }
    }
    Ok(())
}

fn migrate(connection: &mut Connection) -> CommandResult<()> {
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;",
        )
        .map_err(|error| error.to_string())?;
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if version > 2 {
        return Err(format!(
            "Database version {version} is newer than this REDLINE build."
        ));
    }
    if version < 1 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute_batch(MIGRATION_1)
            .map_err(|error| error.to_string())?;
        transaction
            .pragma_update(None, "user_version", 1)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
    }
    if version < 2 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute_batch(MIGRATION_2)
            .map_err(|error| error.to_string())?;
        transaction
            .pragma_update(None, "user_version", 2)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
    }
    Ok(())
}

impl DocumentStore {
    fn open(path: &Path) -> CommandResult<Self> {
        let mut connection = Connection::open(path).map_err(|error| error.to_string())?;
        migrate(&mut connection)?;
        let integrity: String = connection
            .query_row("PRAGMA quick_check", [], |row| row.get(0))
            .map_err(|error| format!("REDLINE could not verify its document database: {error}"))?;
        if integrity != "ok" {
            return Err(format!(
                "REDLINE's document database failed its integrity check: {integrity}"
            ));
        }
        Ok(Self(Mutex::new(connection)))
    }

    fn with_connection<T>(
        &self,
        action: impl FnOnce(&mut Connection) -> CommandResult<T>,
    ) -> CommandResult<T> {
        let mut connection = self
            .0
            .lock()
            .map_err(|_| "Document database lock was poisoned.")?;
        action(&mut connection)
    }
}

fn document_from_row(row: &Row<'_>) -> rusqlite::Result<Document> {
    Ok(Document {
        id: row.get(0)?,
        title: row.get(1)?,
        content_json: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        last_opened_at: row.get(5)?,
        revision: row.get(6)?,
        writing_profile: WritingProfile::from_db(&row.get::<_, String>(7)?),
    })
}

fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<DocumentSummary> {
    Ok(DocumentSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        updated_at: row.get(2)?,
        last_opened_at: row.get(3)?,
        revision: row.get(4)?,
        deleted_at: row.get(5)?,
    })
}

fn revision_from_row(row: &Row<'_>) -> rusqlite::Result<DocumentRevision> {
    Ok(DocumentRevision {
        id: row.get(0)?,
        document_id: row.get(1)?,
        source_revision: row.get(2)?,
        title: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn query_summaries(connection: &Connection, sql: &str) -> CommandResult<Vec<DocumentSummary>> {
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], summary_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

fn list_dictionary(connection: &Connection) -> CommandResult<Vec<DictionaryEntry>> {
    let mut statement = connection
        .prepare(
            "SELECT term, normalized_term, created_at FROM personal_dictionary ORDER BY normalized_term",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(DictionaryEntry {
                term: row.get(0)?,
                normalized_term: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

fn add_dictionary_impl(
    connection: &Connection,
    term: &str,
    created_at: i64,
) -> CommandResult<DictionaryEntry> {
    let (term, normalized_term) = normalize_dictionary_term(term)?;
    connection
        .execute(
            "INSERT OR IGNORE INTO personal_dictionary (term, normalized_term, created_at) VALUES (?1, ?2, ?3)",
            params![term, normalized_term, created_at],
        )
        .map_err(|error| error.to_string())?;
    connection
        .query_row(
            "SELECT term, normalized_term, created_at FROM personal_dictionary WHERE normalized_term = ?1",
            [normalized_term],
            |row| {
                Ok(DictionaryEntry {
                    term: row.get(0)?,
                    normalized_term: row.get(1)?,
                    created_at: row.get(2)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn remove_dictionary_impl(connection: &Connection, term: &str) -> CommandResult<()> {
    let (_, normalized_term) = normalize_dictionary_term(term)?;
    connection
        .execute(
            "DELETE FROM personal_dictionary WHERE normalized_term = ?1",
            [normalized_term],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn load_document(connection: &Connection, id: &str) -> CommandResult<Document> {
    connection
        .query_row(
            "SELECT id, title, content_json, created_at, updated_at, last_opened_at, revision, writing_profile FROM documents WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            document_from_row,
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Document was not found.".into())
}

fn list_revisions_impl(
    connection: &Connection,
    document_id: &str,
) -> CommandResult<Vec<DocumentRevision>> {
    let mut statement = connection
        .prepare(
            "SELECT id, document_id, source_revision, title, created_at FROM document_revisions WHERE document_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 10",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([document_id], revision_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

fn snapshot(
    transaction: &Transaction<'_>,
    document: &Document,
    created_at: i64,
) -> CommandResult<()> {
    let duplicate = transaction
        .query_row(
            "SELECT title = ?2 AND content_json = ?3 FROM document_revisions WHERE document_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
            params![document.id, document.title, document.content_json],
            |row| row.get::<_, bool>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or(false);
    if duplicate {
        return Ok(());
    }

    transaction
        .execute(
            "INSERT INTO document_revisions (document_id, source_revision, title, content_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![document.id, document.revision, document.title, document.content_json, created_at],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM document_revisions WHERE document_id = ?1 AND id NOT IN (SELECT id FROM document_revisions WHERE document_id = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2)",
            params![document.id, RECOVERY_LIMIT],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn save_document_impl(
    connection: &mut Connection,
    input: SaveDocumentInput,
    timestamp: i64,
) -> CommandResult<Document> {
    validate_content(&input.content_json)?;
    let title = normalize_title(&input.title)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    let document = if let Some(id) = input.id {
        let current = load_document(&transaction, &id)?;
        if input.expected_revision != Some(current.revision) {
            return Err(
                "This document changed since it was opened. Your text was not overwritten.".into(),
            );
        }
        transaction
            .execute(
                "UPDATE documents SET title = ?2, content_json = ?3, updated_at = ?4, last_opened_at = ?4, revision = revision + 1, writing_profile = ?5 WHERE id = ?1 AND deleted_at IS NULL",
                params![id, title, input.content_json, timestamp, input.writing_profile.as_str()],
            )
            .map_err(|error| error.to_string())?;
        load_document(&transaction, &id)?
    } else {
        let id: String = transaction
            .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO documents (id, title, content_json, created_at, updated_at, last_opened_at, revision, writing_profile) VALUES (?1, ?2, ?3, ?4, ?4, ?4, 1, ?5)",
                params![id, title, input.content_json, timestamp, input.writing_profile.as_str()],
            )
            .map_err(|error| error.to_string())?;
        load_document(&transaction, &id)?
    };

    let last_snapshot_at: Option<i64> = transaction
        .query_row(
            "SELECT MAX(created_at) FROM document_revisions WHERE document_id = ?1",
            [&document.id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let due = timestamp - last_snapshot_at.unwrap_or(document.created_at) >= RECOVERY_INTERVAL_MS;
    if input.reason == SaveReason::Manual || due {
        snapshot(&transaction, &document, timestamp)?;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(document)
}

fn workspace_impl(connection: &Connection) -> CommandResult<Workspace> {
    let documents = query_summaries(
        connection,
        "SELECT id, title, updated_at, last_opened_at, revision, deleted_at FROM documents WHERE deleted_at IS NULL ORDER BY updated_at DESC, id",
    )?;
    let recent = query_summaries(
        connection,
        "SELECT id, title, updated_at, last_opened_at, revision, deleted_at FROM documents WHERE deleted_at IS NULL ORDER BY last_opened_at DESC, updated_at DESC LIMIT 10",
    )?;
    let trash = query_summaries(
        connection,
        "SELECT id, title, updated_at, last_opened_at, revision, deleted_at FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50",
    )?;
    let active_document = recent
        .first()
        .map(|item| load_document(connection, &item.id))
        .transpose()?;
    let revisions = active_document
        .as_ref()
        .map(|document| list_revisions_impl(connection, &document.id))
        .transpose()?
        .unwrap_or_default();
    Ok(Workspace {
        active_document,
        documents,
        recent,
        trash,
        revisions,
        dictionary: list_dictionary(connection)?,
    })
}

#[tauri::command]
fn load_workspace(store: State<'_, DocumentStore>) -> CommandResult<Workspace> {
    store.with_connection(|connection| workspace_impl(connection))
}

#[tauri::command]
fn open_document(id: String, store: State<'_, DocumentStore>) -> CommandResult<Document> {
    store.with_connection(|connection| {
        connection
            .execute(
                "UPDATE documents SET last_opened_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
                params![id, now_ms()?],
            )
            .map_err(|error| error.to_string())?;
        load_document(connection, &id)
    })
}

#[tauri::command]
fn save_document(
    input: SaveDocumentInput,
    store: State<'_, DocumentStore>,
) -> CommandResult<Document> {
    store.with_connection(|connection| save_document_impl(connection, input, now_ms()?))
}

#[tauri::command]
fn add_dictionary_term(
    term: String,
    store: State<'_, DocumentStore>,
) -> CommandResult<DictionaryEntry> {
    store.with_connection(|connection| add_dictionary_impl(connection, &term, now_ms()?))
}

#[tauri::command]
fn remove_dictionary_term(
    normalized_term: String,
    store: State<'_, DocumentStore>,
) -> CommandResult<()> {
    store.with_connection(|connection| remove_dictionary_impl(connection, &normalized_term))
}

#[tauri::command]
fn delete_document(
    id: String,
    expected_revision: i64,
    store: State<'_, DocumentStore>,
) -> CommandResult<()> {
    store.with_connection(|connection| {
        let timestamp = now_ms()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let document = load_document(&transaction, &id)?;
        if document.revision != expected_revision {
            return Err("This document changed before it could be moved to Trash.".into());
        }
        snapshot(&transaction, &document, timestamp)?;
        transaction
            .execute(
                "UPDATE documents SET deleted_at = ?2, updated_at = ?2, revision = revision + 1 WHERE id = ?1",
                params![id, timestamp],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())
    })
}

#[tauri::command]
fn list_trash(store: State<'_, DocumentStore>) -> CommandResult<Vec<DocumentSummary>> {
    store.with_connection(|connection| {
        query_summaries(
            connection,
            "SELECT id, title, updated_at, last_opened_at, revision, deleted_at FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 50",
        )
    })
}

#[tauri::command]
fn restore_deleted_document(
    id: String,
    store: State<'_, DocumentStore>,
) -> CommandResult<Document> {
    store.with_connection(|connection| {
        let timestamp = now_ms()?;
        let changed = connection
            .execute(
                "UPDATE documents SET deleted_at = NULL, updated_at = ?2, last_opened_at = ?2, revision = revision + 1 WHERE id = ?1 AND deleted_at IS NOT NULL",
                params![id, timestamp],
            )
            .map_err(|error| error.to_string())?;
        if changed == 0 {
            return Err("Trashed document was not found.".into());
        }
        load_document(connection, &id)
    })
}

#[tauri::command]
fn list_document_revisions(
    document_id: String,
    store: State<'_, DocumentStore>,
) -> CommandResult<Vec<DocumentRevision>> {
    store.with_connection(|connection| list_revisions_impl(connection, &document_id))
}

#[tauri::command]
fn restore_document_revision(
    document_id: String,
    revision_id: i64,
    expected_revision: i64,
    store: State<'_, DocumentStore>,
) -> CommandResult<Document> {
    store.with_connection(|connection| {
        let timestamp = now_ms()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let current = load_document(&transaction, &document_id)?;
        if current.revision != expected_revision {
            return Err("This document changed before the recovery point could be restored.".into());
        }
        let recovered: (String, String) = transaction
            .query_row(
                "SELECT title, content_json FROM document_revisions WHERE id = ?1 AND document_id = ?2",
                params![revision_id, document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or("Recovery point was not found.")?;
        snapshot(&transaction, &current, timestamp)?;
        transaction
            .execute(
                "UPDATE documents SET title = ?2, content_json = ?3, updated_at = ?4, last_opened_at = ?4, revision = revision + 1 WHERE id = ?1",
                params![document_id, recovered.0, recovered.1, timestamp],
            )
            .map_err(|error| error.to_string())?;
        let document = load_document(&transaction, &document_id)?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(document)
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::run();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn input(
        id: Option<String>,
        revision: Option<i64>,
        text: &str,
        reason: SaveReason,
    ) -> SaveDocumentInput {
        SaveDocumentInput {
            id,
            expected_revision: revision,
            title: "Draft".into(),
            content_json: format!(
                r#"{{"type":"doc","content":[{{"type":"paragraph","content":[{{"type":"text","text":"{text}"}}]}}]}}"#
            ),
            reason,
            writing_profile: WritingProfile::General,
        }
    }

    #[test]
    fn migration_and_document_lifecycle_are_bounded() {
        let mut connection = connection();
        let created = save_document_impl(
            &mut connection,
            input(None, None, "one", SaveReason::Auto),
            1_000,
        )
        .unwrap();
        assert_eq!(created.revision, 1);
        assert!(
            list_revisions_impl(&connection, &created.id)
                .unwrap()
                .is_empty()
        );

        let saved = save_document_impl(
            &mut connection,
            input(Some(created.id.clone()), Some(1), "two", SaveReason::Manual),
            2_000,
        )
        .unwrap();
        assert_eq!(saved.revision, 2);
        assert_eq!(
            list_revisions_impl(&connection, &created.id).unwrap().len(),
            1
        );
        assert!(
            save_document_impl(
                &mut connection,
                input(Some(created.id.clone()), Some(1), "stale", SaveReason::Auto),
                3_000,
            )
            .is_err()
        );

        for number in 3..=14 {
            let current = load_document(&connection, &created.id).unwrap();
            save_document_impl(
                &mut connection,
                input(
                    Some(created.id.clone()),
                    Some(current.revision),
                    &number.to_string(),
                    SaveReason::Manual,
                ),
                number * 1_000,
            )
            .unwrap();
        }
        assert_eq!(
            list_revisions_impl(&connection, &created.id).unwrap().len(),
            10
        );

        let current = load_document(&connection, &created.id).unwrap();
        let transaction = connection.transaction().unwrap();
        snapshot(&transaction, &current, 20_000).unwrap();
        transaction
            .execute(
                "UPDATE documents SET deleted_at = 20000 WHERE id = ?1",
                [&created.id],
            )
            .unwrap();
        transaction.commit().unwrap();
        assert!(load_document(&connection, &created.id).is_err());
    }

    #[test]
    fn invalid_editor_content_is_rejected() {
        assert!(validate_content(r#"{"type":"doc","content":[{"type":"paragraph"}]}"#).is_ok());
        assert!(validate_content(r#"{"type":"doc","content":[{"type":"image"}]}"#).is_err());
        assert!(
            validate_content(
                r#"{"type":"doc","content":[{"type":"heading","attrs":{"level":4}}]}"#
            )
            .is_err()
        );
    }

    #[test]
    fn elapsed_autosave_creates_a_recovery_point() {
        let mut connection = connection();
        let created = save_document_impl(
            &mut connection,
            input(None, None, "one", SaveReason::Auto),
            1_000,
        )
        .unwrap();
        save_document_impl(
            &mut connection,
            input(Some(created.id.clone()), Some(1), "two", SaveReason::Auto),
            1_001 + RECOVERY_INTERVAL_MS,
        )
        .unwrap();
        assert_eq!(
            list_revisions_impl(&connection, &created.id).unwrap().len(),
            1
        );
    }

    #[test]
    fn version_one_database_migrates_profiles_and_dictionary() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(MIGRATION_1).unwrap();
        connection.pragma_update(None, "user_version", 1).unwrap();
        migrate(&mut connection).unwrap();
        assert_eq!(
            connection
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(list_dictionary(&connection).unwrap(), Vec::new());
    }

    #[test]
    fn dictionary_normalization_is_bounded_and_idempotent() {
        assert_eq!(
            normalize_dictionary_term("  RENe\u{301}E  ").unwrap(),
            ("REN\u{e9}E".into(), "ren\u{e9}e".into())
        );
        assert_eq!(
            normalize_dictionary_term("O\u{2019}Brien").unwrap().1,
            "o\u{2019}brien"
        );
        assert!(normalize_dictionary_term("two words").is_err());
        assert!(normalize_dictionary_term("x").is_err());

        let connection = connection();
        add_dictionary_impl(&connection, "Zorblaxon", 1).unwrap();
        add_dictionary_impl(&connection, "zorblaxon", 2).unwrap();
        assert_eq!(list_dictionary(&connection).unwrap().len(), 1);
        remove_dictionary_impl(&connection, "ZORBLAXON").unwrap();
        assert!(list_dictionary(&connection).unwrap().is_empty());
    }

    #[test]
    fn dictionary_normalization_matches_golden_fixtures() {
        #[derive(Deserialize)]
        struct Fixture {
            input: String,
            canonical: String,
            normalized: String,
        }
        let fixtures: Vec<Fixture> =
            serde_json::from_str(include_str!("../../fixtures/dictionary-normalization.json"))
                .unwrap();
        for fixture in fixtures {
            assert_eq!(
                normalize_dictionary_term(&fixture.input).unwrap(),
                (fixture.canonical, fixture.normalized)
            );
        }
    }

    #[test]
    fn profile_persists_without_becoming_revision_content() {
        let mut connection = connection();
        let mut create = input(None, None, "one", SaveReason::Auto);
        create.writing_profile = WritingProfile::Academic;
        let created = save_document_impl(&mut connection, create, 1_000).unwrap();
        assert_eq!(created.writing_profile, WritingProfile::Academic);

        let mut save = input(
            Some(created.id.clone()),
            Some(created.revision),
            "two",
            SaveReason::Manual,
        );
        save.writing_profile = WritingProfile::Professional;
        let saved = save_document_impl(&mut connection, save, 2_000).unwrap();
        assert_eq!(saved.writing_profile, WritingProfile::Professional);
        assert_eq!(WritingProfile::from_db("invalid"), WritingProfile::General);
    }
}
