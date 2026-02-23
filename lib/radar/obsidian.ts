import type { FeedItem, FeedCategory, FeedTier } from "@/lib/types/radar"

const VAULT_NAME = "TakBrain"

function todayDate(): string {
  const d = new Date()
  return d.toISOString().split("T")[0]
}

function todayFolder(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${yyyy}/${mm}`
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

/** Map tier to readable Korean tag-friendly label */
function tierTag(tier: FeedTier): string {
  const map: Record<FeedTier, string> = {
    "tier1-daily": "radar/tier1-daily",
    "tier2-weekly": "radar/tier2-weekly",
    "tier3-research": "radar/tier3-research",
    "medical-ai": "radar/medical-ai",
    social: "radar/social",
  }
  return map[tier]
}

/** Map category to nested radar tag */
function categoryTag(cat: FeedCategory): string {
  return `radar/${cat}`
}

function buildFrontmatter(item: FeedItem): string {
  const tags = [
    "radar",
    tierTag(item.tier),
    ...item.categories.map(categoryTag),
  ]

  const lines: string[] = [
    "---",
    "tags:",
    ...tags.map((t) => `  - ${t}`),
    `source: "${item.sourceLabel}"`,
    `source_id: ${item.source}`,
    `tier: ${item.tier}`,
    `cadence: ${item.cadence}`,
    `importance: ${item.importanceScore}`,
    `url: "${item.url}"`,
  ]

  if (item.author) lines.push(`author: "${item.author}"`)
  if (item.date) lines.push(`date: ${item.date}`)
  if (item.commentUrl) lines.push(`comment_url: "${item.commentUrl}"`)
  if (item.points != null) lines.push(`points: ${item.points}`)

  lines.push(`created: ${todayDate()}`)
  lines.push("---")

  return lines.join("\n")
}

/**
 * Build obsidian://new URI with proper %20 encoding.
 *
 * URLSearchParams encodes spaces as `+` (application/x-www-form-urlencoded),
 * but Obsidian expects standard percent-encoding (%20).
 * We manually construct the URI with encodeURIComponent to avoid this.
 */
export function buildObsidianUri(item: FeedItem): string {
  const folder = todayFolder()
  const filename = sanitizeFilename(item.title)
  const filePath = `Radar/${folder}/${filename}`

  const frontmatter = buildFrontmatter(item)

  const bodyLines: string[] = [
    "",
    `# ${item.title}`,
    "",
    "## 요약",
    item.summary ? `> ${item.summary}` : "> ",
    "",
  ]

  if (item.notes) {
    bodyLines.push("## 분류 노트", item.notes, "")
  }

  bodyLines.push(
    "## 메모",
    "",
    "",
    "## 연결",
    "- 관련 개념: [[]]",
    "- 관련 논문: [[]]",
    "- 관련 프로젝트: [[]]",
  )

  const content = frontmatter + "\n" + bodyLines.join("\n")

  // Manual URI construction with encodeURIComponent (spaces → %20, not +)
  const uri =
    `obsidian://new?vault=${encodeURIComponent(VAULT_NAME)}` +
    `&file=${encodeURIComponent(filePath)}` +
    `&content=${encodeURIComponent(content)}`

  return uri
}
