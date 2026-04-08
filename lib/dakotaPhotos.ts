// Dakota 사진 풀에서 (출근 여부 + 시간대) 기반으로 결정적 픽
import manifest from "@/public/dakota/manifest.json"

export type DakotaSlot = "dawn" | "pre" | "morning" | "lunch" | "afternoon" | "evening" | "night"
export type DakotaMode = "work" | "off"

const FALLBACKS: Record<string, string> = {
  dawn: "/dakota-evening.png",
  pre: "/dakota-morning.png",
  morning: "/dakota-morning.png",
  lunch: "/dakota-afternoon.png",
  afternoon: "/dakota-afternoon.png",
  evening: "/dakota-evening.png",
  night: "/dakota-evening.png",
}

export function getSlot(date: Date): DakotaSlot {
  // Asia/Seoul 기준 시간 계산
  const seoulHour = Number(
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
  const hm = seoulHour * 60 + minute

  if (hm >= 0 * 60 && hm < 5 * 60) return "dawn"
  if (hm >= 5 * 60 && hm < 8 * 60) return "pre"
  if (hm >= 8 * 60 && hm < 12 * 60) return "morning"
  if (hm >= 12 * 60 && hm < 13 * 60 + 30) return "lunch"
  if (hm >= 13 * 60 + 30 && hm < 18 * 60) return "afternoon"
  if (hm >= 18 * 60 && hm < 21 * 60) return "evening"
  return "night"
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

/** 매일 새 사진 — (날짜 + 슬롯) 시드. 같은 날 같은 슬롯이면 같은 사진. */
export function pickDakotaPhoto(mode: DakotaMode, slot: DakotaSlot, dateKey: string): string {
  const m = manifest as Record<string, Record<string, string[]>>
  const pool = m?.[mode]?.[slot] ?? []
  if (pool.length === 0) return FALLBACKS[slot] ?? "/dakota-morning.png"
  const idx = hashString(`${dateKey}-${mode}-${slot}`) % pool.length
  return pool[idx]
}

/** weekday 기본 휴리스틱 — 월~금=work, 토일=off */
export function defaultWorkdayMode(date: Date = new Date()): DakotaMode {
  const seoulDow = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      weekday: "short",
    }).format(date)
      .replace(/Sun/, "0")
      .replace(/Mon/, "1")
      .replace(/Tue/, "2")
      .replace(/Wed/, "3")
      .replace(/Thu/, "4")
      .replace(/Fri/, "5")
      .replace(/Sat/, "6")
  )
  if (seoulDow >= 1 && seoulDow <= 5) return "work"
  return "off"
}

/** localStorage override 키 */
export function workdayOverrideKey(dateKey: string): string {
  return `dakota-workday-${dateKey}`
}
