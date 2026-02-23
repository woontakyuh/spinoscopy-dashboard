"use client"

import { Badge } from "@/components/ui/badge"
import { CandlestickSparkline } from "@/components/vault/CandlestickSparkline"
import type { AssetPrice } from "@/lib/types/vault"

interface AssetCardProps {
  asset: AssetPrice
}

const CATEGORY_STYLES = {
  crypto: { border: "border-amber-500/40", text: "text-amber-300", label: "Crypto" },
  "stock-us": { border: "border-blue-500/40", text: "text-blue-300", label: "US" },
  "stock-kr": { border: "border-purple-500/40", text: "text-purple-300", label: "KR" },
}

function formatPrice(price: number, currency: string): string {
  if (currency === "KRW") {
    return price >= 10000
      ? `${(price / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원`
      : `${price.toLocaleString("ko-KR")}원`
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function AssetCard({ asset }: AssetCardProps) {
  const style = CATEGORY_STYLES[asset.category]
  const isUp = asset.change24h !== null && asset.change24h >= 0

  return (
    <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-800/50 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium">{asset.label}</span>
          <Badge variant="outline" className={`text-[10px] ${style.border} ${style.text}`}>
            {asset.symbol}
          </Badge>
        </div>
        <Badge variant="outline" className={`text-[10px] ${style.border} ${style.text}`}>
          {style.label}
        </Badge>
      </div>

      {asset.sparkline.length > 1 && (
        <div className="h-14 -mx-1">
          <CandlestickSparkline data={asset.sparkline} />
        </div>
      )}

      <div className="flex items-end justify-between">
        <span className="text-white text-lg font-semibold">
          {formatPrice(asset.price, asset.currency)}
        </span>
        {asset.change24h !== null && (
          <span className={`text-sm font-medium ${isUp ? "text-green-400" : "text-red-400"}`}>
            {isUp ? "+" : ""}{asset.change24h.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  )
}
