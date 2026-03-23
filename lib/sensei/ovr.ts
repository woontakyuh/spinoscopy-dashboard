import type { BjjAttributes } from "@/lib/types/sensei"

type RoleWeights = Record<keyof BjjAttributes, number>

const ROLE_WEIGHTS: Record<string, RoleWeights> = {
  "Guard Player": { guard: 0.30, finishing: 0.20, legLocks: 0.15, passing: 0.10, control: 0.10, takedowns: 0.15 },
  "Top Player": { passing: 0.25, control: 0.25, finishing: 0.20, takedowns: 0.15, guard: 0.10, legLocks: 0.05 },
  "Leg Locker": { legLocks: 0.30, guard: 0.20, finishing: 0.20, passing: 0.10, takedowns: 0.10, control: 0.10 },
  "All-Rounder": { guard: 0.18, passing: 0.18, control: 0.16, finishing: 0.18, takedowns: 0.15, legLocks: 0.15 },
  "Pressure Passer": { passing: 0.30, control: 0.25, takedowns: 0.15, finishing: 0.15, guard: 0.10, legLocks: 0.05 },
  "Half Guard Specialist": { guard: 0.35, passing: 0.15, control: 0.15, finishing: 0.15, takedowns: 0.10, legLocks: 0.10 },
  "Spider Guard Specialist": { guard: 0.35, finishing: 0.25, control: 0.10, passing: 0.10, takedowns: 0.10, legLocks: 0.10 },
  "Back Taker": { control: 0.30, guard: 0.20, finishing: 0.25, passing: 0.10, takedowns: 0.10, legLocks: 0.05 },
  "Submission Hunter": { finishing: 0.35, guard: 0.20, control: 0.15, passing: 0.10, takedowns: 0.10, legLocks: 0.10 },
}

function calcWeightedOvr(attrs: BjjAttributes, weights: RoleWeights): number {
  let sum = 0
  for (const key of Object.keys(weights) as (keyof BjjAttributes)[]) {
    sum += attrs[key] * weights[key]
  }
  return Math.round(sum)
}

function peakBonus(attrs: BjjAttributes): number {
  let bonus = 0
  for (const val of Object.values(attrs)) {
    if (val >= 98) bonus = Math.max(bonus, 7)
    else if (val >= 95) bonus = Math.max(bonus, 5)
    else if (val >= 90) bonus = Math.max(bonus, 3)
  }
  return bonus
}

export function calculateOvr(attrs: BjjAttributes, ovrFloor?: number): { ovr: number; role: string } {
  let bestOvr = 0
  let bestRole = "All-Rounder"

  for (const [role, weights] of Object.entries(ROLE_WEIGHTS)) {
    const ovr = calcWeightedOvr(attrs, weights)
    if (ovr > bestOvr) {
      bestOvr = ovr
      bestRole = role
    }
  }

  const rawOvr = bestOvr + peakBonus(attrs)
  const finalOvr = Math.min(99, Math.max(rawOvr, ovrFloor ?? 0))

  return { ovr: finalOvr, role: bestRole }
}

export function calculateOvrForRole(attrs: BjjAttributes, role: string): number {
  const weights = ROLE_WEIGHTS[role]
  if (!weights) return calcWeightedOvr(attrs, ROLE_WEIGHTS["All-Rounder"])
  return calcWeightedOvr(attrs, weights)
}
