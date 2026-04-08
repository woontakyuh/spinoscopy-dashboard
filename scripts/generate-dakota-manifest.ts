// public/dakota/{work,off}/{slot}/*.{png,jpg,jpeg,webp} 를 스캔해
// public/dakota/manifest.json 으로 저장.
// 빌드 전에 한 번 실행하면 됨 (npm run dev / build 자동화는 prebuild로 추가).

import { readdirSync, writeFileSync, statSync } from "node:fs"
import path from "node:path"

const ROOT = path.join(process.cwd(), "public", "dakota")
const WORK_SLOTS = ["dawn", "pre", "morning", "lunch", "afternoon", "evening", "night"] as const
const OFF_SLOTS = ["slowmorning", "day", "evening", "night"] as const
const SLOTS_BY_MODE = { work: WORK_SLOTS, off: OFF_SLOTS } as const
const MODES = ["work", "off"] as const
const VALID_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])

type Manifest = Record<string, Record<string, string[]>>

const manifest: Manifest = { work: {}, off: {} }

for (const mode of MODES) {
  for (const slot of SLOTS_BY_MODE[mode]) {
    const dir = path.join(ROOT, mode, slot)
    let files: string[] = []
    try {
      const stat = statSync(dir)
      if (stat.isDirectory()) {
        files = readdirSync(dir)
          .filter((f) => VALID_EXT.has(path.extname(f).toLowerCase()))
          .filter((f) => !f.startsWith("."))
          .sort()
          .map((f) => `/dakota/${mode}/${slot}/${f}`)
      }
    } catch {
      // 폴더 없음 — 빈 배열
    }
    manifest[mode][slot] = files
  }
}

const out = path.join(ROOT, "manifest.json")
writeFileSync(out, JSON.stringify(manifest, null, 2), "utf-8")

const totals = MODES.map(
  (m) => `${m}: ${SLOTS_BY_MODE[m].reduce((sum, s) => sum + manifest[m][s].length, 0)}`
).join(", ")
console.log(`✓ wrote ${out}`)
console.log(`  totals — ${totals}`)
