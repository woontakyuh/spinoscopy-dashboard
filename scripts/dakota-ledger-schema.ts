import { notionRequest } from "../lib/notion/client"

const OPERATIONS_DB_ID = process.env.NOTION_DAKOTA_OPERATIONS_DB_ID
const PARENT_PAGE_ID = "310908af-25b9-81c0-a93c-c3d65131f17e" // Jarvis To-Do

const DOMAIN_OPTIONS = [
  { name: "Strategy", color: "purple" },
  { name: "Clinical", color: "orange" },
  { name: "Research", color: "blue" },
  { name: "AI", color: "default" },
  { name: "Finance", color: "yellow" },
  { name: "Training", color: "brown" },
  { name: "Family", color: "green" },
  { name: "Personal", color: "pink" },
  { name: "Operations", color: "gray" },
]

interface NotionDb {
  id: string
  properties: Record<
    string,
    { id: string; type: string; name: string; relation?: { database_id: string } }
  >
}

async function createSessionLogDb(): Promise<NotionDb> {
  return notionRequest<NotionDb>("/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: PARENT_PAGE_ID },
      title: [{ text: { content: "Dakota Session Log" } }],
      properties: {
        Name: { title: {} },
        Date: { date: {} },
        Channel: {
          select: {
            options: [
              { name: "telegram", color: "blue" },
              { name: "cli", color: "gray" },
              { name: "tui", color: "brown" },
              { name: "subagent", color: "purple" },
            ],
          },
        },
        Origin: {
          select: {
            options: [
              { name: "지시", color: "green" },
              { name: "논의", color: "blue" },
              { name: "수행", color: "gray" },
            ],
          },
        },
        Agent: {
          select: {
            options: [
              { name: "dakota", color: "blue" },
              { name: "elon", color: "orange" },
              { name: "brian", color: "green" },
              { name: "andrej", color: "purple" },
              { name: "warren", color: "yellow" },
              { name: "lo", color: "brown" },
            ],
          },
        },
        Domain: { select: { options: DOMAIN_OPTIONS } },
        Tags: { multi_select: { options: [] } },
        Summary: { rich_text: {} },
        Outcome: {
          select: {
            options: [
              { name: "완료", color: "green" },
              { name: "진행", color: "blue" },
              { name: "보류", color: "yellow" },
              { name: "단발조회", color: "gray" },
            ],
          },
        },
        "Msg Count": { number: { format: "number" } },
        "Session Key": { rich_text: {} },
      },
    }),
  })
}

/**
 * 기존 select/multi_select 옵션은 손대지 않고 target에 없는 이름만 덧붙인다.
 * Notion은 이미 존재하는 옵션의 색 변경을 거부하고("Cannot update color of
 * select with name: AI"), select/multi_select PATCH는 옵션 목록을 통째로
 * 교체하므로 현재 값을 그대로 되돌려주지 않으면 값이 사라진다.
 *
 * target이 빈 배열이면(Tags처럼 고정 옵션 목록이 없는 속성) 기존 옵션을
 * 이름만 남겨 그대로 되돌려준다 — PATCH가 사실상 현상 유지가 되어
 * 그동안 값을 쓰며 자동 생성된 옵션이 보존된다.
 */
function mergedOptions(
  propName: string,
  current: Array<{ name: string; color: string }>,
  target: Array<{ name: string; color?: string }>
): Array<{ name: string; color?: string }> {
  const existing = new Set(current.map((o) => o.name))
  const added = target.filter((o) => !existing.has(o.name))

  console.log(
    `      기존 ${propName} ${current.length}개 유지, 추가 ${added.length}개` +
      (added.length ? ` (${added.map((o) => o.name).join(", ")})` : "")
  )
  // 기존 항목은 name만 넘겨 색을 건드리지 않는다
  return [...current.map((o) => ({ name: o.name })), ...added]
}

