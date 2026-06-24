// 맥 mini 전용 소셜 수집기 — Aside CLI(`aside repl`) 기반.
// Aside 브라우저의 로그인 세션을 그대로 사용하므로 X·Threads 모두 "인증 상태"로 수집
// (로그아웃 우회/레이트리밋 없음). 수집 → Notion "Social Feed" DB에 신규만 적재.
//
// 전제: 맥에 Aside 앱이 실행 중 + 해당 계정으로 X·Threads(인스타) 로그인 + `aside` CLI(PATH)
// 필요 env: NOTION_TOKEN, NOTION_SOCIAL_DB_ID
// 실행: node collect.mjs   (launchd 1h)

import { execFileSync } from "node:child_process"
import {
  dedupeByPostId,
  normalizeDate,
  toNotionProperties,
  cleanThreadText,
  sinceDate,
  withinSince,
} from "./normalize.mjs"

const NOTION_TOKEN = process.env.NOTION_TOKEN
const NOTION_DB = process.env.NOTION_SOCIAL_DB_ID
const NOTION_BASE = "https://api.notion.com/v1"
const NOTION_HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
}

const SINCE_DAYS = 7
const ACCOUNTS = {
  threads: [
    "choi.openai",
    "unclejobs.ai",
    "roach_log",
    "tofukyung",
    "asin_cartel",
    "darkest_alex",
    "aimaster3658",
  ],
  x: ["karpathy"],
}

function log(...a) {
  console.log(`[social-collector ${new Date().toISOString()}]`, ...a)
}

// ─── Aside REPL 실행 → ASIDE_RESULT 마커 줄의 JSON 반환 ───
function asideRepl(code) {
  const out = execFileSync("aside", ["repl", code], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 150000,
  })
  const line = out.split("\n").find((l) => l.startsWith("ASIDE_RESULT "))
  if (!line) throw new Error("ASIDE_RESULT 없음 (repl 출력 파싱 실패)")
  return JSON.parse(line.slice("ASIDE_RESULT ".length))
}

// 공통: 스크롤하며 누적 수집하는 repl 코드 빌더
function scrollCollectCode(url, extractBody, cutoff) {
  return `
const p = await openTab(${JSON.stringify(url)});
await sleep(6500);
const seen = {};
const CUTOFF = ${JSON.stringify(cutoff)};
for (let i=0;i<30;i++){
  const batch = await p.evaluate(()=>{ ${extractBody} });
  // 새로 추가된 '최근(cutoff 이내)' 글 수. 오래된 고정글은 여기 안 셈 → 조기중단 방지.
  let addedFresh=0;
  batch.forEach(r=>{ if(r && r.postId && !seen[r.postId]){ seen[r.postId]=r; const d=(r.at||'').slice(0,10); if(d && d >= CUTOFF) addedFresh++; } });
  await p.evaluate(()=>window.scrollBy(0, 5000));
  await sleep(1700);
  // 워밍업 후, 한 바퀴 돌아도 최근 글이 더 안 늘면 7일 윈도우를 다 본 것 → 종료
  if(addedFresh===0 && i>=3) break;
}
try { await p.close(); } catch(e) {}
console.log('ASIDE_RESULT '+JSON.stringify(Object.values(seen)));
`
}

const THREADS_EXTRACT = `
  const out=[];
  document.querySelectorAll('[data-pressable-container]').forEach(el=>{
    const text=(el.innerText||'').trim(); if(!text||text.length<10) return;
    const a=el.querySelector('a[href*="/post/"]'); const href=a?a.getAttribute('href'):null;
    const m=href?href.match(/\\/post\\/([A-Za-z0-9_-]+)/):null; if(!m) return;
    const time=el.querySelector('time[datetime]');
    // 프로필 사진: 프로필 링크(/@handle) 안의 img 우선, 없으면 첫 IG 이미지
    let avatar='';
    el.querySelectorAll('a[href^="/@"]').forEach(an=>{ if(avatar) return; const h=an.getAttribute('href')||''; if(/^\\/@[^/]+\\/?$/.test(h)){ const im=an.querySelector('img'); if(im) avatar=im.src; } });
    if(!avatar){ const im=el.querySelector('img[src*="cdninstagram"],img[src*="fbcdn"]'); if(im) avatar=im.src; }
    out.push({postId:m[1], text, url:href.startsWith('http')?href:'https://www.threads.com'+href, at:time?time.getAttribute('datetime'):'', avatar});
  });
  return out;`

