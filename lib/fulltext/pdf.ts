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

// 고정 대기는 못 믿는다. Cloudflare 챌린지("Just a moment...")가 끝나기 전에 읽으면
// DOM 이 텅 비어 no-pdf-url 로 오판한다 — 같은 SAGE 페이지가 9초에 통과했다 실패했다 한다.
// 실제 문서가 뜰 때까지 폴링하되, 안 풀려도 일단 진행해 진단정보는 남긴다.
for (let i = 0; i < 20; i++) {
  await sleep(3000);
  const s = await p.evaluate(() => ({ t: document.title || '', r: document.readyState }));
  const challenging = /just a moment|attention required|checking your browser|请稍候/i.test(s.t);
  if (!challenging && s.r === 'complete' && s.t.length > 3) break;
}

const res = await p.evaluate(async () => {
  const diag = { url: location.href, title: (document.title || '').slice(0, 120) };
  const abs = (u) => { try { return new URL(u, location.href).href } catch (e) { return null } };

  const meta = document.querySelector('meta[name="citation_pdf_url"]');
  let pdfUrl = meta ? abs(meta.getAttribute('content')) : null;

  // 링크 후보를 넓게 훑는다: .pdf 로 끝나거나, 경로에 /pdf|/epdf 가 있거나,
  // 다운로드 속성이 붙은 앵커. 첫 번째만 보던 기존 방식은 놓치는 게 많았다.
  if (!pdfUrl) {
    const cands = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && /\\.pdf($|[?#])|\\/e?pdf\\/|pdfft|type=printable|\\/pdfdirect\\//i.test(h));
    pdfUrl = cands.length ? abs(cands[0]) : null;
  }

  if (!pdfUrl) return { ok:false, reason:'no-pdf-url', ...diag };
  try {
    const r = await fetch(pdfUrl, { credentials:'include' });
    if (!r.ok) return { ok:false, reason:'fetch-'+r.status, ...diag };
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin=''; for (let i=0;i<buf.length;i++) bin+=String.fromCharCode(buf[i]);
    return { ok:true, b64: btoa(bin) };
  } catch(e) { return { ok:false, reason:String(e && e.message || e), ...diag }; }
});
try { await p.close(); } catch(e) {}
console.log('ASIDE_RESULT '+JSON.stringify(res));
`
}

export interface AsideResult {
  ok: boolean
  b64?: string
  reason?: string
  /** 실패 진단용 — 브라우저가 실제로 도착한 URL과 페이지 제목. */
  url?: string
  title?: string
}

/**
 * 실패 사유를 사람이 읽을 수 있게 만든다. 진단정보를 함께 붙이는 게 핵심 —
 * `no-pdf-url` 한 마디만 남으면 챌린지에 막힌 건지, 구독 벽인지, 선택자가 안 맞은
 * 건지 원격에서 구분할 방법이 없다.
 */
export function describeAsideFailure(res: AsideResult): string {
  const base = res.reason ?? "결과 없음"
  const bits = [res.url, res.title].filter(Boolean)
  return bits.length ? `${base} (${bits.join(" · ")})` : base
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
