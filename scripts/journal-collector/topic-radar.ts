// scripts/journal-collector/topic-radar.ts
// 코어 6개 저널 "밖"에서 가끔 나오는 좋은 논문을 줍는다 — 저널이 아닌 "주제" 기준.
// 좁은 관심 쿼리로 전(全) PubMed 검색(코어 6개 제외) → Notion/seen 중복 제거
// → Groq LLM 이 관련성·품질 점수화 → 통과분만 별도 다이제스트 메일.
// 재발송 방지: seen-state 파일(PMID). DRY_RUN=1 이면 발송/seen 갱신 안 함.
// env: NOTION_TOKEN, NOTION_JOURNAL_DB_ID, GROQ_API_KEY, JOURNAL_ALERT_SMTP_*, RADAR_DAYS(기본7), RADAR_MIN_SCORE(기본7)
import nodemailer from "nodemailer"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { searchPubmedByTerm, fetchPubmedArticles, titleKey } from "../../lib/journal-alert/pipeline"
import { alertSubject, alertWrap, articleItem, articleList, escHtml } from "../../lib/journal-alert/mailTemplate"
import { notionEnv } from "../../lib/notion/client"

const DRY = process.env.DRY_RUN === "1"
const DAYS = Number(process.env.RADAR_DAYS ?? "7")
const MIN_SCORE = Number(process.env.RADAR_MIN_SCORE ?? "8")
const SEEN_PATH = join(homedir(), ".journal-topic-radar-seen.json")

// Tak 의 관심: UBE/biportal·full-endoscopic spine, PROM(척추수술), 척추수술 AI/ML. 코어 6개 저널 제외.
// 모든 arm 에 "척추수술" 문맥을 강제해 cervical cancer/spinal anaesthesia 류 오탐을 줄인다.
const SPINE_CTX =
  '("spine surgery"[tiab] OR "spinal surgery"[tiab] OR "spinal fusion"[tiab] OR "lumbar fusion"[tiab] OR ' +
  'discectomy[tiab] OR laminectomy[tiab] OR "spinal stenosis"[tiab] OR spondylolisthesis[tiab] OR ' +
  '"disc herniation"[tiab] OR "spinal decompression"[tiab] OR "spinal deformity"[tiab] OR scoliosis[tiab])'
const TOPIC =
  '(("unilateral biportal"[tiab] OR biportal[tiab] OR "full-endoscopic"[tiab] OR "full endoscopic"[tiab] OR ' +
  '"endoscopic spine"[tiab] OR "endoscopic lumbar"[tiab] OR "endoscopic decompression"[tiab] OR "endoscopic discectomy"[tiab]) ' +
  `OR ("patient-reported outcome*"[tiab] AND ${SPINE_CTX}) ` +
  'OR (("machine learning"[tiab] OR "deep learning"[tiab] OR "artificial intelligence"[tiab] OR "large language model"[tiab]) ' +
  `AND ${SPINE_CTX}))`
const EXCLUDE_CORE =
  ' NOT ("Spine J"[journal] OR "Spine (Phila Pa 1976)"[journal] OR "J Neurosurg Spine"[journal] ' +
  'OR "Eur Spine J"[journal] OR "Global Spine J"[journal] OR "Neurospine"[journal]) ' +
  'NOT (cancer[ti] OR carcinoma[ti] OR tumour[ti] OR anaesthesia[ti] OR anesthesia[ti] OR arthroplasty[ti] ' +
  'OR "hip "[ti] OR knee[ti] OR dental[ti] OR pulmonary[ti])'

const NOTION_TOKEN = process.env.NOTION_TOKEN
const DB = notionEnv("NOTION_JOURNAL_DB_ID")
const NH = { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" }

async function loadNotionKeys(): Promise<Set<string>> {
  const keys = new Set<string>()
  let cursor: string | undefined
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
      method: "POST", headers: NH, body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    })
    const j: any = await res.json()
    if (j.object === "error") throw new Error(`Notion: ${j.message}`)
    for (const p of j.results) {
      const t = (p.properties?.Title?.title || []).map((x: any) => x.plain_text).join("")
      if (t) keys.add(titleKey(t))
      const d = p.properties?.DOI?.url
      if (d) keys.add(d.replace(/^https?:\/\/doi\.org\//, "").toLowerCase())
    }
    cursor = j.has_more ? j.next_cursor : undefined
  } while (cursor)
  return keys
}

function loadSeen(): Set<string> {
  if (!existsSync(SEEN_PATH)) return new Set()
  try { return new Set(JSON.parse(readFileSync(SEEN_PATH, "utf8"))) } catch { return new Set() }
}