const X_EXTRACT = `
  const out=[];
  document.querySelectorAll('article[data-testid="tweet"]').forEach(a=>{
    const t=a.querySelector('[data-testid="tweetText"]');
    const time=a.querySelector('time');
    const link=time&&time.closest('a')?time.closest('a').href:'';
    const m=link.match(/status\\/(\\d+)/); if(!m) return;
    const im=a.querySelector('img[src*="profile_images"]');
    out.push({postId:m[1], text:(t?t.innerText:'').trim(), url:link, at:time?time.getAttribute('datetime'):'', avatar:im?im.src:''});
  });
  return out;`

function collectThreads(account, cutoff) {
  const raw = asideRepl(scrollCollectCode(`https://www.threads.com/@${account}`, THREADS_EXTRACT, cutoff))
  return raw
    .map((r) => ({
      platform: "threads",
      account,
      postId: r.postId,
      text: cleanThreadText(r.text, account),
      url: r.url,
      postedAt: normalizeDate(r.at),
      avatar: r.avatar || "",
    }))
    .filter((it) => withinSince(it, cutoff))
}

function collectX(handle, cutoff) {
  const raw = asideRepl(scrollCollectCode(`https://x.com/${handle}`, X_EXTRACT, cutoff))
  return raw
    .map((r) => ({
      platform: "x",
      account: handle,
      postId: r.postId,
      text: (r.text || "").trim(),
      url: r.url || `https://x.com/${handle}/status/${r.postId}`,
      postedAt: normalizeDate(r.at),
      avatar: r.avatar || "",
    }))
    .filter((it) => it.text && withinSince(it, cutoff))
}

// ─── Notion ───
async function fetchExistingPostIds(limit = 100) {
  const res = await fetch(`${NOTION_BASE}/databases/${NOTION_DB}/query`, {
    method: "POST",
    headers: NOTION_HEADERS,
    body: JSON.stringify({ page_size: limit, sorts: [{ property: "CollectedAt", direction: "descending" }] }),
  })
  if (!res.ok) throw new Error(`Notion query ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.results ?? [])
    .map((p) => (p.properties?.PostId?.rich_text ?? []).map((r) => r.plain_text ?? "").join(""))
    .filter(Boolean)
}

async function insertPage(item, collectedAtISO) {
  const res = await fetch(`${NOTION_BASE}/pages`, {
    method: "POST",
    headers: NOTION_HEADERS,
    body: JSON.stringify({ parent: { database_id: NOTION_DB }, properties: toNotionProperties(item, collectedAtISO) }),
  })
  if (!res.ok) throw new Error(`Notion insert ${res.status}: ${await res.text()}`)
}

function gather(platform, fn, handles, cutoff) {
  const all = []
  for (const h of handles) {
    try {
      const items = fn(h, cutoff)
      log(`${platform} @${h}: ${items.length}건 수집`)
      all.push(...items)
    } catch (e) {
      log(`${platform} @${h} 실패 (스킵):`, e.message)
    }
  }
  return all
}

async function main() {
  if (!NOTION_TOKEN || !NOTION_DB) {
    log("환경변수 누락: NOTION_TOKEN / NOTION_SOCIAL_DB_ID")
    process.exit(1)
  }
  const collectedAt = new Date().toISOString()
  const cutoff = sinceDate(SINCE_DAYS, Date.now())

  const collected = [
    ...gather("threads", collectThreads, ACCOUNTS.threads, cutoff),
    ...gather("x", collectX, ACCOUNTS.x, cutoff),
  ]
  log(`총 수집 ${collected.length}건 (cutoff ${cutoff})`)

  let existing = []
  try {
    existing = await fetchExistingPostIds(100)
  } catch (e) {
    log("기존 PostId 조회 실패 — 진행:", e.message)
  }

  const fresh = dedupeByPostId(collected, existing)
  log(`신규 ${fresh.length}건 적재 시작`)

  let ok = 0
  for (const item of fresh) {
    try {
      await insertPage(item, collectedAt)
      ok++
    } catch (e) {
      log("적재 실패 (스킵):", item.postId, e.message)
    }
  }
  log(`완료: ${ok}/${fresh.length}건 적재`)
}

main().catch((e) => {
  log("치명적 오류:", e)
  process.exit(1)
})
