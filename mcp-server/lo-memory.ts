import type { LoMemory } from "../lib/types/lo-v2"

export const MEMORY_DIGEST_LIMIT = 40

export function formatMemoryDigest(memories: readonly LoMemory[]): string {
  const active = memories
    .filter((memory) => memory.status === "active")
    .sort((left, right) => (right.importance ?? 0) - (left.importance ?? 0)
      || right.lastEditedAt.localeCompare(left.lastEditedAt)
      || left.pageId.localeCompare(right.pageId))
    .slice(0, MEMORY_DIGEST_LIMIT)

  if (active.length === 0) return "(memory empty)"

  return active.map((memory) => {
    const category = memory.category ?? "uncategorized"
    const importance = memory.importance ?? 0
    return `[${category}] ${memory.name} (importance: ${importance}, last edited: ${memory.lastEditedAt})\n${memory.content}`
  }).join("\n\n")
}
