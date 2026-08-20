import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { z } from "zod"

import {
  AiFrontierBackfillPreviewError,
  parseAiFrontierBackfillArgs,
  runAiFrontierBackfillPreview,
  type AiFrontierBackfillPreviewDependencies,
} from "../lib/notion/ai-frontier-backfill-preview"

const catalogEpisodeSchema = z.object({
  source: z.enum(["ai-frontier", "dwarkesh"]), reference: z.string(),
  episodeNumber: z.number().int().nullable(), name: z.string(), officialUrl: z.string(),
  published: z.string().nullable(), duration: z.string().nullable(),
  youtube: z.string().nullable(), summary: z.string().nullable(),
}).strict()

const existingEpisodeSchema = z.object({
  id: z.string(), name: z.string(), episodeNumber: z.number().nullable(),
  status: z.string().nullable(), published: z.string().nullable(), recorded: z.string().nullable(),
  reviewed: z.boolean(), topics: z.array(z.string()), models: z.array(z.string()),
  people: z.array(z.string()), youtube: z.string().nullable(), transcriptSource: z.string().nullable(),
  duration: z.string().nullable(), summary: z.string().nullable(), keyTerms: z.array(z.string()),
  source: z.enum(["ai-frontier", "dwarkesh"]), sourceKey: z.string().nullable(),
  sourceIdentityPersisted: z.boolean(),
}).strict()

const schemaEntrySchema = z.object({
  property: z.enum(["Source", "Source Key"]),
  expectedType: z.enum(["select", "rich_text"]),
}).strict()
const schemaResultSchema = z.object({
  mode: z.enum(["dryRun", "apply"]), databaseId: z.string(),
  planned: z.array(schemaEntrySchema), applied: z.array(schemaEntrySchema),
  unchanged: z.array(schemaEntrySchema),
  conflicts: z.array(schemaEntrySchema.extend({ actualType: z.string() }).strict()),
  writes: z.number().int().nonnegative(),
}).strict()
const catalogResultSchema = z.object({
  created: z.number().int().nonnegative(), updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(), createdPages: z.array(z.object({
    pageId: z.string(), source: z.enum(["ai-frontier", "dwarkesh"]), sourceKey: z.string(),
    published: z.string().nullable(), officialUrl: z.string(),
  }).strict()),
}).strict()
const batchResultSchema = z.object({
  completed: z.array(z.string()), failed: z.array(z.never()), skipped: z.array(z.string()),
}).strict()
const applyFixtureSchema = z.object({
  schema: schemaResultSchema, catalog: catalogResultSchema,
  appliedEpisodes: z.array(existingEpisodeSchema), summaries: batchResultSchema,
}).strict()
const fixtureSchema = z.object({
  schema: schemaResultSchema,
  catalog: z.array(catalogEpisodeSchema),
  existingEpisodes: z.array(existingEpisodeSchema),
  transcripts: z.record(z.string(), z.string().nullable()),
  apply: applyFixtureSchema.optional(),
}).strict()

type Fixture = z.infer<typeof fixtureSchema>
type ApplyFixture = z.infer<typeof applyFixtureSchema>

class FixtureConfigurationError extends Error {
  readonly name = "FixtureConfigurationError"
}

function requireApplyFixture(fixture: Fixture): ApplyFixture {
  if (fixture.apply === undefined) {
    throw new FixtureConfigurationError("Apply fixture가 필요합니다.")
  }
  return fixture.apply
}

async function fixtureDependencies(path: string): Promise<AiFrontierBackfillPreviewDependencies> {
  const fixture = fixtureSchema.parse(JSON.parse(await readFile(path, "utf8")))
  return {
    loadSchemaPreview: async () => fixture.schema,
    loadCatalog: async () => fixture.catalog,
    loadExistingEpisodes: async () => fixture.existingEpisodes,
    loadTranscript: async (episode) => {
      const transcript = fixture.transcripts[episode.reference]
      if (transcript === undefined || transcript === null || transcript.trim() === "") {
        throw new FixtureConfigurationError(`Transcript fixture가 없습니다: ${episode.reference}`)
      }
      return { ...episode, transcript }
    },
    apply: {
      migrateSchema: async () => requireApplyFixture(fixture).schema,
      syncCatalog: async () => requireApplyFixture(fixture).catalog,
      loadIndex: async () => {
        const applied = requireApplyFixture(fixture).appliedEpisodes
        return {
          status: "ok", sources: { episodes: "ok", concepts: "ok" },
          episodes: applied, concepts: [],
          episodeIndex: Object.fromEntries(applied.flatMap((episode) =>
            episode.sourceKey === null ? [] : [[episode.sourceKey, episode.id]]
          )),
        }
      },
      importSummaries: async () => requireApplyFixture(fixture).summaries,
    },
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  output: Pick<Console, "log" | "error"> = console
): Promise<number> {
  try {
    const options = parseAiFrontierBackfillArgs(argv)
    const fixturePath = process.env.AI_FRONTIER_BACKFILL_PREVIEW_FIXTURE?.trim()
    const dependencies = fixturePath === undefined || fixturePath === ""
      ? undefined
      : await fixtureDependencies(fixturePath)
    const preview = await runAiFrontierBackfillPreview(options, dependencies)
    output.log(JSON.stringify({ ok: true, ...preview }, null, 2))
    return 0
  } catch (error) {
    const known = error instanceof AiFrontierBackfillPreviewError
      ? { name: error.name, code: error.code, message: error.message }
      : error instanceof z.ZodError
        ? { name: "FixtureValidationError", code: "invalid-fixture", message: "Fixture 형식이 올바르지 않습니다." }
        : error instanceof FixtureConfigurationError
          ? { name: error.name, code: "invalid-fixture", message: error.message }
          : { name: "Error", code: "preview-failed", message: "Preview 실행에 실패했습니다." }
    output.error(JSON.stringify({ ok: false, error: known }))
    return 1
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main().then((code) => {
    process.exitCode = code
  })
}
