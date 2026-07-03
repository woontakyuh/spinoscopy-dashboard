# 원문 PDF 온디맨드 확보 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brian(Scholar) 논문에 "원문 받기" 버튼을 추가해, 클릭하면 OA 무료본이나 경북대 원내망 PDF를 자동 확보해 Dropbox 공유 폴더에 저장하고 대시보드/모바일에서 열 수 있게 한다.

**Architecture:** Vercel API route는 큐 등록(`원문 요청`=true) + Ably 트리거 발행만 한다. 실제 PDF 확보·저장은 상주 데몬 워커(`scripts/fulltext-worker/`)가 담당한다 — Ably 채널 구독으로 즉시 깨어나고(백업 5분 폴링), OA 리졸버(Unpaywall/Europe PMC) → 실패 시 Aside-Chrome로 원내망 PDF 획득 → Dropbox API 업로드 + 공유링크 생성 → Notion 상태·링크 갱신. Notion은 메타/상태/링크 레이어, PDF 정본은 Dropbox 공유 폴더, Ably는 즉시 트리거 전용이다.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Notion API(`notionRequest`), `aside repl` CLI(로그인 Chrome 구동, 기존 `scrape-tsj.mjs` 패턴), Dropbox HTTP API(SDK 없이 fetch), Ably HTTP REST 발행 + `ably` npm 구독, Vitest, tsx + launchd(`KeepAlive`).

## Global Constraints

