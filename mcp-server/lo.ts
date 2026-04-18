#!/usr/bin/env tsx
// Lo MCP Server — exposes Lo's persona, memory, and BJJ training tools to any MCP client
// (Claude Desktop, Claude Code CLI, etc.) backed by the same Notion DBs the web dashboard uses.

import { config } from "dotenv"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, "..")
config({ path: path.join(REPO_ROOT, ".env.local"), quiet: true })

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import { loMemory, type MemoryCategory } from "../lib/notion/loMemory.js"
import { listAllSenseiEntries } from "../lib/notion/sensei.js"

// ─── Persona ───────────────────────────────────────────────────
const PERSONA_PATH = path.join(REPO_ROOT, "LO.md")
function loadPersona(): string {
  if (!existsSync(PERSONA_PATH)) return "LO.md not found"
  return readFileSync(PERSONA_PATH, "utf-8")
}

// ─── Helpers ───────────────────────────────────────────────────
function getMonthStartInSeoul(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

function getTodayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

function computeStreak(dates: string[]): number {
  const dateSet = new Set(dates)
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  const cursor = new Date(today)
  let streak = 0
  while (true) {
    const iso = cursor.toISOString().slice(0, 10)
    if (dateSet.has(iso)) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else if (streak === 0) {
      cursor.setDate(cursor.getDate() - 1)
      const prev = cursor.toISOString().slice(0, 10)
      if (dateSet.has(prev)) {
        streak = 1
        cursor.setDate(cursor.getDate() - 1)
      } else break
    } else break
  }
  return streak
}

// ─── Server ────────────────────────────────────────────────────
const server = new Server(
  { name: "lo-mcp", version: "1.0.0" },
  { capabilities: { resources: {}, tools: {} } },
)

// ─── Resources ─────────────────────────────────────────────────
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "lo://persona",
      name: "Lo persona",
      description:
        "Lo's immutable persona (calm BJJ coach, technically precise). Read this once at the start of every conversation and follow it for all replies.",
      mimeType: "text/markdown",
    },
    {
      uri: "lo://memory-digest",
      name: "Lo memory digest",
      description:
        "Top facts from Lo Memory DB (most important first). A pre-formatted text summary of what Lo knows about Tak's BJJ profile, training history, and game plans.",
      mimeType: "text/plain",
    },
  ],
}))

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri
  if (uri === "lo://persona") {
    return { contents: [{ uri, mimeType: "text/markdown", text: loadPersona() }] }
  }
  if (uri === "lo://memory-digest") {
    const digest = await loMemory.getMemoryDigest(60)
    return { contents: [{ uri, mimeType: "text/plain", text: digest || "(memory empty)" }] }
  }
  throw new Error(`Unknown resource: ${uri}`)
})

