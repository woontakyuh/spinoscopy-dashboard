"use client"

import { useState } from "react"
import { SenseiNavMap } from "@/components/sensei/SenseiNavMap"

// Phase 2: NavMap에 filter chip UI 추가. 실제 필터 로직은 Phase 3/v2에서
// SenseiNavMap 내부에 연결 예정. 현재는 chip UI + selected state만.

type Filter = "block1" | "block2" | "all" | "heat"

const CHIPS: { id: Filter; label: string; note?: string }[] = [
  { id: "block1", label: "Block 1 overlay" },
  { id: "block2", label: "Block 2 preview" },
  { id: "all", label: "All positions" },
  { id: "heat", label: "Training heat", note: "최근 8주" },
]

export function NavMapWrapper() {
  const [filter, setFilter] = useState<Filter>("block1")
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
              filter === c.id
                ? "bg-[#1D9E75]/15 border-[#1D9E75]/40 text-[#1D9E75]"
                : "bg-transparent border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{c.label}</span>
            {c.note && <span className="text-muted-foreground/70">· {c.note}</span>}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground/60 ml-auto">
          필터 로직은 Phase 3/v2에서 노드 스타일에 연결
        </span>
      </div>
      <SenseiNavMap />
    </div>
  )
}
