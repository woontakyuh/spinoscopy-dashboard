"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import type { PatientSearchResult } from "@/lib/types/patient"

interface PatientSearchProps {
  onSelect: (patient: PatientSearchResult) => void
  selectedId?: string
}

export function PatientSearch({ onSelect, selectedId }: PatientSearchProps) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  let debounceTimer: ReturnType<typeof setTimeout>
  function handleChange(value: string) {
    setQuery(value)
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => setDebouncedQuery(value), 400)
  }

  const { data: patients, isLoading } = useQuery({
    queryKey: ["patients", debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 1) return []
      const res = await fetch(`/api/notion/patients?q=${encodeURIComponent(debouncedQuery)}`)
      if (!res.ok) throw new Error("검색 실패")
      return res.json() as Promise<PatientSearchResult[]>
    },
    enabled: debouncedQuery.length >= 1,
  })

  return (
    <div className="space-y-2">
      <Input
        placeholder="환자명으로 검색..."
        value={query}
        onChange={e => handleChange(e.target.value)}
        className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
      />

      {isLoading && (
        <div className="space-y-1">
          <Skeleton className="h-10 w-full bg-zinc-800" />
          <Skeleton className="h-10 w-full bg-zinc-800" />
        </div>
      )}

      {!isLoading && patients && patients.length > 0 && (
        <div className="border border-zinc-700 rounded-lg overflow-hidden">
          {patients.map(patient => (
            <button
              type="button"
              key={patient.page_id}
              onClick={() => onSelect(patient)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-700 transition-colors border-b border-zinc-700 last:border-0 ${
                selectedId === patient.page_id ? "bg-blue-600/20 border-blue-500/30" : "bg-zinc-800"
              }`}
            >
              <div>
                <p className="text-white font-medium text-sm">{patient.name}</p>
                <p className="text-zinc-400 text-xs">
                  {patient.pt_no && `#${patient.pt_no} · `}
                  {patient.age && `${patient.age}세 · `}
                  {patient.sex}
                  {patient.hospital.length > 0 && ` · ${patient.hospital.join(", ")}`}
                </p>
              </div>
              <div className="text-right">
                {patient.op_date && (
                  <p className="text-zinc-400 text-xs">
                    수술: {new Date(patient.op_date).toLocaleDateString("ko-KR", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
                {patient.op_name && (
                  <p className="text-zinc-500 text-xs truncate max-w-32">{patient.op_name}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {!isLoading && debouncedQuery.length >= 1 && (!patients || patients.length === 0) && (
        <p className="text-zinc-500 text-sm text-center py-3">검색 결과가 없습니다.</p>
      )}
    </div>
  )
}
