import { describe, expect, it, vi } from "vitest"

import {
  LoChatCitationError,
  LoChatLoopLimitError,
  listLoChatFunctions,
  runLoChat,
  runLoConversation,
  runLoToolLoop,
  type LoChatProvider,
  type LoToolAdapter,
} from "./index"

const trainingCitation = {
  id: "notion:training:training-1",
  source: "notion" as const,
  label: "BJJ Training: Half guard class",
  href: "https://notion.so/training-1",
}

function functionCall(name: string, argumentsJson = "{}"): Record<string, unknown> {
  return {
    type: "function_call",
    call_id: `call-${name}`,
    name,
    arguments: argumentsJson,
  }
}

function answer(text: string): Record<string, unknown> {
  return {
    type: "message",
    content: [{ type: "output_text", text }],
  }
}

function createAdapter(): LoToolAdapter {
  return {
    execute: vi.fn().mockResolvedValue({
      tool: "lo.training.recent",
      data: [{ pageId: "training-1", name: "Half guard class" }],
      citations: [trainingCitation],
    }),
  }
}

function createProvider(...outputs: Array<readonly Record<string, unknown>[]>): LoChatProvider {
  return {
    respond: vi.fn()
      .mockResolvedValueOnce({ output: outputs[0] ?? [] })
      .mockResolvedValueOnce({ output: outputs[1] ?? [] })
      .mockResolvedValueOnce({ output: outputs[2] ?? [] }),
  }
}

