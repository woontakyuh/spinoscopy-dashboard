import { z } from "zod"
import type { NavMapPoint } from "@/lib/sensei/nav-map-focus"

export const NAV_MAP_PRESET_STORAGE_KEY = "sensei-navmap-presets-v1"
export const DEFAULT_LAYOUT_NAME = "default"

export interface NavMapViewBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface NavMapLayoutPreset {
  readonly name: string
  readonly positions: Readonly<Record<string, NavMapPoint>>
  readonly viewBox: NavMapViewBox
}

export type CreatePresetResult =
  | { readonly kind: "ok"; readonly preset: NavMapLayoutPreset }
  | { readonly kind: "invalid-name" }

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const viewBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().positive().finite(),
  h: z.number().positive().finite(),
})

const presetSchema = z.object({
  name: z.string().trim().min(1).max(24),
  positions: z.record(z.string(), pointSchema),
  viewBox: viewBoxSchema,
})

const storeSchema = z.object({
  version: z.literal(1),
  presets: z.array(presetSchema),
})

export function createLayoutPreset(
  name: string,
  positions: Readonly<Record<string, NavMapPoint>>,
  viewBox: NavMapViewBox,
): CreatePresetResult {
  const result = presetSchema.safeParse({
    name: name.trim(),
    positions,
    viewBox,
  })
  if (!result.success) return { kind: "invalid-name" }
  return { kind: "ok", preset: result.data }
}

export function loadLayoutPresets(storage: Storage): readonly NavMapLayoutPreset[] {
  const raw = storage.getItem(NAV_MAP_PRESET_STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = storeSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.presets : []
  } catch (error) {
    if (error instanceof SyntaxError) return []
    throw error
  }
}

export function saveLayoutPresets(
  storage: Storage,
  presets: readonly NavMapLayoutPreset[],
): void {
  storage.setItem(
    NAV_MAP_PRESET_STORAGE_KEY,
    JSON.stringify({ version: 1, presets }),
  )
}

export function upsertLayoutPreset(
  presets: readonly NavMapLayoutPreset[],
  next: NavMapLayoutPreset,
): readonly NavMapLayoutPreset[] {
  const remaining = presets.filter((preset) => preset.name !== next.name)
  return [...remaining, next]
}
