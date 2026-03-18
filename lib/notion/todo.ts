import { notionRequest } from "./client"

const TODO_DB_ID_KEY = "NOTION_TODO_DB_ID"

interface NotionProperty {
  type: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  date?: { start: string; end: string | null } | null
  select?: { name: string } | null
}

interface NotionPage {
  id: string
  url: string
  archived?: boolean
  created_time: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionPage[]
}

interface NotionDatabaseProperty {
  type: string
}

interface NotionDatabaseResponse {
  properties: Record<string, NotionDatabaseProperty>
}

interface NotionCreateResponse {
  id: string
  url: string
}

export interface TodoItem {
  page_id: string
  name: string
  due: string | null
  status: string
  priority: string
  category: string
  notes: string
  url: string
  created_at: string
  completed_at: string | null
}

export interface TodoCreateInput {
  name: string
  due?: string
  status?: string
  priority?: string
  category?: string
  notes?: string
}

export interface TodoUpdateInput {
  name?: string
  due?: string | null
  status?: string
  priority?: string
  category?: string
  notes?: string
}

interface TodoQueryOptions {
  status?: string
  fromDate?: string
  completedFromDate?: string
  excludeDone?: boolean
}

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.type === "title") return (prop.title ?? []).map((item) => item.plain_text ?? "").join("").trim()
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((item) => item.plain_text ?? "").join("").trim()
  return ""
}

function toTodoItem(page: NotionPage): TodoItem {
  const properties = page.properties
  return {
    page_id: page.id,
    name: getText(properties.Name),
    due: properties.Due?.date?.start ?? null,
    status: properties.Status?.select?.name ?? "To Do",
    priority: properties.Priority?.select?.name ?? "Medium",
    category: properties.Category?.select?.name ?? "일상업무",
    notes: getText(properties.Notes),
    url: page.url,
    created_at: page.created_time.slice(0, 10),
    completed_at: properties["Completed At"]?.date?.start ?? null,
  }
}

let cachedTodoPropertyNames: Set<string> | null = null

async function getTodoPropertyNames(): Promise<Set<string>> {
  if (cachedTodoPropertyNames) {
    return cachedTodoPropertyNames
  }

  const dbId = getTodoDbId()
  const database = await notionRequest<NotionDatabaseResponse>(`/databases/${dbId}`)
  cachedTodoPropertyNames = new Set(Object.keys(database.properties ?? {}))
  return cachedTodoPropertyNames
}

async function supportsCategoryProperty(): Promise<boolean> {
  const names = await getTodoPropertyNames()
  return names.has("Category")
}

function getTodayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export function getTodoDbId(): string {
  const dbId = process.env[TODO_DB_ID_KEY]
  if (!dbId) {
    throw new Error("NOTION_TODO_DB_ID is not configured")
  }
  return dbId
}

function buildQueryFilter(options: TodoQueryOptions): Record<string, unknown> | undefined {
  const filters: Record<string, unknown>[] = []

  if (options.excludeDone) {
    filters.push({ property: "Status", select: { does_not_equal: "Done" } })
  }

  if (options.status && options.status !== "all") {
    filters.push({ property: "Status", select: { equals: options.status } })
  }

  if (options.fromDate) {
    filters.push({ property: "Due", date: { on_or_after: options.fromDate } })
  }

  if (options.completedFromDate) {
    filters.push({ property: "Completed At", date: { on_or_after: options.completedFromDate } })
  }

  if (filters.length === 0) return undefined
  if (filters.length === 1) return filters[0]

  return { and: filters }
}

export async function getTodayTodos(): Promise<TodoItem[]> {
  const dbId = getTodoDbId()
  const today = getTodayInSeoul()

  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        or: [
          { property: "Due", date: { equals: today } },
          {
            and: [
              { property: "Status", select: { does_not_equal: "Done" } },
              { property: "Due", date: { on_or_before: today } },
            ],
          },
        ],
      },
      sorts: [
        { property: "Due", direction: "ascending" },
        { timestamp: "last_edited_time", direction: "descending" },
      ],
      page_size: 100,
    }),
  })

  return response.results.map(toTodoItem)
}

export async function getAllTodos(options: TodoQueryOptions = {}): Promise<TodoItem[]> {
  const dbId = getTodoDbId()
  const filter = buildQueryFilter(options)

  const sorts = options.status === "Done"
    ? [{ property: "Completed At", direction: "descending" as const }]
    : [
        { property: "Due", direction: "ascending" as const },
        { timestamp: "last_edited_time" as const, direction: "descending" as const },
      ]

  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({ filter, sorts, page_size: 100 }),
  })

  return response.results.map(toTodoItem)
}

export async function createTodo(input: TodoCreateInput): Promise<{ page_id: string; url: string }> {
  const dbId = getTodoDbId()
  const hasCategory = await supportsCategoryProperty()

  const properties: Record<string, unknown> = {
    Name: {
      title: [{ text: { content: input.name.trim() } }],
    },
    Due: {
      date: input.due ? { start: input.due } : null,
    },
    Status: {
      select: { name: input.status ?? "To Do" },
    },
    Priority: {
      select: { name: input.priority ?? "Medium" },
    },
    Notes: {
      rich_text: input.notes?.trim() ? [{ text: { content: input.notes.trim() } }] : [],
    },
  }

  if (hasCategory) {
    properties.Category = {
      select: { name: input.category ?? "일상업무" },
    }
  }

  const response = await notionRequest<NotionCreateResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties,
    }),
  })

  return {
    page_id: response.id,
    url: response.url,
  }
}

export async function updateTodo(pageId: string, updates: TodoUpdateInput): Promise<void> {
  const hasCategory = await supportsCategoryProperty()
  const properties: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    properties.Name = {
      title: [{ text: { content: updates.name.trim() } }],
    }
  }

  if (updates.due !== undefined) {
    properties.Due = {
      date: updates.due ? { start: updates.due } : null,
    }
  }

  if (updates.status !== undefined) {
    properties.Status = {
      select: { name: updates.status },
    }
    // Done 처리 시 Completed At 자동 기록
    if (updates.status === "Done") {
      properties["Completed At"] = {
        date: { start: getTodayInSeoul() },
      }
    }
  }

  if (updates.priority !== undefined) {
    properties.Priority = {
      select: { name: updates.priority },
    }
  }

  if (hasCategory && updates.category !== undefined) {
    properties.Category = {
      select: { name: updates.category },
    }
  }

  if (updates.notes !== undefined) {
    const notes = updates.notes.trim()
    properties.Notes = {
      rich_text: notes ? [{ text: { content: notes } }] : [],
    }
  }

  if (Object.keys(properties).length === 0) {
    return
  }

  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}

export async function deleteTodo(pageId: string): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  })
}
