#!/usr/bin/env tsx
// Lo MCP Server — exposes Lo's canonical persona, durable memory, and bounded
// dashboard tools to MCP clients without creating a second Lo domain layer.

import { config } from "dotenv"
import { readFile } from "node:fs/promises"
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
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import {
  createLoDashboardService,
  listLoToolDefinitions,
  type LoToolDefinition,
  type LoToolResult,
} from "../lib/lo/dashboard"
import { listLoMemories } from "../lib/notion/loMemory"
import type { LoMemory, LoMemoryQuery } from "../lib/types/lo-v2"
import {
  LO_MCP_CONVERSATION_TOOL,
  createLoopbackLoMcpConversation,
  parseLoMcpConversationInput,
  type LoMcpConversation,
} from "./lo-conversation"
import { formatMemoryDigest, MEMORY_DIGEST_LIMIT } from "./lo-memory"

export interface LoMcpDashboardService {
  executeTool(call: unknown): Promise<LoToolResult>
}

export interface LoMcpContextOptions {
  repoRoot?: string
  readFile?: (filePath: string) => Promise<string | Buffer>
  listMemories?: (options: LoMemoryQuery) => Promise<LoMemory[]>
  dashboardService?: LoMcpDashboardService
  toolDefinitions?: () => LoToolDefinition[]
  conversation?: LoMcpConversation
}

export interface LoMcpContext {
  personaPath: string
  readPersona: () => Promise<string>
  getMemoryDigest: () => Promise<string>
  dashboardService: LoMcpDashboardService
  toolDefinitions: () => LoToolDefinition[]
  conversation: LoMcpConversation
}

/**
 * Creates the dependency boundary used by both the MCP request handlers and
 * focused tests. Domain reads and tool execution stay in their existing Lo
 * modules; this layer only adapts them to MCP.
 */
export function createLoMcpContext(options: LoMcpContextOptions = {}): LoMcpContext {
  const personaPath = path.join(options.repoRoot ?? REPO_ROOT, "LO.md")
  const readPersonaFile = options.readFile ?? readFile
  const listMemories = options.listMemories ?? listLoMemories
  const dashboardService = options.dashboardService ?? createLoDashboardService()
  const toolDefinitions = options.toolDefinitions ?? listLoToolDefinitions
  const conversation = options.conversation ?? createLoopbackLoMcpConversation(process.env)

  return {
    personaPath,
    async readPersona() {
      const contents = await readPersonaFile(personaPath)
      return typeof contents === "string" ? contents : contents.toString("utf8")
    },
    async getMemoryDigest() {
      const memories = await listMemories({ status: "active" })
      return formatMemoryDigest(memories)
    },
    dashboardService,
    toolDefinitions,
    conversation,
  }
}

/** Lists the bootstrap resources without connecting a stdio transport. */
export function listLoResources() {
  return {
    resources: [
      {
        uri: "lo://persona",
        name: "Lo persona",
        description:
          "Read this resource at the start of every conversation and follow Lo's canonical identity, coaching role, tone, and hard rules.",
        mimeType: "text/markdown",
      },
      {
        uri: "lo://memory-digest",
        name: "Lo memory digest",
        description:
          "Read this resource at the start of every conversation for the current durable Lo context before coaching or answering.",
        mimeType: "text/plain",
      },
    ],
  }
}

/** Reads one Lo resource without requiring an MCP client or stdio transport. */
export async function readLoResource(context: LoMcpContext, uri: string) {
  if (uri === "lo://persona") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: await context.readPersona(),
      }],
    }
  }
  if (uri === "lo://memory-digest") {
    return {
      contents: [{
        uri,
        mimeType: "text/plain",
        text: await context.getMemoryDigest(),
      }],
    }
  }
  throw new Error(`Unknown resource: ${uri}`)
}

/** Lists the fallback bootstrap tools plus the eight governed dashboard tools. */
export function listLoTools(context: LoMcpContext) {
  return {
    tools: [
      {
        name: "get_persona",
        description:
          "Return Lo's canonical persona. Use this at conversation start only when the client cannot read lo://persona directly.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_memory_digest",
        description:
          "Return Lo's top 40 active memories. Use this at conversation start only when the client cannot read lo://memory-digest directly.",
        inputSchema: { type: "object", properties: {} },
      },
      LO_MCP_CONVERSATION_TOOL,
      ...context.toolDefinitions(),
    ],
  }
}

/** Executes one MCP tool call while preserving the dashboard service's schemas and bounds. */
export async function callLoTool(
  context: LoMcpContext,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{
  content: Array<{ type: "text"; text: string }>
  isError?: true
}> {
  try {
    let result: unknown

    switch (name) {
      case "get_persona":
        result = {
          text: await context.readPersona(),
          source: "LO.md",
          fallback_for_resource: "lo://persona",
        }
        break
      case "get_memory_digest":
        result = {
          text: await context.getMemoryDigest(),
          limit: MEMORY_DIGEST_LIMIT,
          fallback_for_resource: "lo://memory-digest",
        }
        break
      case "lo.conversation":
        result = await context.conversation(parseLoMcpConversationInput(args))
        break
      default:
        if (!context.toolDefinitions().some((tool) => tool.name === name)) {
          throw new Error(`Unknown tool: ${name}`)
        }
        result = await context.dashboardService.executeTool({ name, input: args })
    }

    return {
      content: [{
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [{ type: "text", text: `Error in ${name}: ${message}` }],
    }
  }
}

/** Creates an unconnected MCP server so clients and tests control transport lifecycle. */
export function createLoMcpServer(context: LoMcpContext = createLoMcpContext()): Server {
  const server = new Server(
    { name: "lo-mcp", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} } },
  )

  server.setRequestHandler(ListResourcesRequestSchema, async () => listLoResources())
  server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
    readLoResource(context, request.params.uri),
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => listLoTools(context))
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callLoTool(context, request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>),
  )

  return server
}

export async function main(): Promise<void> {
  const server = createLoMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[lo-mcp] connected via stdio")
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1]
  return Boolean(entryPoint && path.resolve(entryPoint) === __filename)
}

if (isMainModule()) {
  main().catch((error) => {
    console.error("[lo-mcp] fatal:", error)
    process.exit(1)
  })
}
