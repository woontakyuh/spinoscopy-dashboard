import { analyzeAiFrontierEpisode } from "@/lib/andrej/frontier-analysis"
import { fetchAiFrontierEpisode } from "@/lib/andrej/frontier-catalog"
import {
  getAiFrontierIndex,
} from "@/lib/notion/ai-frontier"
import {
  persistAiFrontierImport,
  setAiFrontierImportStatus,
} from "@/lib/notion/ai-frontier-import"
import type { AiFrontierIndex } from "@/lib/types/ai-frontier"
import type {
  AiFrontierEpisodeAnalysis,
  AiFrontierImportResult,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

type ImportStatus = "수집 중" | "수집 실패"

interface ImportDependencies {
  loadIndex(): Promise<AiFrontierIndex>
  loadEpisode(url: string): Promise<AiFrontierOfficialEpisode>
  analyze(episode: AiFrontierOfficialEpisode): Promise<AiFrontierEpisodeAnalysis>
  persist(
    input: Parameters<typeof persistAiFrontierImport>[0]
  ): Promise<AiFrontierImportResult>
  setStatus(pageId: string, status: ImportStatus): Promise<void>
}

const defaultDependencies: ImportDependencies = {
  loadIndex: () => getAiFrontierIndex(),
  loadEpisode: (url) => fetchAiFrontierEpisode(url),
  analyze: (episode) => analyzeAiFrontierEpisode(episode, {
    apiKey: process.env.OPENAI_API_KEY ?? "",
  }),
  persist: (input) => persistAiFrontierImport(input),
  setStatus: (pageId, status) => setAiFrontierImportStatus(pageId, status),
}

export class AiFrontierImportNotFoundError extends Error {
  constructor() {
    super("AI Frontier Episode를 찾을 수 없습니다.")
    this.name = "AiFrontierImportNotFoundError"
  }
}

export class AiFrontierImportConflictError extends Error {
  constructor() {
    super("이미 완료됐거나 수집 중인 Episode입니다.")
    this.name = "AiFrontierImportConflictError"
  }
}

export class AiFrontierImportError extends Error {
  constructor(cause?: unknown) {
    super("AI Frontier Episode 자료를 가져오지 못했습니다.", { cause })
    this.name = "AiFrontierImportError"
  }
}

export async function importAiFrontierEpisode(
  pageId: string,
  dependencies: ImportDependencies = defaultDependencies
): Promise<AiFrontierImportResult> {
  const index = await dependencies.loadIndex()
  if (index.sources.episodes !== "ok" || index.sources.concepts !== "ok") {
    throw new AiFrontierImportError()
  }
  const episodeRecord = index.episodes.find((episode) => episode.id === pageId)
  if (!episodeRecord?.transcriptSource) {
    throw new AiFrontierImportNotFoundError()
  }
  if (episodeRecord.status === "완료" || episodeRecord.status === "수집 중") {
    throw new AiFrontierImportConflictError()
  }

  let collecting = false
  try {
    await dependencies.setStatus(pageId, "수집 중")
    collecting = true
    const episode = await dependencies.loadEpisode(episodeRecord.transcriptSource)
    if (episode.episodeNumber !== episodeRecord.episodeNumber) {
      throw new AiFrontierImportError()
    }
    const analysis = await dependencies.analyze(episode)
    return await dependencies.persist({
      pageId,
      episode,
      analysis,
      existingConcepts: index.concepts,
    })
  } catch (error) {
    if (collecting) {
      try {
        await dependencies.setStatus(pageId, "수집 실패")
      } catch (statusError) {
        throw new AiFrontierImportError(statusError)
      }
    }
    if (error instanceof AiFrontierImportConflictError) throw error
    throw new AiFrontierImportError(error)
  }
}
