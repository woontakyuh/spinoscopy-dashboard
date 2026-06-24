export interface ScrapedArticle {
  title: string
  authors: string
  url: string
  pii: string
  postedAt: string | null
  journalName: string
}

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
}

export function parseTsjDate(text: string): string | null {
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/)
  if (!m) return null
  const mm = MONTHS[m[1].toLowerCase()]
  if (!mm) return null
  return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`
}

export function extractPii(href: string): string | null {
  const m = href.match(/\/article\/(S\d{4}-\d{4}\(\d{2}\)\d{5}-\d)/)
  return m ? m[1] : null
}

export function parseTsjCitation(raw: {
  title: string
  href: string
  innerText: string
}): ScrapedArticle | null {
  const pii = extractPii(raw.href)
  if (!pii) return null
  const lines = raw.innerText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  // line 0 = 제목, line 1 = 저자, 날짜 라인은 "Published online" 또는 월/일/년 패턴
  const authorsLine =
    lines[1] && !/published online|full-text/i.test(lines[1]) ? lines[1] : ""
  const authors = authorsLine
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .join(", ")
  const dateLine = lines.find((l) => parseTsjDate(l) !== null) ?? ""
  const base = "https://www.thespinejournalonline.com"
  return {
    title: raw.title.trim(),
    authors,
    url: raw.href.startsWith("http") ? raw.href : base + raw.href,
    pii,
    postedAt: parseTsjDate(dateLine),
    journalName: "The Spine Journal",
  }
}
