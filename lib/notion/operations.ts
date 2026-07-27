import { notionRequest } from "./client"

const OPERATIONS_DB_ID_KEY = "NOTION_DAKOTA_OPERATIONS_DB_ID"

export const OPERATION_STATUSES = ["Inbox", "In Progress", "Waiting", "Completed", "Archived"] as const
export const OPERATION_TYPES = ["Decision", "Execution", "Research", "Automation", "Draft"] as const
export const OPERATION_DOMAINS = [
  "Strategy", "Clinical", "Research", "AI", "Finance",
  "Training", "Family", "Personal", "Operations",
] as const

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
  multi_select?: Array<{ name: string }>
  number?: number | null
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
  has_more: boolean
  next_cursor: string | null
}

export interface OperationItem {
  page_id: string
  name: string
  status: OperationStatus
  type: OperationType
  domain: OperationDomain
  priority: string
  tags: string[]
  context: string
  action_taken: string
  result: string
  next_action: string
  linked_todo_url: string | null
  source_url: string | null
  started_at: string | null
  last_touched: string | null
  session_count: number
  msg_total: number
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
  tags?: string[]
  context?: string
  action_taken?: string
  result?: string
  next_action?: string
  linked_todo_url?: string | null
  source_url?: string | null
  started_at?: string | null
  last_touched?: string | null
  session_count?: number
  msg_total?: number
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
    tags: (p.Tags?.multi_select ?? []).map((t) => t.name),
    context: text(p.Context),
    action_taken: text(p["Action Taken"]),
    result: text(p.Result),
    next_action: text(p["Next Action"]),
    linked_todo_url: p["Linked Todo"]?.url ?? null,
    source_url: p.Source?.url ?? null,
    started_at: p["Started At"]?.date?.start ?? null,
    last_touched: p["Last Touched"]?.date?.start ?? null,
    session_count: p["Session Count"]?.number ?? 0,
    msg_total: p["Msg Total"]?.number ?? 0,
    created_at: dateOnly(page.created_time),
    updated_at: dateOnly(page.last_edited_time),
    completed_at: p["Completed At"]?.date?.start ?? null,
    notion_url: page.url,
  }
}

export function getOperationsDbId(): string | null {
  return process.env[OPERATIONS_DB_ID_KEY] ?? null
}

/**
 * (I4) 운영 34건이 하루 대략 한 건씩 늘어나는 추세라 page_size:100 하나로는 곧 부족해진다.
 * 100건을 넘으면 last_edited_time 역순 정렬상 가장 오래된(휴면) 과제부터 프롬프트에서
 * 사라져 그 과제 소속 수행 세션이 영영 매칭되지 못하고 고아가 된다. 전수 페이지네이션한다.
 * Visibility 필터와 정렬은 대시보드 표시용으로 의도된 것이라 그대로 유지한다.
 */
export async function getOperations(): Promise<OperationItem[]> {
  const dbId = getOperationsDbId()
  if (!dbId) return []

  const results: NotionOperationPage[] = []
  let cursor: string | null = null
  do {
    const response: NotionQueryResponse = await notionRequest<NotionQueryResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "Visibility", select: { does_not_equal: "Private" } },
        sorts: [
          { timestamp: "last_edited_time", direction: "descending" },
        ],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    results.push(...response.results)
    // I3와 같은 이유로 조용한 진행 대신 던진다.
    if (response.has_more) {
      if (!response.next_cursor) {
        throw new Error("Notion 페이지네이션 오류: has_more=true인데 next_cursor가 없습니다 (Operations)")
      }
      cursor = response.next_cursor
    } else {
      cursor = null
    }
  } while (cursor)

  return results.map(toOperation)
}

interface NotionPageIdResponse {
  results: Array<{ id: string }>
  has_more: boolean
  next_cursor: string | null
}

/**
 * 가드 전용. Visibility 필터 없이 전수를 페이지네이션해 page_id만 모은다.
 * getOperations()는 대시보드 표시용이라 Private을 빼고 100건에서 끊기므로
 * 참조 유효성 판정에는 쓸 수 없다.
 */
export async function listAllOperationPageIds(): Promise<Set<string>> {
  const dbId = getOperationsDbId()
  const ids = new Set<string>()
  if (!dbId) return ids

  let cursor: string | null = null
  do {
    const response: NotionPageIdResponse = await notionRequest<NotionPageIdResponse>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    for (const page of response.results) ids.add(page.id)
    // I3: has_more=true인데 next_cursor가 없으면 조용히 멈추던 버그. 이 함수는 참조 유효성
    // 판정의 유일한 근거라, 잘려나가면 유효한 ref가 전부 null로 떨어져 되돌릴 수 없다.
    if (response.has_more) {
      if (!response.next_cursor) {
        throw new Error("Notion 페이지네이션 오류: has_more=true인데 next_cursor가 없습니다 (Operations page ids)")
      }
      cursor = response.next_cursor
    } else {
      cursor = null
    }
  } while (cursor)

  return ids
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
        Tags: { multi_select: (input.tags ?? []).map((name) => ({ name })) },
        "Started At": { date: dateValue(input.started_at) },
        "Last Touched": { date: dateValue(input.last_touched) },
        "Session Count": { number: input.session_count ?? 0 },
        "Msg Total": { number: input.msg_total ?? 0 },
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
  if (updates.tags !== undefined) properties.Tags = { multi_select: updates.tags.map((name) => ({ name })) }
  if (updates.started_at !== undefined) properties["Started At"] = { date: dateValue(updates.started_at) }
  if (updates.last_touched !== undefined) properties["Last Touched"] = { date: dateValue(updates.last_touched) }
  if (updates.session_count !== undefined) properties["Session Count"] = { number: updates.session_count }
  if (updates.msg_total !== undefined) properties["Msg Total"] = { number: updates.msg_total }
  if (updates.completed_at !== undefined) properties["Completed At"] = { date: dateValue(updates.completed_at) }

  if (Object.keys(properties).length === 0) return
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })
}
