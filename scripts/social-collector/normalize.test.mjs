import { test } from "node:test"
import assert from "node:assert/strict"
import {
  firstLine,
  dedupeByPostId,
  extractTweetsFromNextData,
  normalizeDate,
  toNotionProperties,
} from "./normalize.mjs"

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

test("extractTweetsFromNextData: 깊이 탐색으로 id_str+text 수집", () => {
  const root = {
    props: { pageProps: { timeline: { entries: [
      { content: { tweet: { id_str: "111", full_text: "hello", created_at: "2026-06-20T00:00:00Z" } } },
      { content: { tweet: { id_str: "222", text: "world" } } },
    ] } } },
  }
  const tweets = extractTweetsFromNextData(root, "karpathy")
  assert.equal(tweets.length, 2)
  const t1 = tweets.find((t) => t.postId === "111")
  assert.equal(t1.text, "hello")
  assert.equal(t1.url, "https://x.com/karpathy/status/111")
  assert.equal(t1.postedAt, "2026-06-20")
  assert.equal(t1.platform, "x")
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
