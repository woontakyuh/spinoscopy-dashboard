const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"

export function resolveGroqModel(configuredModel: string | undefined): string {
  return configuredModel || DEFAULT_GROQ_MODEL
}

interface RadarGateCandidate {
  readonly core: boolean
  readonly score: number
  readonly impact: number
}

export function passesTopicRadarGate(
  candidate: RadarGateCandidate,
  minScore: number,
  minImpact: number,
): boolean {
  const relevant = candidate.core || candidate.score >= minScore
  const impactAccepted = candidate.impact >= minImpact || (candidate.core && candidate.impact < 0)
  return relevant && impactAccepted
}
