// public/dakota/by-outfit/{outfit}/*.{png,jpg,jpeg,webp} 를 스캔해
// public/dakota/manifest.json 으로 저장.
//
// 파일명에서 variant 추출: 첫 숫자 이전 글자가 variant 이름.
//   black1.png  → variant "black"
//   red_2.png   → variant "red"
//   dakota.png  → variant "dakota" (숫자 없음)
//   1.png       → variant "default"
//
// 빌드 전에 한 번 실행. (npm run build에 prebuild 훅으로 들어가 있음)

import { readdirSync, writeFileSync, statSync } from "node:fs"
import path from "node:path"

const ROOT = path.join(process.cwd(), "public", "dakota")
const BY_OUTFIT = path.join(ROOT, "by-outfit")
const VALID_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])

function getVariant(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "")
  const m = base.match(/^([^\d]+)/)
  if (!m) return "default"
  const v = m[1].replace(/[_\-\s]+$/, "").toLowerCase()
  return v || "default"
}

interface ManifestOutfit {
  // variant name → file paths (web-relative)
  [variant: string]: string[]
}

interface Manifest {
  outfits: Record<string, ManifestOutfit>
}

const manifest: Manifest = { outfits: {} }

let outfitDirs: string[] = []
try {
  outfitDirs = readdirSync(BY_OUTFIT).filter((name) => {
    if (name.startsWith(".")) return false
    return statSync(path.join(BY_OUTFIT, name)).isDirectory()
  })
} catch {
  console.warn(`No by-outfit dir found at ${BY_OUTFIT}`)
}

for (const outfit of outfitDirs) {
  const dir = path.join(BY_OUTFIT, outfit)
  const files = readdirSync(dir)
    .filter((f) => VALID_EXT.has(path.extname(f).toLowerCase()))
    .filter((f) => !f.startsWith("."))
    .sort()

  const byVariant: ManifestOutfit = {}
  for (const f of files) {
    const v = getVariant(f)
    if (!byVariant[v]) byVariant[v] = []
    byVariant[v].push(`/dakota/by-outfit/${outfit}/${f}`)
  }
  manifest.outfits[outfit] = byVariant
}

const out = path.join(ROOT, "manifest.json")
writeFileSync(out, JSON.stringify(manifest, null, 2), "utf-8")

const totalFiles = Object.values(manifest.outfits).reduce(
  (sum, byVar) => sum + Object.values(byVar).reduce((s, files) => s + files.length, 0),
  0
)
const summary = Object.entries(manifest.outfits)
  .map(([outfit, byVar]) => {
    const variants = Object.entries(byVar)
      .map(([v, files]) => `${v}(${files.length})`)
      .join(", ")
    return `  ${outfit}: ${variants || "(empty)"}`
  })
  .join("\n")

console.log(`✓ wrote ${out}`)
console.log(`  ${outfitDirs.length} outfits, ${totalFiles} total files`)
if (totalFiles > 0) console.log(summary)