- 다크모드 전용, Tailwind v4, zinc 팔레트 (`components/scholar/ArticleDetail.tsx` 기존 클래스 관례 따름).
- Notion 호출은 항상 `notionRequest()` from `lib/notion/client.ts` 사용. Notion-Version은 `2022-06-28` 고정(client.ts에 하드코딩됨).
- Notion 필드명은 한글 그대로: `원문 요청`(checkbox), `원문 상태`(select), `원문 PDF`(url).
- `원문 상태` select 값 4종(정확히 이 문자열): `요청됨` / `OA 확보` / `원내망 확보` / `실패`.
- 워커 rate limit: 건당 최소 간격 30초 + 랜덤 지터, 일일 상한 `FULLTEXT_DAILY_MAX`(기본 20).
- PDF 검증: 획득 버퍼는 반드시 매직넘버 `%PDF`(hex `25 50 44 46`)로 시작해야 유효.
- env: `DROPBOX_TOKEN`(files.write + sharing.write 스코프), `DROPBOX_SCHOLAR_DIR`(Dropbox-상대 폴더경로, 예 `/Scholar PDFs`), `ABLY_API_KEY`(Ably 앱 키), `UNPAYWALL_EMAIL`(없으면 `woontak.yuh@gmail.com`), `FULLTEXT_DAILY_MAX`(기본 20), `FULLTEXT_POLL_MS`(백업 폴링 간격, 기본 300000). 워커는 기존 `run.sh` 패턴대로 `.env.local`에서 로드. Vercel에는 `ABLY_API_KEY`를 프로젝트 env로 등록.
- Ably 채널명 `fulltext-trigger`, 이벤트명 `request` 고정. 발행 페이로드는 최소(`{}` 또는 `{pageId}`) — 워커는 신호를 받으면 Notion 큐 전체를 재조회하므로 페이로드에 의존하지 않는다.
- 커밋 메시지 꼬리(모든 커밋):
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TaJf53o9dKVFnYvVq1hFwk
  ```

## 파일 구조

- `lib/fulltext/oa.ts` — OA 리졸버. `parseUnpaywall`, `parseEuropePmc`(순수), `resolveOA`(fetch 조합).
- `lib/fulltext/pdf.ts` — 순수 유틸: `extractDoi`, `safeName`, `isPdfBuffer`, `buildFetchScript`, `parseAsideResult`.
- `lib/fulltext/aside.ts` — `fetchPdfViaAside`(execFileSync로 `aside repl` 호출, 위 순수 유틸 조합).
- `lib/fulltext/dropbox.ts` — `dropboxPath`(순수), `parseCreateLinkResponse`(순수), `saveToDropbox`(API 업로드+공유링크).
- `lib/fulltext/ably.ts` — `publishTrigger()`(Ably REST 발행, Vercel route용). 상수 `ABLY_CHANNEL`/`ABLY_EVENT`.
- `lib/notion/fulltext.ts` — Notion 읽기/쓰기: `readFulltext`(순수), `requestFulltext`, `markAcquired`, `markFailed`, `queryFulltextQueue`.
- `lib/types/journal.ts` — `JournalArticle`에 3필드 추가(수정).
- `lib/notion/journal.ts` — `toArticle`에서 새 필드 매핑(수정).
- `app/api/notion/journal/route.ts` — PATCH에 `requestFulltext` 액션 추가(수정).
- `components/scholar/ArticleDetail.tsx` — PDF 버튼 + 폴링 추가(수정).
- `scripts/fulltext-worker/drain.ts` — 큐 1회 소진 로직(순수 처리 루프, 데몬이 호출).
- `scripts/fulltext-worker/daemon.ts` — 상주 데몬 엔트리(Ably 구독 + 백업 폴링 + 뮤텍스).
- `scripts/fulltext-worker/run.sh` — launchd 진입점(.env.local 로드, daemon.ts 실행).
- `scripts/fulltext-worker/com.spino.fulltext-worker.plist` — `KeepAlive` 상주 launchd.
- `scripts/fulltext-worker/README.md` — 셋업/운영 가이드.
- 테스트: `lib/fulltext/*.test.ts`, `lib/notion/fulltext.test.ts`.

각 task는 독립적으로 테스트 가능한 산출물로 끝난다.

---

### Task 1: Notion 스키마 필드 + 읽기 매핑

Notion Journal DB에 필드 3개를 추가하고(수동), 그 값을 앱 타입/쿼리에 태운다.

**Files:**
- Notion UI: Journal DB에 `원문 요청`(checkbox), `원문 상태`(select: 요청됨/OA 확보/원내망 확보/실패), `원문 PDF`(url) 추가.
- Create: `lib/notion/fulltext.ts`
- Create: `lib/notion/fulltext.test.ts`
- Modify: `lib/types/journal.ts` (JournalArticle에 3필드)
- Modify: `lib/notion/journal.ts:64-87` (toArticle 매핑)

**Interfaces:**
- Produces:
  - `interface FulltextFields { requested: boolean; status: string | null; pdf: string | null }`
  - `readFulltext(props: Record<string, any>): FulltextFields`
  - `JournalArticle.fulltext_requested: boolean`, `.fulltext_status: string | null`, `.fulltext_pdf: string | null`

- [ ] **Step 1: 실패 테스트 작성** — `lib/notion/fulltext.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { readFulltext } from "./fulltext"

describe("readFulltext", () => {
  it("모든 필드가 있으면 값을 읽는다", () => {
    const props = {
      "원문 요청": { type: "checkbox", checkbox: true },
      "원문 상태": { type: "select", select: { name: "OA 확보" } },
      "원문 PDF": { type: "url", url: "https://www.dropbox.com/s/abc/x.pdf" },
    }
    expect(readFulltext(props)).toEqual({
      requested: true,
      status: "OA 확보",
      pdf: "https://www.dropbox.com/s/abc/x.pdf",
    })
  })

  it("필드가 비어있으면 기본값을 준다", () => {
    expect(readFulltext({})).toEqual({ requested: false, status: null, pdf: null })
  })

  it("select/url이 null이면 null", () => {
    const props = {
      "원문 요청": { type: "checkbox", checkbox: false },
      "원문 상태": { type: "select", select: null },
      "원문 PDF": { type: "url", url: null },
    }
    expect(readFulltext(props)).toEqual({ requested: false, status: null, pdf: null })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/notion/fulltext.test.ts`
Expected: FAIL — `readFulltext` is not a function / 모듈 없음.

- [ ] **Step 3: `lib/notion/fulltext.ts` 생성 (readFulltext만 먼저)**

```typescript
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
  source: "OA" | "원내망",
  shareUrl: string
): Promise<void> {
  await notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "원문 상태": { select: { name: source === "OA" ? "OA 확보" : "원내망 확보" } },
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/notion/fulltext.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: `lib/types/journal.ts` JournalArticle에 필드 추가**

`affiliations: string` 다음 줄(21행 근처)에 추가:

```typescript
  affiliations: string
  fulltext_requested: boolean
  fulltext_status: string | null
  fulltext_pdf: string | null
}
```

- [ ] **Step 6: `lib/notion/journal.ts` toArticle 매핑**

파일 상단 import에 추가:

```typescript
import { readFulltext } from "./fulltext"
```

`toArticle`의 `return { ... }` 안, `affiliations: getText(p.Affiliations),` 다음에 추가.
`p`는 `Record<string, NotionProperty>`이고 NotionProperty는 checkbox/select/url을 갖고 있어
`readFulltext(p)`에 그대로 넘어간다(캐스팅 불필요):

```typescript
    affiliations: getText(p.Affiliations),
    fulltext_requested: readFulltext(p).requested,
    fulltext_status: readFulltext(p).status,
    fulltext_pdf: readFulltext(p).pdf,
```

- [ ] **Step 7: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 타입 에러 없음.

- [ ] **Step 8: 커밋**

```bash
git add lib/notion/fulltext.ts lib/notion/fulltext.test.ts lib/types/journal.ts lib/notion/journal.ts
git commit -m "feat(scholar): 원문 확보 Notion 필드 + 읽기/쓰기 헬퍼

원문 요청/원문 상태/원문 PDF 3필드 추가, readFulltext·requestFulltext·
markAcquired·markFailed·queryFulltextQueue 구현.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TaJf53o9dKVFnYvVq1hFwk"
```

> **주의(수동 선행):** Step 7 실행 전에 Notion Journal DB에 필드 3개를 실제로 만들어 둔다. 필드가 없으면 런타임에서 select 쓰기가 400을 낸다(테스트는 순수 함수라 무관).

---

### Task 2: OA 리졸버 (Unpaywall + Europe PMC)

DOI로 무료 공개 PDF URL을 찾는다.

**Files:**
- Create: `lib/fulltext/oa.ts`
- Create: `lib/fulltext/oa.test.ts`

**Interfaces:**
- Consumes: `extractDoi`는 Task 3에서 오지만 oa.ts는 bare DOI 문자열을 입력받으므로 의존 없음.
- Produces:
  - `type OASource = "unpaywall" | "europepmc"`
  - `interface OAResult { url: string; source: OASource }`
  - `parseUnpaywall(json: unknown): string | null`
  - `parseEuropePmc(json: unknown): string | null`
  - `resolveOA(doi: string | null, pmid: string | null): Promise<OAResult | null>`

- [ ] **Step 1: 실패 테스트 작성** — `lib/fulltext/oa.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { parseUnpaywall, parseEuropePmc } from "./oa"

describe("parseUnpaywall", () => {
  it("best_oa_location.url_for_pdf 를 뽑는다", () => {
    const json = { best_oa_location: { url_for_pdf: "https://x.org/a.pdf" } }
    expect(parseUnpaywall(json)).toBe("https://x.org/a.pdf")
  })
  it("OA 없으면 null", () => {
    expect(parseUnpaywall({ best_oa_location: null })).toBeNull()
    expect(parseUnpaywall({})).toBeNull()
    expect(parseUnpaywall({ best_oa_location: { url_for_pdf: null } })).toBeNull()
  })
})

describe("parseEuropePmc", () => {
  it("Open access pdf fullTextUrl 을 뽑는다", () => {
    const json = {
      resultList: {
        result: [
          {
            fullTextUrlList: {
              fullTextUrl: [
                { documentStyle: "html", availability: "Open access", url: "https://x/html" },
                { documentStyle: "pdf", availability: "Open access", url: "https://x/a.pdf" },
              ],
            },
          },
        ],
      },
    }
    expect(parseEuropePmc(json)).toBe("https://x/a.pdf")
  })
  it("pdf가 없거나 OA 아니면 null", () => {
    expect(parseEuropePmc({ resultList: { result: [] } })).toBeNull()
    expect(
      parseEuropePmc({
        resultList: { result: [{ fullTextUrlList: { fullTextUrl: [{ documentStyle: "pdf", availability: "Subscription required", url: "u" }] } }] },
      })
    ).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/fulltext/oa.test.ts`
Expected: FAIL — 모듈/함수 없음.

- [ ] **Step 3: `lib/fulltext/oa.ts` 구현**

```typescript
export type OASource = "unpaywall" | "europepmc"
export interface OAResult {
  url: string
  source: OASource
}

export function parseUnpaywall(json: unknown): string | null {
  const j = json as { best_oa_location?: { url_for_pdf?: string | null } | null }
  return j?.best_oa_location?.url_for_pdf ?? null
}

export function parseEuropePmc(json: unknown): string | null {
  const j = json as {
    resultList?: {
      result?: Array<{
        fullTextUrlList?: {
          fullTextUrl?: Array<{ documentStyle?: string; availability?: string; url?: string }>
        }
      }>
    }
  }
  const urls = j?.resultList?.result?.[0]?.fullTextUrlList?.fullTextUrl ?? []
  const hit = urls.find(
    (u) => u.documentStyle === "pdf" && (u.availability ?? "").toLowerCase().includes("open access")
  )
  return hit?.url ?? null
}

const UNPAYWALL_EMAIL = process.env.UNPAYWALL_EMAIL || "woontak.yuh@gmail.com"

async function tryUnpaywall(doi: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`
    )
    if (!res.ok) return null
    return parseUnpaywall(await res.json())
  } catch {
    return null
  }
}

async function tryEuropePmc(doi: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:%22${encodeURIComponent(
        doi
      )}%22&format=json&resultType=core`
    )
    if (!res.ok) return null
    return parseEuropePmc(await res.json())
  } catch {
    return null
  }
}

export async function resolveOA(doi: string | null, _pmid: string | null): Promise<OAResult | null> {
  if (!doi) return null
  const u = await tryUnpaywall(doi)
  if (u) return { url: u, source: "unpaywall" }
  const e = await tryEuropePmc(doi)
  if (e) return { url: e, source: "europepmc" }
  return null
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/fulltext/oa.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/fulltext/oa.ts lib/fulltext/oa.test.ts
git commit -m "feat(scholar): OA PDF 리졸버 (Unpaywall + Europe PMC)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TaJf53o9dKVFnYvVq1hFwk"
```

---

### Task 3: PDF 순수 유틸 (DOI 추출 · 파일명 · 검증 · Aside 스크립트/파싱)

**Files:**
- Create: `lib/fulltext/pdf.ts`
- Create: `lib/fulltext/pdf.test.ts`

**Interfaces:**
- Produces:
  - `extractDoi(doiUrl: string | null): string | null`
  - `safeName(doi: string | null, pageId: string): string`
  - `isPdfBuffer(buf: Buffer): boolean`
  - `buildFetchScript(articleUrl: string): string`
  - `interface AsideResult { ok: boolean; b64?: string; reason?: string }`
  - `parseAsideResult(stdout: string): AsideResult`

- [ ] **Step 1: 실패 테스트 작성** — `lib/fulltext/pdf.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { extractDoi, safeName, isPdfBuffer, buildFetchScript, parseAsideResult } from "./pdf"

describe("extractDoi", () => {
  it("doi.org URL에서 bare DOI를 뽑는다", () => {
    expect(extractDoi("https://doi.org/10.1007/s00586-024-01234")).toBe("10.1007/s00586-024-01234")
    expect(extractDoi("http://dx.doi.org/10.1016/j.spinee.2024.01.001")).toBe("10.1016/j.spinee.2024.01.001")
  })
  it("이미 bare면 그대로", () => {
    expect(extractDoi("10.1007/xyz")).toBe("10.1007/xyz")
  })
  it("null이면 null", () => {
    expect(extractDoi(null)).toBeNull()
    expect(extractDoi("")).toBeNull()
  })
})

describe("safeName", () => {
  it("DOI의 슬래시/특수문자를 밑줄로", () => {
    expect(safeName("10.1007/s00586-024-01234", "p1")).toBe("10.1007_s00586-024-01234")
  })
  it("DOI 없으면 page id 기반", () => {
    expect(safeName(null, "abc-123")).toBe("page-abc-123")
  })
})

describe("isPdfBuffer", () => {
  it("%PDF로 시작하면 true", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.7\n..."))).toBe(true)
  })
  it("아니면 false", () => {
    expect(isPdfBuffer(Buffer.from("<html>login</html>"))).toBe(false)
    expect(isPdfBuffer(Buffer.from(""))).toBe(false)
  })
})

describe("buildFetchScript", () => {
  it("URL을 스크립트에 포함한다", () => {
    const s = buildFetchScript("https://doi.org/10.1/x")
    expect(s).toContain("https://doi.org/10.1/x")
    expect(s).toContain("citation_pdf_url")
    expect(s).toContain("ASIDE_RESULT")
  })
})

describe("parseAsideResult", () => {
  it("ASIDE_RESULT 라인에서 JSON을 파싱한다", () => {
    const out = "noise\nASIDE_RESULT {\"ok\":true,\"b64\":\"QUJD\"}\nmore"
    expect(parseAsideResult(out)).toEqual({ ok: true, b64: "QUJD" })
  })
  it("라인이 없으면 ok:false", () => {
    expect(parseAsideResult("nothing here").ok).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/fulltext/pdf.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `lib/fulltext/pdf.ts` 구현**

```typescript
export function extractDoi(doiUrl: string | null): string | null {
  if (!doiUrl) return null
  const m = doiUrl.match(/(?:doi\.org\/)(.+)$/i)
  if (m) return m[1].trim()
  if (doiUrl.startsWith("10.")) return doiUrl.trim()
  return null
}

export function safeName(doi: string | null, pageId: string): string {
  if (doi) return doi.replace(/[^a-zA-Z0-9.\-]+/g, "_")
  return `page-${pageId}`
}

export function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "%PDF"
}

export function buildFetchScript(articleUrl: string): string {
  return `
const p = await openTab(${JSON.stringify(articleUrl)});
await sleep(8000);
const res = await p.evaluate(async () => {
  const meta = document.querySelector('meta[name="citation_pdf_url"]');
  let pdfUrl = meta ? meta.getAttribute('content') : null;
  if (!pdfUrl) {
    const a = document.querySelector('a[href$=".pdf"], a[href*="/pdf"]');
    pdfUrl = a ? a.href : null;
  }
  if (!pdfUrl) return { ok:false, reason:'no-pdf-url' };
  try {
    const r = await fetch(pdfUrl, { credentials:'include' });
    if (!r.ok) return { ok:false, reason:'fetch-'+r.status };
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin=''; for (let i=0;i<buf.length;i++) bin+=String.fromCharCode(buf[i]);
    return { ok:true, b64: btoa(bin) };
  } catch(e) { return { ok:false, reason:String(e && e.message || e) }; }
});
try { await p.close(); } catch(e) {}
console.log('ASIDE_RESULT '+JSON.stringify(res));
`
}

export interface AsideResult {
  ok: boolean
  b64?: string
  reason?: string
}

export function parseAsideResult(stdout: string): AsideResult {
  const line = stdout.split("\n").find((l) => l.startsWith("ASIDE_RESULT "))
  if (!line) return { ok: false, reason: "ASIDE_RESULT 없음" }
  try {
    return JSON.parse(line.slice("ASIDE_RESULT ".length)) as AsideResult
  } catch {
    return { ok: false, reason: "JSON 파싱 실패" }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/fulltext/pdf.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/fulltext/pdf.ts lib/fulltext/pdf.test.ts
git commit -m "feat(scholar): 원문 확보 PDF 순수 유틸(DOI/파일명/검증/Aside)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TaJf53o9dKVFnYvVq1hFwk"
```

---

### Task 4: Aside fetch 래퍼 + Dropbox 업로더

`aside repl`로 원내망 PDF를 받고, Dropbox API로 올려 공유링크를 만든다.

**Files:**
- Create: `lib/fulltext/aside.ts`
- Create: `lib/fulltext/dropbox.ts`
- Create: `lib/fulltext/dropbox.test.ts`

**Interfaces:**
- Consumes: `buildFetchScript`, `parseAsideResult`, `isPdfBuffer` (Task 3).
- Produces:
  - `fetchPdfViaAside(articleUrl: string): { pdf: Buffer | null; reason?: string }`
  - `dropboxPath(dir: string, name: string): string`
  - `parseCreateLinkResponse(json: unknown): string | null`
  - `saveToDropbox(pdf: Buffer, name: string): Promise<{ shareUrl: string }>`

- [ ] **Step 1: dropbox 순수 유틸 실패 테스트** — `lib/fulltext/dropbox.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { dropboxPath, parseCreateLinkResponse } from "./dropbox"

describe("dropboxPath", () => {
  it("dir 끝 슬래시를 정리하고 .pdf를 붙인다", () => {
    expect(dropboxPath("/Scholar PDFs", "10.1_x")).toBe("/Scholar PDFs/10.1_x.pdf")
    expect(dropboxPath("/Scholar PDFs/", "10.1_x")).toBe("/Scholar PDFs/10.1_x.pdf")
  })
})

describe("parseCreateLinkResponse", () => {
  it("url을 뽑는다", () => {
    expect(parseCreateLinkResponse({ url: "https://www.dropbox.com/s/a/x.pdf?dl=0" })).toBe(
      "https://www.dropbox.com/s/a/x.pdf?dl=0"
    )
  })
  it("이미 존재(409) 응답의 기존 링크를 뽑는다", () => {
    const err = {
      error: {
        ".tag": "shared_link_already_exists",
        shared_link_already_exists: { metadata: { url: "https://www.dropbox.com/s/b/x.pdf" } },
      },
    }
    expect(parseCreateLinkResponse(err)).toBe("https://www.dropbox.com/s/b/x.pdf")
  })
  it("없으면 null", () => {
    expect(parseCreateLinkResponse({})).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/fulltext/dropbox.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `lib/fulltext/dropbox.ts` 구현**

```typescript
const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN ?? ""
const DROPBOX_DIR = process.env.DROPBOX_SCHOLAR_DIR ?? "/Scholar PDFs"

export function dropboxPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}.pdf`
}

export function parseCreateLinkResponse(json: unknown): string | null {
  const j = json as {
    url?: string
    error?: { shared_link_already_exists?: { metadata?: { url?: string } } }
  }
  if (j?.url) return j.url
  return j?.error?.shared_link_already_exists?.metadata?.url ?? null
}

async function uploadBytes(path: string, pdf: Buffer): Promise<void> {
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DROPBOX_TOKEN}`,
      "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", mute: true }),
      "Content-Type": "application/octet-stream",
    },
    body: pdf,
  })
  if (!res.ok) throw new Error(`Dropbox upload ${res.status}: ${await res.text()}`)
}

async function createShareLink(path: string): Promise<string> {
  const res = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
    method: "POST",
    headers: { Authorization: `Bearer ${DROPBOX_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
  const json = await res.json()
  const url = parseCreateLinkResponse(json)
  if (!url) throw new Error(`Dropbox share link 실패 ${res.status}: ${JSON.stringify(json)}`)
  return url
}

export async function saveToDropbox(pdf: Buffer, name: string): Promise<{ shareUrl: string }> {
  const path = dropboxPath(DROPBOX_DIR, name)
  await uploadBytes(path, pdf)
  const shareUrl = await createShareLink(path)
  return { shareUrl }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/fulltext/dropbox.test.ts`
Expected: PASS

- [ ] **Step 5: `lib/fulltext/aside.ts` 구현 (순수 유틸 조합, 자체 테스트 없음)**

```typescript
import { execFileSync } from "node:child_process"
import { buildFetchScript, parseAsideResult, isPdfBuffer } from "./pdf"

/**
 * aside repl로 로그인 Chrome을 구동해 논문 페이지에서 PDF를 in-page fetch한다.
 * 실패 시 pdf=null + reason. (봇차단 우회·기관 IP는 실브라우저 세션이 담당)
 */
