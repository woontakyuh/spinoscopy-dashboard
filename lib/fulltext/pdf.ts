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
