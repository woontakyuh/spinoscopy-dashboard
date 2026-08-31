import { describe, expect, it } from "vitest"

import {
  AiFrontierSourceConflictError,
  assertCatalogSourceIdentity,
  assertExistingSourceIdentity,
  normalizeSourceKey,
  resolveEpisodeSourceIdentity,
  sourceKeyFromOfficialUrl,
} from "./ai-frontier-identity"

describe("normalizeSourceKey", () => {
  it("정규 키를 대문자/공백 제거 형태로 맞춘다", () => {
    expect(normalizeSourceKey("ep110")).toBe("EP110")
    expect(normalizeSourceKey(" EP 110 ")).toBe("EP110")
    expect(normalizeSourceKey("dwarkesh:ryan-greenblatt")).toBe("DWARKESH:RYAN-GREENBLATT")
  })

  it("형식을 벗어난 값은 null로 떨어뜨린다", () => {
    expect(normalizeSourceKey("")).toBeNull()
    expect(normalizeSourceKey("   ")).toBeNull()
    expect(normalizeSourceKey(null)).toBeNull()
    expect(normalizeSourceKey("EPISODE-110")).toBeNull()
    expect(normalizeSourceKey("DWARKESH:")).toBeNull()
    expect(normalizeSourceKey("DWARKESH:ryan greenblatt")).toBeNull()
    expect(normalizeSourceKey("EP")).toBeNull()
  })
})

describe("sourceKeyFromOfficialUrl", () => {
  it("공식 URL에서 정규 키를 만든다", () => {
    expect(sourceKeyFromOfficialUrl("https://www.dwarkesh.com/p/ryan-greenblatt")).toBe(
      "DWARKESH:RYAN-GREENBLATT"
    )
    expect(sourceKeyFromOfficialUrl("https://aifrontier.kr/ko/episodes/ep110")).toBe("EP110")
  })

  it("공식 URL이 아니면 null이다", () => {
    expect(sourceKeyFromOfficialUrl("https://www.dwarkesh.com/archive")).toBeNull()
    expect(sourceKeyFromOfficialUrl("https://example.com/p/ryan-greenblatt")).toBeNull()
    expect(sourceKeyFromOfficialUrl("not-a-url")).toBeNull()
    expect(sourceKeyFromOfficialUrl(null)).toBeNull()
  })
})

describe("resolveEpisodeSourceIdentity", () => {
  it("마이그레이션 전 AI Frontier 행은 Episode 번호로 정체성을 만든다", () => {
    expect(
      resolveEpisodeSourceIdentity({
        source: null,
        sourceKey: null,
        episodeNumber: 110,
        transcriptSource: null,
      })
    ).toEqual({ source: "ai-frontier", sourceKey: "EP110", persisted: false })
  })

  it("마이그레이션 전 Dwarkesh 행은 공식 URL로 정체성을 만든다", () => {
    expect(
      resolveEpisodeSourceIdentity({
        source: null,
        sourceKey: null,
        episodeNumber: null,
        transcriptSource: "https://www.dwarkesh.com/p/ryan-greenblatt",
      })
    ).toEqual({
      source: "dwarkesh",
      sourceKey: "DWARKESH:RYAN-GREENBLATT",
      persisted: false,
    })
  })

  it("저장된 Source/Source Key가 있으면 그대로 쓴다", () => {
    expect(
      resolveEpisodeSourceIdentity({
        source: "dwarkesh",
        sourceKey: "DWARKESH:RYAN-GREENBLATT",
        episodeNumber: null,
        transcriptSource: "https://www.dwarkesh.com/p/ryan-greenblatt",
      })
    ).toEqual({
      source: "dwarkesh",
      sourceKey: "DWARKESH:RYAN-GREENBLATT",
      persisted: true,
    })
  })

  it("저장된 Source Key가 깨져 있으면 레거시 값으로 안전하게 되돌아간다", () => {
    expect(
      resolveEpisodeSourceIdentity({
        source: "ai-frontier",
        sourceKey: "???",
        episodeNumber: 110,
        transcriptSource: "https://aifrontier.kr/ko/episodes/ep110",
      })
    ).toEqual({ source: "ai-frontier", sourceKey: "EP110", persisted: false })
  })

  it("Source select가 키와 어긋나면 정규 키의 출처를 따른다", () => {
    expect(
      resolveEpisodeSourceIdentity({
        source: "ai-frontier",
        sourceKey: "DWARKESH:RYAN-GREENBLATT",
        episodeNumber: null,
        transcriptSource: "https://www.dwarkesh.com/p/ryan-greenblatt",
      })
    ).toEqual({
      source: "dwarkesh",
      sourceKey: "DWARKESH:RYAN-GREENBLATT",
      persisted: false,
    })
  })

  it("근거가 전혀 없으면 AI Frontier 기본값과 null 키를 준다", () => {
    expect(
      resolveEpisodeSourceIdentity({
        source: null,
        sourceKey: null,
        episodeNumber: null,
        transcriptSource: null,
      })
    ).toEqual({ source: "ai-frontier", sourceKey: null, persisted: false })
  })

  it("키가 없어도 저장된 Source select는 출처로 인정한다", () => {
    expect(
      resolveEpisodeSourceIdentity({
        source: "dwarkesh",
        sourceKey: null,
        episodeNumber: null,
        transcriptSource: null,
      })
    ).toEqual({ source: "dwarkesh", sourceKey: null, persisted: false })
  })
})

