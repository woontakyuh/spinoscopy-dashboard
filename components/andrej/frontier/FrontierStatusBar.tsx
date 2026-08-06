// AI Frontier 상태 줄 + 검색.
// 훅 없는 표시 전용 모듈. 클라이언트 경계는 FrontierDashboard 가 연다.
// 한 줄 안에서 "지금 무엇이 있고 언제 받아왔는지"를 끝내고, 검색은 그 줄에 붙여 둔다.

import { cn } from "@/lib/utils"

import { frontierFocusRing } from "./FrontierSourceState"

export interface FrontierStatusBarProps {
  readonly latestEpisodeNumber: number | null
  readonly episodeCount: number
  readonly conceptCount: number
  readonly unreviewedCount: number
  /** React Query가 마지막으로 데이터를 받은 시각(ms). 아직 없으면 0. */
  readonly syncedAt: number
  /** 한쪽 소스라도 못 읽었는지 */
  readonly partial: boolean
  readonly search: string
  readonly onSearchChange: (search: string) => void
}

/** 마지막으로 실제 데이터를 받은 시각. 시계는 서울 기준 24시간 표기로 고정한다. */
function formatSyncedAt(updatedAt: number): string {
  if (updatedAt === 0) return "--:--"
  return new Date(updatedAt).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
}

function StatusItem({
  label,
  value,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly tone?: string
}) {
  return (
    <span>
      {label} <span className={cn("num", tone ?? "text-foreground")}>{value}</span>
    </span>
  )
}

export function FrontierStatusBar({
  latestEpisodeNumber,
  episodeCount,
  conceptCount,
  unreviewedCount,
  syncedAt,
  partial,
  search,
  onSearchChange,
}: FrontierStatusBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-3 py-2">
      <p
        data-testid="frontier-status"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        <StatusItem
          label="최신"
          value={latestEpisodeNumber === null ? "—" : `EP${latestEpisodeNumber}`}
          tone="text-purple-700 dark:text-purple-200"
        />
        <StatusItem label="에피소드" value={String(episodeCount)} />
        <StatusItem label="개념" value={String(conceptCount)} />
        <StatusItem
          label="미검토"
          value={String(unreviewedCount)}
          tone={unreviewedCount > 0 ? "text-amber-700 dark:text-amber-300" : undefined}
        />
        <span data-testid="frontier-last-sync">
          동기화 <span className="num text-foreground">{formatSyncedAt(syncedAt)}</span>
        </span>
        {partial && <span className="text-red-700 dark:text-red-300">일부 연결 실패</span>}
      </p>

      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label="에피소드·개념 검색"
        placeholder="제목, 토픽, 개념 검색"
        className={cn(
          "min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground md:max-w-xs",
          frontierFocusRing
        )}
      />
    </div>
  )
}
