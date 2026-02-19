/**
 * PROM Score Calculator
 *
 * Parsing and conversion utilities for spine surgery outcome measures.
 * All raw values are stored in Notion as rich_text in the formats described below.
 */

// ---------------------------------------------------------------------------
// Korean EQ-5D-5L Value Set (Kim SH et al., 2016, Qual Life Res)
// U = 1 - constant - Σ(dimension level coefficients) - N4
// N4 = 0.078 if any dimension is at level 4 or 5
// ---------------------------------------------------------------------------
const KR_EQ5D5L_CONSTANT = 0.096
const KR_EQ5D5L_N4 = 0.078

type Level = 1 | 2 | 3 | 4 | 5
type DimCoeff = Record<Level, number>

const KR_COEFFS: { MO: DimCoeff; SC: DimCoeff; UA: DimCoeff; PD: DimCoeff; AD: DimCoeff } = {
  MO: { 1: 0,     2: 0.046, 3: 0.058, 4: 0.133, 5: 0.251 },
  SC: { 1: 0,     2: 0.032, 3: 0.050, 4: 0.078, 5: 0.122 },
  UA: { 1: 0,     2: 0.021, 3: 0.051, 4: 0.100, 5: 0.175 },
  PD: { 1: 0,     2: 0.042, 3: 0.053, 4: 0.166, 5: 0.207 },
  AD: { 1: 0,     2: 0.033, 3: 0.046, 4: 0.102, 5: 0.137 },
}

// ---------------------------------------------------------------------------
// Parsed result types
// ---------------------------------------------------------------------------

export interface VASResult {
  /** For cervical: neck VAS; for lumbar: back VAS */
  proximal: number
  /** For cervical: arm VAS; for lumbar: leg VAS */
  distal: number
}

export interface ODIResult {
  raw: number
  max: number
  /** Normalized 0–100 */
  score: number
}

export interface NDIResult {
  raw: number
  max: number
  /** Normalized 0–100 */
  score: number
}

export interface EQ5DResult {
  /** 5-digit profile e.g. "11131" */
  profile: string
  /** MO, SC, UA, PD, AD levels */
  dims: [number, number, number, number, number]
  /** Korean utility index (Kim et al. 2016), rounded to 3 decimal places */
  utility: number
  /** EQ VAS score (0–100) */
  vas: number
}

// ---------------------------------------------------------------------------
// VAS  — stored as "a/b"  (cervical: neck/arm, lumbar: back/leg)
// ---------------------------------------------------------------------------
export function parseVAS(raw: string): VASResult | null {
  const parts = raw.trim().split("/")
  if (parts.length !== 2) return null
  const [a, b] = parts.map(s => Number(s.trim()))
  if (isNaN(a) || isNaN(b)) return null
  return { proximal: a, distal: b }
}

/** Format VAS for display given spine region */
export function formatVAS(raw: string, region: "cervical" | "lumbar" | "unknown" = "unknown"): string {
  const v = parseVAS(raw)
  if (!v) return raw
  const labels =
    region === "cervical" ? ["Neck", "Arm"]
    : region === "lumbar" ? ["Back", "Leg"]
    : ["VAS-1", "VAS-2"]
  return `${labels[0]} ${v.proximal} / ${labels[1]} ${v.distal}`
}

// ---------------------------------------------------------------------------
// ODI  — stored as "raw/max"  (sex skipped → /45, answered → /50)
// Normalized ODI % = (raw / max) × 100
// ---------------------------------------------------------------------------
export function parseODI(raw: string): ODIResult | null {
  const parts = raw.trim().split("/")
  if (parts.length !== 2) return null
  const [score, max] = parts.map(s => Number(s.trim()))
  if (isNaN(score) || isNaN(max) || max === 0) return null
  return {
    raw: score,
    max,
    score: Math.round((score / max) * 1000) / 10, // 1 decimal
  }
}

export function formatODI(raw: string): string {
  const r = parseODI(raw)
  if (!r) return raw
  return `ODI ${r.score.toFixed(1)}% (${r.raw}/${r.max})`
}

// ---------------------------------------------------------------------------
// JOA  — stored as raw number  (cervical: /17, lumbar: /29 or /17 depending on scale)
// No normalization; display as-is
// ---------------------------------------------------------------------------
export function parseJOA(raw: string): number | null {
  const v = Number(raw.trim())
  return isNaN(v) ? null : v
}

