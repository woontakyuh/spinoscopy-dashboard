import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import type { MarkdownSourceFile, BjjGraphReadModel } from "@/lib/types/lo-graph"
import { buildBjjGraph } from "./index"

const GRAPH_DIRECTORIES = ["positions", "techniques", "log", "strategy", "partners", "ratings"] as const

/** Reads the canonical markdown inputs without importing Node APIs into the pure parser module. */
export async function readBjjGraphSources(root: string): Promise<MarkdownSourceFile[]> {
  const files = await Promise.all(GRAPH_DIRECTORIES.map(async (directory) => {
    const absoluteDirectory = path.join(root, directory)
    return readMarkdownFiles(root, absoluteDirectory)
  }))
  return files.flat().sort((left, right) => left.path.localeCompare(right.path))
}

/** Loads and indexes the canonical BJJ repository for server-side tools and API routes. */
export async function loadBjjGraph(root: string): Promise<BjjGraphReadModel> {
  return buildBjjGraph(await readBjjGraphSources(root))
}

async function readMarkdownFiles(root: string, directory: string): Promise<MarkdownSourceFile[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (isMissingDirectory(error)) return []
    throw error
  }

  const nested = await Promise.all(entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry): Promise<MarkdownSourceFile[]> => {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) return readMarkdownFiles(root, absolutePath)
      if (!entry.isFile() || !entry.name.endsWith(".md")) return []
      return [{
        path: path.relative(root, absolutePath).split(path.sep).join("/"),
        content: await readFile(absolutePath, "utf8"),
      }]
    }))
  return nested.flat()
}

function isMissingDirectory(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
