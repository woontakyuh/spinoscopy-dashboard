"use client"

import { SenseiNavMap } from "@/components/sensei/SenseiNavMap"

export function NavMapWrapper() {
  return (
    <section className="space-y-4" aria-labelledby="lo-skills-title">
      <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-400">
            Skills map
          </p>
          <h2 id="lo-skills-title" className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            기술 연결도
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            게임 플랜으로 흐름을 좁히고, 노드를 선택해 연결 기술과 실제 훈련 기록을 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>선택: 연결선·상세 보기</span>
          <span>재선택: 전체 지도</span>
          <span>빈 공간 드래그: 지도 이동</span>
          <span>노드 드래그: 위치 고정</span>
          <span>+/−: 확대·축소</span>
        </div>
      </header>
      <SenseiNavMap />
    </section>
  )
}
