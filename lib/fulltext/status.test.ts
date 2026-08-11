import { describe, it, expect } from "vitest"
import { fulltextState, fulltextNotionFilter } from "./status"

describe("fulltextState", () => {
  it("OA·Aside 두 확보 경로를 모두 acquired 로 본다", () => {
    // 어느 경로로 받았든 "우리 파이프라인이 채취한 원문" 이라는 점은 같다.
    expect(fulltextState("OA 확보", true)).toBe("acquired")
    expect(fulltextState("Aside 확보", true)).toBe("acquired")
  })

  it("실패는 failed", () => {
    expect(fulltextState("실패", true)).toBe("failed")
  })

  it("요청됨은 pending", () => {
    expect(fulltextState("요청됨", true)).toBe("pending")
  })

  it("요청은 켜졌는데 상태가 비면 pending — 워커 큐가 집어가는 상태와 같게", () => {
    // queryFulltextQueue 가 {요청됨, 비어있음} 을 큐로 보므로 화면도 같게 읽어야
    // "대기 2건" 인데 목록엔 안 보이는 어긋남이 안 생긴다.
    expect(fulltextState(null, true)).toBe("pending")
  })

  it("접근불가는 failed 가 아니라 none — 재시도 대상이 아니다", () => {
    // 구독이 없어 애초에 못 받는 건이라 failed 에 섞이면 재시도 목록이 오염된다.
    expect(fulltextState("접근불가", false)).toBe("none")
  })

  it("요청한 적 없으면 none", () => {
    expect(fulltextState(null, false)).toBe("none")
    expect(fulltextState(undefined, undefined)).toBe("none")
  })

  it("모르는 상태값은 none 으로 떨어뜨린다", () => {
    // Notion select 에 사람이 손으로 값을 추가해도 화면이 깨지지 않아야 한다.
    expect(fulltextState("보류", true)).toBe("none")
  })
})

describe("fulltextNotionFilter", () => {
  it("all 이면 조건을 붙이지 않는다", () => {
    expect(fulltextNotionFilter("all")).toBeNull()
  })

  it("acquired 는 두 확보 상태의 OR", () => {
    expect(fulltextNotionFilter("acquired")).toEqual({
      or: [
        { property: "원문 상태", select: { equals: "OA 확보" } },
        { property: "원문 상태", select: { equals: "Aside 확보" } },
      ],
    })
  })

  it("failed 는 단일 조건", () => {
    expect(fulltextNotionFilter("failed")).toEqual({
      property: "원문 상태",
      select: { equals: "실패" },
    })
  })

  it("pending 은 요청됨 + (요청 ON & 상태 비어있음) — fulltextState 와 같은 범위", () => {
    // 서버 쿼리와 화면 카운트가 어긋나면 "대기 2건" 인데 목록은 1건이 된다.
    expect(fulltextNotionFilter("pending")).toEqual({
      or: [
        { property: "원문 상태", select: { equals: "요청됨" } },
        {
          and: [
            { property: "원문 요청", checkbox: { equals: true } },
            { property: "원문 상태", select: { is_empty: true } },
          ],
        },
      ],
    })
  })
})
