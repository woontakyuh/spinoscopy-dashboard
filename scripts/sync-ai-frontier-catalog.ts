import { fetchAiFrontierCatalog } from "../lib/andrej/frontier-catalog"
import { getAiFrontierIndex } from "../lib/notion/ai-frontier"
import { syncAiFrontierCatalog } from "../lib/notion/ai-frontier-catalog"

async function main() {
  const catalog = await fetchAiFrontierCatalog()
  const index = await getAiFrontierIndex()
  if (index.sources.episodes !== "ok") {
    throw new Error("AI Frontier Episodes DB를 읽지 못했습니다.")
  }

  const result = await syncAiFrontierCatalog(catalog, index.episodes)
  console.log(JSON.stringify({ catalog: catalog.length, ...result }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
