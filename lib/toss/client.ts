import "server-only"
import {
  listOfficialAccounts,
  getHoldings as tossGetHoldings,
  TossCredentialsError,
} from "toss-securities"

// toss-securities 라이브러리가 읽을 수 있도록 명시적으로 baseUrl 전달
// Vercel(미국 IP) → Cloudflare Worker(고정 IP) → Toss API
const tossOptions = (() => {
  const baseUrl = process.env.TOSSINVEST_API_BASE_URL
  return baseUrl ? { baseUrl } : {}
})()

export { TossCredentialsError }

export interface TossAccountInfo {
  accountNo: string
  accountSeq: number
  accountType: string
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

export const hasTossCredentials = (): boolean =>
  !!(process.env.TOSSINVEST_CLIENT_ID && process.env.TOSSINVEST_CLIENT_SECRET)

/** 연결된 계좌 번호 / accountSeq 가져오기 */
export async function getAccountInfo(): Promise<TossAccountInfo> {
  const res = await listOfficialAccounts(tossOptions as Parameters<typeof listOfficialAccounts>[0])
  const list = res.data?.result ?? []
  if (list.length === 0) {
    throw new Error("연결된 Toss 계좌가 없습니다.")
  }
  const first = list[0]
  return {
    accountNo: first.accountNo,
    accountSeq: first.accountSeq,
    accountType: first.accountType,
  }
}

/** 계좌 자산 요약 + 보유 주식 통합 조회 */
export async function getTossPortfolio() {
  const accountInfo = await getAccountInfo()
  const res = await tossGetHoldings({
    account: accountInfo.accountSeq,
    ...tossOptions,
  } as Parameters<typeof tossGetHoldings>[0])
  const result = res.data?.result

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
      accountNo: accountInfo.accountNo,
      maskedNo: accountInfo.accountNo.slice(-4).padStart(accountInfo.accountNo.length, "*"),
    },
    summary,
    holdings,
  }
}
