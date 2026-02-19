const NOTION_API_BASE = "https://api.notion.com/v1"

export async function notionRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Notion API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}
