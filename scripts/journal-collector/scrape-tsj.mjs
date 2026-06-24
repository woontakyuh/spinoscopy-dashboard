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
