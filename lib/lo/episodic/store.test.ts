import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  LoEpisodicConflictError,
  createLoEpisodicStore,
  type LoEpisodicStore,
} from "./store"

describe("Lo episodic SQLite store", () => {
  let directory: string
  let store: LoEpisodicStore

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "lo-episodic-"))
    store = createLoEpisodicStore({
      filePath: path.join(directory, "episodic.sqlite"),
      now: () => new Date("2026-08-05T12:00:00.000Z"),
    })
  })

  afterEach(async () => {
    store.close()
    await rm(directory, { recursive: true, force: true })
  })

  it("persists one complete turn and rehydrates ordered messages", () => {
    const persisted = store.appendTurn({
      surface: "dashboard",
      contextKey: "dashboard:conversation-1",
      externalTurnId: "turn-1",
      userText: "오늘 하프가드 우선순위는?",
      assistantText: "프레임을 먼저 세워.",
    })

    expect(store.recentMessages({
      surface: "dashboard",
      contextKey: "dashboard:conversation-1",
      limit: 10,
    })).toEqual([
      { role: "user", content: "오늘 하프가드 우선순위는?" },
      { role: "assistant", content: "프레임을 먼저 세워." },
    ])
    expect(persisted).toMatchObject({
      surface: "dashboard",
      contextKey: "dashboard:conversation-1",
      externalTurnId: "turn-1",
    })
  })

  it("returns recent complete turns in insertion order when timestamps match", () => {
    for (const index of [1, 2, 3]) {
      store.appendTurn({
        surface: "hermes",
        contextKey: "telegram:7115247932",
        externalTurnId: `message-${index}`,
        userText: `질문 ${index}`,
        assistantText: `답변 ${index}`,
      })
    }

    expect(store.recentMessages({
      surface: "hermes",
      contextKey: "telegram:7115247932",
      limit: 2,
    })).toEqual([
      { role: "user", content: "질문 2" },
      { role: "assistant", content: "답변 2" },
      { role: "user", content: "질문 3" },
      { role: "assistant", content: "답변 3" },
    ])
  })

  it("keeps explicit surface contexts isolated", () => {
    store.appendTurn({
      surface: "dashboard",
      contextKey: "dashboard:conversation-1",
      externalTurnId: "dashboard-1",
      userText: "Dashboard 질문",
      assistantText: "Dashboard 답변",
    })
    store.appendTurn({
      surface: "hermes",
      contextKey: "telegram:7115247932",
      externalTurnId: "telegram-1",
      userText: "Telegram 질문",
      assistantText: "Telegram 답변",
    })

    expect(store.recentMessages({
      surface: "hermes",
      contextKey: "telegram:7115247932",
      limit: 10,
    })).toEqual([
      { role: "user", content: "Telegram 질문" },
      { role: "assistant", content: "Telegram 답변" },
    ])
  })

  it("is idempotent for an identical external turn", () => {
    const input = {
      surface: "dashboard" as const,
      contextKey: "dashboard:conversation-1",
      externalTurnId: "turn-1",
      userText: "같은 질문",
      assistantText: "같은 답변",
    }

    const first = store.appendTurn(input)
    const second = store.appendTurn(input)

    expect(second).toEqual(first)
    expect(store.countTurns()).toBe(1)
  })

  it("rejects a reused turn identity with different content", () => {
    store.appendTurn({
      surface: "dashboard",
      contextKey: "dashboard:conversation-1",
      externalTurnId: "turn-1",
      userText: "원래 질문",
      assistantText: "원래 답변",
    })

    expect(() => store.appendTurn({
      surface: "dashboard",
      contextKey: "dashboard:conversation-1",
      externalTurnId: "turn-1",
      userText: "변경된 질문",
      assistantText: "변경된 답변",
    })).toThrow(LoEpisodicConflictError)
    expect(store.countTurns()).toBe(1)
  })
})