describe("Lo chat tool loop", () => {
  it("runs free-form dashboard messages on Luna and allows non-factual replies without fake citations", async () => {
    const adapter: LoToolAdapter = {
      execute: vi.fn().mockResolvedValue({
        tool: "lo.memory.search",
        data: [],
        citations: [],
      }),
    }
    const provider = createProvider([answer("좋아. 무엇부터 볼까?")])

    const result = await runLoConversation([
      { role: "user", content: "안녕 Lo" },
    ], { adapter, provider })

    expect(result).toEqual({ answer: "좋아. 무엇부터 볼까?", citations: [] })
    expect(adapter.execute).toHaveBeenCalledWith({
      name: "lo.memory.search",
      input: { query: "안녕 Lo", limit: 5 },
    })
    expect(provider.respond).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.6-luna",
      input: [expect.objectContaining({
        role: "user",
        content: [expect.objectContaining({
          type: "input_text",
          text: expect.stringContaining("user: 안녕 Lo"),
        })],
      })],
    }))
  })

  it("grounds a month-specific training question before asking the provider", async () => {
    const adapter: LoToolAdapter = {
      execute: vi.fn()
        .mockResolvedValueOnce({
          tool: "lo.memory.search",
          data: [],
          citations: [],
        })
        .mockResolvedValueOnce({
          tool: "lo.training.recent",
          data: [{ pageId: "training-1", name: "Half guard class", date: "2026-07-31" }],
          citations: [trainingCitation],
        }),
    }
    const provider = createProvider([
      answer("7월 수련 기록입니다. [citation:notion:training:training-1]"),
    ])

    const result = await runLoConversation([
      { role: "user", content: "7월 수련 현황좀 알려줄래" },
    ], {
      adapter,
      provider,
      now: () => new Date("2026-08-05T06:00:00.000Z"),
    })

    expect(adapter.execute).toHaveBeenNthCalledWith(2, {
      name: "lo.training.recent",
      input: { from: "2026-07-01", to: "2026-07-31", limit: 20 },
    })
    expect(result.citations).toEqual([trainingCitation])
  })

  it("routes a model function call through the bounded dashboard adapter and preserves its citation", async () => {
    const adapter = createAdapter()
    const provider = createProvider(
      [functionCall("lo_training_recent", JSON.stringify({ limit: 1, from: null, to: null }))],
      [answer("Recent training: Half guard class [citation:notion:training:training-1]")],
    )

    const result = await runLoChat({ commandId: "review-training" }, { adapter, provider })

    expect(adapter.execute).toHaveBeenCalledWith({ name: "lo.training.recent", input: { limit: 1 } })
    expect(result).toEqual({
      answer: "Recent training: Half guard class [citation:notion:training:training-1]",
      citations: [trainingCitation],
    })
    expect(provider.respond).toHaveBeenCalledTimes(2)
    expect(provider.respond).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: "gpt-5.6-luna",
      toolChoice: { type: "function", name: "lo_training_recent" },
    }))
  })

  it("emits provider-valid strict schemas while preserving nullable optional tool inputs", () => {
    const [trainingTool] = listLoChatFunctions(["lo.training.recent"])

    expect(trainingTool.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["limit", "from", "to"],
      properties: {
        from: { anyOf: expect.arrayContaining([expect.objectContaining({ type: "null" })]) },
        to: { anyOf: expect.arrayContaining([expect.objectContaining({ type: "null" })]) },
      },
    })
  })

  it("rejects a factual answer that cites an ID not returned by a tool in this request", async () => {
    const adapter = createAdapter()
    const provider = createProvider(
      [functionCall("lo_training_recent")],
      [answer("Half guard class [citation:notion:training:other-request]")],
    )

    await expect(runLoChat({ commandId: "review-training" }, { adapter, provider }))
      .rejects.toBeInstanceOf(LoChatCitationError)
  })

  it("rejects a factual answer that omits current-request citations", async () => {
    const adapter = createAdapter()
    const provider = createProvider(
      [functionCall("lo_training_recent")],
      [answer("Half guard class was the most recent training session.")],
    )

    await expect(runLoChat({ commandId: "review-training" }, { adapter, provider }))
      .rejects.toBeInstanceOf(LoChatCitationError)
  })

  it("stops after three provider rounds when the model keeps requesting tools", async () => {
    const adapter = createAdapter()
    const provider = createProvider(
      [functionCall("lo_training_recent")],
      [functionCall("lo_training_recent")],
      [functionCall("lo_training_recent")],
    )

    await expect(runLoChat({ commandId: "review-training" }, { adapter, provider }))
      .rejects.toBeInstanceOf(LoChatLoopLimitError)

    expect(provider.respond).toHaveBeenCalledTimes(3)
    expect(adapter.execute).toHaveBeenCalledTimes(3)
  })

  it("keeps explicit durable-memory writes in the strict adapter surface", async () => {
    const adapter: LoToolAdapter = {
      execute: vi.fn().mockResolvedValue({
        tool: "lo.memory.save",
        data: { pageId: "memory-1" },
        citations: [{
          id: "notion:memory:memory-1",
          source: "notion" as const,
          label: "Lo Memory: Half guard priority",
        }],
      }),
    }
    const provider = createProvider(
      [functionCall("lo_memory_save", JSON.stringify({
        name: "Half guard priority",
        content: "Prioritize the underhook.",
        category: "rule",
        source: {
          kind: "gateway",
          reference: "operator-note-1",
          capturedAt: "2026-08-04T12:00:00.000Z",
        },
      }))],
      [answer("Saved durable memory [citation:notion:memory:memory-1]")],
    )

    await runLoToolLoop({
      prompt: "Save one explicitly requested durable memory.",
      toolNames: ["lo.memory.save"],
      adapter,
      provider,
    })

    expect(adapter.execute).toHaveBeenCalledWith(expect.objectContaining({ name: "lo.memory.save" }))
  })

  it("exposes only the explicit fitness metric allowlist to the model", async () => {
    const adapter: LoToolAdapter = {
      execute: vi.fn().mockResolvedValue({
        tool: "lo.fitness.trends",
        data: {
          readiness: 99,
          readinessAssessment: "inferred",
          snapshot: {
            latestDailyLog: {
              pageId: "fitness-1",
              metrics: { weightKg: 75, dailyMedication: "secret" },
            },
          },
          trends: [{ metric: "weightKg", delta: -0.5 }],
        },
        citations: [{
          id: "notion:fitness:fitness-1",
          source: "notion" as const,
          label: "Fitness Log: 2026-08-04",
        }],
      }),
    }
    const provider = createProvider(
      [functionCall("lo_fitness_trends", JSON.stringify({ metrics: ["weightKg"] }))],
      [answer("Weight decreased by 0.5 kg [citation:notion:fitness:fitness-1]")],
    )

    await runLoToolLoop({
      prompt: "Review allowed fitness trends.",
      toolNames: ["lo.fitness.trends"],
      adapter,
      provider,
    })

    const secondInput = (provider.respond as ReturnType<typeof vi.fn>).mock.calls[1][0].input as Array<Record<string, unknown>>
    const toolOutput = secondInput.find((item) => item.type === "function_call_output")
    expect(toolOutput).toBeDefined()
    const safeResult = JSON.parse(toolOutput?.output as string) as { data: Record<string, unknown> }
    expect(JSON.stringify(safeResult)).toContain("weightKg")
    expect(JSON.stringify(safeResult)).not.toContain("dailyMedication")
    expect(safeResult.data.readiness).toBeNull()
  })
})
