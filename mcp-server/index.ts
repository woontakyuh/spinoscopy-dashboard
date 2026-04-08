#!/usr/bin/env tsx
// Dakota MCP Server — exposes Dakota's persona and tools to any MCP client
// (Claude Desktop, Claude Code CLI, etc.) via the same Notion backend the
// web dashboard uses. Single source of truth for Dakota across channels.

import { config } from "dotenv"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// .env.local 먼저 로드 (스크립트 실행 위치 무관)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, "..")
config({ path: path.join(REPO_ROOT, ".env.local") })

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import { getAllTodos, createTodo, updateTodo } from "../lib/notion/todo.js"
import {
  getUpcomingSchedules,
  getSchedulesRichInRange,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "../lib/notion/schedule.js"
import {
  listGoogleCalendarEventsForRange,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "../lib/google/calendar.js"
import {
  listMemories,
  createMemory,
  updateMemory,
  getMemoryDigest,
  type MemoryCategory,
} from "../lib/notion/dakotaMemoryV2.js"
import { listResearchProjects } from "../lib/notion/research.js"
import { getJournalStats } from "../lib/notion/journal.js"
import { getAllPatientRows } from "../lib/notion/analytics.js"

// ─── Persona resource ──────────────────────────────────────────
const PERSONA_PATH = path.join(REPO_ROOT, "DAKOTA.md")
function loadPersona(): string {
  if (!existsSync(PERSONA_PATH)) return "DAKOTA.md not found"
  return readFileSync(PERSONA_PATH, "utf-8")
}

// ─── Server setup ──────────────────────────────────────────────
const server = new Server(
  {
    name: "dakota-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
)

// ─── Resources ─────────────────────────────────────────────────
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "dakota://persona",
      name: "Dakota persona",
      description:
        "Dakota's immutable persona, tone, role, and hard rules. Read this once at the start of every conversation and follow it for all replies.",
      mimeType: "text/markdown",
    },
    {
      uri: "dakota://memory-digest",
      name: "Dakota memory digest",
      description:
        "Top facts from Dakota Memory DB (most important first). A pre-formatted text summary of what Dakota knows about Tak.",
      mimeType: "text/plain",
    },
  ],
}))

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri
  if (uri === "dakota://persona") {
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: loadPersona(),
        },
      ],
    }
  }
  if (uri === "dakota://memory-digest") {
    const digest = await getMemoryDigest(60)
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: digest || "(memory empty)",
        },
      ],
    }
  }
  throw new Error(`Unknown resource: ${uri}`)
})

