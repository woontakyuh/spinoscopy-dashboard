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

// ─── 어떤 PDF 를 받을지 고르기 ───
//
// 브라우저 안에서 실행되는 코드라 문자열로 들고 다니며 fetch 스크립트에 그대로 박는다.
// 테스트는 같은 문자열을 new Function 으로 되살려 돌린다(loadPickPdfUrl) — 배포되는 코드와
// 검증하는 코드가 같다.
//
// 실측으로 확인한 함정 두 가지 (2026-10-07):
//  · thejns.org(PubFactory)는 citation_pdf_url 이 /previewpdf/ = 앞 2쪽 미리보기다.
//    본문은 같은 경로의 /downloadpdf/. JNS Spine 6건이 전부 2쪽짜리로 저장됐었다.
//  · e-neurospine.org 는 citation_pdf_url 이 없고 본문 PDF 는 onclick 의
//    journal_download('pdf', id, '파일.pdf') → /upload/pdf/파일.pdf 로만 나온다.
//    그래서 첫 .pdf 앵커 = Supplementary Table(1쪽)을 받았다. 참고문헌 칸의
//    다른 논문 PDF(link.springer.com …) 링크도 같은 페이지에 깔려 있다.
export const PICK_PDF_URL_JS = String.raw`function pickPdfUrl(input) {
  var abs = function (u) { try { return u ? new URL(u, input.base).href : null } catch (e) { return null } };
  var site = function (u) {
    try {
      var parts = new URL(u).hostname.split('.');
      var n = parts.length;
      var sld = parts[n - 2] || '';
      // co.kr · or.kr · ac.uk 같은 2단 국가 도메인은 한 칸 더 본다
      var keep = (parts[n - 1].length === 2 && /^(co|or|ac|go|re|ne|com|org|net|edu)$/.test(sld)) ? 3 : 2;
      return parts.slice(-keep).join('.');
    } catch (e) { return '' }
  };
  var SUPP = /supplement|suppl[-_.\/]|_esm\d*\.|mmc\d+\.|\/media\/|appendix/i;
  var PDFLIKE = /\.pdf($|[?#])|\/e?pdf\/|pdfft|type=printable|\/pdfdirect\/|\/downloadpdf\//i;
  var fix = function (u) { return u ? u.replace('/previewpdf/', '/downloadpdf/') : u };
  var home = site(input.base);

  var meta = fix(abs(input.citationPdfUrl));
  if (meta && !SUPP.test(meta)) return meta;

  var files = input.downloadFiles || [];
  for (var i = 0; i < files.length; i++) {
    if (!SUPP.test(files[i])) return abs('/upload/pdf/' + files[i]);
  }

  var anchors = input.anchors || [];
  for (var j = 0; j < anchors.length; j++) {
    var a = anchors[j];
    if (a.inRefs) continue;
    var u = abs(a.href);
    if (!u || !PDFLIKE.test(u) || SUPP.test(u)) continue;
    if (site(u) !== home) continue;
    return fix(u);
  }
  return null;
}`

export interface PickPdfInput {
  base: string
  citationPdfUrl: string | null
  downloadFiles?: string[]
  anchors?: Array<{ href: string; inRefs?: boolean }>
}

/** PICK_PDF_URL_JS 를 Node 에서 쓸 수 있게 되살린다(테스트용). */
export function loadPickPdfUrl(): (input: PickPdfInput) => string | null {
  return new Function(`return (${PICK_PDF_URL_JS})`)()
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
  // 소스를 그대로 박아 넣는다 — 페이지 안에서 new Function 을 쓰면 출판사 CSP 에 막힐 수 있다.
  const pickPdfUrl = ${PICK_PDF_URL_JS};

  const meta = document.querySelector('meta[name="citation_pdf_url"]');
  const downloadFiles = Array.from(document.querySelectorAll('[onclick*="journal_download"]'))
    .map((el) => {
      const m = (el.getAttribute('onclick') || '').match(/journal_download\\(\\s*'pdf'\\s*,[^,]*,\\s*'([^']+)'/);
      return m ? m[1] : null;
    })
    .filter(Boolean);
  const anchors = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
    href: a.getAttribute('href'),
    inRefs: !!a.closest('[name="jats-ref-pub"], .references, #references, .ref-list, .reference, ol.refs'),
  }));
  const pdfUrl = pickPdfUrl({
    base: location.href,
    citationPdfUrl: meta ? meta.getAttribute('content') : null,
    downloadFiles,
    anchors,
  });

  if (!pdfUrl) return { ok:false, reason:'no-pdf-url', ...diag };
  try {
    const r = await fetch(pdfUrl, { credentials:'include' });
    if (!r.ok) return { ok:false, reason:'fetch-'+r.status, pdfUrl, ...diag };
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin=''; for (let i=0;i<buf.length;i++) bin+=String.fromCharCode(buf[i]);
    return { ok:true, b64: btoa(bin), pdfUrl: r.url || pdfUrl };
  } catch(e) { return { ok:false, reason:String(e && e.message || e), pdfUrl, ...diag }; }
});
try { await p.close(); } catch(e) {}
console.log('ASIDE_RESULT '+JSON.stringify(res));
`
}

// ─── 받은 PDF 가 정말 본문인가 ───
//
// 예전엔 %PDF 매직바이트만 봤다. 미리보기·보충자료도 PDF 라서 전부 "확보"로 찍혔다.

/** PDF 쪽수. 페이지 객체가 압축 스트림 안에 숨어 있어 셀 수 없으면 null. */
export function countPdfPages(buf: Buffer): number | null {
  const text = buf.toString("latin1")
  const n = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length
  return n > 0 ? n : null
}

// 원래 1~2쪽인 게 정상인 글 종류. 이것들만 짧아도 통과시킨다.
const SHORT_FORM = /editorial|letter|comment|errat|correspond|reply|corrigend|retract/i

export function assessFulltext(
  buf: Buffer,
  ctx: { pdfUrl?: string | null; pubType?: string | null }
): { ok: true; pages: number | null } | { ok: false; reason: string } {
  const url = ctx.pdfUrl ?? ""
  if (/\/previewpdf\//i.test(url)) return { ok: false, reason: `미리보기 PDF(본문 아님): ${url}` }
  if (/supplement|suppl[-_.\/]|_esm\d*\.|mmc\d+\./i.test(url)) {
    return { ok: false, reason: `보충자료 PDF(본문 아님): ${url}` }
  }
  const pages = countPdfPages(buf)
  if (pages !== null && pages <= 2 && !SHORT_FORM.test(ctx.pubType ?? "")) {
    return {
      ok: false,
      reason: `${pages}쪽뿐 — 미리보기/보충자료로 보여 저장하지 않음${url ? `: ${url}` : ""}`,
    }
  }
  return { ok: true, pages }
}

export interface AsideResult {
  ok: boolean
  b64?: string
  /** 실제로 받아온 PDF 주소(리다이렉트 후). 미리보기/보충자료 판정에 쓴다. */
  pdfUrl?: string
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
