// 모바일 세그먼트와 그 세그먼트가 여닫는 패널 껍데기.
// 훅 없는 표시 전용 모듈. 클라이언트 경계는 FrontierDashboard 가 연다.
// tab/tabpanel의 id 약속이 한 파일 안에 같이 있어야 어긋나지 않는다.

import { Fragment, type ReactNode } from "react"

import { cn } from "@/lib/utils"

import { SECTIONS, SECTION_LABEL, frontierFocusRing } from "./FrontierSourceState"
import type { FrontierMobileSection } from "./frontier-view"

const tabId = (section: FrontierMobileSection) => `frontier-tab-${section}`
const panelId = (section: FrontierMobileSection) => `frontier-panel-${section}`

export interface FrontierSegmentsProps {
  readonly current: FrontierMobileSection
  /** 세그먼트에 붙일 개수. 검색/필터가 걸린 뒤의 실제 보이는 수. */
  readonly counts: Record<FrontierMobileSection, number>
  readonly onChange: (section: FrontierMobileSection) => void
}

/** 상자 두 개가 아니라 `에피소드 N | 개념 N` 한 줄로 읽혀야 한다. */
export function FrontierSegments({ current, counts, onChange }: FrontierSegmentsProps) {
  return (
    <div role="tablist" aria-label="Frontier 목록 전환" className="flex items-center md:hidden">
      {SECTIONS.map((section, index) => {
        const active = current === section
        return (
          <Fragment key={section}>
            {index > 0 && (
              <span
                data-testid="frontier-segment-separator"
                aria-hidden="true"
                className="text-xs text-muted-foreground/50"
              >
                {" | "}
              </span>
            )}
            <button
              type="button"
              role="tab"
              id={tabId(section)}
              aria-selected={active}
              aria-controls={panelId(section)}
              onClick={() => onChange(section)}
              className={cn(
                "min-h-10 rounded px-1 text-xs transition-colors",
                frontierFocusRing,
                // 색만으로 구분하지 않도록 활성 쪽에 밑줄을 함께 준다.
                active
                  ? "text-purple-200 underline decoration-purple-400/60 underline-offset-4"
                  : "text-muted-foreground"
              )}
            >
              {SECTION_LABEL[section]} <span className="num">{counts[section]}</span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

export interface FrontierPanelProps {
  readonly section: FrontierMobileSection
  readonly current: FrontierMobileSection
  /** 교차 이동으로 이 패널이 목적지가 되었는지 */
  readonly targeted: boolean
  readonly children: ReactNode
}

/** md 미만에서는 선택된 한쪽만 남기고, md 이상에서는 둘 다 편다. */
export function FrontierPanel({ section, current, targeted, children }: FrontierPanelProps) {
  return (
    <div
      id={panelId(section)}
      data-testid={panelId(section)}
      data-target={targeted ? "true" : undefined}
      role="tabpanel"
      aria-labelledby={tabId(section)}
      className={cn(
        "min-w-0",
        targeted && "rounded-xl ring-1 ring-purple-400/30",
        current !== section && "hidden md:block"
      )}
    >
      {children}
    </div>
  )
}