// ─── Tools ─────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Persona/context (call these at session start) ──
    {
      name: "read_persona",
      description:
        "Return LO.md content — Lo's immutable persona, tone, role, and hard rules. Call this FIRST at the start of every conversation and follow it for all replies. Equivalent to reading the lo://persona resource but callable as a tool.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_memory_digest",
      description:
        "Return a pre-formatted text summary of top facts from Lo Memory DB (most important first). Call this at the start of every conversation after read_persona to know what Lo already knows about Tak.",
      inputSchema: {
        type: "object",
        properties: { max_rows: { type: "number", minimum: 1, maximum: 100, default: 60 } },
      },
    },

    // ── Memory ──
    {
      name: "list_memories",
      description:
        "Query Lo Memory DB. Filter by category and/or minimum importance. Returns rows with page_id (use for update_memory).",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["profile", "preference", "person", "project", "rule", "fact", "event"],
          },
          min_importance: { type: "number", minimum: 1, maximum: 5 },
          limit: { type: "number", minimum: 1, maximum: 100 },
        },
      },
    },
    {
      name: "add_memory",
      description:
        "Add a new BJJ-related fact to Lo Memory DB. Use when you discover something new and meaningful about Tak's game plans, technique preferences, or training rhythms that should persist long-term.",
      inputSchema: {
        type: "object",
        required: ["name", "category", "content"],
        properties: {
          name: { type: "string" },
          category: {
            type: "string",
            enum: ["profile", "preference", "person", "project", "rule", "fact", "event"],
          },
          content: { type: "string" },
          importance: { type: "number", minimum: 1, maximum: 5, default: 3 },
        },
      },
    },
    {
      name: "search_memory",
      description:
        "Search Lo Memory DB by text (matches name + content, case-insensitive). MUST be called when Tak says '지난번/그 스파링/우리 얘기했던/기억나?/그 기술' etc. — signals past conversation recall across channels.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          category: {
            type: "string",
            enum: ["profile", "preference", "person", "project", "rule", "fact", "event"],
          },
          limit: { type: "number", minimum: 1, maximum: 50 },
        },
      },
    },
    {
      name: "update_memory",
      description: "Update an existing memory row by page_id.",
      inputSchema: {
        type: "object",
        required: ["page_id"],
        properties: {
          page_id: { type: "string" },
          name: { type: "string" },
          category: {
            type: "string",
            enum: ["profile", "preference", "person", "project", "rule", "fact", "event"],
          },
          content: { type: "string" },
          importance: { type: "number", minimum: 1, maximum: 5 },
          status: { type: "string", enum: ["active", "archived"] },
        },
      },
    },

    // ── Training data ──
    {
      name: "list_training_sessions",
      description:
        "List BJJ training sessions from the Notion Sensei DB within a date range. Defaults: this month through today. Optionally filter by tag substring.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD (Asia/Seoul). Default: first of current month." },
          to: { type: "string", description: "YYYY-MM-DD (Asia/Seoul). Default: today." },
          tag: { type: "string", description: "case-insensitive substring in class/sparring/study tags" },
          limit: { type: "number", minimum: 1, maximum: 100 },
        },
      },
    },
    {
      name: "get_training_stats",
      description:
        "Return this month's training summary — session count, current streak (consecutive days), top 10 most-used tags.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}))

// ─── Tool execution ────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name
  const args = (req.params.arguments ?? {}) as Record<string, unknown>

  try {
    let result: unknown

    switch (name) {
      case "read_persona": {
        result = loadPersona()
        break
      }
      case "get_memory_digest": {
        const max = (args.max_rows as number | undefined) ?? 60
        const digest = await loMemory.getMemoryDigest(max)
        result = digest || "(memory empty)"
        break
      }
      case "list_memories": {
        const rows = await loMemory.listMemories({
          category: args.category as MemoryCategory | undefined,
          minImportance: args.min_importance as number | undefined,
          limit: args.limit as number | undefined,
        })
        result = { count: rows.length, rows }
        break
      }
      case "add_memory": {
        const row = await loMemory.createMemory({
          name: args.name as string,
          category: args.category as MemoryCategory,
          content: args.content as string,
          importance: (args.importance as number) ?? 3,
          source: "chat",
        })
        result = { ok: true, page_id: row.page_id, name: row.name }
        break
      }
      case "search_memory": {
        const all = await loMemory.listMemories({
          category: args.category as MemoryCategory | undefined,
          limit: 200,
          status: "active",
        })
        const q = (args.query as string).toLowerCase()
        const matches = all.filter(
          (r) => r.name.toLowerCase().includes(q) || r.content.toLowerCase().includes(q),
        )
        const limit = (args.limit as number | undefined) ?? 20
        result = {
          count: matches.length,
          rows: matches.slice(0, limit).map((r) => ({
            page_id: r.page_id,
            name: r.name,
            category: r.category,
            content: r.content,
            importance: r.importance,
            created_time: r.created_time,
          })),
        }
        break
      }
      case "update_memory": {
        await loMemory.updateMemory({
          pageId: args.page_id as string,
          name: args.name as string | undefined,
          category: args.category as MemoryCategory | undefined,
          content: args.content as string | undefined,
          importance: args.importance as number | undefined,
          status: args.status as "active" | "archived" | undefined,
        })
        result = { ok: true }
        break
      }

      case "list_training_sessions": {
        const fromDate = (args.from as string | undefined) ?? getMonthStartInSeoul()
        const toDate = (args.to as string | undefined) ?? getTodayInSeoul()
        const all = await listAllSenseiEntries()
        let filtered = all.filter((s) => s.date && s.date >= fromDate && s.date <= toDate)
        const tag = args.tag as string | undefined
        if (tag) {
          const q = tag.toLowerCase()
          filtered = filtered.filter((s) =>
            [...s.classTags, ...s.sparringTags, ...(s.studyTags ?? [])].some((t) => t.toLowerCase().includes(q)),
          )
        }
        const limit = (args.limit as number | undefined) ?? 30
        result = {
          count: filtered.length,
          from: fromDate,
          to: toDate,
          items: filtered.slice(0, limit).map((s) => ({
            id: s.id,
            date: s.date,
            title: s.title,
            sessionType: s.sessionType,
            instructor: s.instructor,
            gym: s.gym,
            classTags: s.classTags,
            sparringTags: s.sparringTags,
            studyTags: s.studyTags ?? [],
            note: s.note,
            url: s.url,
          })),
        }
        break
      }

      case "get_training_stats": {
        const all = await listAllSenseiEntries()
        const monthStart = getMonthStartInSeoul()
        const thisMonth = all.filter((s) => s.date && s.date >= monthStart)
        const tagCounts: Record<string, number> = {}
        for (const s of thisMonth) {
          for (const t of [...s.classTags, ...s.sparringTags, ...(s.studyTags ?? [])]) {
            tagCounts[t] = (tagCounts[t] ?? 0) + 1
          }
        }
        const top_tags = Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([tag, count]) => ({ tag, count }))
        const streak = computeStreak(all.map((s) => s.date).filter((d): d is string => !!d))
        result = {
          month_start: monthStart,
          month_count: thisMonth.length,
          streak_days: streak,
          top_tags,
        }
        break
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { isError: true, content: [{ type: "text", text: `Error in ${name}: ${message}` }] }
  }
})

// ─── Boot ──────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[lo-mcp] connected via stdio")
}

main().catch((e) => {
  console.error("[lo-mcp] fatal:", e)
  process.exit(1)
})
