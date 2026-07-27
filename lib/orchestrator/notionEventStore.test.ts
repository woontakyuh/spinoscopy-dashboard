import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isNotionEventStoreAvailable } from "./notionEventStore"

const OLD_ENV = { ...process.env }

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token"
  delete process.env.NOTION_DAKOTA_MEMORY_DB_ID
  delete process.env.NOTION_DAKOTA_EVENT_DB_ID
})

afterEach(() => {
  process.env = { ...OLD_ENV }
})

describe("isNotionEventStoreAvailable", () => {
  it("전용 이벤트 DB가 없으면 비활성이다", () => {
    expect(isNotionEventStoreAvailable()).toBe(false)
  })

  it("Memory DB만 설정돼 있어도 비활성이다 — 장기기억을 오염시키지 않는다", () => {
    process.env.NOTION_DAKOTA_MEMORY_DB_ID = "memory-db"
    expect(isNotionEventStoreAvailable()).toBe(false)
  })

  it("전용 이벤트 DB가 있으면 활성이다", () => {
    process.env.NOTION_DAKOTA_EVENT_DB_ID = "event-db"
    expect(isNotionEventStoreAvailable()).toBe(true)
  })
})
