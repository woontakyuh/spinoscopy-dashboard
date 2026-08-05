import { createHash, randomUUID } from "node:crypto"
import { type DatabaseSync } from "node:sqlite"

import { openLoEpisodicDatabase, resolveLoEpisodicDbPath } from "./database"

export const LO_CONVERSATION_SURFACES = [
  "dashboard",
  "hermes",
  "claude-code",
  "claude-desktop",
] as const
export type LoConversationSurface = typeof LO_CONVERSATION_SURFACES[number]
export type LoConversationRole = "user" | "assistant"
export interface LoConversationMessage {
  role: LoConversationRole
  content: string
}
export interface LoConversationTurnInput {
  surface: LoConversationSurface
  contextKey: string
  externalTurnId: string
  userText: string
  assistantText: string
}
export interface LoConversationTurn extends LoConversationTurnInput {
  turnId: string
  sessionId: string
  createdAt: string
}
export interface LoEpisodicStore {
  appendTurn(input: LoConversationTurnInput): LoConversationTurn
  recentMessages(input: {
    surface: LoConversationSurface
    contextKey: string
    limit: number
  }): LoConversationMessage[]
  countTurns(): number
  close(): void
}
export class LoEpisodicConflictError extends Error {
  constructor() {
    super("Lo conversation turn identity was reused with different content")
    this.name = "LoEpisodicConflictError"
  }
}

interface StoreOptions {
  filePath?: string
  now?: () => Date
}

const SESSION_IDLE_MS = 3 * 60 * 60 * 1_000

