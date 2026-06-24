# Journal Collector — TSJ 파일럿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Spine Journal "Articles in Press"를 병원 M4 맥미니에서 Aside로 직접 스크랩 → PubMed(병원 IP, 429 없음)로 enrich → 기존 분류/Notion 로직 재사용해 Journal DB에 신규만 적재하는 수집기를, TSJ 한 저널로 end-to-end 검증한다.

**Architecture:** 순수 파싱·ingest 로직은 `lib/journal-alert/`(테스트 가능, node 전용 의존성 없음)에, Aside 브라우저 호출은 `scripts/journal-collector/`(node `execFileSync`)에 둔다. 스크랩된 article은 제목으로 PubMed를 조회해 full record로 enrich하고, PubMed에 아직 없으면 제목 기반 최소 레코드로 생성한다. 분류(`classifyInterest`)·dedup(`titleKey`/`loadExistingKeys`)·Notion 생성(`createJournalPage`)은 기존 `pipeline.ts` 함수를 재사용한다.

**Tech Stack:** TypeScript, tsx (실행), Aside CLI (`aside repl`), PubMed E-utilities, Notion API, vitest.

## Global Constraints

- 수집 호스트는 **병원 M4 맥미니**(`Taks-Mac-mini.local`, 24/7). Aside 앱 실행 + `~/.local/bin/aside` PATH 필요.
- Aside REPL 컨텍스트 전역: `openTab(url)`, `sleep(ms)`, `tab.evaluate(fn)`, `tab.close()`. 결과는 `console.log('ASIDE_RESULT '+JSON.stringify(x))` 한 줄로 반환.
- 필요 env (`.env.local`): `NOTION_TOKEN`, `NOTION_JOURNAL_DB_ID`. (CRON_SECRET·JOURNAL_ALERT_PAUSED 없음 확인됨.)
- Notion multi_select 옵션 이름에 콤마 금지 — `toMultiSelectOptions()` 항상 통과 (이미 적용됨, `c334f7f`).
- 기존 `lib/journal-alert/pipeline.ts`의 분류/Notion 스키마는 **단일 진실원**. 중복 구현 금지(DRY).
- TSJ 실측값 (2026-06-25 스파이크 확인):
  - URL: `https://www.thespinejournalonline.com/inpress`
  - article 컨테이너: `.articleCitation` (50개)
  - 제목+링크: 컨테이너 내부 `h3 a` → `innerText` = 제목, `href` = `/article/S1529-9430(26)00191-9/fulltext`
  - 저자: 컨테이너 `innerText` 2번째 줄 (콤마구분). 별도 안정 셀렉터 없음 → innerText 라인 파싱.
  - 날짜: `"Published online: June 24, 2026"` 형태 라인.
  - **초록은 목록에 없음** → 초록은 PubMed enrich로만 채움.

---

### Task 1: TSJ 순수 파서 (날짜·PII·라인 파싱)

**Files:**
- Create: `lib/journal-alert/journalSite.ts`
- Test: `lib/journal-alert/journalSite.test.ts`

**Interfaces:**
- Produces:
  - `interface ScrapedArticle { title: string; authors: string; url: string; pii: string; postedAt: string | null; journalName: string }`
  - `parseTsjDate(text: string): string | null` — "Published online: June 24, 2026" → "2026-06-24"
  - `extractPii(href: string): string | null` — "/article/S1529-9430(26)00191-9/fulltext" → "S1529-9430(26)00191-9"
  - `parseTsjCitation(raw: { title: string; href: string; innerText: string }): ScrapedArticle | null` — DOM에서 뽑은 raw를 정규화

- [ ] **Step 1: 실패 테스트 작성**

