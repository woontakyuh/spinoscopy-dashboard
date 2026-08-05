"use client"

import { useEffect, useState } from "react"

interface Candidate {
  candidateId: string
  name: string
  content: string
  category: string
  sourceReference: string
  createdAt: string
}

export function MemoryCandidateQueue({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [deciding, setDeciding] = useState<string | null>(null)

  useEffect(() => {
    void fetchImpl("/api/lo/memory-candidates", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("후보를 불러오지 못했습니다.")
        const data = await response.json() as { candidates: Candidate[] }
        setCandidates(data.candidates)
        setStatus("ready")
      })
      .catch(() => setStatus("error"))
  }, [fetchImpl])

  async function decide(candidateId: string, decision: "approve" | "reject") {
    setDeciding(candidateId)
    try {
      const response = await fetchImpl("/api/lo/memory-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, decision }),
      })
      if (!response.ok) throw new Error("결정을 저장하지 못했습니다.")
      setCandidates((current) => current.filter((candidate) => candidate.candidateId !== candidateId))
    } finally {
      setDeciding(null)
    }
  }

  return (
    <section className="border border-[#5e3d2f] bg-[#17110f]">
      <header className="flex items-end justify-between gap-4 border-b border-[#4a3026] px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a88965]">SQLite → Notion</p>
          <h2 className="mt-1 text-sm font-semibold text-[#f0dfc5]">기억 승인 대기함</h2>
        </div>
        <span className="font-mono text-xs text-[#c58b61]">{candidates.length} pending</span>
      </header>

      {status === "loading" && <p className="px-4 py-5 text-sm text-[#a99a88]">Mac mini의 기억 후보를 읽는 중...</p>}
      {status === "error" && <p className="px-4 py-5 text-sm text-[#efaa91]" role="alert">기억 후보를 불러오지 못했습니다.</p>}
      {status === "ready" && candidates.length === 0 && (
        <p className="px-4 py-5 text-sm text-[#a99a88]">승인을 기다리는 기억 후보가 없습니다.</p>
      )}
      {candidates.length > 0 && (
        <ul className="divide-y divide-[#3f2a22]">
          {candidates.map((candidate) => (
            <li className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto]" key={candidate.candidateId}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-[#f1dfc5]">{candidate.name}</h3>
                  <span className="border border-[#6c4b38] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#c7a47d]">
                    {candidate.category}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-[#c8b8a2]">{candidate.content}</p>
                <p className="mt-2 truncate font-mono text-[10px] text-[#796b5e]">{candidate.sourceReference}</p>
              </div>
              <div className="flex items-center gap-2 lg:justify-end">
                <button
                  className="border border-[#5d4938] px-3 py-2 text-xs text-[#b9aa97] transition-colors hover:border-[#8b6448] hover:text-[#ead8bd] disabled:opacity-40"
                  disabled={deciding === candidate.candidateId}
                  onClick={() => void decide(candidate.candidateId, "reject")}
                  type="button"
                >
                  거절
                </button>
                <button
                  className="border border-[#9b5f3d] bg-[#5a2f22] px-3 py-2 text-xs font-medium text-[#ffe1c5] transition-colors hover:bg-[#73402d] disabled:opacity-40"
                  disabled={deciding === candidate.candidateId}
                  onClick={() => void decide(candidate.candidateId, "approve")}
                  type="button"
                >
                  Notion으로 승인
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
