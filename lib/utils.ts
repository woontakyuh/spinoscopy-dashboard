import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 환자 이름 마스킹: 첫 글자와 마지막 글자만 남기고 가운데는 O로 가린다.
 * 예) 김철수 → 김O수, 김철수영 → 김OO영, 홍길 → 홍O
 * 한 글자 이하 이름은 그대로 둔다.
 */
export function maskPatientName(name: string | null | undefined): string {
  if (!name) return ""
  const chars = Array.from(name.trim())
  if (chars.length <= 1) return chars.join("")
  if (chars.length === 2) return `${chars[0]}O`
  return `${chars[0]}${"O".repeat(chars.length - 2)}${chars[chars.length - 1]}`
}
