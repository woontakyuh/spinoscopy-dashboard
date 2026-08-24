#!/usr/bin/env node
/**
 * 캐릭터 전신 이미지를 대시보드용으로 정규화한다.
 *
 *   npm run character:build -- <사진.png> --out tak-gi-purple
 *   npm run character:build -- <사진.png> --check          # 측정만, 파일은 안 씀
 *
 * 왜 얼굴로 맞추나 —
 *   키(머리~발끝)로 맞추면 안 된다. 숙인 자세는 그 길이가 짧으므로
 *   숙인 사진이 확대되고 서 있는 사진이 축소되는 꼴이 된다.
 *   자세와 무관하게 크기가 같은 건 얼굴뿐이다. macOS Vision 으로
 *   얼굴 높이와 눈 사이 거리를 재서, 둘의 평균으로 배율을 잡는다.
 *
 * 입력에 알파가 없으면 macOS Vision 으로 누끼를 딴다.
 * 직접 딴 누끼가 있으면 그걸 쓰는 게 낫다 (자동 추출은 경계가 거칠 때가 있다).
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")
const REF = JSON.parse(readFileSync(join(HERE, "reference.json"), "utf8"))

function bin(name) {
  const out = join(HERE, ".bin", name)
  if (!existsSync(out)) {
    mkdirSync(join(HERE, ".bin"), { recursive: true })
    process.stderr.write(`  ${name} 빌드 중...\n`)
    execFileSync("swiftc", ["-O", join(HERE, `${name}.swift`), "-o", out], { stdio: "inherit" })
  }
  return out
}

/** Vision 얼굴 측정 → { faceH, ipd } */
function measureFace(path) {
  const out = execFileSync(bin("faceinfo"), [path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  const line = out.split("\n").find((l) => l.startsWith("faceW="))
  if (!line) throw new Error(`얼굴을 못 찾았다: ${path}\n${out}`)
  const get = (k) => Number(line.match(new RegExp(`${k}=(-?[\\d.]+)`))?.[1])
  const faceH = get("faceH"), ipd = get("ipd")
  if (!faceH || ipd <= 0) throw new Error(`얼굴 측정 실패 (faceH=${faceH} ipd=${ipd}): ${path}`)
  return { faceH, ipd }
}

/** 알파가 없으면 Vision 으로 누끼를 딴다 */
async function ensureAlpha(path) {
  const meta = await sharp(path).metadata()
  if (meta.hasAlpha) return path
  const cut = join(HERE, ".bin", "cut.png")
  process.stderr.write("  알파가 없다 → Vision 으로 누끼 추출\n")
  execFileSync(bin("cutout"), [path, cut], { stdio: "inherit" })
  return cut
}

/** 알파 > 0 인 영역의 bbox */
async function alphaBBox(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error(`투명한 이미지다: ${path}`)
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

const argv = process.argv.slice(2)
const input = argv.find((a) => !a.startsWith("--"))
const check = argv.includes("--check")
const outName = argv[argv.indexOf("--out") + 1]

if (!input || (!check && !argv.includes("--out"))) {
  console.error("사용법: npm run character:build -- <사진> --out tak-gi-purple  [--check]")
  process.exit(2)
}

const srcPath = resolve(input)
const withAlpha = await ensureAlpha(srcPath)
const { faceH, ipd } = measureFace(withAlpha)

// 두 기준의 평균 — 하나가 검출 노이즈를 타도 다른 하나가 잡아준다
const scale = 0.5 * (REF.target.faceHeight / faceH + REF.target.ipd / ipd)
const box = await alphaBBox(withAlpha)
const w = Math.round(box.width * scale), h = Math.round(box.height * scale)
const { width: CW, height: CH, bottomMargin } = REF.canvas

console.log(`입력      ${input}`)
console.log(`얼굴      높이 ${faceH.toFixed(1)}  눈사이 ${ipd.toFixed(1)}`)
console.log(`배율      ${scale.toFixed(4)}  (기준 얼굴높이 ${REF.target.faceHeight} / 눈사이 ${REF.target.ipd})`)
console.log(`피사체    ${box.width}x${box.height} → ${w}x${h}   키÷얼굴 ${(box.height / faceH).toFixed(2)}`)
console.log(`캔버스    ${CW}x${CH}`)

const fits = w <= CW && h <= CH - bottomMargin
if (!fits) {
  console.error(`\n⚠ 피사체가 캔버스를 넘는다 (${w}x${h} > ${CW}x${CH - bottomMargin}).`)
  console.error(`  reference.json 의 canvas 를 키워야 하는데, 그러면 기존 이미지도 전부 다시 만들어야 한다.`)
  if (!check) process.exit(1)
}
if (check) { console.log(`\n맞음 ✓`); process.exit(0) }

const outDir = join(REPO, REF.outputDir)
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `${outName}.webp`)

const subject = await sharp(withAlpha).extract(box).resize(w, h, { kernel: "lanczos3" }).png().toBuffer()
await sharp({ create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  // 가로 중앙, 발끝을 같은 바닥선에 — 숙인 자세는 그만큼 머리가 낮아진다
  .composite([{ input: subject, left: Math.round((CW - w) / 2), top: CH - bottomMargin - h }])
  .webp({ quality: REF.webp.quality, alphaQuality: REF.webp.alphaQuality })
  .toFile(outPath)

console.log(`\n생성      ${REF.outputDir}/${outName}.webp  (${Math.round(statSync(outPath).size / 1024)}KB)`)
console.log(`\n다음: lib/sensei/characterImage.ts 의 AVAILABLE_GI_BELTS 에 벨트를 추가할 것`)
