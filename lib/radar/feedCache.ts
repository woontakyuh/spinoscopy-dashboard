import type { FeedItem } from "@/lib/types/radar"

interface NormalizedFeedCacheEntry {
  readonly expiresAt: number
  readonly items: readonly FeedItem[]
}

interface TextRequestOptions {
  readonly headers?: HeadersInit
}

const MIN_TTL_SECONDS = 60
const normalizedFeedCache = new Map<string, NormalizedFeedCacheEntry>()

function cloneFeedItems(items: readonly FeedItem[]): FeedItem[] {
  return items.map((item) => ({
    ...item,
    categories: [...item.categories],
  }))
}

export async function cachedFeedItems(
  key: string,
  ttlSeconds: number,
  load: () => Promise<readonly FeedItem[]>,
): Promise<FeedItem[]> {
  const now = Date.now()
  const existing = normalizedFeedCache.get(key)

  if (existing && existing.expiresAt > now) {
    return cloneFeedItems(existing.items)
  }

  const items = await load()
  normalizedFeedCache.set(key, {
    expiresAt: now + Math.max(ttlSeconds, MIN_TTL_SECONDS) * 1000,
    items: cloneFeedItems(items),
  })

  return cloneFeedItems(items)
}

export async function fetchTextNoStore(
  endpoint: string,
  options: TextRequestOptions = {},
): Promise<string | null> {
  const res = await fetch(endpoint, {
    cache: "no-store",
    headers: options.headers,
  })

  if (!res.ok) return null
  return res.text()
}
