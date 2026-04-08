// Dakota 사진 풀에서 (출근 여부 + 시간대 + 그날 variant) 기반으로 결정적 픽
import manifest from "@/public/dakota/manifest.json"
import outfitMap from "@/public/dakota/outfit-map.json"

export type WorkSlot = "dawn" | "pre" | "morning" | "lunch" | "afternoon" | "evening" | "night"
export type OffSlot = "slowmorning" | "day" | "evening" | "night"
export type DakotaSlot = WorkSlot | OffSlot
export type DakotaMode = "work" | "off"

const FALLBACKS: Record<string, string> = {
  // work
  dawn: "/dakota-evening.png",
  pre: "/dakota-morning.png",
  morning: "/dakota-morning.png",
  lunch: "/dakota-afternoon.png",
  afternoon: "/dakota-afternoon.png",
  // off
  slowmorning: "/dakota-morning.png",
  day: "/dakota-afternoon.png",
  // 공통
  evening: "/dakota-evening.png",
  night: "/dakota-evening.png",
}

function getSeoulMinutes(date: Date): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(date)
  )
  const minute = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      minute: "2-digit",
    }).format(date)
  )
  return hour * 60 + minute
}

function getWorkSlot(date: Date): WorkSlot {
  const hm = getSeoulMinutes(date)
  if (hm < 5 * 60) return "dawn"
  if (hm < 8 * 60) return "pre"
  if (hm < 12 * 60) return "morning"
  if (hm < 13 * 60 + 30) return "lunch"
  if (hm < 18 * 60) return "afternoon"
  if (hm < 21 * 60) return "evening"
  return "night"
}

function getOffSlot(date: Date): OffSlot {
  const hm = getSeoulMinutes(date)
  if (hm < 10 * 60) return "slowmorning"
  if (hm < 17 * 60) return "day"
  if (hm < 21 * 60) return "evening"
  return "night"
}

export function getSlot(date: Date, mode: DakotaMode = "work"): DakotaSlot {
  return mode === "off" ? getOffSlot(date) : getWorkSlot(date)
}

export function dateKeySeoul(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date)
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface OutfitVariants {
  [variant: string]: string[]
}

interface ManifestShape {
  outfits: Record<string, OutfitVariants>
}

interface OutfitMapShape {
  work: Record<string, string[]>
  off: Record<string, string[]>
}

function getOutfitsForSlot(mode: DakotaMode, slot: DakotaSlot): string[] {
  const map = (outfitMap as unknown as OutfitMapShape)[mode]
  return (map?.[slot as string] ?? []) as string[]
}

/** 같은 날엔 한 outfit 안에서 같은 variant만 등장 */
export function pickDakotaPhoto(mode: DakotaMode, slot: DakotaSlot, dateKey: string): string {
  const m = (manifest as unknown as ManifestShape).outfits ?? {}
  const outfits = getOutfitsForSlot(mode, slot)

  // 1) 각 outfit에 대해 오늘의 variant 결정 → 그 variant의 파일들만 풀에 추가
  const candidates: string[] = []
  for (const outfit of outfits) {
    const variants = m[outfit]
    if (!variants) continue
    const variantNames = Object.keys(variants).filter((v) => variants[v].length > 0)
    if (variantNames.length === 0) continue
    const variantIdx = hashString(`${dateKey}-${outfit}-variant`) % variantNames.length
    const todayVariant = variantNames[variantIdx]
    candidates.push(...variants[todayVariant])
  }

  if (candidates.length === 0) return FALLBACKS[slot] ?? "/dakota-morning.png"

  // 2) 슬롯+날짜 시드로 최종 1장 픽
  const idx = hashString(`${dateKey}-${mode}-${slot}`) % candidates.length
  return candidates[idx]
}

/** weekday 기본 휴리스틱 — 월~금=work, 토일=off */
export function defaultWorkdayMode(date: Date = new Date()): DakotaMode {
  const dow = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      weekday: "short",
    })
      .format(date)
      .replace(/Sun/, "0")
      .replace(/Mon/, "1")
      .replace(/Tue/, "2")
      .replace(/Wed/, "3")
      .replace(/Thu/, "4")
      .replace(/Fri/, "5")
      .replace(/Sat/, "6")
  )
  if (dow >= 1 && dow <= 5) return "work"
  return "off"
}

export function workdayOverrideKey(dateKey: string): string {
  return `dakota-workday-${dateKey}`
}
