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

  export interface RequestOptions {
    baseUrl?: string
    clientId?: string
    clientSecret?: string
    account?: string | number
  }

  export function listOfficialAccounts(options?: RequestOptions): Promise<{
    data?: { result?: OfficialAccount[] }
  }>
  export function getHoldings(options: RequestOptions): Promise<HoldingsResponse>
  export class TossCredentialsError extends Error {}
  export class TossApiError extends Error {
    code: string
    requestId: string
    httpStatus: number
    data: unknown
  }
}
