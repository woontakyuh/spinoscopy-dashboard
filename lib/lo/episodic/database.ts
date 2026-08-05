import { chmodSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

export function openLoEpisodicDatabase(filePath = resolveLoEpisodicDbPath()): DatabaseSync {
  if (filePath !== ":memory:") mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const database = new DatabaseSync(filePath)
  database.exec("PRAGMA journal_mode = WAL")
  database.exec("PRAGMA busy_timeout = 5000")
  database.exec("PRAGMA foreign_keys = ON")
  database.exec(`
    CREATE TABLE IF NOT EXISTS lo_session (
      session_id TEXT PRIMARY KEY,
      surface TEXT NOT NULL,
      context_key TEXT NOT NULL,
      started_at TEXT NOT NULL,
      last_turn_at TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lo_session_lookup
      ON lo_session(surface, context_key, last_turn_at DESC);
    CREATE TABLE IF NOT EXISTS lo_exchange (
      turn_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES lo_session(session_id) ON DELETE CASCADE,
      ingest_key TEXT NOT NULL UNIQUE,
      external_turn_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lo_message (
      turn_id TEXT NOT NULL REFERENCES lo_exchange(turn_id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position IN (0, 1)),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      PRIMARY KEY (turn_id, position)
    );
    CREATE TABLE IF NOT EXISTS lo_memory_candidate (
      candidate_id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL UNIQUE,
      content_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      importance INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
      source_reference TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'promoting', 'approved', 'rejected')),
      created_at TEXT NOT NULL,
      decided_at TEXT,
      notion_page_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lo_memory_candidate_status
      ON lo_memory_candidate(status, created_at DESC);
  `)
  if (filePath !== ":memory:") chmodSync(filePath, 0o600)
  return database
}

export function resolveLoEpisodicDbPath(environment = process.env): string {
  return environment.LO_EPISODIC_DB_FILE?.trim()
    || path.join(homedir(), "Library", "Application Support", "spinoscopy", "lo", "episodic.db")
}