export function fetchPdfViaAside(articleUrl: string): { pdf: Buffer | null; reason?: string } {
  const script = buildFetchScript(articleUrl)
  let stdout: string
  try {
    stdout = execFileSync("aside", ["repl", script], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 150000,
    })
  } catch (e) {
    return { pdf: null, reason: `aside 실행 실패: ${e instanceof Error ? e.message : String(e)}` }
  }
  const res = parseAsideResult(stdout)
  if (!res.ok || !res.b64) return { pdf: null, reason: res.reason ?? "결과 없음" }
  const pdf = Buffer.from(res.b64, "base64")
  if (!isPdfBuffer(pdf)) return { pdf: null, reason: "PDF 아님(구독 벽/challenge 추정)" }
  return { pdf }
}
```

- [ ] **Step 6: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/fulltext/aside.ts lib/fulltext/dropbox.ts lib/fulltext/dropbox.test.ts
git commit -m "feat(scholar): Aside PDF fetch 래퍼 + Dropbox 업로드/공유링크

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TaJf53o9dKVFnYvVq1hFwk"
```

---

### Task 5: Ably 발행 lib + API route requestFulltext 액션

대시보드 버튼이 호출할 큐 등록 엔드포인트. 큐 등록(Notion) + 즉시 트리거(Ably 발행).

