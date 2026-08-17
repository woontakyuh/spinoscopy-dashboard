import { runAiFrontierCatalogSync } from "../lib/notion/ai-frontier-catalog"

async function main() {
  console.log(JSON.stringify(await runAiFrontierCatalogSync(), null, 2))
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
