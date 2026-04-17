import { createMemoryModule } from "./agentMemory"

export const loMemory = createMemoryModule("NOTION_LO_MEMORY_DB_ID")
export const { listMemories, getMemoryDigest, createMemory, updateMemory, archiveMemory } = loMemory
export type { MemoryCategory, MemoryRow, MemoryQueryOptions, MemoryCreateInput, MemoryUpdateInput } from "./agentMemory"
