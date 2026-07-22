declare module "toss-securities" {
  export interface OfficialAccount {
    accountNo: string
    accountSeq: number
    accountType: string
  }

  export interface HoldingsResponse {
    data?: {
      result?: {
        totalPurchaseAmount?: { krw?: string; usd?: string }
        marketValue?: { amount?: { krw?: string; usd?: string } }
        profitLoss?: {
          amount?: { krw?: string; usd?: string }
          rate?: string
        }
        dailyProfitLoss?: {
          amount?: { krw?: string; usd?: string }
          rate?: string
        }
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
          dailyProfitLoss?: { amount?: string; rate?: string }
        }>
      }
    }
  }

  export function listOfficialAccounts(): Promise<{
    data?: { result?: OfficialAccount[] }
  }>
  export function getHoldings(options: { account: string | number }): Promise<HoldingsResponse>
  export class TossCredentialsError extends Error {}
  export class TossApiError extends Error {
    code: string
    requestId: string
    httpStatus: number
    data: unknown
  }
}
