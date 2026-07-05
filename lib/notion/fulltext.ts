import { notionRequest } from "./client"

export interface FulltextFields {
  requested: boolean
  status: string | null
  pdf: string | null
}

type Prop = {
  type?: string
  checkbox?: boolean
  select?: { name: string } | null
  url?: string | null
}

export function readFulltext(props: Record<string, Prop>): FulltextFields {
  return {
    requested: props["원문 요청"]?.checkbox ?? false,
    status: props["원문 상태"]?.select?.name ?? null,
    pdf: props["원문 PDF"]?.url ?? null,
  }
}

const JOURNAL_DB_ID = process.env.NOTION_JOURNAL_DB_ID ?? ""

/** 대시보드/Notion 어느 쪽이든 요청을 큐에 넣는다. */
export async function requestFulltext(pageId: string): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "원문 요청": { checkbox: true },
        "원문 상태": { select: { name: "요청됨" } },
      },
    }),
  })
}

/** 확보 성공: 상태 + Dropbox 공유링크 기록. source는 "OA" | "원내망". */
export async function markAcquired(
  pageId: string,
  source: "OA" | "Aside",
  shareUrl: string
): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "원문 상태": { select: { name: source === "OA" ? "OA 확보" : "Aside 확보" } },
        "원문 PDF": { url: shareUrl },
      },
    }),
  })
}

/** 확보 실패: 상태 + 본문 콜아웃. */
export async function markFailed(pageId: string, reason: string): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: { "원문 상태": { select: { name: "실패" } } },
    }),
  })
  await notionRequest(`/blocks/${pageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({
      children: [
        {
          object: "block",
          type: "callout",
          callout: {
            icon: { emoji: "⚠️" },
            rich_text: [{ type: "text", text: { content: `원문 확보 실패: ${reason}` } }],
          },
        },
      ],
    }),
  })
}

export interface QueueItem {
  pageId: string
  doiUrl: string | null
  pmid: string | null
  title: string
}

/** 원문 요청 = true AND 원문 상태 ∈ {요청됨, 비어있음} 인 페이지. */
export async function queryFulltextQueue(): Promise<QueueItem[]> {
  const body = {
    page_size: 50,
    filter: {
      and: [
        { property: "원문 요청", checkbox: { equals: true } },
        {
          or: [
            { property: "원문 상태", select: { equals: "요청됨" } },
            { property: "원문 상태", select: { is_empty: true } },
          ],
        },
      ],
    },
  }
  const res = await notionRequest<{ results: Array<{ id: string; properties: Record<string, any> }> }>(
    `/databases/${JOURNAL_DB_ID}/query`,
    { method: "POST", body: JSON.stringify(body) }
  )
  return res.results.map((page) => {
    const p = page.properties
    const title =
      (p.Title?.title ?? []).map((t: { plain_text?: string }) => t.plain_text ?? "").join("").trim()
    const pmid =
      (p.PMID?.rich_text ?? []).map((t: { plain_text?: string }) => t.plain_text ?? "").join("").trim()
    return {
      pageId: page.id,
      doiUrl: p.DOI?.url ?? null,
      pmid: pmid || null,
      title,
    }
  })
}