describe("assertCatalogSourceIdentity", () => {
  it("공식 URL과 reference가 맞으면 정규 정체성을 돌려준다", () => {
    expect(
      assertCatalogSourceIdentity({
        source: "dwarkesh",
        reference: "DWARKESH:RYAN-GREENBLATT",
        officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
      })
    ).toEqual({ source: "dwarkesh", sourceKey: "DWARKESH:RYAN-GREENBLATT" })
    expect(
      assertCatalogSourceIdentity({
        source: "ai-frontier",
        reference: "EP110",
        officialUrl: "https://aifrontier.kr/ko/episodes/ep110",
      })
    ).toEqual({ source: "ai-frontier", sourceKey: "EP110" })
  })

  it("Dwarkesh URL과 EP 키가 충돌하면 거부한다", () => {
    expect(() =>
      assertCatalogSourceIdentity({
        source: "dwarkesh",
        reference: "EP110",
        officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
      })
    ).toThrow(AiFrontierSourceConflictError)
  })

  it("source 필드가 키와 어긋나면 거부한다", () => {
    expect(() =>
      assertCatalogSourceIdentity({
        source: "ai-frontier",
        reference: "DWARKESH:RYAN-GREENBLATT",
        officialUrl: "https://www.dwarkesh.com/p/ryan-greenblatt",
      })
    ).toThrow(AiFrontierSourceConflictError)
  })

  it("정규 형식이 아닌 reference는 거부한다", () => {
    expect(() =>
      assertCatalogSourceIdentity({
        source: "ai-frontier",
        reference: "episode-110",
        officialUrl: "https://aifrontier.kr/ko/episodes/ep110",
      })
    ).toThrow(AiFrontierSourceConflictError)
  })
})

describe("assertExistingSourceIdentity", () => {
  it("저장된 키가 다르면 거부한다", () => {
    expect(() =>
      assertExistingSourceIdentity(
        { id: "page-1", sourceKey: "EP110", persisted: true },
        { source: "dwarkesh", sourceKey: "DWARKESH:RYAN-GREENBLATT" }
      )
    ).toThrow(AiFrontierSourceConflictError)
  })

  it("저장된 키가 없거나 같으면 통과한다", () => {
    expect(() =>
      assertExistingSourceIdentity(
        { id: "page-1", sourceKey: null, persisted: false },
        { source: "dwarkesh", sourceKey: "DWARKESH:RYAN-GREENBLATT" }
      )
    ).not.toThrow()
    expect(() =>
      assertExistingSourceIdentity(
        { id: "page-1", sourceKey: "EP110", persisted: true },
        { source: "ai-frontier", sourceKey: "EP110" }
      )
    ).not.toThrow()
  })

  it("유도된 레거시 키가 달라도 마이그레이션을 막지 않는다", () => {
    expect(() =>
      assertExistingSourceIdentity(
        { id: "page-1", sourceKey: "EP110", persisted: false },
        { source: "dwarkesh", sourceKey: "DWARKESH:RYAN-GREENBLATT" }
      )
    ).not.toThrow()
  })
})
