// public/dakota/by-outfit/{category}/*.{png,jpg,jpeg,webp} 스캔 →
// public/dakota/manifest.json 저장.
//
// 카테고리 = 최상위 폴더명 (office / outside / home / dress ...)
// variant  = 파일명에서 숫자 제거한 prefix (blacksuit1.png → "blacksuit")
//
// 출력 구조:
//   { office: { _all: [...], blacksuit: [...], office: [...], ... },
//     outside: { _all: [...], ... }, ... }
//
// prebuild 훅에서 자동 실행.

import { readdirSync, writeFileSync, statSync } from "node:fs"
import path from "node:path"

const ROOT = path.join(process.cwd(), "public", "dakota")
const BY_OUTFIT = path.join(ROOT, "by-outfit")
const VALID_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])

function getVariant(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "")
  // 끝 숫자 제거 → prefix 가 variant
  const v = base.replace(/\d+$/, "").replace(/[_\-\s]+$/, "").toLowerCase()
  return v || "default"
}

interface CategoryManifest {
  _all: string[]
  [variant: string]: string[]
}

type Manifest = Record<string, CategoryManifest>

const manifest: Manifest = {}

let categoryDirs: string[] = []
try {
  categoryDirs = readdirSync(BY_OUTFIT).filter((name) => {
    if (name.startsWith(".")) return false
    return statSync(path.join(BY_OUTFIT, name)).isDirectory()
  })
} catch {
  console.warn(`No by-outfit dir found at ${BY_OUTFIT}`)
}

for (const category of categoryDirs) {
  const dir = path.join(BY_OUTFIT, category)
  const files = readdirSync(dir)
    .filter((f) => VALID_EXT.has(path.extname(f).toLowerCase()))
    .filter((f) => !f.startsWith("."))
    .sort()

  const catManifest: CategoryManifest = { _all: [] }
  for (const f of files) {
    const webPath = `/dakota/by-outfit/${category}/${f}`
    catManifest._all.push(webPath)
    const variant = getVariant(f)
    if (!catManifest[variant]) catManifest[variant] = []
    catManifest[variant].push(webPath)
  }
  manifest[category] = catManifest
}

const out = path.join(ROOT, "manifest.json")
writeFileSync(out, JSON.stringify(manifest, null, 2), "utf-8")

console.log(`✓ wrote ${out}`)
let totalFiles = 0
for (const [cat, cm] of Object.entries(manifest)) {
  totalFiles += cm._all.length
  const variants = Object.keys(cm).filter((k) => k !== "_all")
  console.log(`  ${cat}: ${cm._all.length} files · ${variants.length} variants (${variants.join(", ")})`)
}
console.log(`  total: ${totalFiles} files across ${categoryDirs.length} categories`)
