// Frontier Episodes 데이터베이스에 소스 정체성 속성(`Source`, `Source Key`)을 추가하는
// 멱등 스키마 마이그레이터. 기본은 읽기 전용 dry-run이며, apply에서도 누락된 속성이 있을 때만
// 경계가 명확한 PATCH 1건을 보낸다. 기존 속성 타입이 다르면 덮어쓰지 않고 충돌로 보고한다.
import { AI_FRONTIER_EPISODES_DB_ID, type AiFrontierNotionRequest } from "./ai-frontier"
import { notionEnv, notionRequest } from "./client"

export type AiFrontierSchemaMode = "dryRun" | "apply"
export type AiFrontierSchemaPropertyName = "Source" | "Source Key"
export type AiFrontierSchemaPropertyType = "select" | "rich_text"

export interface AiFrontierSchemaEntry {
  property: AiFrontierSchemaPropertyName
  expectedType: AiFrontierSchemaPropertyType
}

export interface AiFrontierSchemaConflict extends AiFrontierSchemaEntry {
  /** Notion에 이미 존재하는 실제 타입. 자동 교체하지 않는다. */
  actualType: string
}

export interface AiFrontierSchemaResult {
  mode: AiFrontierSchemaMode
  databaseId: string
  /** 추가가 필요한 속성. dry-run에서도 동일하게 채워진다. */
  planned: AiFrontierSchemaEntry[]
  /** 실제로 PATCH로 추가된 속성. dry-run/충돌/무변경이면 빈 배열. */
  applied: AiFrontierSchemaEntry[]
  /** 이미 호환되는 타입으로 존재하는 속성. */
  unchanged: AiFrontierSchemaEntry[]
  conflicts: AiFrontierSchemaConflict[]
  /** 이번 실행이 보낸 스키마 변이 요청 수. dry-run과 충돌은 항상 0. */
  writes: number
}

export interface AiFrontierSchemaMigrationOptions {
  /** 기본값 `dryRun`. 쓰기는 명시적으로 `apply`를 넘길 때만 발생한다. */
  mode?: AiFrontierSchemaMode
  request?: AiFrontierNotionRequest
  databaseId?: string
}

export type AiFrontierSchemaErrorCode = "invalid-schema-response"

export class AiFrontierSchemaError extends Error {
  readonly code: AiFrontierSchemaErrorCode

  constructor(message: string, code: AiFrontierSchemaErrorCode = "invalid-schema-response") {
    super(message)
    this.name = "AiFrontierSchemaError"
    this.code = code
  }
}

interface RequiredProperty {
  readonly property: AiFrontierSchemaPropertyName
  readonly expectedType: AiFrontierSchemaPropertyType
  /** Notion 스키마 PATCH에 그대로 실리는 정의. */
  readonly definition: Readonly<Record<string, unknown>>
}

const SOURCE_OPTIONS = [
  { name: "ai-frontier", color: "blue" },
  { name: "dwarkesh", color: "purple" },
] as const

export const AI_FRONTIER_SCHEMA_REQUIRED_PROPERTIES: readonly RequiredProperty[] = [
  {
    property: "Source",
    expectedType: "select",
    definition: { select: { options: SOURCE_OPTIONS } },
  },
  {
    property: "Source Key",
    expectedType: "rich_text",
    definition: { rich_text: {} },
  },
]

const defaultRequest: AiFrontierNotionRequest = (path, options) =>
  notionRequest<unknown>(path, options)

function resolveDatabaseId(explicit?: string): string {
  return (
    explicit?.trim() ||
    notionEnv("NOTION_AI_FRONTIER_EPISODES_DB_ID") ||
    AI_FRONTIER_EPISODES_DB_ID
  )
}

/** 외부(Notion) 응답을 신뢰하지 않고 속성명 → 타입 맵으로 좁힌다. */
function readPropertyTypes(response: unknown, databaseId: string): Record<string, string> {
  const fail = (detail: string): never => {
    throw new AiFrontierSchemaError(
      `Notion 데이터베이스 스키마 응답이 올바르지 않다(${databaseId}): ${detail}`
    )
  }
  if (typeof response !== "object" || response === null) return fail("객체가 아니다")
  const properties = (response as { properties?: unknown }).properties
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return fail("properties가 객체가 아니다")
  }
  const types: Record<string, string> = {}
  for (const [name, definition] of Object.entries(properties as Record<string, unknown>)) {
    if (typeof definition !== "object" || definition === null) {
      return fail(`속성 '${name}' 정의가 객체가 아니다`)
    }
    const type = (definition as { type?: unknown }).type
    if (typeof type !== "string" || type.length === 0) {
      return fail(`속성 '${name}'에 type이 없다`)
    }
    types[name] = type
  }
  return types
}

function entryOf(required: RequiredProperty): AiFrontierSchemaEntry {
  return { property: required.property, expectedType: required.expectedType }
}

export async function migrateAiFrontierEpisodesSchema(
  options: AiFrontierSchemaMigrationOptions = {}
): Promise<AiFrontierSchemaResult> {
  const mode: AiFrontierSchemaMode = options.mode ?? "dryRun"
  const request = options.request ?? defaultRequest
  const databaseId = resolveDatabaseId(options.databaseId)

  const types = readPropertyTypes(await request(`/databases/${databaseId}`), databaseId)

  const planned: AiFrontierSchemaEntry[] = []
  const unchanged: AiFrontierSchemaEntry[] = []
  const conflicts: AiFrontierSchemaConflict[] = []
  const missing: RequiredProperty[] = []

  for (const required of AI_FRONTIER_SCHEMA_REQUIRED_PROPERTIES) {
    const actualType = types[required.property]
    if (actualType === undefined) {
      planned.push(entryOf(required))
      missing.push(required)
    } else if (actualType === required.expectedType) {
      unchanged.push(entryOf(required))
    } else {
      conflicts.push({ ...entryOf(required), actualType })
    }
  }

  const readOnly = mode === "dryRun" || conflicts.length > 0 || missing.length === 0
  if (readOnly) {
    return { mode, databaseId, planned, applied: [], unchanged, conflicts, writes: 0 }
  }

  const properties: Record<string, unknown> = {}
  for (const required of missing) properties[required.property] = required.definition

  await request(`/databases/${databaseId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  })

  return { mode, databaseId, planned, applied: [...planned], unchanged, conflicts, writes: 1 }
}
