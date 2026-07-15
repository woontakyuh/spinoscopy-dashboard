// Dakota 사진 픽 로직 — 카테고리 기반 + 30분 버킷 회전.
//
// 폴더 구조:
//   public/dakota/by-outfit/office   — 출근 복장 (blacksuit / office / whitejacket)
//   public/dakota/by-outfit/outside  — 퇴근 후 외출복 (blackseethrough / blacktop / browny / meshtop)
//   public/dakota/by-outfit/home     — 집에서 (free)
//   public/dakota/by-outfit/dress    — 격식 드레스 (override 시에만 사용)
//
// 시간대 → slot:
//   00:00 - 06:00  home   (심야)
//   06:00 - 18:00  office (work 모드) / outside (off 모드)
//   18:00 - 22:00  outside (공통, 퇴근 후)
//   22:00 - 24:00  home   (밤)
//
// dress 는 자동 선택 안 함. Dakota 가 "드레스 입어" 등 요청을 받아
// {{OUTFIT:dress:blingdress}} 같은 태그 붙이면 override 로만 반영.

import manifest from "@/public/dakota/manifest.json"

export type DakotaSlot = "home" | "office" | "outside"
export type DakotaMode = "work" | "off"

interface CategoryManifest {
  _all: string[]
  [variant: string]: string[]
}

type ManifestShape = Record<string, CategoryManifest | undefined>

const M = manifest as unknown as ManifestShape

const FALLBACK = "/dakota-morning.png"

// 자동 노출용 safe pool.
// manifest의 _all은 보유 의상 전체 목록일 뿐, 첫 화면 적합성까지 의미하지 않는다.
// 첫 화면은 의료/업무 대시보드의 front door이므로 선정성·이벤트성·사적 home 컷은 제외한다.
const AUTO_SAFE_BY_SLOT: Record<DakotaSlot, string[]> = {
  office: [
    "/dakota/by-outfit/office/office19.png",
    "/dakota/by-outfit/office/office20.png",
    "/dakota/by-outfit/office/office21.png",
    "/dakota/by-outfit/office/whitejacket1.png",
    "/dakota/by-outfit/office/whitejacket2.png",
    "/dakota/by-outfit/office/whitejacket3.png",
    "/dakota/by-outfit/office/whitejacket4.png",
    "/dakota/by-outfit/office/whitejacket5.png",
    "/dakota/by-outfit/office/whitejacket6.png",
    "/dakota/by-outfit/office/whitejacket8.png",
  ],
  outside: [
    "/dakota/by-outfit/outside/blacktop2.png",
    "/dakota/by-outfit/outside/blacktop5.png",
    "/dakota/by-outfit/outside/blacktop7.png",
    "/dakota/by-outfit/outside/blacktop8.png",
  ],
  // 현재 home/free 컷은 첫 화면 자동 노출에는 부적합하므로 심야에도 안전한 office pool을 쓴다.
  home: [
    "/dakota/by-outfit/office/office21.png",
    "/dakota/by-outfit/office/whitejacket1.png",
    "/dakota/by-outfit/office/whitejacket2.png",
    "/dakota/by-outfit/office/whitejacket3.png",
    "/dakota/by-outfit/office/whitejacket6.png",
    "/dakota/by-outfit/office/whitejacket8.png",
  ],
}

function getSeoulHourMinute(date: Date): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(date),
  )
  const minute = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      minute: "2-digit",
    }).format(date),
  )
  return hour * 60 + minute
}

export function getSlot(date: Date, mode: DakotaMode = "work"): DakotaSlot {
  const hm = getSeoulHourMinute(date)
  // 06시 이후 첫 화면은 이미 업무 대시보드 맥락이라 home 사진을 쓰지 않는다.
  // 07시 첫 진입에서 사적인 home 컷이 뜨면 제품 첫인상이 깨진다.
  if (hm < 6 * 60 || hm >= 22 * 60) return "home"
  // Post-work evening (공통)
  if (hm >= 18 * 60) return "outside"
  // Day hours
  return mode === "work" ? "office" : "outside"
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

/**
 * 30분마다 같은 카테고리 안에서 회전.
 * (날짜 + slot + 30분 버킷) 을 시드로 결정적 선택 → 서버/클라이언트 동일.
 */
export function pickDakotaPhoto(
  mode: DakotaMode,
  slot: DakotaSlot,
  dateKey: string,
  now: Date = new Date(),
): string {
  const files = AUTO_SAFE_BY_SLOT[slot]
  if (files.length === 0) return FALLBACK
  const bucket = Math.floor(getSeoulHourMinute(now) / 30)
  const idx = hashString(`${dateKey}-${slot}-${mode}-${bucket}`) % files.length
  return files[idx]
}

/** 월~금 = work, 토일 = off (기본값, localStorage override 가능) */
export function defaultWorkdayMode(date: Date = new Date()): DakotaMode {
  const dow = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" })
      .format(date)
      .replace(/Sun/, "0")
      .replace(/Mon/, "1")
      .replace(/Tue/, "2")
      .replace(/Wed/, "3")
      .replace(/Thu/, "4")
      .replace(/Fri/, "5")
      .replace(/Sat/, "6"),
  )
  return dow >= 1 && dow <= 5 ? "work" : "off"
}

export function workdayOverrideKey(dateKey: string): string {
  return `dakota-workday-${dateKey}`
}

export function outfitOverrideKey(dateKey: string): string {
  return `dakota-outfit-override-${dateKey}`
}

export interface OutfitOverride {
  outfit: string // 카테고리 (office / outside / home / dress)
  variant: string // 파일명 prefix (blacksuit, bluedress, ...)
}

/**
 * 착장 override — {outfit(카테고리), variant} 기반으로 해당 variant 파일만 회전.
 * 하나만 있으면 30분 내내 고정, 3장+ 면 30분 버킷 회전.
 */
export function pickOverridePhoto(
  override: OutfitOverride,
  dateKey: string,
  now: Date = new Date(),
): string | null {
  const cat = M[override.outfit.toLowerCase()]
  if (!cat) return null
  const files = cat[override.variant.toLowerCase()] ?? []
  if (files.length === 0) return null
  const bucket = Math.floor(getSeoulHourMinute(now) / 30)
  const idx = hashString(`${dateKey}-override-${override.outfit}-${override.variant}-${bucket}`) % files.length
  return files[idx]
}
