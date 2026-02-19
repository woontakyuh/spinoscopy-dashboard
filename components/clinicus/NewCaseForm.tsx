"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { NewCaseInput } from "@/lib/types/patient"

const schema = z.object({
  name: z.string().min(1, "환자명 필수"),
  pt_no: z.string(),
  age: z.string(),
  sex: z.enum(["M", "F"]),
  hospital: z.string(),
  op_date: z.string().min(1, "수술일 필수"),
  op_name: z.string().min(1, "수술명 필수"),
  level: z.string(),
  preop_dx: z.string(),
  vas: z.string(),
  odi: z.string(),
  joa: z.string(),
  ndi: z.string(),
  eq5d: z.string(),
})

type FormValues = z.infer<typeof schema>

export function NewCaseForm() {
  const [saved, setSaved] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sex: "M" as const, hospital: "Davos", pt_no: "", age: "", level: "", preop_dx: "", vas: "", odi: "", joa: "", ndi: "", eq5d: "", op_date: "", op_name: "", name: "" },
  })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const input: NewCaseInput = {
        name: values.name,
        pt_no: values.pt_no ?? "",
        age: values.age ?? "",
        sex: values.sex,
        hospital: values.hospital,
        op_date: values.op_date,
        op_name: values.op_name,
        level: values.level ?? "",
        class_a: [],
        class_b: [],
        op_category: [],
        landmark: [],
        surgeon: ["여운탁"],
        preop_dx: values.preop_dx ?? "",
        prom: {
          vas: values.vas,
          odi: values.odi,
          joa: values.joa,
          ndi: values.ndi,
          eq5d: values.eq5d,
        },
      }
      const res = await fetch("/api/notion/prom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error("등록 실패")
      const data = await res.json() as { pageId: string }
      return data.pageId
    },
    onSuccess: (pageId) => {
      setSaved(pageId)
      reset()
      setTimeout(() => setSaved(null), 5000)
    },
  })

  return (
    <form onSubmit={handleSubmit(values => mutation.mutate(values))} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-zinc-300 text-sm">환자명 *</Label>
          <Input {...register("name")} className="bg-zinc-800 border-zinc-700 text-white mt-1" placeholder="홍길동" />
          {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <Label className="text-zinc-300 text-sm">차트번호</Label>
          <Input {...register("pt_no")} className="bg-zinc-800 border-zinc-700 text-white mt-1" placeholder="12345678" />
        </div>

        <div>
          <Label className="text-zinc-300 text-sm">나이</Label>
          <Input {...register("age")} className="bg-zinc-800 border-zinc-700 text-white mt-1" placeholder="65" />
        </div>

        <div>
          <Label className="text-zinc-300 text-sm">성별</Label>
          <select {...register("sex")} className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm">
            <option value="M">남</option>
            <option value="F">여</option>
          </select>
        </div>

        <div>
          <Label className="text-zinc-300 text-sm">병원</Label>
          <select {...register("hospital")} className="mt-1 w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm">
            <option value="Davos">Davos</option>
            <option value="DTSH">DTSH</option>
            <option value="SNUH">SNUH</option>
            <option value="Keio">Keio</option>
          </select>
        </div>

        <div>
          <Label className="text-zinc-300 text-sm">수술일 *</Label>
          <Input {...register("op_date")} type="date" className="bg-zinc-800 border-zinc-700 text-white mt-1" />
          {errors.op_date && <p className="text-red-400 text-xs mt-1">{errors.op_date.message}</p>}
        </div>

        <div>
          <Label className="text-zinc-300 text-sm">수술명 *</Label>
          <Input {...register("op_name")} className="bg-zinc-800 border-zinc-700 text-white mt-1" placeholder="UBE L4-5 ULBD" />
          {errors.op_name && <p className="text-red-400 text-xs mt-1">{errors.op_name.message}</p>}
        </div>

        <div>
          <Label className="text-zinc-300 text-sm">Level</Label>
          <Input {...register("level")} className="bg-zinc-800 border-zinc-700 text-white mt-1" placeholder="L4-5" />
        </div>

        <div>
          <Label className="text-zinc-300 text-sm">수술 전 진단</Label>
          <Input {...register("preop_dx")} className="bg-zinc-800 border-zinc-700 text-white mt-1" placeholder="HIVD L4-5" />
        </div>
      </div>

      <div className="border-t border-zinc-700 pt-4">
        <p className="text-zinc-300 text-sm font-medium mb-3">수술 전 PROM (선택)</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "vas", label: "VAS (0-10)" },
            { key: "odi", label: "ODI (0-100)" },
            { key: "joa", label: "JOA" },
            { key: "ndi", label: "NDI" },
            { key: "eq5d", label: "EQ5D" },
          ].map(field => (
            <div key={field.key}>
              <Label className="text-zinc-400 text-xs">{field.label}</Label>
              <Input
                {...register(field.key as "vas" | "odi" | "joa" | "ndi" | "eq5d")}
                className="bg-zinc-800 border-zinc-700 text-white mt-1 h-8 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {mutation.isError && (
        <p className="text-red-400 text-sm">오류: {mutation.error?.message}</p>
      )}
      {saved && (
        <p className="text-green-400 text-sm">✓ Notion에 등록되었습니다. (ID: {saved.slice(0, 8)}...)</p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500">
        {mutation.isPending ? "등록 중..." : "케이스 등록"}
      </Button>
    </form>
  )
}
