/**
 * 드랍박스 수업 영상 → 노션 수련 기록 링크 연결.
 *
 *   npm run bjj:video-sync -- --dry-run   # 뭘 할지만 보여준다
 *   npm run bjj:video-sync                # 실제로 쓴다
 *
 * 조인 키는 날짜다. 폴더명이 이미 `2026-08-19` 이고 노션 기록도 날짜를 가지니
 * 파일·폴더 이름을 하나도 바꾸지 않는다. 링크는 폴더 단위로 만든다 — 이유는
 * lib/bjj-video/index.ts 주석 참고.
 *
 * 멱등하다. 이미 같은 링크가 박혀 있으면 노션을 건드리지 않고, 드랍박스에
 * 공유 링크가 이미 있으면 새로 만들지 않고 기존 것을 가져온다.
 */
import dns from "node:dns"
import { notionRequest } from "../lib/notion/client"

// IPv6 로 먼저 붙었다가 간헐적으로 죽는 걸 봤다. 네트워크를 많이 치는
// 스크립트라 IPv4 를 우선한다.
dns.setDefaultResultOrder("ipv4first")

/** 일시적 네트워크 실패를 몇 번 되짚는다 */
async function retry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown
  for (let i = 1; i <= tries; i++) {
    try { return await fn() } catch (e) {
      last = e
      if (i === tries) break
      const wait = 400 * 2 ** (i - 1)
      console.log(`  … ${label} 재시도 ${i}/${tries - 1} (${wait}ms)`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw last
}
import {
  folderDate, countClips, normalizeShareUrl, videoLabel,
  type ClassVideoFolder,
} from "../lib/bjj-video"

const VIDEO_ROOT = process.env.DROPBOX_BJJ_CLASS_DIR ?? "/Tak/3. 주짓수/2. 수업영상"
const DRY = process.argv.includes("--dry-run")

// ─── Dropbox ───

let tokenCache: { token: string; exp: number } = { token: "", exp: 0 }

async function accessToken(): Promise<string> {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token
  const { DROPBOX_APP_KEY: key, DROPBOX_APP_SECRET: secret, DROPBOX_REFRESH_TOKEN: refresh } = process.env
  if (!key || !secret || !refresh) {
    throw new Error("DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN 이 필요하다")
  }
  const res = await retry("토큰 갱신", () => fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  }))
  if (!res.ok) throw new Error(`드랍박스 토큰 갱신 실패: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { access_token: string; expires_in?: number }
  // 만료 1분 전에 갱신한다
  tokenCache = { token: json.access_token, exp: Date.now() + ((json.expires_in ?? 14400) - 60) * 1000 }
  return tokenCache.token
}

async function dbx<T>(endpoint: string, body: unknown): Promise<{ ok: boolean; status: number; json: T }> {
  return retry(endpoint, async () => {
    const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return { ok: res.ok, status: res.status, json: (await res.json()) as T }
  })
}

interface DbxList { entries: { name: string; path_display?: string; [".tag"]?: string }[]; has_more: boolean; cursor?: string }

async function listAll(path: string): Promise<DbxList["entries"]> {
  const out: DbxList["entries"] = []
  let r = await dbx<DbxList>("files/list_folder", { path, limit: 2000 })
  if (!r.ok) throw new Error(`폴더 조회 실패 ${path}: ${JSON.stringify(r.json).slice(0, 200)}`)
  out.push(...r.json.entries)
  while (r.json.has_more && r.json.cursor) {
    r = await dbx<DbxList>("files/list_folder/continue", { cursor: r.json.cursor })
    if (!r.ok) break
    out.push(...r.json.entries)
  }
  return out
}

/** 공유 링크를 가져오거나 없으면 만든다 (멱등) */
async function shareLink(path: string): Promise<string> {
  const existing = await dbx<{ links: { url: string }[] }>("sharing/list_shared_links", { path, direct_only: true })
  if (existing.ok && existing.json.links?.length) return normalizeShareUrl(existing.json.links[0].url)

  const made = await dbx<{ url?: string; error_summary?: string }>("sharing/create_shared_link_with_settings", { path })
  if (made.ok && made.json.url) return normalizeShareUrl(made.json.url)

  // 경합으로 그 사이에 생겼을 수 있다 — 한 번 더 읽어본다
  if (made.json.error_summary?.includes("shared_link_already_exists")) {
    const again = await dbx<{ links: { url: string }[] }>("sharing/list_shared_links", { path, direct_only: true })
    if (again.ok && again.json.links?.length) return normalizeShareUrl(again.json.links[0].url)
  }
  throw new Error(`공유 링크 실패 ${path}: ${JSON.stringify(made.json).slice(0, 200)}`)
}

// ─── Notion ───

interface NotionPage {
  id: string
  properties: Record<string, { date?: { start?: string }; url?: string; number?: number }>
}

async function allSessions(dbId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let cursor: string | undefined
  do {
    const r = await notionRequest<{ results: NotionPage[]; has_more: boolean; next_cursor?: string }>(
      `/databases/${dbId}/query`,
      { method: "POST", body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }) },
    )
    pages.push(...r.results)
    cursor = r.has_more ? r.next_cursor : undefined
  } while (cursor)
  return pages
}

/** 이 스크립트가 쓰는 속성이 DB 에 없으면 만든다 */
async function ensureProperties(dbId: string): Promise<void> {
  const db = await notionRequest<{ properties: Record<string, unknown> }>(`/databases/${dbId}`)
  const missing: Record<string, unknown> = {}
  if (!db.properties["Class Video"]) missing["Class Video"] = { url: {} }
  if (!db.properties["Class Video Count"]) missing["Class Video Count"] = { number: {} }
  if (Object.keys(missing).length === 0) return
  console.log(`  노션 속성 추가: ${Object.keys(missing).join(", ")}`)
  if (DRY) return
  await notionRequest(`/databases/${dbId}`, { method: "PATCH", body: JSON.stringify({ properties: missing }) })
}

// ─── main ───

async function main() {
  const dbId = process.env.NOTION_BJJ_DB_ID
  if (!dbId) throw new Error("NOTION_BJJ_DB_ID 가 없다")
  if (DRY) console.log("※ dry-run — 아무것도 쓰지 않는다\n")

  console.log(`드랍박스 스캔: ${VIDEO_ROOT}`)
  const top = await listAll(VIDEO_ROOT)
  const folders: ClassVideoFolder[] = []
  for (const e of top) {
    if (e[".tag"] !== "folder") continue
    const date = folderDate(e.name)
    if (!date) { console.log(`  건너뜀(날짜 아님): ${e.name}`); continue }
    const inner = await listAll(e.path_display ?? `${VIDEO_ROOT}/${e.name}`)
    folders.push({ date, path: e.path_display ?? `${VIDEO_ROOT}/${e.name}`, clipCount: countClips(inner) })
  }
  folders.sort((a, b) => a.date.localeCompare(b.date))
  console.log(`  영상 폴더 ${folders.length}개 / 클립 ${folders.reduce((s, f) => s + f.clipCount, 0)}개\n`)

  await ensureProperties(dbId)

  const pages = await allSessions(dbId)
  // 영상 폴더는 날짜 단위이므로, 그 날 기록이 여러 건이면(수업+오픈매트 등)
  // 전부에 붙인다. 하나에만 붙이면 다른 쪽을 보다가 "영상 없네" 하게 된다.
  const byDate = new Map<string, NotionPage[]>()
  for (const p of pages) {
    const d = p.properties.Date?.date?.start?.slice(0, 10)
    if (!d) continue
    const list = byDate.get(d)
    if (list) list.push(p)
    else byDate.set(d, [p])
  }
  console.log(`노션 수련 기록 ${pages.length}건 (고유 날짜 ${byDate.size}개)\n`)

  let linked = 0, skipped = 0, orphan = 0
  for (const f of folders) {
    // 빈 폴더가 먼저다 — 영상이 없으면 노션 기록 유무는 따질 것도 없다
    if (f.clipCount === 0) { console.log(`  · ${f.date}  빈 폴더 — 건너뜀`); skipped++; continue }

    const targets = byDate.get(f.date)
    if (!targets || targets.length === 0) {
      console.log(`  ⚠ ${f.date}  클립 ${f.clipCount}개 — 노션 기록 없음`)
      orphan++
      continue
    }

    const stale = targets.filter(
      (p) => p.properties["Class Video Count"]?.number !== f.clipCount || !p.properties["Class Video"]?.url,
    )
    if (stale.length === 0) { console.log(`  = ${f.date}  이미 연결됨`); skipped++; continue }

    const url = DRY ? "(dry-run)" : await shareLink(f.path)
    if (!DRY) {
      for (const p of stale) {
        await notionRequest(`/pages/${p.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            properties: {
              "Class Video": { url },
              "Class Video Count": { number: f.clipCount },
            },
          }),
        })
      }
    }
    const extra = targets.length > 1 ? ` (기록 ${stale.length}/${targets.length}건)` : ""
    console.log(`  ✓ ${f.date}  ${videoLabel(f.clipCount)}${extra}`)
    linked++
  }

  console.log(`\n연결 ${linked} · 변경없음 ${skipped} · 노션기록없음 ${orphan}`)
  if (orphan > 0) {
    console.log(`\n노션 기록이 없는 폴더는 링크를 걸 곳이 없다. 그 날 수련 기록을`)
    console.log(`노션에 만들면 다음 실행 때 자동으로 붙는다.`)
  }
}

main().catch((e) => { console.error(`\n실패: ${e.message}`); process.exit(1) })