// 핵심 술기(UBE/biportal/full-endoscopic 척추) 키워드 매칭 — LLM 점수와 무관하게 통과 후보.
function isCoreTechnique(title: string): boolean {
  return /unilateral biportal|biportal|full[- ]endoscop|endoscopic (spine|lumbar|cervical|disc|decompression|discectomy)/i.test(title)
}

// OpenAlex 로 저널 impact(2년 평균 피인용 ≈ IF) 조회. PMID→source→summary_stats. source 별 캐시.
const IMPACT_CACHE = new Map<string, { journal: string; impact: number }>()
async function journalImpact(pmid: string): Promise<{ journal: string; impact: number }> {
  const mail = process.env.JOURNAL_ALERT_RECIPIENT || "noreply@example.com"
  try {
    const w = await fetch(`https://api.openalex.org/works/pmid:${pmid}?select=primary_location&mailto=${mail}`)
    if (!w.ok) return { journal: "", impact: -1 }
    const src = ((await w.json()) as any)?.primary_location?.source
    if (!src?.id) return { journal: "", impact: -1 }
    if (IMPACT_CACHE.has(src.id)) return IMPACT_CACHE.get(src.id)!
    const s = await fetch(`https://api.openalex.org/sources/${src.id.split("/").pop()}?select=display_name,summary_stats&mailto=${mail}`)
    let impact = -1, journal = src.display_name || ""
    if (s.ok) { const sj: any = await s.json(); impact = Number(sj?.summary_stats?.["2yr_mean_citedness"] ?? -1); journal = sj?.display_name || journal }
    const val = { journal, impact }
    IMPACT_CACHE.set(src.id, val)
    return val
  } catch { return { journal: "", impact: -1 } }
}

interface Scored { pmid: string; title: string; authors: string; journal: string; doiUrl: string; score: number; reason: string; impact: number; core: boolean }

async function gateWithLLM(cands: { pmid: string; title: string; abstract: string }[]): Promise<Map<string, { score: number; reason: string }>> {
  const list = cands.map((c, i) => `[${i}] ${c.title}\n${(c.abstract || "(no abstract)").slice(0, 320)}`).join("\n\n")
  const prompt =
    `당신은 척추외과의를 위한 매우 엄격한 논문 게이트키퍼입니다. 이 외과의의 핵심 관심은 오직: ` +
    `(1) UBE/양방향 내시경·full-endoscopic 척추수술, (2) 척추수술의 환자보고결과(PROM), (3) 척추수술 임상결정에 쓰이는 AI/ML. ` +
    `점수 기준(1~10): 9~10=핵심 관심에 정확히 부합하고 방법론도 탄탄한 꼭 읽을 논문; 8=관련성 높고 견고; ` +
    `7 이하=주변부/간접적이거나 표본 작음/저질 의심. 기본은 탈락입니다. 핵심 주제가 아니면(예: 일반 마취·종양·타관절·영상기법 자체) 5 이하로 강하게 깎으세요. ` +
    `대부분은 8 미만이어야 정상이며, 정말 좋은 소수만 8+ 입니다. ` +
    `오직 JSON 만 출력: {"items":[{"i":번호,"score":정수,"reason":"왜 그 점수인지 한 줄 한국어"}]} — 모든 후보 포함.\n\n${list}`
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: 'JSON만 출력. 형식: {"items":[{"i":0,"score":8,"reason":"..."}]}' },
        { role: "user", content: prompt },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j: any = await res.json()
  const content = j.choices?.[0]?.message?.content ?? "{}"
  let arr: any[] = []
  try { const o = JSON.parse(content); arr = Array.isArray(o) ? o : (o.items || o.results || []) } catch { arr = [] }
  const out = new Map<string, { score: number; reason: string }>()
  for (const r of arr) {
    const c = cands[r.i]
    if (c) out.set(c.pmid, { score: Number(r.score) || 0, reason: String(r.reason || "") })
  }
  return out
}


function buildHtml(kept: Scored[]): string {
  const items = kept.map((r) => articleItem({
    href: r.doiUrl,
    title: r.title,
    badgesHtml: `${r.core ? '<span style="background:#eff6ff;color:#1d4ed8;font-size:11px;padding:1px 6px;border-radius:4px;margin-left:6px;">핵심술기</span>' : ""}<span style="background:#ecfdf5;color:#047857;font-size:12px;padding:1px 6px;border-radius:4px;margin-left:4px;">★${r.score} · IF ${r.impact >= 0 ? r.impact.toFixed(1) : "?"}</span>`,
    subHtml: `${escHtml(r.authors)} · <i>${escHtml(r.journal)}</i>`,
    noteHtml: `→ ${escHtml(r.reason)}`,
  })).join("")
  return alertWrap(
    "🛰️ Topic Radar — 다른 저널의 주목할 논문",
    [`코어 6개 밖에서 주제(UBE·내시경·PROM·AI) 선별 ${kept.length}건 — 핵심술기 자동통과 + 나머지 LLM ${MIN_SCORE}+, 저널 impact 게이트.`],
    articleList(items)
  )
}