export function createLoEpisodicStore({
  filePath = resolveLoEpisodicDbPath(),
  now = () => new Date(),
}: StoreOptions = {}): LoEpisodicStore {
  const database = openLoEpisodicDatabase(filePath)

  return {
    appendTurn(input) {
      const normalized = normalizeTurn(input)
      const ingestKey = [
        normalized.surface,
        normalized.contextKey,
        normalized.externalTurnId,
      ].join(":")
      const payloadHash = hashPayload(normalized)
      const existing = findTurn(database, ingestKey)
      if (existing) {
        if (existing.payloadHash !== payloadHash) throw new LoEpisodicConflictError()
        return existing.turn
      }

      const createdAt = now().toISOString()
      const sessionId = resolveSession(database, normalized, createdAt)
      const turnId = randomUUID()

      database.exec("BEGIN IMMEDIATE")
      try {
        database.prepare(`
          INSERT INTO lo_exchange (
            turn_id, session_id, ingest_key, external_turn_id, payload_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(turnId, sessionId, ingestKey, normalized.externalTurnId, payloadHash, createdAt)
        const insertMessage = database.prepare(`
          INSERT INTO lo_message (turn_id, position, role, content)
          VALUES (?, ?, ?, ?)
        `)
        insertMessage.run(turnId, 0, "user", normalized.userText)
        insertMessage.run(turnId, 1, "assistant", normalized.assistantText)
        database.prepare(`
          UPDATE lo_session
          SET last_turn_at = ?, turn_count = turn_count + 1
          WHERE session_id = ?
        `).run(createdAt, sessionId)
        database.exec("COMMIT")
      } catch (error) {
        database.exec("ROLLBACK")
        const raced = findTurn(database, ingestKey)
        if (raced) {
          if (raced.payloadHash !== payloadHash) throw new LoEpisodicConflictError()
          return raced.turn
        }
        throw error
      }

      return { ...normalized, turnId, sessionId, createdAt }
    },

    recentMessages({ surface, contextKey, limit }) {
      assertSurface(surface)
      const normalizedContext = requiredText("contextKey", contextKey)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("limit must be an integer from 1 to 100")
      }
      const rows = database.prepare(`
        SELECT message.role, message.content
        FROM lo_message AS message
        JOIN lo_exchange AS exchange ON exchange.turn_id = message.turn_id
        JOIN lo_session AS session ON session.session_id = exchange.session_id
        WHERE exchange.turn_id IN (
          SELECT recent.turn_id
          FROM lo_exchange AS recent
          JOIN lo_session AS recent_session ON recent_session.session_id = recent.session_id
          WHERE recent_session.surface = ? AND recent_session.context_key = ?
          ORDER BY recent.rowid DESC
          LIMIT ?
        )
        ORDER BY exchange.rowid ASC, message.position ASC
      `).all(surface, normalizedContext, limit) as SqlRow[]
      return rows.map((row) => ({
        role: asRole(row.role),
        content: asText(row.content),
      }))
    },

    countTurns() {
      const row = database.prepare("SELECT COUNT(*) AS count FROM lo_exchange").get() as SqlRow | undefined
      return Number(row?.count ?? 0)
    },

    close() {
      database.close()
    },
  }
}

function resolveSession(
  database: DatabaseSync,
  input: LoConversationTurnInput,
  createdAt: string,
): string {
  const row = database.prepare(`
    SELECT session_id, last_turn_at
    FROM lo_session
    WHERE surface = ? AND context_key = ?
    ORDER BY last_turn_at DESC
    LIMIT 1
  `).get(input.surface, input.contextKey) as SqlRow | undefined
  if (row) {
    const lastTurnAt = Date.parse(asText(row.last_turn_at))
    if (Date.parse(createdAt) - lastTurnAt <= SESSION_IDLE_MS) return asText(row.session_id)
  }

  const sessionId = randomUUID()
  database.prepare(`
    INSERT INTO lo_session (
      session_id, surface, context_key, started_at, last_turn_at, turn_count
    ) VALUES (?, ?, ?, ?, ?, 0)
  `).run(sessionId, input.surface, input.contextKey, createdAt, createdAt)
  return sessionId
}

function findTurn(
  database: DatabaseSync,
  ingestKey: string,
): { payloadHash: string; turn: LoConversationTurn } | null {
  const row = database.prepare(`
    SELECT
      exchange.turn_id, exchange.session_id, exchange.external_turn_id,
      exchange.payload_hash, exchange.created_at, session.surface, session.context_key,
      user.content AS user_text, assistant.content AS assistant_text
    FROM lo_exchange AS exchange
    JOIN lo_session AS session ON session.session_id = exchange.session_id
    JOIN lo_message AS user ON user.turn_id = exchange.turn_id AND user.position = 0
    JOIN lo_message AS assistant ON assistant.turn_id = exchange.turn_id AND assistant.position = 1
    WHERE exchange.ingest_key = ?
  `).get(ingestKey) as SqlRow | undefined
  if (!row) return null
  return {
    payloadHash: asText(row.payload_hash),
    turn: {
      turnId: asText(row.turn_id),
      sessionId: asText(row.session_id),
      surface: asSurface(row.surface),
      contextKey: asText(row.context_key),
      externalTurnId: asText(row.external_turn_id),
      userText: asText(row.user_text),
      assistantText: asText(row.assistant_text),
      createdAt: asText(row.created_at),
    },
  }
}

function normalizeTurn(input: LoConversationTurnInput): LoConversationTurnInput {
  assertSurface(input.surface)
  return {
    surface: input.surface,
    contextKey: requiredText("contextKey", input.contextKey),
    externalTurnId: requiredText("externalTurnId", input.externalTurnId),
    userText: requiredText("userText", input.userText),
    assistantText: requiredText("assistantText", input.assistantText),
  }
}

function hashPayload(input: LoConversationTurnInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

function requiredText(label: string, value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} must not be empty`)
  return normalized
}

function assertSurface(value: string): asserts value is LoConversationSurface {
  if (!(LO_CONVERSATION_SURFACES as readonly string[]).includes(value)) {
    throw new Error(`Unsupported Lo conversation surface: ${value}`)
  }
}

type SqlRow = Record<string, unknown>

function asText(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid Lo episodic database row")
  return value
}

function asRole(value: unknown): LoConversationRole {
  if (value !== "user" && value !== "assistant") throw new Error("Invalid Lo conversation role")
  return value
}

function asSurface(value: unknown): LoConversationSurface {
  if (typeof value !== "string") throw new Error("Invalid Lo conversation surface")
  assertSurface(value)
  return value
}
