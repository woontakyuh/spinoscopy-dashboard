import { describe, expect, it, vi } from "vitest"

import { LO_CHAT_MODEL, LoChatProviderUnavailableError } from "./index"
import { createOpenAIResponsesProvider } from "./openai"

describe("OpenAI Lo chat provider", () => {
  it("uses the official Responses API, Luna model, and disabled provider-side storage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [] }), { status: 200 }))
    const provider = createOpenAIResponsesProvider({ apiKey: "test-openai-key", fetchImpl })

    await provider.respond({
      model: LO_CHAT_MODEL,
      instructions: "Use tools.",
      input: [{ type: "message", role: "user", content: [] }],
      tools: [],
    })

    expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-openai-key" }),
    }))
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      tools: [],
    })
  })

  it("normalizes an unavailable provider response without exposing its body", async () => {
    const provider = createOpenAIResponsesProvider({
      apiKey: "test-openai-key",
      fetchImpl: vi.fn().mockResolvedValue(new Response("provider detail", { status: 429 })),
    })

    await expect(provider.respond({
      model: LO_CHAT_MODEL,
      instructions: "Use tools.",
      input: [],
      tools: [],
    })).rejects.toBeInstanceOf(LoChatProviderUnavailableError)
  })
})
