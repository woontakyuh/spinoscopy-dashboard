import {
  fetchAiFrontierCatalog,
  fetchAiFrontierEpisode,
} from "@/lib/andrej/frontier-catalog"
import {
  DwarkeshCatalogError,
  fetchDwarkeshCatalog,
  fetchDwarkeshEpisode,
} from "@/lib/andrej/dwarkesh-catalog"
import type {
  AiFrontierCatalogEpisode,
  AiFrontierOfficialEpisode,
} from "@/lib/types/ai-frontier-import"

export type FrontierCatalogSource = "ai-frontier" | "dwarkesh"

export type FrontierCatalogSourceFailure = {
  readonly source: FrontierCatalogSource
  readonly reason: "upstream"
  readonly status?: number
}

export type FrontierCatalogSourceResult =
  | { readonly ok: true; readonly episodes: readonly AiFrontierCatalogEpisode[] }
  | { readonly ok: false; readonly error: FrontierCatalogSourceFailure }

export type FrontierCatalogSources = {
  readonly aiFrontier: FrontierCatalogSourceResult
  readonly dwarkesh: FrontierCatalogSourceResult
}

type CatalogDependencies = {
  readonly loadAiFrontierCatalog: () => Promise<AiFrontierCatalogEpisode[]>
  readonly loadDwarkeshCatalog: () => Promise<AiFrontierCatalogEpisode[]>
}

type EpisodeDependencies = {
  readonly loadAiFrontierEpisode: (url: string) => Promise<AiFrontierOfficialEpisode>
  readonly loadDwarkeshEpisode: (url: string) => Promise<AiFrontierOfficialEpisode>
}

const defaultCatalogDependencies: CatalogDependencies = {
  loadAiFrontierCatalog: () => fetchAiFrontierCatalog(),
  loadDwarkeshCatalog: () => fetchDwarkeshCatalog(),
}

const defaultEpisodeDependencies: EpisodeDependencies = {
  loadAiFrontierEpisode: (url) => fetchAiFrontierEpisode(url),
  loadDwarkeshEpisode: (url) => fetchDwarkeshEpisode(url),
}

export class FrontierCatalogFetchError extends Error {
  readonly name = "FrontierCatalogFetchError"

  constructor(readonly failure: FrontierCatalogSourceFailure) {
    super("Frontier catalog source failed.")
  }
}

export class FrontierSourceError extends Error {
  readonly name = "FrontierSourceError"

  constructor(url: string, cause?: unknown) {
    super(`등록되지 않은 Frontier 전사 출처입니다: ${url}`, { cause })
  }
}

function sourceResult(
  source: FrontierCatalogSource,
  result: PromiseSettledResult<AiFrontierCatalogEpisode[]>
): FrontierCatalogSourceResult {
  switch (result.status) {
    case "fulfilled":
      return { ok: true, episodes: result.value }
    case "rejected":
      return {
        ok: false,
        error: {
          source,
          reason: "upstream",
          ...(result.reason instanceof DwarkeshCatalogError && result.reason.status !== null
            ? { status: result.reason.status }
            : {}),
        },
      }
  }
}

export async function fetchFrontierCatalogSources(
  dependencies: CatalogDependencies = defaultCatalogDependencies
): Promise<FrontierCatalogSources> {
  const [aiFrontier, dwarkesh] = await Promise.allSettled([
    dependencies.loadAiFrontierCatalog(),
    dependencies.loadDwarkeshCatalog(),
  ])
  return {
    aiFrontier: sourceResult("ai-frontier", aiFrontier),
    dwarkesh: sourceResult("dwarkesh", dwarkesh),
  }
}

function sortedCatalog(episodes: readonly AiFrontierCatalogEpisode[]) {
  return episodes
    .map((episode, index) => ({ episode, index }))
    .sort((left, right) =>
      (right.episode.published ?? "").localeCompare(left.episode.published ?? "") ||
      left.index - right.index
    )
    .map(({ episode }) => episode)
}

export async function fetchFrontierCatalog(
  dependencies: CatalogDependencies = defaultCatalogDependencies
): Promise<AiFrontierCatalogEpisode[]> {
  const sources = await fetchFrontierCatalogSources(dependencies)
  if (!sources.aiFrontier.ok) throw new FrontierCatalogFetchError(sources.aiFrontier.error)
  if (!sources.dwarkesh.ok) throw new FrontierCatalogFetchError(sources.dwarkesh.error)
  return sortedCatalog([...sources.aiFrontier.episodes, ...sources.dwarkesh.episodes])
}

export async function fetchFrontierEpisode(
  url: string,
  dependencies: EpisodeDependencies = defaultEpisodeDependencies
): Promise<AiFrontierOfficialEpisode> {
  let origin: string
  try {
    origin = new URL(url).origin
  } catch (error) {
    throw new FrontierSourceError(url, error)
  }
  if (origin === "https://aifrontier.kr") {
    return dependencies.loadAiFrontierEpisode(url)
  }
  if (origin === "https://www.dwarkesh.com") {
    return dependencies.loadDwarkeshEpisode(url)
  }
  throw new FrontierSourceError(url)
}
