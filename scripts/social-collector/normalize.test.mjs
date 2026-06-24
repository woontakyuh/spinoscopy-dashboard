import { test } from "node:test"
import assert from "node:assert/strict"
import {
  firstLine,
  dedupeByPostId,
  normalizeDate,
  toNotionProperties,
  cleanThreadText,
  sinceDate,
  withinSince,
} from "./normalize.mjs"

test("cleanThreadText: 머리 메타(계정·시각) 제거", () => {
  assert.equal(cleanThreadText("choi.openai\n14분\n실제 본문\n둘째줄", "choi.openai"), "실제 본문\n둘째줄")
  assert.equal(cleanThreadText("2시간\n본문", "choi.openai"), "본문")
  assert.equal(cleanThreadText("본문만", "choi.openai"), "본문만")
})

test("cleanThreadText: AI Threads 토픽칩·시각·Translate·참여수 제거", () => {
  const raw = "AI Threads\n56m\nAI 쯔꾸르 만들기 장족의발전\n집을 템플릿화시켜서\nTranslate\n\n1\n/\n3\n4\n5"
  assert.equal(cleanThreadText(raw, "aimaster3658"), "AI 쯔꾸르 만들기 장족의발전\n집을 템플릿화시켜서")
  // Pinned + 영문 토픽칩 + View N more
  const raw2 = "Pinned\nunclejobs.ai\n10h\nAside는, 통합하지 않습니다\n본문 둘째줄\nView 12 more"
  assert.equal(cleanThreadText(raw2, "unclejobs.ai"), "Aside는, 통합하지 않습니다\n본문 둘째줄")
})

test("sinceDate / withinSince: 주간 컷오프", () => {
  const now = Date.parse("2026-06-22T00:00:00Z")
  assert.equal(sinceDate(7, now), "2026-06-15")
  assert.equal(withinSince({ postedAt: "2026-06-20" }, "2026-06-15"), true)
  assert.equal(withinSince({ postedAt: "2026-06-10" }, "2026-06-15"), false)
  assert.equal(withinSince({ postedAt: "" }, "2026-06-15"), true) // 날짜 미상은 포함
})

test("firstLine: 첫 비어있지 않은 줄, 길면 잘림", () => {
  assert.equal(firstLine("\n  hello \n world"), "hello")
  assert.equal(firstLine("x".repeat(100), 10), "xxxxxxxxx…")
  assert.equal(firstLine(""), "")
})

test("dedupeByPostId: 기존 PostId 제외 + 내부 중복 제거", () => {
  const items = [
    { postId: "a", text: "1" },
    { postId: "b", text: "2" },
    { postId: "a", text: "dup" },
    { postId: "", text: "no id" },
  ]
  const out = dedupeByPostId(items, ["b"])
  assert.deepEqual(out.map((i) => i.postId), ["a"])
})

test("normalizeDate: 파싱/실패", () => {
  assert.equal(normalizeDate("2026-06-20T12:00:00Z"), "2026-06-20")
  assert.equal(normalizeDate("garbage"), "")
  assert.equal(normalizeDate(""), "")
})

test("toNotionProperties: 속성 매핑 + PostedAt 선택", () => {
  const p = toNotionProperties(
    { platform: "threads", account: "choi.openai", postId: "abc", text: "본문\n둘째줄", url: "https://t/p/abc", postedAt: "2026-06-21" },
    "2026-06-22T00:00:00.000Z"
  )
  assert.equal(p.Platform.select.name, "threads")
  assert.equal(p.Account.rich_text[0].text.content, "choi.openai")
  assert.equal(p.PostId.rich_text[0].text.content, "abc")
  assert.equal(p.URL.url, "https://t/p/abc")
  assert.equal(p.Title.title[0].text.content, "본문")
  assert.equal(p.PostedAt.date.start, "2026-06-21")
  assert.equal(p.CollectedAt.date.start, "2026-06-22T00:00:00.000Z")

  const noDate = toNotionProperties({ platform: "x", account: "k", postId: "1", text: "t", url: "u" }, "2026-06-22T00:00:00.000Z")
  assert.equal(noDate.PostedAt, undefined)
})
