export interface AiFrontierCatalogEpisode {
  episodeNumber: number
  name: string
  officialUrl: string
  published: string | null
  duration: string | null
  youtube: string | null
  summary: string | null
}

export interface AiFrontierOfficialEpisode extends AiFrontierCatalogEpisode {
  transcript: string
}

export interface AiFrontierConceptDraft {
  term: string
  korean: string
  category: string
  oneLine: string
  intuition: string
  whyItMatters: string
}

export interface AiFrontierEpisodeAnalysis {
  summary: string
  topics: string[]
  models: string[]
  people: string[]
  concepts: AiFrontierConceptDraft[]
  keyPoints: Array<{ heading: string; bullets: string[] }>
  insights: string[]
  mentalModels: string[]
  factInterpretation: string[]
  questions: string[]
}

export interface AiFrontierImportResult {
  pageId: string
  episodeNumber: number
  status: "완료"
  conceptsCreated: number
  conceptsUpdated: number
}
