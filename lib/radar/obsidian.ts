import type { FeedItem } from "@/lib/types/radar"

const VAULT_NAME = "TakMD"

function todayFolder(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}/${mm}`
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

export function buildObsidianUri(item: FeedItem): string {
  const folder = todayFolder()
  const filename = sanitizeFilename(item.title)
  const filePath = `Radar/${folder}/${filename}`

  const lines: string[] = [
    `# ${item.title}`,
    "",
    `- **출처**: ${item.sourceLabel}`,
    `- **URL**: ${item.url}`,
    item.commentUrl ? `- **댓글**: ${item.commentUrl}` : "",
    item.author ? `- **저자**: ${item.author}` : "",
    item.date ? `- **날짜**: ${item.date}` : "",
    item.points != null ? `- **점수**: ${item.points}` : "",
    "",
    "---",
    "",
    item.summary ? `> ${item.summary}` : "",
    "",
    "## 메모",
    "",
    "",
  ].filter(Boolean)

  const content = lines.join("\n")

  const params = new URLSearchParams({
    vault: VAULT_NAME,
    file: filePath,
    content,
  })

  return `obsidian://new?${params.toString()}`
}