**Files:**
- Create: `lib/fulltext/ably.ts`
- Create: `lib/fulltext/ably.test.ts`
- Modify: `app/api/notion/journal/route.ts:57-81` (PATCH 확장)

**Interfaces:**
- Consumes: `requestFulltext(pageId)` (Task 1).
- Produces:
  - `ABLY_CHANNEL = "fulltext-trigger"`, `ABLY_EVENT = "request"` (상수, 워커도 동일 값 사용)
  - `ablyAuthHeader(key: string): string` (순수, Basic 인증 헤더값)
  - `publishTrigger(pageId?: string): Promise<void>` (키 없으면 no-op, 실패해도 throw 안 함)
  - `PATCH /api/notion/journal` body `{ pageId, action: "requestFulltext" }` → `{ ok: true }`

- [ ] **Step 1: ably 순수 유틸 실패 테스트** — `lib/fulltext/ably.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { ablyAuthHeader, ABLY_CHANNEL, ABLY_EVENT } from "./ably"

describe("ablyAuthHeader", () => {
  it("키를 base64 Basic 헤더로 만든다", () => {
    // "app.key:secret" → base64
    expect(ablyAuthHeader("app.key:secret")).toBe(
      "Basic " + Buffer.from("app.key:secret").toString("base64")
    )
  })
})

describe("상수", () => {
  it("채널/이벤트명 고정", () => {
    expect(ABLY_CHANNEL).toBe("fulltext-trigger")
    expect(ABLY_EVENT).toBe("request")
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/fulltext/ably.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `lib/fulltext/ably.ts` 구현**

```typescript
export const ABLY_CHANNEL = "fulltext-trigger"
export const ABLY_EVENT = "request"

