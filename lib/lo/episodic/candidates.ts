import { createHash, randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import type { LoMemoryCategory, LoMemoryCreateInput } from "@/lib/types/lo-v2"
import { openLoEpisodicDatabase, resolveLoEpisodicDbPath } from "./database"
import type { LoConversationTurn } from "./store"

export type LoMemoryCandidateStatus = "pending" | "promoting" | "approved" | "rejected"
export interface LoMemoryCandidate {
  candidateId: string
  turnId: string
  name: string
  content: string
  category: LoMemoryCategory
  importance: number
  sourceReference: string
  status: LoMemoryCandidateStatus
  createdAt: string
  decidedAt: string | null
  notionPageId: string | null
}
export interface LoMemoryCandidateQueue {
  considerTurn(turn: LoConversationTurn): LoMemoryCandidate | null
  list(input?: { status?: LoMemoryCandidateStatus }): LoMemoryCandidate[]
  approve(input: {
    candidateId: string
    promote: (memory: LoMemoryCreateInput) => Promise<{ pageId: string }>
  }): Promise<LoMemoryCandidate>
  reject(candidateId: string): LoMemoryCandidate
  close(): void
}

const EXPLICIT_MEMORY = /(?:기억해(?:줘)?|기억해\s*둬)\s*[:：]\s*(.{4,1000})/u
const SENSITIVE = /(?:api\s*key|api\s*token|access\s*token|secret|password|비밀번호|주민(?:등록)?번호|계좌번호)/iu

export function createLoMemoryCandidateQueue({
  filePath = resolveLoEpisodicDbPath(),
  now = () => new Date(),
}: {
  filePath?: string
  now?: () => Date
} = {}): LoMemoryCandidateQueue {
  const database = openLoEpisodicDatabase(filePath)

  return {
    considerTurn(turn) {
      const extracted = extractCandidate(turn.userText)
      if (!extracted) return null
      const contentHash = createHash("sha256").update(extracted.content.toLocaleLowerCase("ko-KR")).digest("hex")
      const existing = findCandidate(database, turn.turnId, contentHash)
      if (existing) return existing

      const candidate: LoMemoryCandidate = {
        candidateId: randomUUID(),
        turnId: turn.turnId,
        name: candidateName(extracted.content),
        content: extracted.content,
        category: extracted.category,
        importance: 3,
        sourceReference: `sqlite:lo-turn:${turn.turnId}`,
        status: "pending",
        createdAt: turn.createdAt,
        decidedAt: null,
        notionPageId: null,
      }
      database.prepare(`
        INSERT INTO lo_memory_candidate (
          candidate_id, turn_id, content_hash, name, content, category,
          importance, source_reference, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidate.candidateId,
        candidate.turnId,
        contentHash,
        candidate.name,
        candidate.content,
        candidate.category,
        candidate.importance,
        candidate.sourceReference,
        candidate.status,
        candidate.createdAt,
      )
      return candidate
    },

    list({ status } = {}) {
      const rows = status
        ? database.prepare(`
            SELECT * FROM lo_memory_candidate WHERE status = ? ORDER BY created_at DESC, candidate_id
          `).all(status)
        : database.prepare(`
            SELECT * FROM lo_memory_candidate ORDER BY created_at DESC, candidate_id
          `).all()
      return (rows as CandidateRow[]).map(toCandidate)
    },

    async approve({ candidateId, promote }) {
      const existing = candidateById(database, candidateId)
      if (existing.status === "approved") return existing
      if (existing.status !== "pending") {
        throw new Error(`Lo memory candidate cannot be approved from ${existing.status}`)
      }
      const claimed = database.prepare(`
        UPDATE lo_memory_candidate SET status = 'promoting'
        WHERE candidate_id = ? AND status = 'pending'
      `).run(candidateId) as RunResult
      if (Number(claimed.changes) !== 1) throw new Error("Lo memory candidate approval conflict")

      let promoted: { pageId: string }
      try {
        promoted = await promote({
          name: existing.name,
          content: existing.content,
          category: existing.category,
          importance: existing.importance,
          source: {
            kind: "chat",
            reference: existing.sourceReference,
            capturedAt: existing.createdAt,
          },
        })
      } catch (error) {
        database.prepare(`
          UPDATE lo_memory_candidate SET status = 'pending'
          WHERE candidate_id = ? AND status = 'promoting'
        `).run(candidateId)
        throw error
      }

      database.prepare(`
        UPDATE lo_memory_candidate
        SET status = 'approved', decided_at = ?, notion_page_id = ?
        WHERE candidate_id = ? AND status = 'promoting'
      `).run(now().toISOString(), promoted.pageId, candidateId)
      return candidateById(database, candidateId)
    },

    reject(candidateId) {
      const result = database.prepare(`
        UPDATE lo_memory_candidate
        SET status = 'rejected', decided_at = ?
        WHERE candidate_id = ? AND status = 'pending'
      `).run(now().toISOString(), candidateId) as RunResult
      if (Number(result.changes) !== 1) {
        const existing = candidateById(database, candidateId)
        if (existing.status === "rejected") return existing
        throw new Error(`Lo memory candidate cannot be rejected from ${existing.status}`)
      }
      return candidateById(database, candidateId)
    },

    close() {
      database.close()
    },
  }
}

function candidateById(database: DatabaseSync, candidateId: string): LoMemoryCandidate {
  const row = database.prepare(`
    SELECT * FROM lo_memory_candidate WHERE candidate_id = ?
  `).get(candidateId) as CandidateRow | undefined
  if (!row) throw new Error("Unknown Lo memory candidate")
  return toCandidate(row)
}

function extractCandidate(userText: string): { content: string; category: LoMemoryCategory } | null {
  const content = EXPLICIT_MEMORY.exec(userText.trim())?.[1]?.trim()
  if (!content || SENSITIVE.test(content)) return null
  const category: LoMemoryCategory = /(?:선호|좋아|싫어)/u.test(content)
    ? "preference"
    : /(?:앞으로|규칙|항상|절대)/u.test(content) ? "rule" : "fact"
  return { content, category }
}

function candidateName(content: string): string {
  return content.length <= 80 ? content : `${content.slice(0, 77)}...`
}

function findCandidate(
  database: DatabaseSync,
  turnId: string,
  contentHash: string,
): LoMemoryCandidate | null {
  const row = database.prepare(`
    SELECT * FROM lo_memory_candidate WHERE turn_id = ? OR content_hash = ? LIMIT 1
  `).get(turnId, contentHash) as CandidateRow | undefined
  return row ? toCandidate(row) : null
}

type CandidateRow = Record<string, unknown>
type RunResult = { changes: number | bigint }

function toCandidate(row: CandidateRow): LoMemoryCandidate {
  return {
    candidateId: text(row.candidate_id),
    turnId: text(row.turn_id),
    name: text(row.name),
    content: text(row.content),
    category: text(row.category) as LoMemoryCategory,
    importance: Number(row.importance),
    sourceReference: text(row.source_reference),
    status: text(row.status) as LoMemoryCandidateStatus,
    createdAt: text(row.created_at),
    decidedAt: nullableText(row.decided_at),
    notionPageId: nullableText(row.notion_page_id),
  }
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid Lo memory candidate row")
  return value
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value)
}