// ─── Tools ─────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ─── Memory ────────────────────────────────────────────
    {
      name: "list_memories",
      description:
        "Query Dakota Memory DB. Filter by category and/or minimum importance. Returns rows with page_id (use for update_memory).",
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
        "Add a new fact to Dakota Memory DB. Use when you discover something new and meaningful about Tak that should persist long-term.",
      inputSchema: {
        type: "object",
        required: ["name", "category", "content"],
        properties: {
          name: { type: "string", description: "short key" },
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

    // ─── Todos ─────────────────────────────────────────────
    {
      name: "list_todos",
      description: "List Tak's todos from Notion. Filter by status (default: active = not Done).",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "Done", "all"], default: "active" },
          query: { type: "string", description: "case-insensitive substring match on name" },
          limit: { type: "number", minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
    {
      name: "add_todo",
      description: "Create a new todo in Tak's Notion Todo DB.",
      inputSchema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          due: { type: "string", description: "YYYY-MM-DD" },
          priority: { type: "string", enum: ["High", "Medium", "Low"], default: "Medium" },
          category: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    {
      name: "update_todo",
      description: "Update a todo (rename, change due date, mark Done, change priority/category).",
      inputSchema: {
        type: "object",
        required: ["page_id"],
        properties: {
          page_id: { type: "string" },
          name: { type: "string" },
          due: { type: ["string", "null"], description: "YYYY-MM-DD or null to clear" },
          status: { type: "string", description: "e.g. To Do, In Progress, Done" },
          priority: { type: "string", enum: ["High", "Medium", "Low"] },
          category: { type: "string" },
        },
      },
    },

    // ─── Schedules ─────────────────────────────────────────
    {
      name: "list_schedules",
      description:
        "List schedules within a date range. Returns BOTH Notion Schedule DB rows (with all columns) AND Google Calendar events, merged.",
      inputSchema: {
        type: "object",
        required: ["from", "to"],
        properties: {
          from: { type: "string", description: "YYYY-MM-DD (Asia/Seoul)" },
          to: { type: "string", description: "YYYY-MM-DD (Asia/Seoul)" },
          query: { type: "string", description: "case-insensitive substring filter" },
        },
      },
    },
    {
      name: "create_schedule",
      description:
        "Create a new schedule entry in Notion Schedule DB and/or Google Calendar.",
      inputSchema: {
        type: "object",
        required: ["name", "date_start"],
        properties: {
          name: { type: "string" },
          date_start: { type: "string", description: "YYYY-MM-DD or ISO datetime" },
          date_end: { type: "string" },
          place: { type: "string" },
          category: { type: "string" },
          targets: {
            type: "array",
            items: { type: "string", enum: ["notion", "gcal"] },
            default: ["notion"],
          },
        },
      },
    },

    {
      name: "update_schedule",
      description: "Update an existing Notion Schedule row by page_id (rename, change date, place, category, etc).",
      inputSchema: {
        type: "object",
        required: ["page_id"],
        properties: {
          page_id: { type: "string" },
          name: { type: "string" },
          date_start: { type: "string", description: "YYYY-MM-DD or ISO" },
          date_end: { type: ["string", "null"] },
          place: { type: ["string", "null"] },
          category: { type: ["string", "null"] },
          society: { type: "array", items: { type: "string" } },
          topic: { type: ["string", "null"] },
          link: { type: ["string", "null"] },
        },
      },
    },
    {
      name: "delete_schedule",
      description: "Archive a Notion Schedule row (not a hard delete).",
      inputSchema: {
        type: "object",
        required: ["page_id"],
        properties: { page_id: { type: "string" } },
      },
    },
    {
      name: "update_gcal_event",
      description:
        "Update a Google Calendar event by event_id. event_id is found via list_schedules result's gcal items.",
      inputSchema: {
        type: "object",
        required: ["event_id"],
        properties: {
          event_id: { type: "string" },
          name: { type: "string" },
          date_start: { type: "string", description: "YYYY-MM-DD or ISO" },
          date_end: { type: "string" },
          place: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
        },
      },
    },
    {
      name: "delete_gcal_event",
      description: "Delete a Google Calendar event by event_id.",
      inputSchema: {
        type: "object",
        required: ["event_id"],
        properties: { event_id: { type: "string" } },
      },
    },

    // ─── Other agents (orchestration) ──────────────────────
    {
      name: "ask_brian",
      description: "Get Brian's snapshot — journal stats + research projects (status breakdown).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ask_opdb",
      description: "Get Op DB snapshot — total patient cases + recent week/month deltas.",
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
      // ── Memory ──
      case "list_memories": {
        const rows = await listMemories({
          category: args.category as MemoryCategory | undefined,
          minImportance: args.min_importance as number | undefined,
          limit: args.limit as number | undefined,
        })
        result = { count: rows.length, rows }
        break
      }
      case "add_memory": {
        const row = await createMemory({
          name: args.name as string,
          category: args.category as MemoryCategory,
          content: args.content as string,
          importance: (args.importance as number) ?? 3,
          source: "chat",
        })
        result = { ok: true, page_id: row.page_id, name: row.name }
        break
      }
      case "update_memory": {
        await updateMemory({
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

      // ── Todos ──
      case "list_todos": {
        const status = (args.status as string | undefined) ?? "active"
        const opts: { status?: string; excludeDone?: boolean } = {}
        if (status === "active") opts.excludeDone = true
        else if (status === "Done") opts.status = "Done"
        const todos = await getAllTodos(opts)
        const q = (args.query as string | undefined)?.toLowerCase()
        const filtered = q ? todos.filter((t) => t.name.toLowerCase().includes(q)) : todos
        const limit = (args.limit as number | undefined) ?? 50
        result = {
          count: filtered.length,
          items: filtered.slice(0, limit).map((t) => ({
            page_id: t.page_id,
            name: t.name,
            due: t.due,
            status: t.status,
            priority: t.priority,
            category: t.category,
            notes: t.notes,
          })),
        }
        break
      }
      case "add_todo": {
        const created = await createTodo({
          name: args.name as string,
          due: args.due as string | undefined,
          priority: args.priority as string | undefined,
          category: args.category as string | undefined,
          notes: args.notes as string | undefined,
        })
        result = { ok: true, ...created }
        break
      }
      case "update_todo": {
        await updateTodo(args.page_id as string, {
          name: args.name as string | undefined,
          due: args.due as string | null | undefined,
          status: args.status as string | undefined,
          priority: args.priority as string | undefined,
          category: args.category as string | undefined,
        })
        result = { ok: true }
        break
      }

      // ── Schedules ──
      case "list_schedules": {
        const from = args.from as string
        const to = args.to as string
        const [notionItems, gcalItems] = await Promise.all([
          getSchedulesRichInRange(from, to, 50).catch(() => []),
          listGoogleCalendarEventsForRange(from, to).catch(() => []),
        ])
        const q = (args.query as string | undefined)?.toLowerCase()
        const matchStr = (s: string | undefined) => !q || (s ?? "").toLowerCase().includes(q)
        const notion = q
          ? notionItems.filter((it) =>
              Object.values(it).some((v) => {
                if (typeof v === "string") return matchStr(v)
                if (Array.isArray(v))
                  return v.some((s) => typeof s === "string" && matchStr(s))
                return false
              })
            )
          : notionItems
        const gcal = q
          ? gcalItems.filter((e) => matchStr(e.title) || matchStr(e.location))
          : gcalItems
        result = {
          notion_count: notion.length,
          gcal_count: gcal.length,
          notion,
          gcal: gcal.map((e) => ({
            title: e.title,
            start: e.start,
            end: e.end,
            location: e.location,
            url: e.url,
          })),
        }
        break
      }
      case "create_schedule": {
        const created = await createSchedule({
          name: args.name as string,
          date_start: args.date_start as string,
          date_end: args.date_end as string | undefined,
          place: args.place as string | undefined,
          category: args.category as string | undefined,
          targets: (args.targets as ("notion" | "gcal")[] | undefined) ?? ["notion"],
        })
        result = { ok: true, ...created }
        break
      }

      case "update_schedule": {
        await updateSchedule(args.page_id as string, {
          name: args.name as string | undefined,
          date_start: args.date_start as string | undefined,
          date_end: args.date_end as string | null | undefined,
          place: args.place as string | null | undefined,
          category: args.category as string | null | undefined,
          society: args.society as string[] | undefined,
          topic: args.topic as string | null | undefined,
          link: args.link as string | null | undefined,
        })
        result = { ok: true }
        break
      }
      case "delete_schedule": {
        await deleteSchedule(args.page_id as string)
        result = { ok: true }
        break
      }
      case "update_gcal_event": {
        result = await updateGoogleCalendarEvent({
          eventId: args.event_id as string,
          name: args.name as string | undefined,
          date_start: args.date_start as string | undefined,
          date_end: args.date_end as string | undefined,
          place: args.place as string | null | undefined,
          description: args.description as string | null | undefined,
        })
        break
      }
      case "delete_gcal_event": {
        result = await deleteGoogleCalendarEvent(args.event_id as string)
        break
      }

      // ── Orchestration ──
      case "ask_brian": {
        const [stats, projects] = await Promise.all([
          getJournalStats().catch(() => null),
          listResearchProjects().catch(() => []),
        ])
        const byStatus: Record<string, number> = {}
        for (const p of projects) {
          byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
        }
        result = {
          journal: stats,
          research_total: projects.length,
          research_by_status: byStatus,
          recent_projects: projects.slice(0, 15).map((p) => ({
            title: p.title,
            status: p.status,
            target_journal: p.target_journal,
            start_date: p.start_date,
          })),
        }
        break
      }
      case "ask_opdb": {
        const data = await getAllPatientRows()
        const total = data.patients.length
        const now = Date.now()
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const recent_week = data.patients.filter((p) => p.op_date && p.op_date.slice(0, 10) >= weekAgo).length
        const recent_month = data.patients.filter((p) => p.op_date && p.op_date.slice(0, 10) >= monthAgo).length
        result = { total, recent_week, recent_month }
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
    return {
      isError: true,
      content: [{ type: "text", text: `Error in ${name}: ${message}` }],
    }
  }
})

// ─── Boot ──────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[dakota-mcp] connected via stdio")
}

main().catch((e) => {
  console.error("[dakota-mcp] fatal:", e)
  process.exit(1)
})
