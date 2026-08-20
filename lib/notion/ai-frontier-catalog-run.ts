import {
  fetchFrontierCatalogSources,
  type FrontierCatalogSources,
} from "@/lib/andrej/frontier-sources"
import type { AiFrontierEpisode } from "@/lib/types/ai-frontier"
import type { AiFrontierCatalogEpisode } from "@/lib/types/ai-frontier-import"

import { getAiFrontierIndex } from "./ai-frontier"
import {
  type CatalogSourceFailure,
  type CatalogSyncResult,
  syncAiFrontierCatalog,
} from "./ai-frontier-catalog"
import { DWARKESH_CATALOG_WINDOW } from "./ai-frontier-catalog-plan"

type CatalogRunDependencies = {
  readonly loadCatalog: () => Promise<AiFrontierCatalogEpisode[] | FrontierCatalogSources>
  readonly loadIndex: () => Promise<Awaited<ReturnType<typeof getAiFrontierIndex>>>
  readonly sync: (
    catalog: AiFrontierCatalogEpisode[],
    existingEpisodes: AiFrontierEpisode[]
  ) => Promise<CatalogSyncResult>
}

const defaultDependencies: CatalogRunDependencies = {
  loadCatalog: () => fetchFrontierCatalogSources(),
  loadIndex: () => getAiFrontierIndex(),
  sync: (catalog, existingEpisodes) =>
    syncAiFrontierCatalog(catalog, existingEpisodes),
}

function isolatedCatalog(loadResult: FrontierCatalogSources): {
  readonly catalog: AiFrontierCatalogEpisode[]
  readonly sourceFailures: readonly CatalogSourceFailure[]
} {
  const catalog: AiFrontierCatalogEpisode[] = []
  const sourceFailures: CatalogSourceFailure[] = []

  if (loadResult.aiFrontier.ok) catalog.push(...loadResult.aiFrontier.episodes)
  else sourceFailures.push(loadResult.aiFrontier.error)

  if (!loadResult.dwarkesh.ok) {
    sourceFailures.push(loadResult.dwarkesh.error)
  } else if (loadResult.dwarkesh.episodes.length === 0) {
    sourceFailures.push({ source: "dwarkesh", reason: "empty" })
  } else if (loadResult.dwarkesh.episodes.length < DWARKESH_CATALOG_WINDOW) {
    sourceFailures.push({
      source: "dwarkesh",
      reason: "undersized",
      count: loadResult.dwarkesh.episodes.length,
    })
  } else {
    catalog.push(...loadResult.dwarkesh.episodes)
  }
  return { catalog, sourceFailures }
}

export async function runAiFrontierCatalogSync(
  dependencies: CatalogRunDependencies = defaultDependencies
): Promise<CatalogSyncResult & { readonly catalog: number }> {
  const loadResult = await dependencies.loadCatalog()
  const isolated = Array.isArray(loadResult)
    ? { catalog: loadResult, sourceFailures: [] }
    : isolatedCatalog(loadResult)
  const index = await dependencies.loadIndex()
  if (index.sources.episodes !== "ok") {
    throw new Error("AI Frontier Episodes DB를 읽지 못했습니다.")
  }
  const result = await dependencies.sync(isolated.catalog, index.episodes)
  return {
    catalog: isolated.catalog.length,
    ...result,
    ...(Array.isArray(loadResult) ? {} : { sourceFailures: isolated.sourceFailures }),
  }
}
