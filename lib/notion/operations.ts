import { notionRequest } from "./client"

const OPERATIONS_DB_ID_KEY = "NOTION_DAKOTA_OPERATIONS_DB_ID"

export const OPERATION_STATUSES = ["Inbox", "In Progress", "Waiting", "Completed", "Archived"] as const
export const OPERATION_TYPES = ["Decision", "Execution", "Research", "Automation", "Draft"] as const
export const OPERATION_DOMAINS = ["Strategy", "Clinical", "Research", "AI", "Family", "Personal", "Operations"] as const

type OperationStatus = (typeof OPERATION_STATUSES)[number]
type OperationType = (typeof OPERATION_TYPES)[number]
type OperationDomain = (typeof OPERATION_DOMAINS)[number]

interface NotionRichText {
  plain_text?: string
}

interface NotionProperty {
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  select?: { name: string } | null
  date?: { start: string; end: string | null } | null
  url?: string | null
}

interface NotionOperationPage {
  id: string
  url: string
  created_time: string
  last_edited_time: string
  properties: Record<string, NotionProperty>
}

interface NotionQueryResponse {
  results: NotionOperationPage[]
}

export interface OperationItem {
  page_id: string
  name: string
  status: OperationStatus
  type: OperationType
  domain: OperationDomain
  priority: string
  context: string
  action_taken: string
  result: string
  next_action: string
  linked_todo_url: string | null
  source_url: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  notion_url: string
}

export interface CreateOperationInput {
  name: string
  status?: OperationStatus
  type?: OperationType
  domain?: OperationDomain
  priority?: string
  context?: string
  action_taken?: string
  result?: string
  next_action?: string
  linked_todo_url?: string | null
  source_url?: string | null
}

export interface UpdateOperationInput extends Omit<CreateOperationInput, "name"> {
  name?: string
  completed_at?: string | null
}

function text(property: NotionProperty | undefined): string {
  if (!property) return ""
  const values = property.type === "title" ? property.title : property.rich_text
  return (values ?? []).map((part) => part.plain_text ?? "").join("").trim()
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

function toOperation(page: NotionOperationPage): OperationItem {
  const p = page.properties
  const status = p.Status?.select?.name
  const type = p.Type?.select?.name
  const domain = p.Domain?.select?.name

  return {
    page_id: page.id,
    name: text(p.Name),
    status: OPERATION_STATUSES.includes(status as OperationStatus) ? status as OperationStatus : "Inbox",
    type: OPERATION_TYPES.includes(type as OperationType) ? type as OperationType : "Execution",
    domain: OPERATION_DOMAINS.includes(domain as OperationDomain) ? domain as OperationDomain : "Operations",
    priority: p.Priority?.select?.name ?? "Medium",
    context: text(p.Context),
    action_taken: text(p["Action Taken"]),
    result: text(p.Result),
    next_action: text(p["Next Action"]),
    linked_todo_url: p["Linked Todo"]?.url ?? null,
    source_url: p.Source?.url ?? null,
    created_at: dateOnly(page.created_time),
    updated_at: dateOnly(page.last_edited_time),
    completed_at: p["Completed At"]?.date?.start ?? null,
    notion_url: page.url,
  }
}

export function getOperationsDbId(): string | null {
  return process.env[OPERATIONS_DB_ID_KEY] ?? null
}

export async function getOperations(): Promise<OperationItem[]> {
  const dbId = getOperationsDbId()
  if (!dbId) return []

  const response = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: { property: "Visibility", select: { does_not_equal: "Private" } },
      sorts: [
        { timestamp: "last_edited_time", direction: "descending" },
      ],
      page_size: 100,
    }),
  })

  return response.results.map(toOperation)
}

function richText(content: string | undefined): Array<{ text: { content: string } }> {
  const safe = content?.trim().slice(0, 1800) ?? ""
  return safe ? [{ text: { content: safe } }] : []
}

function dateValue(value: string | null | undefined): { start: string } | null {
  return value ? { start: value } : null
}

export async function createOperation(input: CreateOperationInput): Promise<OperationItem> {
  const dbId = getOperationsDbId()
  if (!dbId) throw new Error("NOTION_DAKOTA_OPERATIONS_DB_ID is not configured")

  const response = await notionRequest<NotionOperationPage>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: richText(input.name) },
        Status: { select: { name: input.status ?? "Inbox" } },
        Type: { select: { name: input.type ?? "Execution" } },
        Domain: { select: { name: input.domain ?? "Operations" } },
        Priority: { select: { name: input.priority ?? "Medium" } },
        Visibility: { select: { name: "Dashboard" } },
        Context: { rich_text: richText(input.context) },
        "Action Taken": { rich_text: richText(input.action_taken) },
        Result: { rich_text: richText(input.result) },
        "Next Action": { rich_text: richText(input.next_action) },
        "Linked Todo": { url: input.linked_todo_url ?? null },
        Source: { url: input.source_url ?? null },
      },
    }),
  })

  return toOperation(response)
}

export async function updateOperation(pageId: string, updates: UpdateOperationInput): Promise<void> {
  const properties: Record<string, unknown> = {}
  if (updates.name !== undefined) properties.Name = { title: richText(updates.name) }
  if (updates.status !== undefined) properties.Status = { select: { name: updates.status } }
  if (updates.type !== undefined) properties.Type = { select: { name: updates.type } }
  if (updates.domain !== undefined) properties.Domain = { select: { name: updates.domain } }
  if (updates.priority !== undefined) properties.Priority = { select: { name: updates.priority } }
  if (updates.context !== undefined) properties.Context = { rich_text: richText(updates.context) }
  if (updates.action_taken !== undefined) properties["Action Taken"] = { rich_text: richText(updates.action_taken) }
  if (updates.result !== undefined) properties.Result = { rich_text: richText(updates.result) }
  if (updates.next_action !== undefined) properties["Next Action"] = { rich_text: richText(updates.next_action) }
  if (updates.linked_todo_url !== undefined) properties["Linked Todo"] = { url: updates.linked_todo_url }
  if (updates.source_url !== undefined) properties.Source = { url: updates.source_url }
  if (updates.completed_at !== undefined) properties["Completed At"] = { date: dateValue(updates.completed_at) }

  if (Object.keys(properties).length === 0) return
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}