```ts
// lib/journal-alert/journalSite.test.ts
import { describe, it, expect } from "vitest"
import { parseTsjDate, extractPii, parseTsjCitation } from "./journalSite"

describe("parseTsjDate", () => {
  it("parses 'Published online: June 24, 2026'", () => {
    expect(parseTsjDate("Published online: June 24, 2026")).toBe("2026-06-24")
  })
  it("parses bare 'May 6, 2026'", () => {
    expect(parseTsjDate("May 6, 2026")).toBe("2026-05-06")
  })
  it("returns null on garbage", () => {
    expect(parseTsjDate("Full-Text")).toBeNull()
  })
})

describe("extractPii", () => {
  it("pulls PII from a fulltext href", () => {
    expect(extractPii("/article/S1529-9430(26)00191-9/fulltext")).toBe("S1529-9430(26)00191-9")
  })
  it("returns null when absent", () => {
    expect(extractPii("/issue/whatever")).toBeNull()
  })
})

describe("parseTsjCitation", () => {
  it("builds a ScrapedArticle from raw DOM fields", () => {
    const raw = {
      title: "Quantifying Postural Recovery After Lumbar Decompression",
      href: "/article/S1529-9430(26)00191-9/fulltext",
      innerText:
        "Quantifying Postural Recovery After Lumbar Decompression\nRam Haddas,Prasanth Romiyo,Ye Shu\nPublished online: June 24, 2026\nFull-Text",
    }
    expect(parseTsjCitation(raw)).toEqual({
      title: "Quantifying Postural Recovery After Lumbar Decompression",
      authors: "Ram Haddas, Prasanth Romiyo, Ye Shu",
      url: "https://www.thespinejournalonline.com/article/S1529-9430(26)00191-9/fulltext",
      pii: "S1529-9430(26)00191-9",
      postedAt: "2026-06-24",
      journalName: "The Spine Journal",
    })
  })
  it("returns null when no PII (e.g. menu link)", () => {
    expect(parseTsjCitation({ title: "x", href: "/issue/y", innerText: "x" })).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/journal-alert/journalSite.test.ts`
Expected: FAIL — "Cannot find module './journalSite'"

- [ ] **Step 3: 최소 구현**

```ts
// lib/journal-alert/journalSite.ts
export interface ScrapedArticle {
  title: string
  authors: string
  url: string
  pii: string
  postedAt: string | null
  journalName: string
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
}

export function parseTsjDate(text: string): string | null {
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/)
  if (!m) return null
  const mm = MONTHS[m[1].toLowerCase()]
  if (!mm) return null
  return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`
}

export function extractPii(href: string): string | null {
  const m = href.match(/\/article\/(S\d{4}-\d{4}\(\d{2}\)\d{5}-\d)/)
  return m ? m[1] : null
}

