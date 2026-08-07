import { describe, expect, it } from "vitest"

import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

import { buildAiFrontierEpisodeBlocks } from "./ai-frontier-blocks"

const episode: AiFrontierOfficialEpisode = {
  episodeNumber: 87,
  name: "EP87. 딸깍의 시대",
  officialUrl: "https://aifrontier.kr/ko/episodes/ep87",
  published: "2026-02-24",
  duration: "PT1H",
  youtube: "https://www.youtube.com/watch?v=abc",
  summary: "공식 설명",
  transcript: `노정석: ${"긴 전사 ".repeat(700)}\n최승준: 마무리`,
}

const analysis: AiFrontierEpisodeAnalysis = {
  summary: "한 줄 요약",
  topics: ["Agent"],
  models: [],
  people: ["노정석", "최승준"],
  concepts: [{
    term: "Agent Harness",
    korean: "에이전트 하네스",
    category: "Agent",
    oneLine: "도구 계층이다.",
    intuition: "작업대와 같다.",
    whyItMatters: "신뢰성을 높인다.",
  }, {
    term: "AI Agent",
    korean: "AI 에이전트",
    category: "Agent",
    oneLine: "목표를 수행한다.",
    intuition: "작업자와 같다.",
    whyItMatters: "자동화한다.",
  }, {
    term: "Tool Use",
    korean: "도구 사용",
    category: "Agent",
    oneLine: "기능을 호출한다.",
    intuition: "손과 같다.",
    whyItMatters: "행동으로 연결한다.",
  }],
  keyPoints: [{ heading: "Agent 구성", bullets: ["모델과 Harness를 나눈다."] }],
  insights: ["Harness가 제품 차이를 만든다."],
  mentalModels: ["모델은 두뇌, Harness는 작업 환경이다."],
  factInterpretation: ["사실과 해석을 구분한다."],
  questions: ["평가를 어떻게 자동화할까?"],
}

describe("AI Frontier Notion 본문 블록", () => {
  it("요약·핵심·개념·출처·전사 순서로 만든다", () => {
    const blocks = buildAiFrontierEpisodeBlocks(episode, analysis)
    const headings = blocks.flatMap((block) => {
      const content = block[block.type] as { rich_text?: Array<{ text?: { content?: string } }> }
      const text = content.rich_text?.map((part) => part.text?.content ?? "").join("") ?? ""
      return block.type.startsWith("heading_") ? [text] : []
    })

    expect(headings).toEqual(expect.arrayContaining([
      "한 줄 요약",
      "핵심 내용",
      "Key Insights",
      "Intuitions / Mental Models",
      "새로 배운 용어",
      "사실·해석·추측 구분",
      "다시 생각해볼 질문",
      "출처",
      "원본 전사",
    ]))
    expect(headings.indexOf("한 줄 요약")).toBeLessThan(headings.indexOf("원본 전사"))
  })

  it("긴 전사는 Notion 제한보다 짧은 여러 paragraph로 나눈다", () => {
    const blocks = buildAiFrontierEpisodeBlocks(episode, analysis)
    const transcriptIndex = blocks.findIndex((block) =>
      block.type === "heading_2" &&
      JSON.stringify(block).includes("원본 전사")
    )
    const transcriptBlocks = blocks.slice(transcriptIndex + 1)

    expect(transcriptBlocks.length).toBeGreaterThan(1)
    for (const block of transcriptBlocks) {
      const content = block.paragraph as { rich_text: Array<{ text: { content: string } }> }
      expect(content.rich_text[0]?.text.content.length).toBeLessThanOrEqual(1_800)
    }
  })
})
