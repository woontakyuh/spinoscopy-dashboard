import { cp, lstat, mkdir, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const SOURCE = path.join(REPOSITORY_ROOT, "skills", "hermes-lo")

async function main(): Promise<void> {
  const { target, allowExternal, force } = parseArguments(process.argv.slice(2))
  await assertSafeTarget(target, allowExternal)
  if (await exists(target)) {
    if (!force) throw new Error(`Target already exists: ${target} (pass --force to replace it)`)
    await rm(target, { recursive: true, force: false })
  }
  await mkdir(path.dirname(target), { recursive: true })
  await cp(SOURCE, target, { recursive: true, errorOnExist: true })
  process.stdout.write(`hermes-lo skill synced to ${target}\n`)
}

function parseArguments(args: readonly string[]): { target: string; allowExternal: boolean; force: boolean } {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")))
  const targets = args.filter((arg) => !arg.startsWith("--"))
  if (targets.length !== 1 || [...flags].some((flag) => flag !== "--allow-external" && flag !== "--force")) {
    throw new Error("Usage: sync-skill.ts <target-directory> [--allow-external] [--force]")
  }
  return { target: path.resolve(targets[0]), allowExternal: flags.has("--allow-external"), force: flags.has("--force") }
}

async function assertSafeTarget(target: string, allowExternal: boolean): Promise<void> {
  if (target === SOURCE) throw new Error("Target must not replace the repository skill source")
  if (!allowExternal && !isWithin(REPOSITORY_ROOT, target)) {
    throw new Error("Refusing to write outside this repository without --allow-external")
  }
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[hermes-lo] ${message}\n`)
  process.exitCode = 1
})
