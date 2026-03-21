import type { BjjAttributes } from "@/lib/types/sensei"

// FIFA-style OVR calculation by role
type RoleWeights = Record<keyof BjjAttributes, number>

const ROLE_WEIGHTS: Record<string, RoleWeights> = {
  "Guard Player": { guard: 0.30, finishing: 0.20, legLocks: 0.15, passing: 0.10, control: 0.10, takedowns: 0.15 },
  "Top Player": { passing: 0.25, control: 0.25, finishing: 0.20, takedowns: 0.15, guard: 0.10, legLocks: 0.05 },
  "Leg Locker": { legLocks: 0.30, guard: 0.20, finishing: 0.20, passing: 0.10, takedowns: 0.10, control: 0.10 },
  "All-Rounder": { guard: 0.18, passing: 0.18, control: 0.16, finishing: 0.18, takedowns: 0.15, legLocks: 0.15 },
  "Pressure Passer": { passing: 0.30, control: 0.25, takedowns: 0.15, finishing: 0.15, guard: 0.10, legLocks: 0.05 },
}

function calcOvr(attrs: BjjAttributes, weights: RoleWeights): number {
  let sum = 0
  for (const key of Object.keys(weights) as (keyof BjjAttributes)[]) {
    sum += attrs[key] * weights[key]
  }
  return Math.round(sum)
}

export function calculateOvr(attrs: BjjAttributes): { ovr: number; role: string } {
  let bestOvr = 0
  let bestRole = "All-Rounder"

  for (const [role, weights] of Object.entries(ROLE_WEIGHTS)) {
    const ovr = calcOvr(attrs, weights)
    if (ovr > bestOvr) {
      bestOvr = ovr
      bestRole = role
    }
  }

  return { ovr: bestOvr, role: bestRole }
}

export function calculateOvrForRole(attrs: BjjAttributes, role: string): number {
  const weights = ROLE_WEIGHTS[role]
  if (!weights) return calcOvr(attrs, ROLE_WEIGHTS["All-Rounder"])
  return calcOvr(attrs, weights)
}
