#!/usr/bin/env tsx
// Elon MCP Server — exposes Elon's persona, memory, and patient-data tools to any MCP client
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

import { elonMemory, type MemoryCategory } from "../lib/notion/elonMemory.js"
import { listInterestingCases } from "../lib/notion/interestingCases.js"
import { getAllPatientRows } from "../lib/notion/analytics.js"
import { notionRequest } from "../lib/notion/client.js"

// ─── Persona ───────────────────────────────────────────────────
const PERSONA_PATH = path.join(REPO_ROOT, "ELON.md")
function loadPersona(): string {
  if (!existsSync(PERSONA_PATH)) return "ELON.md not found"
  return readFileSync(PERSONA_PATH, "utf-8")
}

// ─── Helpers ───────────────────────────────────────────────────
function getMonthStartInSeoul(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

// ─── Server ────────────────────────────────────────────────────
const server = new Server(
  { name: "elon-mcp", version: "1.0.0" },
  { capabilities: { resources: {}, tools: {} } },
)

// ─── Resources ─────────────────────────────────────────────────
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "elon://persona",
      name: "Elon persona",
      description:
        "Elon's immutable persona (first-principles engineer for patient data). Read this once at the start of every conversation and follow it for all replies.",
      mimeType: "text/markdown",
    },
    {
      uri: "elon://memory-digest",
      name: "Elon memory digest",
      description:
        "Top facts from Elon Memory DB (most important first). A pre-formatted text summary of what Elon knows about Tak's patient cohort and clinical preferences.",
      mimeType: "text/plain",
    },
  ],
}))

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri
  if (uri === "elon://persona") {
    return { contents: [{ uri, mimeType: "text/markdown", text: loadPersona() }] }
  }
  if (uri === "elon://memory-digest") {
    const digest = await elonMemory.getMemoryDigest(60)
    return { contents: [{ uri, mimeType: "text/plain", text: digest || "(memory empty)" }] }
  }
  throw new Error(`Unknown resource: ${uri}`)
})

// ─── Tools ─────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Memory ──
    {
      name: "list_memories",
      description:
        "Query Elon Memory DB. Filter by category and/or minimum importance. Returns rows with page_id (use for update_memory).",
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
        "Add a new fact to Elon Memory DB. Use when you discover something new and meaningful about Tak's clinical preferences, patient cases, or research directions that should persist long-term. Use anonymized patient identifiers — never store raw names or MRNs.",
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
        "Search Elon Memory DB by text (matches name + content, case-insensitive). MUST be called when Tak says '아까/전에/지난번/어제/그 케이스/기억나?/우리 이야기했던' etc. — these signal past conversation recall across channels.",
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

    // ── Patient data ──
    {
      name: "search_patients",
      description:
        "Search Notion Patient DB by name (case-insensitive partial match). Returns surgery patients only (DB=Op AND Sch≠canceled). Use for individual case lookups.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 50 },
        },
      },
    },
    {
      name: "list_interesting_cases",
      description:
        "Return patients tagged with 'Interesting case' in the DB column, sorted by most recently edited. Includes surgery and non-surgery cases.",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number", minimum: 1, maximum: 100 } },
      },
    },
    {
      name: "get_monthly_surgery_stats",
      description:
        "Return this month's surgery summary — total count, op category breakdown, cumulative lifetime total. Surgery filter: DB=Op AND Sch≠canceled.",
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
      case "list_memories": {
        const rows = await elonMemory.listMemories({
          category: args.category as MemoryCategory | undefined,
          minImportance: args.min_importance as number | undefined,
          limit: args.limit as number | undefined,
        })
        result = { count: rows.length, rows }
        break
      }
      case "add_memory": {
        const row = await elonMemory.createMemory({
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
        const all = await elonMemory.listMemories({
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
        await elonMemory.updateMemory({
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

      case "search_patients": {
        const dbId = process.env.NOTION_PATIENT_DB_ID
        if (!dbId) throw new Error("NOTION_PATIENT_DB_ID not set")
        const res = await notionRequest<{
          results: Array<{
            id: string
            url: string
            properties: Record<string, {
              type: string
              title?: Array<{ plain_text?: string }>
              rich_text?: Array<{ plain_text?: string }>
              date?: { start: string } | null
              select?: { name: string } | null
              multi_select?: Array<{ name: string }>
            }>
          }>
        }>(`/databases/${dbId}/query`, {
          method: "POST",
          body: JSON.stringify({
            filter: {
              and: [
                { property: "Name", title: { contains: args.query as string } },
                { property: "DB", multi_select: { contains: "Op" } },
                { property: "Sch", select: { does_not_equal: "canceled" } },
              ],
            },
            page_size: Math.min((args.limit as number | undefined) ?? 20, 50),
            sorts: [{ property: "Op Date", direction: "descending" }],
          }),
        })
        const items = res.results.map((p) => {
          const pr = p.properties
          const getText = (x: typeof pr[string]) => {
            if (!x) return ""
            if (x.type === "title") return (x.title ?? []).map((t) => t.plain_text ?? "").join("").trim()
            if (x.type === "rich_text") return (x.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim()
            return ""
          }
          return {
            page_id: p.id,
            url: p.url,
            name: getText(pr.Name),
            pt_no: getText(pr["Pt No"]),
            age: getText(pr.Age),
            sex: pr.Sex?.select?.name?.trim() ?? "",
            op_date: pr["Op Date"]?.date?.start ?? null,
            op_name: getText(pr["Op Name"]),
            op_category: (pr["Op Category"]?.multi_select ?? []).map((o) => o.name),
            hospital: (pr.Hospital?.multi_select ?? []).map((o) => o.name),
          }
        })
        result = { count: items.length, items }
        break
      }

      case "list_interesting_cases": {
        const cases = await listInterestingCases((args.limit as number | undefined) ?? 30)
        result = { count: cases.length, cases }
        break
      }

      case "get_monthly_surgery_stats": {
        const data = await getAllPatientRows()
        const monthStart = getMonthStartInSeoul()
        const thisMonth = data.patients.filter((p) => p.op_date && p.op_date.slice(0, 10) >= monthStart)
        const by_category: Record<string, number> = {}
        for (const p of thisMonth) {
          const cats = p.op_category.length > 0 ? p.op_category : ["(uncategorized)"]
          for (const c of cats) by_category[c] = (by_category[c] ?? 0) + 1
        }
        result = {
          month_start: monthStart,
          month_count: thisMonth.length,
          lifetime_count: data.patients.length,
          by_category,
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
  console.error("[elon-mcp] connected via stdio")
}

main().catch((e) => {
  console.error("[elon-mcp] fatal:", e)
  process.exit(1)
})