export function formatJOA(raw: string): string {
  const v = parseJOA(raw)
  return v !== null ? `JOA ${v}` : raw
}

// ---------------------------------------------------------------------------
// NDI  — stored as "raw/50"  (always 50-pt scale)
// Normalized NDI % = (raw / 50) × 100
// ---------------------------------------------------------------------------
export function parseNDI(raw: string): NDIResult | null {
  const parts = raw.trim().split("/")
  if (parts.length !== 2) return null
  const [score, max] = parts.map(s => Number(s.trim()))
  if (isNaN(score) || isNaN(max) || max === 0) return null
  return {
    raw: score,
    max,
    score: Math.round((score / max) * 1000) / 10,
  }
}

export function formatNDI(raw: string): string {
  const r = parseNDI(raw)
  if (!r) return raw
  return `NDI ${r.score.toFixed(1)}% (${r.raw}/${r.max})`
}

// ---------------------------------------------------------------------------
// EQ-5D-5L  — stored as "XXXXX/VAS"
//   XXXXX = 5-digit profile (each digit 1–5 for MO/SC/UA/PD/AD)
//   VAS   = EQ VAS score (0–100)
//
// Utility (Korean value set, Kim et al. 2016):
//   U = 1 - 0.096 - Σ(dim coefficients) - N4(0.078 if any dim ≥ 4)
// ---------------------------------------------------------------------------
export function parseEQ5D(raw: string): EQ5DResult | null {
  const parts = raw.trim().split("/")
  if (parts.length !== 2) return null
  const profileStr = parts[0].trim()
  const eqVas = Number(parts[1].trim())
  if (isNaN(eqVas) || profileStr.length !== 5) return null

  const dims = profileStr.split("").map(Number)
  if (dims.some(d => isNaN(d) || d < 1 || d > 5)) return null

  const [mo, sc, ua, pd, ad] = dims as Level[]
  const hasN4 = dims.some(d => d >= 4)

  const decrement =
    KR_EQ5D5L_CONSTANT +
    KR_COEFFS.MO[mo] +
    KR_COEFFS.SC[sc] +
    KR_COEFFS.UA[ua] +
    KR_COEFFS.PD[pd] +
    KR_COEFFS.AD[ad] +
    (hasN4 ? KR_EQ5D5L_N4 : 0)

  const utility = Math.round((1 - decrement) * 1000) / 1000

  return {
    profile: profileStr,
    dims: [mo, sc, ua, pd, ad],
    utility,
    vas: eqVas,
  }
}

export function formatEQ5D(raw: string): string {
  const r = parseEQ5D(raw)
  if (!r) return raw
  return `EQ-5D ${r.utility.toFixed(3)} / EQ VAS ${r.vas}`
}

// ---------------------------------------------------------------------------
// Spine region inference from available PROM fields
// If NDI present → cervical; if ODI present → lumbar
// ---------------------------------------------------------------------------
export function inferRegion(
  promRecord: Record<string, string>
): "cervical" | "lumbar" | "unknown" {
  const timepoints = ["pre", "1mo", "3mo", "6mo", "1y"]
  const hasNDI = timepoints.some(tp => !!promRecord[`${tp} NDI`])
  const hasODI = timepoints.some(tp => !!promRecord[`${tp} ODI`])
  if (hasNDI && !hasODI) return "cervical"
  if (hasODI && !hasNDI) return "lumbar"
  return "unknown"
}

// ---------------------------------------------------------------------------
// Batch: parse all PROM scores for a single timepoint
// ---------------------------------------------------------------------------
export interface ParsedTimepoint {
  timepoint: string
  vas: VASResult | null
  odi: ODIResult | null
  joa: number | null
  ndi: NDIResult | null
  eq5d: EQ5DResult | null
}

export function parseTimepointProm(
  promRecord: Record<string, string>,
  timepoint: string
): ParsedTimepoint {
  const get = (score: string) => promRecord[`${timepoint} ${score}`] ?? ""
  return {
    timepoint,
    vas: get("VAS") ? parseVAS(get("VAS")) : null,
    odi: get("ODI") ? parseODI(get("ODI")) : null,
    joa: get("JOA") ? parseJOA(get("JOA")) : null,
    ndi: get("NDI") ? parseNDI(get("NDI")) : null,
    eq5d: get("EQ5D") ? parseEQ5D(get("EQ5D")) : null,
  }
}
