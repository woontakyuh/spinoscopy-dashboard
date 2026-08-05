import { access, readFile, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const SKILL_PATH = path.join(REPOSITORY_ROOT, "skills", "hermes-lo", "SKILL.md")
const ALIAS_SKILL_PATH = path.join(REPOSITORY_ROOT, "skills", "lo", "SKILL.md")

async function main(): Promise<void> {
  const requirePersona = parseArguments(process.argv.slice(2))
  await assertFile(SKILL_PATH, "Hermes Lo skill")

  const skill = await readFile(SKILL_PATH, "utf8")
  assertIncludes(skill, "name: hermes-lo", "skill frontmatter")
  assertIncludes(skill, "/Users/TakMD/workspace/spinoscopy-dashboard/LO.md", "canonical persona reference")
  assertIncludes(skill, "cd /Users/TakMD/workspace/spinoscopy-dashboard", "absolute wrapper working directory")
  assertIncludes(skill, "scripts/hermes-lo/run.ts", "wrapper command")
  assertIncludes(skill, "127.0.0.1", "loopback boundary")
  assertIncludes(skill, "no copied persona rules", "no-copy persona declaration")

  await assertFile(path.join(REPOSITORY_ROOT, "skills", "hermes-lo", "references", "gateway.md"), "gateway reference")
  await assertFile(ALIAS_SKILL_PATH, "Hermes Lo short-command alias")
  const alias = await readFile(ALIAS_SKILL_PATH, "utf8")
  assertIncludes(alias, "name: lo", "alias skill frontmatter")
  assertIncludes(alias, "/Users/TakMD/workspace/spinoscopy-dashboard/LO.md", "alias canonical persona reference")
  assertIncludes(alias, "scripts/hermes-lo/run.ts", "alias wrapper command")
  assertIncludes(alias, "short-command alias for `hermes-lo`", "alias delegation declaration")
  if (requirePersona) await assertFile(path.join(REPOSITORY_ROOT, "LO.md"), "canonical LO persona")

  process.stdout.write("hermes-lo skill verified\n")
}

function parseArguments(args: readonly string[]): boolean {
  if (args.length === 0) return false
  if (args.length === 1 && args[0] === "--require-persona") return true
  throw new Error("Usage: verify-skill.ts [--require-persona]")
}

async function assertFile(filePath: string, label: string): Promise<void> {
  await access(filePath)
  if (!(await stat(filePath)).isFile()) throw new Error(`${label} is not a file: ${filePath}`)
}

function assertIncludes(content: string, expected: string, label: string): void {
  if (!content.includes(expected)) throw new Error(`Missing ${label}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[hermes-lo] ${message}\n`)
  process.exitCode = 1
})