const ABLY_KEY = process.env.ABLY_API_KEY ?? ""

export function ablyAuthHeader(key: string): string {
  return "Basic " + Buffer.from(key).toString("base64")
}

/**
 * 워커를 즉시 깨우는 트리거를 Ably 채널에 발행한다.
 * 키 미설정/네트워크 실패는 조용히 무시 — 백업 폴링이 결국 큐를 집어간다.
 */
export async function publishTrigger(pageId?: string): Promise<void> {
  if (!ABLY_KEY) return
  try {
    await fetch(`https://rest.ably.io/channels/${ABLY_CHANNEL}/messages`, {
      method: "POST",
      headers: { Authorization: ablyAuthHeader(ABLY_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ name: ABLY_EVENT, data: pageId ? { pageId } : {} }),
    })
  } catch {
    /* 백업 폴링이 커버 */
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/fulltext/ably.test.ts`
Expected: PASS

- [ ] **Step 5: route PATCH에 액션 추가**

import에 추가(기존 import 블록 아래 별도 줄):

```typescript
import { requestFulltext } from "@/lib/notion/fulltext"
import { publishTrigger } from "@/lib/fulltext/ably"
```

PATCH 내부 타입/분기 수정:

```typescript
    const { pageId, action, value } = body as {
      pageId: string
      action: "toggleRead" | "updateInterest" | "requestFulltext"
      value: boolean | InterestLevel
    }

    if (!pageId) {
      return NextResponse.json({ error: "pageId required" }, { status: 400 })
    }

    if (action === "toggleRead") {
      await toggleRead(pageId, value as boolean)
    } else if (action === "updateInterest") {
      await updateInterest(pageId, value as InterestLevel)
    } else if (action === "requestFulltext") {
      await requestFulltext(pageId)
      await publishTrigger(pageId)
    }
```

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 7: 수동 스모크 테스트**

`npm run dev` 실행 후 다른 터미널에서(테스트용 실제 pageId 하나로):

```bash
curl -s -X PATCH http://localhost:4321/api/notion/journal \
  -H 'Content-Type: application/json' \
  -d '{"pageId":"<REAL_PAGE_ID>","action":"requestFulltext"}'
```

Expected: `{"ok":true}` 그리고 Notion에서 그 페이지 `원문 요청`=체크, `원문 상태`=요청됨.
(ABLY_API_KEY 미설정이어도 200 정상 — publishTrigger가 no-op.)

- [ ] **Step 8: 커밋**

```bash
git add lib/fulltext/ably.ts lib/fulltext/ably.test.ts app/api/notion/journal/route.ts
git commit -m "feat(scholar): PATCH requestFulltext (큐 등록 + Ably 즉시 트리거)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TaJf53o9dKVFnYvVq1hFwk"
```

---

### Task 6: ArticleDetail PDF 버튼 + 폴링

**Files:**
- Modify: `components/scholar/ArticleDetail.tsx` (버튼 영역 262-285행 근처 + 상태/폴링 로직)

**Interfaces:**
- Consumes: `article.fulltext_status`, `article.fulltext_pdf`, `PATCH requestFulltext` (Task 5).
- Produces: 없음(최종 UI).

- [ ] **Step 1: 버튼 상태 헬퍼 + 로컬 상태 + 폴링 추가**

`ArticleDetail` 컴포넌트 안, 기존 `useState`들 아래에 추가:

```typescript
  const [ftStatus, setFtStatus] = useState<string | null>(article.fulltext_status)
  const [ftPdf, setFtPdf] = useState<string | null>(article.fulltext_pdf)
  const [ftBusy, setFtBusy] = useState(false)
```

`useEffect([article.page_id])` 안 초기화 블록에 추가:

```typescript
    setFtStatus(article.fulltext_status)
    setFtPdf(article.fulltext_pdf)
    setFtBusy(false)
```

요청 핸들러 + 폴링 useEffect 추가(컴포넌트 내부, return 전):

```typescript
  async function handleRequestFulltext() {
    if (!article.doi_url || ftBusy) return
    setFtBusy(true)
    setFtStatus("요청됨")
    try {
      const res = await fetch("/api/notion/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: article.page_id, action: "requestFulltext" }),
      })
      if (!res.ok) throw new Error("요청 실패")
    } catch (e) {
      console.error(e)
      setFtStatus(article.fulltext_status)
    } finally {
      setFtBusy(false)
    }
  }

  useEffect(() => {
    if (ftStatus !== "요청됨") return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/notion/journal?action=detail&pageId=${article.page_id}`)
        if (!res.ok) return
        const fresh = (await res.json()) as JournalArticle
        setFtStatus(fresh.fulltext_status)
        setFtPdf(fresh.fulltext_pdf)
      } catch {
        /* 폴링 실패는 무시 */
      }
    }, 25000)
    return () => clearInterval(id)
  }, [ftStatus, article.page_id])
```

- [ ] **Step 2: 버튼 JSX 추가**

버튼 묶음(`<div className="flex gap-2 pt-2">` … DOI 링크가 있는 블록)에서 DOI `<a>` 앞 또는 뒤에 PDF 버튼 추가:

```tsx
        {article.doi_url && (
          <FulltextButton
            status={ftStatus}
            pdfUrl={ftPdf}
            busy={ftBusy}
            doiUrl={article.doi_url}
            onRequest={handleRequestFulltext}
          />
        )}
```

- [ ] **Step 3: FulltextButton 컴포넌트 추가**

파일 하단(`ArticleDetail` 함수 밖)에 추가:

```tsx
function FulltextButton({
  status,
  pdfUrl,
  busy,
  doiUrl,
  onRequest,
}: {
  status: string | null
  pdfUrl: string | null
  busy: boolean
  doiUrl: string
  onRequest: () => void
}) {
  const base = "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"

  if (pdfUrl && (status === "OA 확보" || status === "원내망 확보")) {
    return (
      <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
        className={`${base} bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30`}>
        PDF 열기 ↗
      </a>
    )
  }
  if (status === "요청됨" || busy) {
    return (
      <span className={`${base} bg-muted text-muted-foreground border-border opacity-70 cursor-default`}>
        확보 중…
      </span>
    )
  }
  if (status === "실패") {
    return (
      <a href={doiUrl} target="_blank" rel="noopener noreferrer"
        className={`${base} bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25`}>
        실패 — DOI로 이동 ↗
      </a>
    )
  }
  return (
    <button type="button" onClick={onRequest}
      className={`${base} bg-muted text-foreground/90 border-border hover:bg-muted`}>
      원문 받기
    </button>
  )
}
```

- [ ] **Step 4: 타입체크 + 빌드 스모크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: 수동 확인**

`npm run dev` → Scholar → 논문 상세에서 `원문 받기` 버튼 노출 확인, 클릭 시 `확보 중…`으로 바뀌는지, Notion에 요청 반영되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add components/scholar/ArticleDetail.tsx
git commit -m "feat(scholar): 논문 상세에 원문 PDF 버튼 + 상태 폴링

원문 받기 → 확보 중… → PDF 열기 / 실패 상태 전이.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TaJf53o9dKVFnYvVq1hFwk"
```

---

### Task 7: 확보 워커(큐 소진 + 상주 데몬) + launchd 등록

큐를 소진하며 OA→원내망 순으로 확보해 Dropbox 저장·Notion 갱신(`drain.ts`), 그 위에 Ably 구독 + 백업 폴링 + 중복기동 방지 뮤텍스를 얹은 상주 데몬(`daemon.ts`).

**Files:**
- Create: `scripts/fulltext-worker/drain.ts`
- Create: `scripts/fulltext-worker/daemon.ts`
- Create: `scripts/fulltext-worker/run.sh`
- Create: `scripts/fulltext-worker/com.spino.fulltext-worker.plist`
- Create: `scripts/fulltext-worker/README.md`
- Modify: `package.json` (dependencies에 `ably` 추가 — `npm install ably`)

**Interfaces:**
- Consumes: `queryFulltextQueue`, `markAcquired`, `markFailed` (Task 1); `resolveOA` (Task 2); `extractDoi`, `safeName` (Task 3); `fetchPdfViaAside` (Task 4); `saveToDropbox` (Task 4); `ABLY_CHANNEL`, `ABLY_EVENT` (Task 5).
- Produces:
  - `drainQueue(): Promise<number>` (한 번 호출 시 큐를 상한까지 소진, 처리 건수 반환)

- [ ] **Step 1: `ably` 패키지 설치**

Run: `npm install ably`
Expected: `package.json` dependencies에 `ably` 추가, 설치 성공.

- [ ] **Step 2: `scripts/fulltext-worker/drain.ts` 작성 (큐 소진 로직)**

```typescript
// scripts/fulltext-worker/drain.ts
// 큐를 한 번 소진 — OA fast-path → 원내망 Aside → Dropbox 저장 → Notion 갱신.
// daemon.ts가 트리거/폴링 시 호출. 처리 건수를 반환.
import { queryFulltextQueue, markAcquired, markFailed } from "../../lib/notion/fulltext"
import { resolveOA } from "../../lib/fulltext/oa"
import { fetchPdfViaAside } from "../../lib/fulltext/aside"
import { saveToDropbox } from "../../lib/fulltext/dropbox"
import { extractDoi, safeName } from "../../lib/fulltext/pdf"

// per-run 버스트 가드(진짜 일일 누적 아님 — Phase 1 단순화). 한 번 소진에 이만큼까지만.
const MAX_PER_RUN = Number(process.env.FULLTEXT_DAILY_MAX ?? "20")
const MIN_GAP_MS = 30_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = () => MIN_GAP_MS + Math.floor(((Date.now() % 1000) / 1000) * 15_000)

async function downloadOA(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.subarray(0, 4).toString("latin1") === "%PDF" ? buf : null
  } catch {
    return null
  }
}

export async function drainQueue(): Promise<number> {
  const queue = await queryFulltextQueue()
  console.log(`[drain ${new Date().toISOString()}] 큐 ${queue.length}건`)
  let processed = 0

  for (const item of queue) {
    if (processed >= MAX_PER_RUN) {
      console.log(`per-run 상한(${MAX_PER_RUN}) 도달 — 나머지는 다음 트리거/폴링에`)
      break
    }
    const doi = extractDoi(item.doiUrl)
    const name = safeName(doi, item.pageId)
    console.log(`처리: ${item.title.slice(0, 60)} (doi=${doi ?? "없음"})`)

    try {
      // 1) OA 먼저
      const oa = await resolveOA(doi, item.pmid)
      if (oa) {
        const pdf = await downloadOA(oa.url)
        if (pdf) {
          const { shareUrl } = await saveToDropbox(pdf, name)
          await markAcquired(item.pageId, "OA", shareUrl)
          console.log(`  → OA 확보 (${oa.source})`)
          processed++
          await sleep(jitter())
          continue
        }
      }

      // 2) 원내망 Aside
      if (!item.doiUrl) {
        await markFailed(item.pageId, "DOI 없음 — 원내망 확보 불가")
        continue
      }
      const { pdf, reason } = fetchPdfViaAside(item.doiUrl)
      if (pdf) {
        const { shareUrl } = await saveToDropbox(pdf, name)
        await markAcquired(item.pageId, "원내망", shareUrl)
        console.log(`  → 원내망 확보`)
      } else {
        await markFailed(item.pageId, reason ?? "원문 확보 실패")
        console.log(`  → 실패: ${reason}`)
      }
      processed++
      await sleep(jitter())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ! 오류: ${msg}`)
      await markFailed(item.pageId, msg).catch(() => {})
    }
  }
  console.log(`[drain] done — ${processed}건 처리`)
  return processed
}
```

- [ ] **Step 3: `scripts/fulltext-worker/daemon.ts` 작성 (상주 데몬)**

```typescript
// scripts/fulltext-worker/daemon.ts
// 상주 데몬 — Ably 트리거(즉시) + 백업 폴링(완전성) + 중복기동 방지 뮤텍스.
// launchd KeepAlive 로 상시 유지. run.sh 가 .env.local 로드 후 tsx 호출.
import * as Ably from "ably"
import { drainQueue } from "./drain"
import { ABLY_CHANNEL, ABLY_EVENT } from "../../lib/fulltext/ably"

const POLL_MS = Number(process.env.FULLTEXT_POLL_MS ?? "300000")
const ABLY_KEY = process.env.ABLY_API_KEY ?? ""

let running = false

async function runDrain(trigger: string): Promise<void> {
  if (running) {
    console.log(`[${trigger}] 이미 처리 중 — skip`)
    return
  }
  running = true
  try {
    const n = await drainQueue()
    console.log(`[${trigger}] ${n}건 처리`)
  } catch (e) {
    console.error(`[${trigger}] drain 오류:`, e instanceof Error ? e.message : e)
  } finally {
    running = false
  }
}

async function main() {
  console.log(`[fulltext-daemon] 시작 (poll=${POLL_MS}ms, ably=${ABLY_KEY ? "on" : "off"})`)

  await runDrain("startup") // 부팅 시 밀린 큐 한 번 소진
  setInterval(() => void runDrain("poll"), POLL_MS) // 백업 폴링(안전망)

  if (ABLY_KEY) {
    const client = new Ably.Realtime(ABLY_KEY)
    const channel = client.channels.get(ABLY_CHANNEL)
    await channel.subscribe(ABLY_EVENT, () => void runDrain("ably"))
    console.log("[fulltext-daemon] Ably 구독 시작")
  }
  // setInterval + Ably 연결이 이벤트 루프를 유지 → 프로세스 상주.
}

main().catch((e) => {
  console.error("[fulltext-daemon] 치명 오류:", e)
  process.exit(1)
})
```

- [ ] **Step 4: `run.sh` 작성 (기존 collector run.sh 패턴, daemon 실행)**

```bash
#!/bin/bash
# launchd 진입점 — .env.local 로드 후 원문 확보 데몬 실행.
set -euo pipefail
REPO="/Users/TakMD/workspace/spinoscopy-dashboard"
cd "$REPO"
set -a
# shellcheck disable=SC1091
. "$REPO/.env.local"
set +a
export PATH="/Users/TakMD/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec npx tsx "$REPO/scripts/fulltext-worker/daemon.ts"
```

실행권한:

```bash
chmod +x scripts/fulltext-worker/run.sh
```

> **맥스튜디오(Phase 2) 이식 시:** `REPO` 경로를 그 머신 경로로 바꾼다.

- [ ] **Step 5: `com.spino.fulltext-worker.plist` 작성 (KeepAlive 상주)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.spino.fulltext-worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/TakMD/workspace/spinoscopy-dashboard/scripts/fulltext-worker/run.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/fulltext-worker.log</string>
  <key>StandardErrorPath</key><string>/tmp/fulltext-worker.log</string>
</dict></plist>
```

- [ ] **Step 6: `README.md` 작성 (셋업/운영 가이드)**

```markdown
# 원문 확보 워커 (fulltext-worker)

Scholar 논문 큐(`원문 요청`=true, `원문 상태`∈{요청됨,비어있음})를 소진하며
OA→원내망(Aside-Chrome) 순으로 PDF를 확보, Dropbox 공유 폴더에 올리고
Notion `원문 상태`/`원문 PDF`를 갱신한다.

## 구조
- `drain.ts` — 큐 1회 소진(export `drainQueue`).
- `daemon.ts` — 상주 데몬: Ably 트리거(즉시) + 백업 폴링(기본 5분) + 중복기동 뮤텍스.

## env (.env.local)
- `NOTION_TOKEN`, `NOTION_JOURNAL_DB_ID` — 기존
- `DROPBOX_TOKEN` — files.write + sharing.write 스코프
- `DROPBOX_SCHOLAR_DIR` — Dropbox-상대 폴더(예 `/Scholar PDFs`)
- `ABLY_API_KEY` — Ably 앱 키(없으면 폴링만으로 동작)
- `UNPAYWALL_EMAIL` — 선택(기본 woontak.yuh@gmail.com)
- `FULLTEXT_DAILY_MAX` — per-run 상한(기본 20)
- `FULLTEXT_POLL_MS` — 백업 폴링 간격(기본 300000=5분)

## 수동 실행 (개발/검증)
    set -a; . ./.env.local; set +a
    # 큐 1회 소진만:
    npx tsx -e "import('./scripts/fulltext-worker/drain').then(m=>m.drainQueue())"
    # 데몬 전체(Ctrl+C로 종료):
    npx tsx scripts/fulltext-worker/daemon.ts

## launchd 등록 (상시)
    cp scripts/fulltext-worker/com.spino.fulltext-worker.plist ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/com.spino.fulltext-worker.plist
    tail -f /tmp/fulltext-worker.log

## Phase 2 (경북대 맥스튜디오)
- Aside 앱 + 로그인 Chrome(원내망 IP 확인) + Node/tsx 설치.
- run.sh 의 REPO 경로 수정.
- 맥미니의 워커는 OA만 처리(원내망 권한 없음) → 맥스튜디오로 이관하면 구독형까지 확보.
- 동시 두 곳에서 돌리면 큐가 겹치므로, 이관 후 맥미니 plist는 unload 한다.
```

- [ ] **Step 7: OA end-to-end 검증 (맥미니, 실제 OA DOI 하나)**

준비: `.env.local`에 `DROPBOX_TOKEN`, `DROPBOX_SCHOLAR_DIR` 채우고, Notion에서 OA 논문 1건의 `원문 요청`을 체크(또는 Task 5 curl로 요청).

```bash
set -a; . ./.env.local; set +a
npx tsx -e "import('./scripts/fulltext-worker/drain').then(m=>m.drainQueue())"
```

Expected:
- 로그에 `→ OA 확보 (unpaywall|europepmc)`
- Dropbox 공유 폴더에 `<safeName>.pdf` 생성
- Notion 그 페이지 `원문 상태`=`OA 확보`, `원문 PDF`=Dropbox 링크
- 대시보드 상세에서 버튼이 `PDF 열기`로 바뀌고 링크로 PDF가 열림

- [ ] **Step 8: 데몬 + Ably 트리거 검증 (선택, ABLY_API_KEY 있을 때)**

`npx tsx scripts/fulltext-worker/daemon.ts` 로 데몬을 띄운 상태에서, 다른 터미널에서 Task 5의
curl(또는 대시보드 버튼)로 요청 → 데몬 로그에 `[ably] N건 처리`가 **수 초 내** 찍히는지 확인.
키가 없으면 이 단계는 건너뛰고 백업 폴링(최대 5분)으로만 동작.

- [ ] **Step 9: 커밋**

```bash
git add scripts/fulltext-worker/ package.json package-lock.json
git commit -m "feat(scholar): 원문 확보 데몬(Ably 즉시 트리거 + 백업 폴링) + KeepAlive

drain.ts 큐 소진 + daemon.ts 상주(Ably 구독/5분 폴링/뮤텍스).
OA→원내망 Aside→Dropbox 저장→Notion 갱신, 건당 30초+지터, per-run 상한 20.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TaJf53o9dKVFnYvVq1hFwk"
```

---

## 스펙과의 차이(의도된 정제) 및 Phase 1 범위 축소

- **Dropbox 저장 방식**: 스펙은 "로컬 Dropbox 폴더에 파일 쓰기"였으나, 플랜은 Dropbox API
  `files/upload`로 올린다. 결과는 동일(공유 폴더에 저장 → 두 사람 로컬 동기화)이되, 워커
  머신에 **Dropbox 데스크톱 클라이언트가 없어도 되어 더 단순**하다. 토큰만 있으면 된다.
- **폴백 B(다운로드 폴더 감시) 연기**: 플랜은 in-page fetch 단일 경로(base64, maxBuffer
  64MB ≈ ~48MB PDF)만 구현한다. 대부분 논문(<20MB)을 커버하므로 대용량/스트리밍 전용
  폴백 B는 Phase 2에서 실제 실패 사례가 나오면 추가한다.
- **Dropbox 실패 자동 재시도 연기**: 저장 실패 시 즉시 `실패` 처리하고, 재시도는 사용자가
  버튼을 다시 눌러 큐에 재등록하는 경로(상태 머신)로 커버한다. 자동 1회 재시도는 후속.
- **일일 상한은 per-run 버스트 가드**: `FULLTEXT_DAILY_MAX`는 진짜 24시간 누적이 아니라 "한 번
  소진에 최대 N건"이다(디스크/DB 상태 없이 단순화). 트리거/폴링이 잦아도 건당 30초+지터가
  있어 실질 다운로드 속도는 사람 수준. 진짜 일일 누적 카운팅은 Phase 2 후속.
- **Ably는 선택적 최적화**: `ABLY_API_KEY` 미설정이면 route 발행은 no-op, 데몬은 백업 폴링만으로
  동작(최대 5분 지연). 즉시성만 잃고 기능은 완전. 키가 있으면 지연 ~1~2초.

## Phase 2 (별도, 이 플랜 범위 밖 — 참고)

Phase 2는 코드가 아니라 이식/운영이다: 맥스튜디오에 Aside+Chrome(원내망 IP)+Node/tsx 세팅,
`run.sh` 경로 수정, launchd 등록, Tailscale 원격 관리, 구독형 논문 1건 실전 확인, 맥미니 plist
unload. Task 7의 README에 절차를 담았다.

## 완료 기준 (Phase 1)

- `npx vitest run` 전부 통과, `npx tsc --noEmit` 에러 없음.
- 대시보드 논문 상세에 `원문 받기` 버튼 노출, 클릭 시 큐 등록 + `확보 중…` + (키 있으면) Ably 발행.
- 맥미니 데몬이 OA 논문 1건을 Dropbox+Notion까지 end-to-end 확보, 대시보드에서 `PDF 열기` 동작.
- (ABLY_API_KEY 있을 때) 버튼 클릭 → 데몬이 수 초 내 반응. 없으면 백업 폴링으로 5분 내.
- Notion 수동 `원문 요청` 체크로도 같은 큐를 타는 것 확인.
