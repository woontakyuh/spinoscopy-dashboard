"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import type { PatientSearchResult, Timepoint } from "@/lib/types/patient"

const TIMEPOINTS: { value: Timepoint; label: string }[] = [
  { value: "pre", label: "수술 전" },
  { value: "1mo", label: "1개월" },
  { value: "3mo", label: "3개월" },
  { value: "6mo", label: "6개월" },
  { value: "1y", label: "1년" },
]

const promSchema = z.object({
  vas: z.string().optional(),
  odi: z.string().optional(),
  joa: z.string().optional(),
  ndi: z.string().optional(),
  eq5d: z.string().optional(),
})

type PromFormValues = z.infer<typeof promSchema>

interface PromFormProps {
  patient: PatientSearchResult
}

export function PromForm({ patient }: PromFormProps) {
  const [timepoint, setTimepoint] = useState<Timepoint>("pre")
  const [saved, setSaved] = useState(false)

  const { data: existingProm, isLoading: promLoading } = useQuery({
    queryKey: ["prom", patient.page_id],
    queryFn: async () => {
      const res = await fetch(`/api/notion/patients?pageId=${patient.page_id}`)
      if (!res.ok) throw new Error("PROM 조회 실패")
      return res.json() as Promise<Record<string, string>>
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PromFormValues>({
    resolver: zodResolver(promSchema),
  })

  const mutation = useMutation({
    mutationFn: async (scores: PromFormValues) => {
      const res = await fetch("/api/notion/prom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: patient.page_id, timepoint, scores }),
      })
      if (!res.ok) throw new Error("저장 실패")
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      reset()
    },
  })

  const getExisting = (score: string) =>
    existingProm?.[`${timepoint} ${score}`] ?? ""

  return (
    <div className="space-y-4">
      <div>
        <p className="text-white font-medium">{patient.name}</p>
        <p className="text-zinc-400 text-sm">
          {patient.op_name && `${patient.op_name} · `}
          {patient.op_date && new Date(patient.op_date).toLocaleDateString("ko-KR")}
        </p>
      </div>

      <div>
        <Label className="text-zinc-300 text-sm mb-2 block">시점 선택</Label>
        <div className="flex gap-2 flex-wrap">
          {TIMEPOINTS.map(tp => (
            <button
              type="button"
              key={tp.value}
              onClick={() => setTimepoint(tp.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timepoint === tp.value
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {tp.label}
            </button>
          ))}
        </div>
      </div>

      {promLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-10 w-full bg-zinc-800" />
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit(values => mutation.mutate(values))} className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            {[
              { key: "vas", label: "VAS", placeholder: "0–10", hint: getExisting("VAS") },
              { key: "odi", label: "ODI", placeholder: "0–100", hint: getExisting("ODI") },
              { key: "joa", label: "JOA", placeholder: "경추 0–17 / 요추 0–29", hint: getExisting("JOA") },
              { key: "ndi", label: "NDI", placeholder: "0–50 (경추만)", hint: getExisting("NDI") },
              { key: "eq5d", label: "EQ5D", placeholder: "0.000–1.000", hint: getExisting("EQ5D") },
            ].map(field => (
              <div key={field.key} className="flex items-center gap-3">
                <Label className="w-14 text-zinc-300 text-sm shrink-0">{field.label}</Label>
                <div className="flex-1 relative">
                  <Input
                    {...register(field.key as keyof PromFormValues)}
                    placeholder={field.placeholder}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
                  />
                  {field.hint && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">
                      현재: {field.hint}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {mutation.isError && (
            <p className="text-red-400 text-sm">저장 실패: {mutation.error?.message}</p>
          )}

          {saved && (
            <p className="text-green-400 text-sm">✓ Notion에 저장되었습니다.</p>
          )}

          <Button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-500"
          >
            {mutation.isPending ? "저장 중..." : `${TIMEPOINTS.find(t => t.value === timepoint)?.label} PROM 저장`}
          </Button>
        </form>
      )}
    </div>
  )
}
