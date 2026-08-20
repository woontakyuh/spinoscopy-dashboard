import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

export type NotionWriteBlock = {
  object: "block"
  type: string
  [key: string]: unknown
}

const MAX_TEXT_LENGTH = 1_800

function richText(content: string, url?: string) {
  return [{
    type: "text",
    text: {
      content,
      ...(url ? { link: { url } } : {}),
    },
  }]
}

function textBlock(
  type: "paragraph" | "heading_1" | "heading_2" | "heading_3" | "bulleted_list_item",
  content: string,
  url?: string
): NotionWriteBlock {
  return {
    object: "block",
    type,
    [type]: { rich_text: richText(content, url) },
  }
}

function heading(level: 1 | 2 | 3, content: string): NotionWriteBlock {
  return textBlock(`heading_${level}`, content)
}

function paragraph(content: string, url?: string): NotionWriteBlock {
  return textBlock("paragraph", content, url)
}

function bullet(content: string): NotionWriteBlock {
  return textBlock("bulleted_list_item", content)
}

function splitLongLine(line: string): string[] {
  const chunks: string[] = []
  for (let index = 0; index < line.length; index += MAX_TEXT_LENGTH) {
    chunks.push(line.slice(index, index + MAX_TEXT_LENGTH))
  }
  return chunks
}

function transcriptParagraphs(transcript: string): NotionWriteBlock[] {
  const paragraphs: string[] = []
  let current = ""
  for (const sourceLine of transcript.split("\n")) {
    const lines = sourceLine.length > MAX_TEXT_LENGTH
      ? splitLongLine(sourceLine)
      : [sourceLine]
    for (const line of lines) {
      const candidate = current === "" ? line : `${current}\n${line}`
      if (candidate.length <= MAX_TEXT_LENGTH) {
        current = candidate
      } else {
        if (current !== "") paragraphs.push(current)
        current = line
      }
    }
  }
  if (current !== "") paragraphs.push(current)
  return paragraphs.filter(Boolean).map((content) => paragraph(content))
}

function titledBullets(title: string, values: string[]): NotionWriteBlock[] {
  return [heading(2, title), ...values.map(bullet)]
}

function sourceLabel(episode: AiFrontierOfficialEpisode): string {
  return episode.source === "dwarkesh"
    ? "Dwarkesh Podcast 공식 전사"
    : "AI Frontier 공식 전사"
}

export function buildAiFrontierEpisodeBlocks(
  episode: AiFrontierOfficialEpisode,
  analysis: AiFrontierEpisodeAnalysis
): NotionWriteBlock[] {
  const blocks: NotionWriteBlock[] = [
    heading(1, episode.name),
    heading(2, "한 줄 요약"),
    paragraph(analysis.summary),
    heading(2, "핵심 내용"),
  ]

  for (const point of analysis.keyPoints) {
    blocks.push(heading(3, point.heading), ...point.bullets.map(bullet))
  }
  blocks.push(
    ...titledBullets("Key Insights", analysis.insights),
    ...titledBullets("Intuitions / Mental Models", analysis.mentalModels),
    heading(2, "새로 배운 용어")
  )
  for (const concept of analysis.concepts) {
    blocks.push(
      heading(3, `${concept.term} · ${concept.korean}`),
      bullet(`한줄 설명: ${concept.oneLine}`),
      bullet(`직관: ${concept.intuition}`),
      bullet(`왜 중요한가: ${concept.whyItMatters}`)
    )
  }
  blocks.push(
    ...titledBullets("사실·해석·추측 구분", analysis.factInterpretation),
    ...titledBullets("다시 생각해볼 질문", analysis.questions),
    heading(2, "출처"),
    paragraph(sourceLabel(episode), episode.officialUrl)
  )
  if (episode.youtube) {
    blocks.push(paragraph("YouTube", episode.youtube))
  }
  blocks.push(
    heading(2, "원본 전사"),
    ...transcriptParagraphs(episode.transcript)
  )
  return blocks
}
