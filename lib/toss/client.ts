import "server-only"

/**
 * Toss Securities 공식 Open API 클라이언트
 * — 조회 전용 (read-only)
 * — Cloudflare Worker 프록시 경유 (Vercel IP 제한 우회)
 */

const DEFAULT_BASE_URL = "https://toss-proxy.woontak-yuh.workers.dev/proxy"

const API_BASE_URL =
  process.env.TOSSINVEST_API_BASE_URL ?? DEFAULT_BASE_URL

export class TossCredentialsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TossCredentialsError"
  }
}

export interface TossAccountSummary {
  totalAsset: number
  totalPurchase: number
  totalProfit: number
  totalProfitRate: number
  todayProfit: number
  todayProfitRate: number
  currency: string
}

export interface TossHoldingItem {
  symbol: string
  name: string
  quantity: number
  averagePrice: number
  currentPrice: number
  totalValue: number
  profit: number
  profitRate: number
  currency: string
  market: "KR" | "US"
}

let cachedToken: string | null = null
let tokenExpiresAt = 0

export const hasTossCredentials = (): boolean =>
  !!(process.env.TOSSINVEST_CLIENT_ID && process.env.TOSSINVEST_CLIENT_SECRET)

function getCredentials() {
  const clientId = process.env.TOSSINVEST_CLIENT_ID
  const clientSecret = process.env.TOSSINVEST_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new TossCredentialsError(
      "TOSSINVEST_CLIENT_ID / TOSSINVEST_CLIENT_SECRET 환경변수가 설정되지 않았습니다.",
    )
  }
  return { clientId, clientSecret }
}

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  const { clientId, clientSecret } = getCredentials()
  const tokenUrl = API_BASE_URL.endsWith("/proxy")
    ? `${API_BASE_URL}/oauth2/token`
    : `${API_BASE_URL}/oauth2/token`

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`Toss 토큰 발급 실패 (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as {
    access_token: string
    expires_in: number
  }

  cachedToken = data.access_token
  tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000
  return cachedToken
}

async function tossFetch<T>(
  path: string,
  options: { account?: string | number } = {},
): Promise<T> {
  const token = await getAccessToken()
  const url = `${API_BASE_URL}${path}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
  if (options.account !== undefined) {
    headers["X-Tossinvest-Account"] = String(options.account)
  }

  const res = await fetch(url, { headers })

  if (res.status === 401) {
    cachedToken = null
    const newToken = await getAccessToken()
    headers.Authorization = `Bearer ${newToken}`
    const retry = await fetch(url, { headers })
    if (!retry.ok) {
      throw new Error(`Toss API 에러: ${retry.status}`)
    }
    return (await retry.json()) as T
  }

  if (res.status === 429) {
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 2000)
    await promise
    const retry = await fetch(url, { headers })
    if (!retry.ok) {
      throw new Error(`Toss API Rate Limit: ${retry.status}`)
    }
    return (await retry.json()) as T
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`Toss API 에러 (${res.status}): ${errText}`)
  }

  return (await res.json()) as T
}

interface AccountsResult {
  result?: Array<{
    accountNo: string
    accountSeq: number
    accountType: string
  }>
  data?: {
    result?: Array<{
      accountNo: string
      accountSeq: number
      accountType: string
    }>
  }
}

interface HoldingsResult {
  result?: {
    totalPurchaseAmount?: { krw?: string; usd?: string }
    marketValue?: { amount?: { krw?: string; usd?: string } }
    profitLoss?: { amount?: { krw?: string; usd?: string }; rate?: string }
    dailyProfitLoss?: { amount?: { krw?: string; usd?: string }; rate?: string }
    items?: Array<{
      symbol: string
      name: string
      marketCountry?: string
      currency?: string
      quantity?: string
      lastPrice?: string
      averagePurchasePrice?: string
      marketValue?: { amount?: string }
      profitLoss?: { amount?: string; rate?: string }
    }>
  }
  data?: {
    result?: HoldingsResult["result"]
  }
}

export async function getTossPortfolio() {
  const rawAccounts = await tossFetch<AccountsResult>("/accounts")
  const accountList = rawAccounts.result ?? rawAccounts.data?.result ?? []

  if (accountList.length === 0) {
    throw new Error("연결된 Toss 계좌가 없습니다.")
  }

  const first = accountList[0]
  const accountSeq = first.accountSeq

  const rawHoldings = await tossFetch<HoldingsResult>("/holdings", {
    account: accountSeq,
  })
  const result = rawHoldings.result ?? rawHoldings.data?.result

  if (!result) {
    throw new Error("포트폴리오 데이터를 불러올 수 없습니다.")
  }

  const krwMarket = Number(result.marketValue?.amount?.krw ?? 0)
  const usdMarket = Number(result.marketValue?.amount?.usd ?? 0)
  const totalAsset = krwMarket + usdMarket

  const krwPurchase = Number(result.totalPurchaseAmount?.krw ?? 0)
  const usdPurchase = Number(result.totalPurchaseAmount?.usd ?? 0)
  const totalPurchase = krwPurchase + usdPurchase

  const krwProfit = Number(result.profitLoss?.amount?.krw ?? 0)
  const totalProfit = krwProfit
  const totalProfitRate = Number(result.profitLoss?.rate ?? 0) * 100

  const krwDailyProfit = Number(result.dailyProfitLoss?.amount?.krw ?? 0)
  const todayProfit = krwDailyProfit
  const todayProfitRate = Number(result.dailyProfitLoss?.rate ?? 0) * 100

  const summary: TossAccountSummary = {
    totalAsset,
    totalPurchase,
    totalProfit,
    totalProfitRate,
    todayProfit,
    todayProfitRate,
    currency: "KRW",
  }

  const holdings: TossHoldingItem[] = (result.items ?? []).map((item) => {
    const qty = Number(item.quantity)
    const curPrice = Number(item.lastPrice)
    const avgPrice = Number(item.averagePurchasePrice)
    const profit = Number(item.profitLoss?.amount ?? 0)
    const profitRate = Number(item.profitLoss?.rate ?? 0) * 100
    const totalVal = Number(item.marketValue?.amount ?? curPrice * qty)

    return {
      symbol: item.symbol,
      name: item.name,
      quantity: qty,
      averagePrice: avgPrice,
      currentPrice: curPrice,
      totalValue: totalVal,
      profit,
      profitRate,
      currency: item.currency || "KRW",
      market: (item.marketCountry === "US" ? "US" : "KR") as "KR" | "US",
    }
  })

  return {
    account: {
      accountNo: first.accountNo,
      maskedNo: first.accountNo.slice(-4).padStart(first.accountNo.length, "*"),
    },
    summary,
    holdings,
  }
}
