import { createMemoryModule } from "./agentMemory"

export const elonMemory = createMemoryModule("NOTION_ELON_MEMORY_DB_ID")
export const { listMemories, getMemoryDigest, createMemory, updateMemory, archiveMemory } = elonMemory
export type { MemoryCategory, MemoryRow, MemoryQueryOptions, MemoryCreateInput, MemoryUpdateInput } from "./agentMemory"
