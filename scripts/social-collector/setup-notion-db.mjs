// Notion "Social Feed" DB를 통합 토큰(NOTION_TOKEN)으로 생성한다.
// 기존 DB(참조)의 부모 페이지 아래에 만들어 통합이 접근 가능하도록 보장.
// 실행: NOTION_TOKEN=... REF_DB=<기존DB id> node setup-notion-db.mjs
// 출력: 생성된 database id (이걸 NOTION_SOCIAL_DB_ID로 .env.local + Vercel에 넣는다)

const TOKEN = process.env.NOTION_TOKEN
const REF_DB = process.env.REF_DB
const BASE = "https://api.notion.com/v1"
const H = { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" }

async function j(res) {
  const t = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${t}`)
  return JSON.parse(t)
}

const ref = await j(await fetch(`${BASE}/databases/${REF_DB}`, { headers: H }))
const parent = ref.parent
if (parent?.type !== "page_id") {
  throw new Error(`참조 DB의 부모가 page가 아님(${parent?.type}). 다른 REF_DB를 쓰거나 페이지를 지정하세요.`)
}
const pageId = parent.page_id
console.error(`부모 페이지: ${pageId}`)

const created = await j(
  await fetch(`${BASE}/databases`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      parent: { type: "page_id", page_id: pageId },
      title: [{ type: "text", text: { content: "Social Feed" } }],
      properties: {
        Title: { title: {} },
        Platform: { select: { options: [{ name: "threads", color: "gray" }, { name: "x", color: "blue" }] } },
        Account: { rich_text: {} },
        PostId: { rich_text: {} },
        URL: { url: {} },
        FullText: { rich_text: {} },
        PostedAt: { date: {} },
        CollectedAt: { date: {} },
      },
    }),
  })
)
console.error("생성 완료.")
console.log(created.id) // stdout = DB id only
