import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"

const temporaryDirectories: string[] = []

function catalog() {
  return Array.from({ length: 20 }, (_, index) => {
    const number = 20 - index
    const slug = `episode-${number}`
    return {
      source: "dwarkesh", reference: `DWARKESH:EPISODE-${number}`, episodeNumber: null,
      name: `Episode ${number}`, officialUrl: `https://www.dwarkesh.com/p/${slug}`,
      published: `2026-07-${String(number).padStart(2, "0")}`, duration: "PT1H",
      youtube: null, summary: null,
    }
  })
}

function existingEpisodes() {
  return catalog().map((row, index) => ({
    id: `page-${index}`, name: row.name, episodeNumber: null, status: "목록",
    published: row.published, recorded: null, reviewed: false, topics: [], models: [],
    people: [], youtube: null, transcriptSource: row.officialUrl, duration: row.duration,
    summary: null, keyTerms: [], source: "dwarkesh", sourceKey: row.reference,
    sourceIdentityPersisted: true,
  }))
}

async function fixturePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "frontier-backfill-cli-"))
  temporaryDirectories.push(directory)
  const rows = catalog()
  const path = join(directory, "fixture.json")
  await writeFile(path, JSON.stringify({
    schema: {
      mode: "dryRun", databaseId: "fixture-db", planned: [], applied: [], unchanged: [
        { property: "Source", expectedType: "select" },
        { property: "Source Key", expectedType: "rich_text" },
      ], conflicts: [], writes: 0,
    },
    catalog: rows,
    existingEpisodes: existingEpisodes(),
    transcripts: Object.fromEntries(rows.map((row) => [row.reference, `Transcript ${row.reference}`])),
    apply: {
      schema: {
        mode: "apply", databaseId: "fixture-db", planned: [], applied: [], unchanged: [
          { property: "Source", expectedType: "select" },
          { property: "Source Key", expectedType: "rich_text" },
        ], conflicts: [], writes: 0,
      },
      catalog: { created: 0, updated: 0, unchanged: 20, createdPages: [] },
      appliedEpisodes: existingEpisodes(),
      summaries: { completed: rows.slice(0, 10).map((row) => row.reference), failed: [], skipped: [] },
    },
  }))
  return path
}

async function runCli(args: readonly string[], fixture?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn("npm", ["run", "frontier:backfill-preview", "--", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_FRONTIER_BACKFILL_PREVIEW_FIXTURE: fixture,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", resolve)
  })
  return { code, stdout, stderr }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("frontier:backfill-preview CLI subprocess", () => {
  it("fails closed without an explicit mode", async () => {
    const result = await runCli([])

    expect(result.code).toBe(1)
    const errorLine = result.stderr.split("\n").find((line) => line.startsWith("{"))
    expect(JSON.parse(errorLine ?? "null")).toMatchObject({ ok: false, error: { code: "mode-required" } })
  })

  it("dry-run audits full transcripts and reports no execution", async () => {
    const result = await runCli(["--dry-run"], await fixturePath())

    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout.slice(result.stdout.indexOf("{")))).toMatchObject({
      ok: true,
      transcripts: { checked: 20, ready: { count: 20 }, missing: { count: 0 } },
      execution: null,
      deletes: 0,
    })
  })

  it("apply uses only injected fixture boundaries and reports observed execution", async () => {
    const result = await runCli(["--apply"], await fixturePath())

    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout.slice(result.stdout.indexOf("{")))).toMatchObject({
      ok: true,
      execution: {
        schema: { writes: 0, applied: 0 },
        catalog: { created: 0, updated: 0, unchanged: 20 },
        summaries: { completed: 10, failed: 0, skipped: 0, analysisCalls: 10 },
      },
      deletes: 0,
    })
  })
})
