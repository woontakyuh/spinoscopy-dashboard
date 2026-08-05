import { describe, expect, it, vi } from "vitest"

import { createLoGatewayConversationService } from "./conversation"

const memoryCitation = {
  id: "notion:memory:memory-1",
  source: "notion" as const,
  label: "Lo Memory: Half guard priority",
}

describe("Lo gateway Hermes conversation adapter", () => {
  it("runs Luna through the read-only Lo conversation loop and hides raw citations", async () => {
    const executeTool = vi.fn().mockResolvedValue({
      tool: "lo.memory.search",
      data: [{ pageId: "memory-1", content: "Prioritize the underhook." }],
      citations: [memoryCitation],
    })
    const respond = vi.fn().mockResolvedValue({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: "언더훅부터 잡아. [citation:notion:memory:memory-1]",
        }],
      }],
    })
    const appendTurn = vi.fn().mockReturnValue({
      turnId: "turn-1",
      sessionId: "session-1",
      surface: "hermes",
      contextKey: "telegram:chat-1",
      externalTurnId: "telegram:update-1",
      userText: "하프가드 우선순위 알려줘",
      assistantText: "언더훅부터 잡아.",
      createdAt: "2026-08-04T12:00:00.000Z",
    })
    const considerTurn = vi.fn()
    const recentMessages = vi.fn().mockReturnValue([
      { role: "user", content: "지난번엔 하프가드 언더훅을 연습했어." },
      { role: "assistant", content: "다음에는 니쉴드 복구까지 연결해." },
    ])
    const conversation = createLoGatewayConversationService({
      service: { executeTool },
      provider: { respond },
      store: {
        appendTurn,
        recentMessages,
        countTurns: vi.fn(),
        close: vi.fn(),
      },
      candidates: { considerTurn },
    })

    await expect(conversation.respond({
      message: "하프가드 우선순위 알려줘",
      surface: "hermes",
      contextKey: "telegram:chat-1",
      externalTurnId: "telegram:update-1",
    }))
      .resolves.toBe("언더훅부터 잡아.")

    expect(executeTool).toHaveBeenCalledWith({
      name: "lo.memory.search",
      input: { query: "하프가드 우선순위 알려줘", limit: 5 },
    })
    expect(executeTool).not.toHaveBeenCalledWith(expect.objectContaining({ name: "lo.memory.save" }))
    expect(recentMessages).toHaveBeenCalledWith({
      surface: "hermes",
      contextKey: "telegram:chat-1",
      limit: 20,
    })
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({
      input: [expect.objectContaining({
        content: [expect.objectContaining({
          text: expect.stringContaining("assistant: 다음에는 니쉴드 복구까지 연결해.\nuser: 하프가드 우선순위 알려줘"),
        })],
      })],
    }))
    expect(appendTurn).toHaveBeenCalledWith({
      surface: "hermes",
      contextKey: "telegram:chat-1",
      externalTurnId: "telegram:update-1",
      userText: "하프가드 우선순위 알려줘",
      assistantText: "언더훅부터 잡아.",
    })
    expect(considerTurn).toHaveBeenCalledWith(expect.objectContaining({
      externalTurnId: "telegram:update-1",
    }))
    expect(respond).toHaveBeenCalledTimes(1)
  })

  it("does not persist a partial turn when the provider fails", async () => {
    const appendTurn = vi.fn()
    const conversation = createLoGatewayConversationService({
      service: {
        executeTool: vi.fn().mockResolvedValue({
          tool: "lo.memory.search",
          data: [],
          citations: [],
        }),
      },
      provider: { respond: vi.fn().mockRejectedValue(new Error("provider unavailable")) },
      store: {
        appendTurn,
        recentMessages: vi.fn().mockReturnValue([]),
        countTurns: vi.fn(),
        close: vi.fn(),
      },
      candidates: { considerTurn: vi.fn() },
    })

    await expect(conversation.respond({
      message: "오늘 훈련 계획 알려줘",
      surface: "dashboard",
      contextKey: "dashboard:conversation-1",
      externalTurnId: "dashboard:turn-1",
    })).rejects.toThrow("provider unavailable")
    expect(appendTurn).not.toHaveBeenCalled()
  })
})