async function extendOperations(sessionLogDbId: string): Promise<void> {
  if (!OPERATIONS_DB_ID) throw new Error("NOTION_DAKOTA_OPERATIONS_DB_ID 미설정")

  // (1) 단순 속성 + Domain/Tags 옵션 확장 (보존+추가)
  const opsBefore = await notionRequest<{
    properties: Record<
      string,
      {
        type: string
        select?: { options: Array<{ name: string; color: string }> }
        multi_select?: { options: Array<{ name: string; color: string }> }
      }
    >
  }>(`/databases/${OPERATIONS_DB_ID}`, { method: "GET" })

  const domainOptions = mergedOptions(
    "Domain",
    opsBefore.properties.Domain?.select?.options ?? [],
    DOMAIN_OPTIONS
  )
  // Tags는 고정 목록이 없다 — target을 빈 배열로 주면 기존 옵션만 그대로 되돌아간다.
  const tagsOptions = mergedOptions("Tags", opsBefore.properties.Tags?.multi_select?.options ?? [], [])

  await notionRequest(`/databases/${OPERATIONS_DB_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Domain: { select: { options: domainOptions } },
        Tags: { multi_select: { options: tagsOptions } },
        "Started At": { date: {} },
        "Last Touched": { date: {} },
        "Session Count": { number: { format: "number" } },
        "Msg Total": { number: { format: "number" } },
      },
    }),
  })
  console.log("[2/4] Operations 단순 속성 추가 완료")

  // (2) Session Log -> Operations 양방향 relation.
  //     Notion이 Operations 쪽에 역방향 속성을 자동 생성한다.
  await notionRequest(`/databases/${sessionLogDbId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Operation: {
          relation: {
            database_id: OPERATIONS_DB_ID,
            type: "dual_property",
            dual_property: {},
          },
        },
      },
    }),
  })
  console.log("[3/4] Operation relation 생성 완료")

  // (3) 자동 생성된 역방향 속성을 찾아 "Sessions"로 개명.
  //     Operations는 여러 기능이 공유하는 성장하는 DB라 이름으로 골라내면
  //     무관한 relation 속성이 생겼을 때 엉뚱한 속성을 개명할 수 있다.
  //     대상 DB(Session Log)를 가리키는 relation.database_id로 정확히 짚는다.
  const ops = await notionRequest<NotionDb>(`/databases/${OPERATIONS_DB_ID}`, { method: "GET" })
  const reciprocal = Object.values(ops.properties).find(
    (p) => p.type === "relation" && p.relation?.database_id === sessionLogDbId
  )
  if (!reciprocal) {
    console.log("[4/4] Session Log를 가리키는 역방향 relation을 찾지 못했습니다")
  } else if (reciprocal.name === "Sessions") {
    console.log("[4/4] 역방향 relation이 이미 Sessions 입니다")
  } else {
    await notionRequest(`/databases/${OPERATIONS_DB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { [reciprocal.name]: { name: "Sessions" } } }),
    })
    console.log(`[4/4] 역방향 relation "${reciprocal.name}" -> "Sessions" 개명 완료`)
  }

  // (4) formula 2종
  await notionRequest(`/databases/${OPERATIONS_DB_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Days Stalled": {
          formula: { expression: 'dateBetween(now(), prop("Last Touched"), "days")' },
        },
        "Lead Time": {
          formula: { expression: 'dateBetween(prop("Completed At"), prop("Started At"), "days")' },
        },
      },
    }),
  })
  console.log("formula 2종 추가 완료")
}

async function main() {
  const existing = process.env.NOTION_DAKOTA_SESSION_LOG_DB_ID
  let dbId = existing
  if (dbId) {
    console.log(`[1/4] Session Log DB 이미 존재: ${dbId} (생성 건너뜀)`)
  } else {
    const db = await createSessionLogDb()
    dbId = db.id
    console.log(`[1/4] Session Log DB 생성됨: ${dbId}`)
  }
  await extendOperations(dbId!)
  console.log("")
  console.log("=== .env.local 에 아래 줄을 추가하세요 ===")
  console.log(`NOTION_DAKOTA_SESSION_LOG_DB_ID=${dbId}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