async function main() {
  if (!DB || !NOTION_TOKEN) throw new Error("NOTION_TOKEN/NOTION_JOURNAL_DB_ID 없음")
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY 없음")

  const pmids = await searchPubmedByTerm(TOPIC + EXCLUDE_CORE, DAYS)
  console.log(`[radar] PubMed 후보 PMID: ${pmids.length}`)
  if (pmids.length === 0) { console.log("[radar] 후보 없음 — 종료"); return }

  const seen = loadSeen()
  const fresh = pmids.filter((id) => !seen.has(id))
  console.log(`[radar] seen 제외 후: ${fresh.length}`)
  if (fresh.length === 0) { console.log("[radar] 새 후보 없음 — 종료"); return }

  const articles = await fetchPubmedArticles(fresh.slice(0, 80))
  const notionKeys = await loadNotionKeys()
  const cands = articles.filter((a) => !notionKeys.has(titleKey(a.title)) && !(a.doiUrl && notionKeys.has(a.doiUrl.replace(/^https?:\/\/doi\.org\//, "").toLowerCase())))
  console.log(`[radar] Notion 중복 제외 후 후보: ${cands.length}`)
  if (cands.length === 0) { console.log("[radar] 신규 없음 — 종료"); return }

  const scores = await gateWithLLM(cands.map((a) => ({ pmid: a.pmid, title: a.title, abstract: a.abstract })))
  const MIN_IMPACT = Number(process.env.RADAR_MIN_IMPACT ?? "1.3")
  const scored: Scored[] = []
  for (const a of cands) {
    const sc = scores.get(a.pmid) || { score: 0, reason: "" }
    const { journal, impact } = await journalImpact(a.pmid)
    scored.push({
      pmid: a.pmid, title: a.title, authors: a.authors, journal: journal || a.journalName,
      doiUrl: a.doiUrl || (a.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/` : ""),
      score: sc.score, reason: sc.reason, impact, core: isCoreTechnique(a.title),
    })
    await new Promise((r) => setTimeout(r, 120))
  }
  // 하이브리드 + impact 게이트: (핵심술기 OR LLM>=MIN_SCORE) AND 저널 impact>=MIN_IMPACT
  const kept = scored
    .filter((x) => (x.core || x.score >= MIN_SCORE) && x.impact >= MIN_IMPACT)
    .sort((a, b) => Number(b.core) - Number(a.core) || b.score - a.score || b.impact - a.impact)
    .slice(0, Number(process.env.RADAR_MAX ?? "12"))
  console.log(`[radar] 게이트 통과(core OR ${MIN_SCORE}+, impact>=${MIN_IMPACT}, cap ${process.env.RADAR_MAX ?? "12"}): ${kept.length}`)

  if (DRY) {
    console.log(`=== DRY RUN (전 후보 — core/점수/impact, MIN_IMPACT=${MIN_IMPACT}) ===`)
    scored.sort((a, b) => b.impact - a.impact).forEach((k) =>
      console.log(`  ${k.core ? "CORE" : "    "} ★${k.score} IF${k.impact >= 0 ? k.impact.toFixed(1) : "?"} [${k.journal.slice(0, 24)}] ${k.title.slice(0, 52)}`))
    console.log(`(seen/발송 안 함. 후보 ${cands.length}, 게이트통과 ${kept.length})`)
    return
  }

  // seen 갱신 (검토한 fresh 전부 — 통과 못한 것도 다시 안 보도록)
  const updatedSeen = Array.from(new Set([...seen, ...fresh]))
  writeFileSync(SEEN_PATH, JSON.stringify(updatedSeen.slice(-5000)))

  if (kept.length === 0) { console.log("[radar] 통과 0건 — 발송 안 함"); return }

  const clean = (s?: string) => (s || "").replace(/\\n/g, "").replace(/["\r\n]/g, "").trim()
  const user = process.env.JOURNAL_ALERT_SMTP_USER
  const to = clean(process.env.JOURNAL_ALERT_RECIPIENT ?? user) || undefined
  const cc = clean(process.env.JOURNAL_ALERT_CC) || undefined
  const transport = nodemailer.createTransport({
    host: process.env.JOURNAL_ALERT_SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.JOURNAL_ALERT_SMTP_PORT ?? "587"), secure: false,
    auth: { user, pass: process.env.JOURNAL_ALERT_SMTP_PASS },
  })
  const info = await transport.sendMail({ from: user, to, cc, subject: alertSubject(`🛰️ Topic Radar — 주목 논문 ${kept.length}건`), html: buildHtml(kept) })
  console.log("[radar] 발송 완료:", info.messageId)
}

main().catch((e) => { console.error("[radar] 실패:", e); process.exit(1) })
