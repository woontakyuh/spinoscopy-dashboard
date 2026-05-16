import type { FeedCategory, FeedItem, FeedSource, FeedTier } from "@/lib/types/radar"

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}

const POLICY_KEYWORDS = [
  "policy",
  "regulation",
  "law",
  "compliance",
  "governance",
  "eu ai act",
  "ftc",
  "guideline",
  "safety",
  "ethics",
]

const MODEL_RELEASE_KEYWORDS = [
  "model",
  "release",
  "llm",
  "gpt",
  "claude",
  "gemini",
  "mistral",
  "weights",
  "checkpoint",
  "benchmark",
  "sota",
]

const TOOL_KEYWORDS = [
  "agent",
  "sdk",
  "framework",
  "tool",
  "plugin",
  "api",
  "platform",
  "workflow",
  "ide",
  "copilot",
]

const RESEARCH_KEYWORDS = [
  "paper",
  "arxiv",
  "study",
  "preprint",
  "method",
  "dataset",
  "experiment",
  "analysis",
]

const MEDICAL_KEYWORDS = [
  "medical",
  "clinical",
  "radiology",
  "health",
  "hospital",
  "surgery",
  "spine",
  "diagnosis",
  "patient",
]

export function inferCategories(title: string, source: FeedSource, tier: FeedTier): FeedCategory[] {
  const text = title.toLowerCase()
  const categories: FeedCategory[] = []

  if (includesAny(text, RESEARCH_KEYWORDS)) categories.push("research")
  if (includesAny(text, MEDICAL_KEYWORDS)) categories.push("medical-ai")
  if (includesAny(text, POLICY_KEYWORDS)) categories.push("policy")
  if (includesAny(text, MODEL_RELEASE_KEYWORDS)) categories.push("model-release")
  if (includesAny(text, TOOL_KEYWORDS)) categories.push("tool")

  if (source === "arxiv" || source === "hf-daily-papers") {
    if (!categories.includes("research")) categories.push("research")
  }

  // Anthropic 공식 블로그 → research
  if (source === "anthropic-engineering" || source === "anthropic-research") {
    if (!categories.includes("research")) categories.push("research")
  }

  // Thought leader 소스 → opinion
  if (tier === "thought-leader" || source === "karpathy-youtube" || source === "dwarkesh-podcast" || source === "lex-fridman-ai") {
    if (!categories.includes("opinion")) categories.push("opinion")
  }

  if (categories.length === 0) categories.push("tool")

  return Array.from(new Set(categories))
}

// 화제 lab/회사명 — 제목에 등장 시 importance 가중. Paper/News 모두 적용.
const HOT_LAB_KEYWORDS = [
  "deepseek", "anthropic", "openai", "google deepmind", "deepmind",
  "meta ai", "fair", "mistral", "qwen", "alibaba",
  "moonshot", "kimi", "01.ai", "yi", "allen ai", "allenai",
  "stability", "cohere", "perplexity", "xai", "nvidia research",
]

export function scoreImportance(
  title: string,
  categories: FeedCategory[],
  tier: FeedTier,
  source?: FeedSource,
  points?: number | null,
): 1 | 2 | 3 | 4 | 5 {
  const text = title.toLowerCase()
  let score = 2

  if (tier === "ai-company") score += 1
  if (tier === "thought-leader") score += 1
  if (categories.includes("model-release")) score += 1
  if (categories.includes("policy")) score += 1
  if (categories.includes("medical-ai")) score += 1
  if (includesAny(text, ["breakthrough", "state-of-the-art", "fda", "phase iii", "launch"])) score += 1
  if (includesAny(text, ["opinion", "rumor", "preview"])) score -= 1

  // AI 기업 공식 블로그에서 model-release 언급 시 추가 가중
  if (source && ["anthropic-engineering", "anthropic-research", "openai-blog", "deepmind-blog"].includes(source)) {
    if (categories.includes("model-release")) score += 1
  }

  // 화제 lab 이름이 제목에 보이면 +1 (DeepSeek, Mistral, Qwen 등)
  if (includesAny(text, HOT_LAB_KEYWORDS)) score += 1

  // 커뮤니티 시그널 — HF Daily Papers upvotes / HN points 가 핵심 큐레이션 신호
  // HF Daily Papers: ~5 = mid, ~20 = trending, ~50+ = viral
  // HN: ~50 = noticeable, ~150 = strong, ~300+ = top
  if (typeof points === "number") {
    if (source === "hf-daily-papers") {
      if (points >= 50) score += 2
      else if (points >= 20) score += 1
    } else {
      // HN 등 일반 점수
      if (points >= 300) score += 2
      else if (points >= 100) score += 1
    }
  }

  if (score < 1) return 1
  if (score > 5) return 5
  return score as 1 | 2 | 3 | 4 | 5
}

export function buildRuleBasedNote(item: Pick<FeedItem, "sourceLabel" | "tier" | "categories" | "importanceScore">): string {
  return `규칙 기반 분류: ${item.sourceLabel} · ${item.tier} · ${item.categories.join(", ")} · 중요도 ${item.importanceScore}/5`
}
