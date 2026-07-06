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

/** 임의 입력(DOI·doi.org 링크·출판사 URL·텍스트)에서 DOI를 찾는다. 없으면 null. */
export function findDoiInText(input: string): string | null {
  if (!input) return null
  const s = input.trim()
  const direct = extractDoi(s)
  if (direct) return direct.replace(/[.,;)\]}>]+$/, "")
  const m = s.match(/10\.\d{4,}\/[^\s"'<>?#]+/)
  return m ? m[0].replace(/[.,;)\]}>]+$/, "") : null
}

export function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "%PDF"
}

// ─── 사람이 읽는 PDF 파일명 규칙: 발행연월_저널_제1저자_키워드 ───
// 예: 2026_07_ESJ_Yang_SSVPI

function alnum(s: string): string {
  return (s || "").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "")
}

/** 저자 문자열의 제1저자 성. "Y. Yang, X. Liu…" → "Yang". 없으면 "Unknown". */
export function firstAuthorSurname(authors: string): string {
  const first = (authors || "").split(",")[0].trim()
  if (!first) return "Unknown"
  const toks = first.split(/\s+/).filter(Boolean)
  // 뒤에서부터, 이니셜(1글자)이 아닌 첫 토큰 = 성
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = alnum(toks[i])
    if (t.length > 1) return t
  }
  return "Unknown"
}

const TITLE_STOP = new Set([
  "the","a","an","of","for","in","on","with","and","to","by","from","as","at","or",
  "novel","new","study","studies","case","cases","report","reports","analysis","review",
  "reviews","effect","effects","role","clinical","using","use","comparison","versus","vs",
  "associated","evaluation","assessment","outcome","outcomes","patient","patients",
  "treatment","management","surgical","surgery","spine","spinal",
])

/** 제목에서 키워드 추출: ①괄호 속 대문자 약어 → ②핵심 단어 2개. 없으면 "". */
export function titleKeyword(title: string): string {
  const t = (title || "")
    .replace(/[‘’“”]/g, "")
    .replace(/[–—]/g, "-")
  const acro = t.match(/\(([A-Z][A-Z0-9]{1,6})\)/)
  if (acro) return acro[1]
  const words = t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !TITLE_STOP.has(w))
  return words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join("-")
}

/** DOI 고유 꼬리 6자(키워드가 비었을 때 폴백). */
export function doiTail(doi: string): string {
  return alnum(doi).slice(-6)
}

export interface FileNameParts {
  pubDate: string | null
  journal: string
  authors: string
  title: string
  doiUrl: string | null
  pageId: string
}

/** 최종 파일명(확장자 제외): 2026_07_ESJ_Yang_SSVPI */
export function buildFilename(p: FileNameParts): string {
  const ym =
    p.pubDate && /^\d{4}-\d{2}/.test(p.pubDate) ? p.pubDate.slice(0, 7).replace("-", "_") : "0000_00"
  const jr = alnum(p.journal) || "Jrnl"
  const au = firstAuthorSurname(p.authors)
  let kw = titleKeyword(p.title)
  if (!kw) {
    const doi = extractDoi(p.doiUrl)
    kw = doi ? doiTail(doi) : `p${alnum(p.pageId).slice(0, 6)}`
  }
  return `${ym}_${jr}_${au}_${kw}`
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
