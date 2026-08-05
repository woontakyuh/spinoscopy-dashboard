import { mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  callLoTool,
  createLoMcpContext,
  listLoResources,
  listLoTools,
  readLoResource,
} from "./lo"
import { LO_TOOL_NAMES } from "../lib/lo/dashboard"
import type { LoMemory } from "../lib/types/lo-v2"

const temporaryRoots: string[] = []

function loMemory(
  pageId: string,
  importance: number,
  lastEditedAt: string,
  status: LoMemory["status"] = "active",
): LoMemory {
  return {
    pageId,
    url: `https://notion.so/${pageId}`,
    name: `Memory ${pageId}`,
    content: `Content ${pageId}`,
    category: "rule",
    status,
    importance,
    source: { kind: "manual", reference: "test", capturedAt: "2026-08-04T00:00:00.000Z" },
    supersedes: null,
    supersededBy: null,
    supersededAt: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    lastEditedAt,
  }
}

async function contextFor(
  memories: LoMemory[] = [],
  executeTool = vi.fn().mockResolvedValue({
    tool: "lo.training.recent",
    data: [{ pageId: "training-1" }],
    citations: [],
  }),
  conversation = vi.fn().mockResolvedValue("언더훅부터 잡아."),
) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "lo-mcp-"))
  temporaryRoots.push(repoRoot)
  await writeFile(path.join(repoRoot, "LO.md"), "# Lo\n\n코치 페르소나\n", "utf8")

  return {
    context: createLoMcpContext({
      repoRoot,
      listMemories: vi.fn().mockResolvedValue(memories),
      dashboardService: { executeTool },
      conversation,
    }),
    executeTool,
    conversation,
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("Lo MCP context", () => {
  it("reads the repository LO.md bytes and directs clients to bootstrap both resources", async () => {
    const { context } = await contextFor()

    const resources = listLoResources()
    const persona = await readLoResource(context, "lo://persona")

    expect(resources.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: "lo://persona",
        mimeType: "text/markdown",
        description: expect.stringMatching(/read .* start .* conversation/i),
      }),
      expect.objectContaining({
        uri: "lo://memory-digest",
        mimeType: "text/plain",
        description: expect.stringMatching(/read .* start .* conversation/i),
      }),
    ]))
    expect(persona).toEqual({
      contents: [{
        uri: "lo://persona",
        mimeType: "text/markdown",
        text: "# Lo\n\n코치 페르소나\n",
      }],
    })
  })

  it("renders the 40 most important active memories, breaking ties by recency", async () => {
    const lowPriority = loMemory("low-priority", 1, "2026-08-05T00:00:00.000Z")
    const highPriorityOlder = loMemory("high-priority-older", 5, "2026-08-02T00:00:00.000Z")
    const highPriorityRecent = loMemory("high-priority-recent", 5, "2026-08-04T00:00:00.000Z")
    const archived = loMemory("archived", 5, "2026-08-06T00:00:00.000Z", "superseded")
    const filler = Array.from({ length: 39 }, (_, index) => loMemory(
      `filler-${String(index).padStart(2, "0")}`,
      2,
      `2026-08-${String(index % 9 + 1).padStart(2, "0")}T00:00:00.000Z`,
    ))
    const { context } = await contextFor([lowPriority, highPriorityOlder, highPriorityRecent, archived, ...filler])

    const digest = await readLoResource(context, "lo://memory-digest")
    const text = digest.contents[0]?.text ?? ""

    expect(text).toContain("Memory high-priority-recent")
    expect(text.indexOf("Memory high-priority-recent")).toBeLessThan(text.indexOf("Memory high-priority-older"))
    expect(text).not.toContain("Memory archived")
    expect(text.match(/^\[rule\] Memory /gm)).toHaveLength(40)
    expect(text).not.toContain("Memory low-priority")
  })
})

describe("Lo MCP tools", () => {
  it("publishes persistent conversation, bootstrap, and bounded dashboard tools", async () => {
    const { context } = await contextFor()

    const tools = listLoTools(context)

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "get_persona",
      "get_memory_digest",
      "lo.conversation",
      ...LO_TOOL_NAMES,
    ])
    expect(tools.tools.find((tool) => tool.name === "get_persona")).toMatchObject({
      inputSchema: { type: "object", properties: {} },
    })
    expect(tools.tools.find((tool) => tool.name === "lo.memory.save")?.inputSchema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["name", "content", "category", "source"]),
    })
    expect(tools.tools.find((tool) => tool.name === "lo.conversation")?.inputSchema).toMatchObject({
      type: "object",
      required: ["message", "surface", "contextKey", "externalTurnId"],
    })
  })

  it("routes a scoped Claude turn through the persistent Lo gateway", async () => {
    const { context, conversation } = await contextFor()
    const input = {
      message: "지난 대화에 이어서 하프가드 계획을 짜줘",
      surface: "claude-desktop",
      contextKey: "claude:conversation-1",
      externalTurnId: "claude:turn-1",
    }

    const result = await callLoTool(context, "lo.conversation", input)

    expect(conversation).toHaveBeenCalledWith(input)
    expect(result).toEqual({
      content: [{ type: "text", text: "언더훅부터 잡아." }],
    })
  })

  it("uses the dashboard service for bounded tool execution without starting stdio", async () => {
    const { context, executeTool } = await contextFor()

    const result = await callLoTool(context, "lo.training.recent", { limit: 1 })

    expect(executeTool).toHaveBeenCalledWith({
      name: "lo.training.recent",
      input: { limit: 1 },
    })
    expect(result).toEqual({
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "lo.training.recent",
          data: [{ pageId: "training-1" }],
          citations: [],
        }, null, 2),
      }],
    })
  })

  it("uses the bootstrap fallbacks and returns MCP errors for unknown tools", async () => {
    const { context } = await contextFor([loMemory("memory-1", 5, "2026-08-04T00:00:00.000Z")])

    const persona = await callLoTool(context, "get_persona", {})
    const digest = await callLoTool(context, "get_memory_digest", {})
    const unknown = await callLoTool(context, "not-a-tool", {})

    expect(persona.content[0]?.text).toContain("\"source\": \"LO.md\"")
    expect(digest.content[0]?.text).toContain("Memory memory-1")
    expect(unknown).toEqual(expect.objectContaining({
      isError: true,
      content: [expect.objectContaining({ text: "Error in not-a-tool: Unknown tool: not-a-tool" })],
    }))
  })
})
