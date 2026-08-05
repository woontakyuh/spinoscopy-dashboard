import { notionRequest, notionEnv } from "./client"
import { findDoiInText } from "../fulltext/pdf"
import { fetchCrossref } from "../fulltext/crossref"
import { fetchPubmedMetaByDoi } from "../fulltext/pubmed"

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

const JOURNAL_DB_ID = notionEnv("NOTION_JOURNAL_DB_ID")

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

/** 요청 취소: 체크박스 해제. 아직 확보 전(요청됨)이면 상태도 비운다. */
export async function cancelFulltextRequest(pageId: string): Promise<void> {
  const page = await notionRequest<{ properties: Record<string, Prop> }>(`/pages/${pageId}`)
  const status = page.properties["원문 상태"]?.select?.name ?? null
  const properties: Record<string, unknown> = { "원문 요청": { checkbox: false } }
  if (status === "요청됨" || status === "실패") properties["원문 상태"] = { select: null }
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
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

export interface AddByDoiResult {
  pageId: string
  created: boolean
  title: string
  doi: string
}

/**
 * 밖에서 본 논문을 DOI(또는 DOI 포함 링크)로 원문요청 큐에 넣는다.
 * 이미 있으면 그 행 재사용, 없으면 CrossRef 메타로 새 행 생성. 둘 다 원문요청 ON.
 */
export async function addFulltextRequestByDoi(input: string): Promise<AddByDoiResult> {
  const doi = findDoiInText(input)
  if (!doi) throw new Error("DOI를 찾을 수 없습니다. DOI 또는 DOI가 포함된 링크를 붙여넣어 주세요.")
  const doiLower = doi.toLowerCase()
  const url = `https://doi.org/${doiLower}`

  // dedup: 같은 DOI 행이 있으면 재사용
  const found = await notionRequest<{ results: Array<{ id: string; properties: Record<string, any> }> }>(
    `/databases/${JOURNAL_DB_ID}/query`,
    { method: "POST", body: JSON.stringify({ page_size: 1, filter: { property: "DOI", url: { equals: url } } }) }
  )
  if (found.results[0]) {
    const page = found.results[0]
    await requestFulltext(page.id)
    const title = (page.properties?.Title?.title ?? [])
      .map((t: { plain_text?: string }) => t.plain_text ?? "").join("").trim()
    return { pageId: page.id, created: false, title: title || doiLower, doi: doiLower }
  }

  // CrossRef 메타로 새 행 생성. CrossRef 에 제목이 없는 논문(중국·일본계 저널에
  // 종종 있다)은 PubMed 로 한 번 더 찾는다 — 안 그러면 제목 자리에 DOI 문자열이
  // 박히고, 야간 doi-backfill 은 Title 을 고치지 않아 영구히 남는다.
  const meta = await fetchCrossref(doiLower)
  const pubmed = meta?.title ? null : await fetchPubmedMetaByDoi(doiLower)

  const title = meta?.title || pubmed?.title || doiLower
  const authors = meta?.authors || pubmed?.authors || ""
  const journal = meta?.journal || pubmed?.journal || ""
  const pubDate = meta?.pubDate || pubmed?.pubDate || null

  const props: Record<string, unknown> = {
    Title: { title: [{ text: { content: title.slice(0, 2000) } }] },
    DOI: { url },
    "원문 요청": { checkbox: true },
    "원문 상태": { select: { name: "요청됨" } },
  }
  if (authors) props.Author = { rich_text: [{ text: { content: authors.slice(0, 2000) } }] }
  if (journal) props["Journal Name"] = { select: { name: journal.slice(0, 100) } }
  if (pubDate) props["Publication Date"] = { date: { start: pubDate } }
  // PubMed 까지 갔다면 PMID 는 공짜로 얻은 셈 — 넣어두면 backfill 이 또 찾지 않는다.
  if (pubmed?.pmid) props.PMID = { rich_text: [{ text: { content: pubmed.pmid } }] }

  const created = await notionRequest<{ id: string }>("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: JOURNAL_DB_ID }, properties: props }),
  })
  return { pageId: created.id, created: true, title, doi: doiLower }
}
