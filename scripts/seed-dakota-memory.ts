// Dakota Memory DB 초기 시드 — 일회성 실행
// 사용: npx tsx scripts/seed-dakota-memory.ts

import { config } from "dotenv"
config({ path: ".env.local" })

const NOTION_TOKEN = process.env.NOTION_TOKEN
const DB_ID = process.env.NOTION_DAKOTA_MEMORY_DB_ID

if (!NOTION_TOKEN || !DB_ID) {
  console.error("NOTION_TOKEN / NOTION_DAKOTA_MEMORY_DB_ID 환경변수 필요")
  process.exit(1)
}

interface Seed {
  name: string
  category: "profile" | "preference" | "person" | "project" | "rule" | "fact" | "event"
  content: string
  importance: 1 | 2 | 3 | 4 | 5
}

const seeds: Seed[] = [
  // ─── profile ──────────────────────────────────────────────
  {
    name: "생년월일",
    category: "profile",
    content: "1986년 5월 2일생",
    importance: 4,
  },
  {
    name: "음악 활동",
    category: "profile",
    content: "초등 1학년~중3까지 violin, 대학 들어가서는 록 밴드에서 drum, 취미로 guitar. 작곡 좋아하고 프로포즈 때 직접 작사작곡한 곡을 베이스 제외 모두 직접 연주·녹음해 들려줌.",
    importance: 3,
  },
  {
    name: "운동 이력",
    category: "profile",
    content: "다양한 운동 좋아함. 중·고·대학 시절 농구에 빠져 지냄 (공격형 PG 겸 3점 슈터). longboard surfing (Bing Surfboard Beacon 9'6\" 모델, 발리·대만·캘리포니아 트립 다님, 요즘 시간 없어서 잘 못 함). alpine snowboard도 좋아함.",
    importance: 3,
  },

  // ─── person (가족) ──────────────────────────────────────
  {
    name: "아내 박진주",
    category: "person",
    content: "Angie Jinju Park, 1986년 1월 29일생. 전직 아나운서, 현 프리랜서 아나운서·진행자, 스타트업 피칭 컨설턴트, 임대사업자(airbnb), 임상심리상담사 (카이임상심리상담센터). 2019.12.13 친구 소개로 첫 만남, 2021.4.10 결혼.",
    importance: 5,
  },
  {
    name: "아들 여준",
    category: "person",
    content: "Christopher Joon Yuh, 2024년 8월 15일 LA 출생. 한국·미국 이중 국적.",
    importance: 5,
  },

  // ─── preference ───────────────────────────────────────
  {
    name: "BJJ 시간표",
    category: "preference",
    content: "BJJ Blue Belt 3 grau. 가능하면 매일 가고 싶지만 보통 주 3회. 수업 타임 7시·8시·9:30, 수업+스파링 1시간씩. 보통 9:30 타임, 종종 8시 타임. 수요일 9:30 = no-gi, 나머지는 gi 수업.",
    importance: 4,
  },
  {
    name: "현재 적극적 운동",
    category: "preference",
    content: "현재 가장 좋아하고 자주 하는 운동은 BJJ. 서핑·스노보드는 하고 싶지만 시간 부족.",
    importance: 3,
  },

  // ─── rule (일정 규칙) ────────────────────────────────
  {
    name: "OP day 패턴",
    category: "rule",
    content: "수술 날이 따로 정해진 게 아니라 매일 반일 진료/반일 수술 구조. 월·화·금 = 오전 수술, 오후 진료. 화·목 = 오전 진료, 오후 수술. (화요일은 양쪽 다 가능)",
    importance: 5,
  },

  // ─── project ─────────────────────────────────────────
  {
    name: "두바이 이주 검토",
    category: "project",
    content: "이란-미국 전쟁이 끝나면 가족과 함께 두바이로 이주해 몇 년 지낼 계획. 샤르자 대학병원 힘찬 척추센터 브랜치에서 스카웃 제안 받음.",
    importance: 4,
  },
  {
    name: "KOMISS 레지스트리 구축",
    category: "project",
    content: "KOMISS 주도 레지스트리 구축 사업, 위원회 부위원장으로 현재 구축 작업 진행 중. 추후 관련 논문 작성 예정.",
    importance: 4,
  },
  {
    name: "연구 관심사",
    category: "project",
    content: "내시경 관련 임상 논문, AI/ML in spine. 활발한 SCI 논문 활동.",
    importance: 3,
  },

  // ─── 학회 포지션 (가변, project 카테고리 — 임기 있음) ──
  {
    name: "KOMISS Scientific Secretary",
    category: "project",
    content: "Korean Minimally Invasive Spine Surgery Society (KOMISS) — Scientific Secretary",
    importance: 4,
  },
  {
    name: "KOMISS Vice Chair Research",
    category: "project",
    content: "KOMISS — Vice Chair of Research Committee",
    importance: 4,
  },
  {
    name: "KOSESS Education Secretary",
    category: "project",
    content: "Korean Research Society of Endoscopic Spine Surgery (KOSESS) — Education Secretary",
    importance: 4,
  },
  {
    name: "WUBES Auditor",
    category: "project",
    content: "World Unilateral Biportal Endoscopy Society (WUBES) — Auditor",
    importance: 4,
  },
  {
    name: "Neurospine AI Section Editor",
    category: "project",
    content: "Neurospine (top SCIE spine journal, official journal of KSNS Korean Spinal Neurosurgery Society and ASIA Spine) — Editor for AI section",
    importance: 4,
  },
]

interface NotionRichText {
  text: { content: string }
}

interface NotionPage {
  parent: { database_id: string }
  properties: {
    Name: { title: NotionRichText[] }
    Category: { select: { name: string } }
    Content: { rich_text: NotionRichText[] }
    Importance: { select: { name: string } }
    Source: { select: { name: string } }
    Status: { select: { name: string } }
  }
}

async function createPage(seed: Seed): Promise<void> {
  const body: NotionPage = {
    parent: { database_id: DB_ID! },
    properties: {
      Name: { title: [{ text: { content: seed.name } }] },
      Category: { select: { name: seed.category } },
      Content: { rich_text: [{ text: { content: seed.content } }] },
      Importance: { select: { name: String(seed.importance) } },
      Source: { select: { name: "migration" } },
      Status: { select: { name: "active" } },
    },
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Notion API error ${res.status}: ${errBody}`)
  }
}

async function main() {
  console.log(`Seeding ${seeds.length} memory rows…`)
  let success = 0
  for (const [i, seed] of seeds.entries()) {
    try {
      await createPage(seed)
      success++
      console.log(`  ${i + 1}/${seeds.length}  ✓ [${seed.category}] ${seed.name}`)
    } catch (e) {
      console.error(`  ${i + 1}/${seeds.length}  ✗ ${seed.name}:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`\nDone. ${success}/${seeds.length} rows seeded.`)
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