export function parseTsjCitation(raw: { title: string; href: string; innerText: string }): ScrapedArticle | null {
  const pii = extractPii(raw.href)
  if (!pii) return null
  const lines = raw.innerText.split("\n").map((l) => l.trim()).filter(Boolean)
  // line 0 = 제목, line 1 = 저자, 날짜 라인은 "Published online" 또는 월/일/년 패턴
  const authorsLine = lines[1] && !/published online|full-text/i.test(lines[1]) ? lines[1] : ""
  const authors = authorsLine.split(",").map((a) => a.trim()).filter(Boolean).join(", ")
  const dateLine = lines.find((l) => parseTsjDate(l) !== null) ?? ""
  const base = "https://www.thespinejournalonline.com"
  return {
    title: raw.title.trim(),
    authors,
    url: raw.href.startsWith("http") ? raw.href : base + raw.href,
    pii,
    postedAt: parseTsjDate(dateLine),
    journalName: "The Spine Journal",
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/journal-alert/journalSite.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/journal-alert/journalSite.ts lib/journal-alert/journalSite.test.ts
git commit -m "feat(journal-collector): TSJ pure parsers (date/PII/citation)"
```

---

### Task 2: PubMed 제목 조회 enrich + 최소 레코드 변환 (pipeline.ts 재사용)

**Files:**
- Modify: `lib/journal-alert/pipeline.ts` (새 export 추가; 기존 private fn 재사용)
- Test: `lib/journal-alert/pipeline.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes (pipeline.ts 내부 기존): `fetchPubmedArticles(pmids)`, `searchPubmedIdsByDateType` 패턴, `classifyInterest`, `titleKey`, `PubmedArticle` 타입, `ScrapedArticle`(Task 1).
- Produces:
  - `minimalArticleFromScraped(s: ScrapedArticle): PubmedArticle` — 초록·pubtype 없는 제목기반 레코드
  - `searchPubmedByTitle(title: string, journal: string): Promise<PubmedArticle | null>`

- [ ] **Step 1: 실패 테스트 작성 (순수 변환만 단위 테스트; 네트워크 함수는 스모크에서 검증)**

```ts
// lib/journal-alert/pipeline.test.ts 에 추가
import { minimalArticleFromScraped } from "./pipeline"

describe("minimalArticleFromScraped", () => {
  it("builds a title-only PubmedArticle from a scraped item", () => {
    const a = minimalArticleFromScraped({
      title: "Endoscopic UBE for stenosis",
      authors: "A, B",
      url: "https://www.thespinejournalonline.com/article/S1529-9430(26)00191-9/fulltext",
      pii: "S1529-9430(26)00191-9",
      postedAt: "2026-06-24",
      journalName: "The Spine Journal",
    })
    expect(a.title).toBe("Endoscopic UBE for stenosis")
    expect(a.abstract).toBe("")
    expect(a.pubTypes).toEqual([])
    expect(a.pmid).toBeNull()
    expect(a.pubDate).toBe("2026-06-24")
    expect(a.doiUrl).toBe("")
    expect(a.journalName).toBe("The Spine Journal")
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/journal-alert/pipeline.test.ts`
Expected: FAIL — "minimalArticleFromScraped is not a function"

- [ ] **Step 3: 구현 (pipeline.ts에 추가)**

`import type { ScrapedArticle } from "./journalSite"` 를 파일 상단 import에 추가. PubmedArticle 타입 근처(또는 fetchPubmedArticles 아래)에 추가:

```ts
export function minimalArticleFromScraped(s: ScrapedArticle): PubmedArticle {
  return {
    pmid: null as unknown as string,   // PubMed 미색인 — 기존 코드의 pmid 사용부는 falsy 가드 있음
    title: s.title,
    authors: s.authors,
    abstract: "",
    doiUrl: "",
    journalName: s.journalName,
    pubDate: s.postedAt ?? "",
    pubTypes: [],
    affiliations: "",
    keywords: [],
    volume: "",
    issue: "",
  }
}

// 제목 정확매칭으로 PubMed 단건 조회. 색인 전이면 null.
export async function searchPubmedByTitle(title: string, journal: string): Promise<PubmedArticle | null> {
  const term = `"${title}"[Title] AND "${journal}"[journal]`
  const url =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed` +
    `&term=${encodeURIComponent(term)}&retmax=1&retmode=json`
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SpinoscopyDashboard/1.0" } })
  if (!res.ok) throw new Error(`PubMed title search failed: ${res.status}`)
  const payload = (await res.json()) as { esearchresult?: { idlist?: string[] } }
  const id = payload.esearchresult?.idlist?.[0]
  if (!id) return null
  const [article] = await fetchPubmedArticles([id])
  return article ?? null
}
```

> 주의: `pmid` 가 string 타입이라 `null` 캐스팅. 기존 `buildArticleProperties`는 `if (article.pmid)` 가드라 안전.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/journal-alert/pipeline.test.ts`
Expected: PASS (기존 4 + 신규 1)

- [ ] **Step 5: 커밋**

```bash
git add lib/journal-alert/pipeline.ts lib/journal-alert/pipeline.test.ts
git commit -m "feat(journal-collector): PubMed title-enrich + minimal record from scraped"
```

---

### Task 3: ingest 오케스트레이션 (dedup → enrich → create)

**Files:**
- Modify: `lib/journal-alert/pipeline.ts`

**Interfaces:**
- Consumes: `loadExistingKeys(databaseId)`, `titleKey(title)`, `createJournalPage(databaseId, article)`, `searchPubmedByTitle`, `minimalArticleFromScraped`, `ScrapedArticle`.
- Produces:
  - `interface IngestResult { scraped: number; created: number; skipped: number; enriched: number }`
  - `ingestScrapedArticles(databaseId: string, scraped: ScrapedArticle[]): Promise<IngestResult>`

- [ ] **Step 1: 구현 (네트워크/Notion 부수효과라 단위테스트 대신 Task 6 스모크로 검증 — 로직 단순)**

```ts
export interface IngestResult { scraped: number; created: number; skipped: number; enriched: number }

export async function ingestScrapedArticles(
  databaseId: string,
  scraped: ScrapedArticle[],
): Promise<IngestResult> {
  const existing = await loadExistingKeys(databaseId)
  let created = 0, skipped = 0, enriched = 0
  for (const s of scraped) {
    if (existing.has(titleKey(s.title))) { skipped++; continue }
    let article = await searchPubmedByTitle(s.title, s.journalName)  // 색인됐으면 full
    if (article) enriched++; else article = minimalArticleFromScraped(s)
    await createJournalPage(databaseId, article)
    existing.add(titleKey(s.title))   // 같은 run 내 중복 방지
    await new Promise((r) => setTimeout(r, 350))  // PubMed/Notion 레이트 보호
  }
  return { scraped: scraped.length, created: created + 0 + (created = created), skipped, enriched } // placeholder fix below
}
```

> 위 return 의 `created` 증가가 빠졌다. 루프 안 `await createJournalPage(...)` 다음 줄에 `created++` 를 넣고, return 은 `{ scraped: scraped.length, created, skipped, enriched }` 로 한다. (Step 2에서 바로잡아 커밋)

- [ ] **Step 2: created 카운트 정정 + 커밋**

루프 본문을 다음으로 확정:

```ts
  for (const s of scraped) {
    if (existing.has(titleKey(s.title))) { skipped++; continue }
    let article = await searchPubmedByTitle(s.title, s.journalName)
    if (article) enriched++; else article = minimalArticleFromScraped(s)
    await createJournalPage(databaseId, article)
    created++
    existing.add(titleKey(s.title))
    await new Promise((r) => setTimeout(r, 350))
  }
  return { scraped: scraped.length, created, skipped, enriched }
```

```bash
git add lib/journal-alert/pipeline.ts
git commit -m "feat(journal-collector): ingestScrapedArticles (dedup/enrich/create)"
```

---

### Task 4: Aside TSJ 스크래퍼 (node, execFileSync)

**Files:**
- Create: `scripts/journal-collector/scrape-tsj.mjs`

**Interfaces:**
- Consumes: `aside` CLI, `lib/journal-alert/journalSite.ts`(`parseTsjCitation`) — `.mjs`에서 import하려면 컴파일된 JS가 필요하므로, 파서 호출은 **collect.ts(tsx)** 단계에서 하고, 이 파일은 raw DOM 추출만 반환한다.
- Produces: `scrapeTsjRaw(): Promise<Array<{ title: string; href: string; innerText: string }>>`

- [ ] **Step 1: 구현**

```js
// scripts/journal-collector/scrape-tsj.mjs
// 병원 M4 맥미니 전용 — Aside 로그인 Chrome 으로 TSJ Articles in Press DOM 추출.
import { execFileSync } from "node:child_process"

const TSJ_URL = "https://www.thespinejournalonline.com/inpress"

const EXTRACT = `
  return [...document.querySelectorAll('.articleCitation')].map(el => {
    const a = el.querySelector('h3 a') || el.querySelector('a');
    return a ? { title:(a.innerText||'').trim(), href:a.getAttribute('href')||'', innerText:(el.innerText||'').trim() } : null;
  }).filter(Boolean);
`

export async function scrapeTsjRaw() {
  const code = `
const p = await openTab(${JSON.stringify(TSJ_URL)});
await sleep(9000);
const out = await p.evaluate(() => { ${EXTRACT} });
try { await p.close(); } catch(e) {}
console.log('ASIDE_RESULT '+JSON.stringify(out));
`
  const stdout = execFileSync("aside", ["repl", code], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 150000 })
  const line = stdout.split("\n").find((l) => l.startsWith("ASIDE_RESULT "))
  if (!line) throw new Error("ASIDE_RESULT 없음 — Aside 앱 실행/로그인 확인")
  return JSON.parse(line.slice("ASIDE_RESULT ".length))
}
```

- [ ] **Step 2: 수동 스모크 (실페이지)**

Run: `cd <repo> && PATH="$HOME/.local/bin:$PATH" node -e "import('./scripts/journal-collector/scrape-tsj.mjs').then(m=>m.scrapeTsjRaw()).then(r=>console.log(r.length, r[0]))"`
Expected: 약 50, 첫 항목에 title/href(`/article/S1529-9430...`)/innerText 출력

- [ ] **Step 3: 커밋**

```bash
git add scripts/journal-collector/scrape-tsj.mjs
git commit -m "feat(journal-collector): Aside TSJ raw DOM scraper"
```

---

### Task 5: collect 엔트리포인트 (tsx)

**Files:**
- Create: `scripts/journal-collector/collect.ts`
- Create: `scripts/journal-collector/run.sh`

**Interfaces:**
- Consumes: `scrapeTsjRaw`(Task 4), `parseTsjCitation`(Task 1), `ingestScrapedArticles`(Task 3).

- [ ] **Step 1: 구현 (collect.ts)**

```ts
// scripts/journal-collector/collect.ts — tsx 로 실행. 병원 M4 맥미니 launchd.
import { scrapeTsjRaw } from "./scrape-tsj.mjs"
import { parseTsjCitation } from "../../lib/journal-alert/journalSite"
import { ingestScrapedArticles } from "../../lib/journal-alert/pipeline"

const log = (...a: unknown[]) => console.log(`[journal-collector ${new Date().toISOString()}]`, ...a)

async function main() {
  const databaseId = process.env.NOTION_JOURNAL_DB_ID?.trim()
  if (!databaseId) throw new Error("NOTION_JOURNAL_DB_ID missing")
  const raw = await scrapeTsjRaw()
  log(`scraped raw: ${raw.length}`)
  const articles = raw.map(parseTsjCitation).filter((x): x is NonNullable<typeof x> => x !== null)
  log(`parsed: ${articles.length}`)
  const result = await ingestScrapedArticles(databaseId, articles)
  log(`done`, result)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: 구현 (run.sh — social-collector/run.sh 패턴)**

```bash
#!/bin/bash
set -euo pipefail
REPO="/Users/TakMD/workspace/spinoscopy-dashboard"
cd "$REPO"
set -a; source .env.local; set +a
export PATH="/Users/TakMD/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec npx tsx "$REPO/scripts/journal-collector/collect.ts"
```

- [ ] **Step 3: 수동 end-to-end 스모크**

Run: `bash scripts/journal-collector/run.sh`
Expected: 로그에 `scraped raw: ~50`, `parsed: ~50`, `done { scraped, created, skipped, enriched }`. 첫 실행은 backlog 복구분과 dedup되어 created가 작을 수 있음(정상). Notion Journal DB에 source=TSJ 신규행 확인.

- [ ] **Step 4: 커밋**

```bash
chmod +x scripts/journal-collector/run.sh
git add scripts/journal-collector/collect.ts scripts/journal-collector/run.sh
git commit -m "feat(journal-collector): tsx collect entrypoint + run.sh"
```

---

### Task 6: launchd 스케줄 (하루 2회)

**Files:**
- Create: `scripts/journal-collector/com.spino.journal-collector.plist` (repo에 보관용 사본)
- 설치 위치: `~/Library/LaunchAgents/com.spino.journal-collector.plist`

- [ ] **Step 1: plist 작성 (social plist 패턴, StartCalendarInterval 08:00·20:00)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.spino.journal-collector</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/TakMD/workspace/spinoscopy-dashboard/scripts/journal-collector/run.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>/tmp/journal-collector.log</string>
  <key>StandardErrorPath</key><string>/tmp/journal-collector.log</string>
</dict></plist>
```

- [ ] **Step 2: 설치 & 로드**

Run:
```bash
cp scripts/journal-collector/com.spino.journal-collector.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.spino.journal-collector.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.spino.journal-collector.plist
launchctl list | grep journal-collector
```
Expected: `com.spino.journal-collector` 목록에 표시.

- [ ] **Step 3: 커밋**

```bash
git add scripts/journal-collector/com.spino.journal-collector.plist
git commit -m "chore(journal-collector): launchd plist (daily 08:00/20:00)"
```

---

### Task 7: Vercel cron 정리 (로컬 수집 안정화 후)

**Files:**
- Modify: `vercel.json`

**전제:** Task 5 스모크 성공 + Task 6 launchd 1회 이상 정상 실행 확인 후에만 진행 (수집 공백 방지).

- [ ] **Step 1: cron 제거**

`vercel.json` 의 `crons` 배열에서 journal alert 항목 제거. (다른 cron 있으면 보존; 없으면 빈 `{}` 또는 파일 정리.)

- [ ] **Step 2: 커밋 & 배포**

```bash
git add vercel.json
git commit -m "chore(journal-alert): retire Vercel cron — collection moved to mac mini"
```

Expected: 다음 배포부터 Vercel은 Notion READ만. 수집은 맥미니 launchd 단독.

---

## Self-Review

- **Spec coverage**: §4 아키텍처(맥미니 로컬, PubMed+Aside)→Task 2~6. §5 컴포넌트→Task 1,4,5,6. §6 merge/dedup→Task 3(titleKey dedup + PubMed enrich). §7 분류 재사용→Task 2,3(classifyInterest via createJournalPage 경로). §8 TSJ 파일럿→Task 1~6. §9 Vercel 정리→Task 7 (backlog 복구는 이미 세션 중 실행). §10 확장→파일럿 후 별도 플랜.
- **Placeholder scan**: Task 3 Step 1에 의도적 결함(created 미집계)을 두고 Step 2에서 바로잡는 TDD 흐름 — 최종 코드는 완전. 그 외 placeholder 없음.
- **Type consistency**: `ScrapedArticle`(Task 1) 필드명이 Task 2/3/5에서 일관. `IngestResult` 필드 일관. `PubmedArticle` 필드는 pipeline.ts 실제 정의(pmid/title/authors/abstract/doiUrl/journalName/pubDate/pubTypes/affiliations/keywords/volume/issue)와 일치.

## 알려진 한계 / 후속

- 초록은 PubMed 색인 후에만 채워짐 → 색인 전 생성된 행은 제목기반 분류. PubMed 따라붙으면 기존 `runBackfillFields`/`runReclassifyInterest`로 보강.
- 저자 파싱은 innerText 라인 기반(취약). 사이트 개편 시 Task 1 파서 조정.
- 확장(나머지 5개 저널 + PubMed 정식 통합)은 파일럿 검증 후 별도 플랜.
