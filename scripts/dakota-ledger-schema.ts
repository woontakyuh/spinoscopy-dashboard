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
  properties: Record<string, { id: string; type: string; name: string }>
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
 * 기존 select 옵션은 손대지 않고 없는 이름만 덧붙인다.
 * Notion은 이미 존재하는 옵션의 색 변경을 거부하므로("Cannot update color of
 * select with name: AI"), 전체 목록을 통째로 덮어쓰면 실패한다.
 */
async function mergedDomainOptions(dbId: string): Promise<Array<{ name: string; color?: string }>> {
  const db = await notionRequest<{
    properties: Record<string, { type: string; select?: { options: Array<{ name: string; color: string }> } }>
  }>(`/databases/${dbId}`, { method: "GET" })

  const current = db.properties.Domain?.select?.options ?? []
  const existing = new Set(current.map((o) => o.name))
  const added = DOMAIN_OPTIONS.filter((o) => !existing.has(o.name))

  console.log(
    `      기존 Domain ${current.length}개 유지, 추가 ${added.length}개` +
      (added.length ? ` (${added.map((o) => o.name).join(", ")})` : "")
  )
  // 기존 항목은 name만 넘겨 색을 건드리지 않는다
  return [...current.map((o) => ({ name: o.name })), ...added]
}

async function extendOperations(sessionLogDbId: string): Promise<void> {
  if (!OPERATIONS_DB_ID) throw new Error("NOTION_DAKOTA_OPERATIONS_DB_ID 미설정")

  // (1) 단순 속성 + Domain 옵션 확장
  await notionRequest(`/databases/${OPERATIONS_DB_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Domain: { select: { options: await mergedDomainOptions(OPERATIONS_DB_ID) } },
        Tags: { multi_select: { options: [] } },
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

  // (3) 자동 생성된 역방향 속성을 찾아 "Sessions"로 개명
  const ops = await notionRequest<NotionDb>(`/databases/${OPERATIONS_DB_ID}`, { method: "GET" })
  const reciprocal = Object.values(ops.properties).find(
    (p) => p.type === "relation" && p.name !== "Sessions"
  )
  if (reciprocal && reciprocal.name !== "Sessions") {
    await notionRequest(`/databases/${OPERATIONS_DB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { [reciprocal.name]: { name: "Sessions" } } }),
    })
    console.log(`[4/4] 역방향 relation "${reciprocal.name}" -> "Sessions" 개명 완료`)
  } else {
    console.log("[4/4] 역방향 relation이 이미 Sessions 입니다")
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
