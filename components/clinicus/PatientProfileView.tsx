"use client"

import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import type { PatientProfile } from "@/lib/notion/patients"

interface Props {
  pageId: string
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  )
}

function Field({ label, value, unit, color }: { label: string; value: string | number | null | undefined; unit?: string; color?: string }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm num font-medium ${color ?? "text-foreground"}`}>
        {value}{unit && <span className="text-xs text-muted-foreground ml-0.5">{unit}</span>}
      </span>
    </div>
  )
}

function ComorbidityBadges(profile: PatientProfile) {
  const items: string[] = []
  if (profile.htn) items.push("HTN")
  if (profile.dm) items.push("DM")
  if (profile.dl) items.push("DL")
  if (profile.cardiac) items.push("Cardiac")
  if (profile.renal) items.push("Renal")
  if (profile.liver) items.push("Liver")
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(item => (
        <Badge key={item} variant="outline" className="text-[10px] border-amber-600/30 text-amber-400">
          {item}
        </Badge>
      ))}
    </div>
  )
}

export function PatientProfileView({ pageId }: Props) {
  const { data: profile, isLoading } = useQuery<PatientProfile>({
    queryKey: ["patient-profile", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/notion/patients?pageId=${pageId}&action=profile`)
      if (!res.ok) throw new Error("프로필 조회 실패")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48 bg-muted" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 bg-muted" />)}
        </div>
      </div>
    )
  }

  if (!profile) return null

  const hasBody = profile.height || profile.weight || profile.bmi || profile.bmd
  const hasBTM = profile.vitd || profile.ctx || profile.p1np || profile.hba1c
  const hasBTMfu = profile.vitd_fu || profile.ctx_fu || profile.p1np_fu
  const hasSpine = profile.pi || profile.pt || profile.ss
  const hasSurgical = profile.op_time || profile.ebl || profile.postop_los || profile.total_los
  const hasCost = false // cost 표시 제외
  const comorbidities = ComorbidityBadges(profile)

  return (
    <div className="space-y-4 animate-fade-in-up">

      {/* AI Insight */}
      {profile.ai_insight && (
        <div className="rounded-lg bg-indigo-950/30 border border-indigo-500/20 px-4 py-3">
          <p className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold mb-1.5">AI Insight</p>
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{profile.ai_insight}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

        {/* Clinical Info */}
        <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2.5">
          <Section title="진단/분류">
            {profile.preop_dx && <Field label="Preop Dx" value={profile.preop_dx} />}
            {profile.level && <Field label="Level" value={profile.level} />}
            {profile.ctl.length > 0 && <Field label="CTL" value={profile.ctl.join(", ")} />}
            {profile.class_a.length > 0 && <Field label="ClassA" value={profile.class_a.join(", ")} />}
            {profile.class_b.length > 0 && <Field label="ClassB" value={profile.class_b.join(", ")} />}
            {profile.class_c.length > 0 && <Field label="ClassC" value={profile.class_c.join(", ")} />}
            {profile.op_category.length > 0 && <Field label="수술 분류" value={profile.op_category.join(", ")} />}
          </Section>
        </div>

        {/* Body Metrics + BTM */}
        {(hasBody || hasBTM) && (
          <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2.5">
            {hasBody && (
              <Section title="신체/골밀도">
                <Field label="키" value={profile.height} unit="cm" />
                <Field label="체중" value={profile.weight} unit="kg" />
                <Field label="BMI" value={profile.bmi} color={profile.bmi && profile.bmi < 18.5 ? "text-amber-400" : undefined} />
                <Field label="BMD" value={profile.bmd} color={profile.bmd && profile.bmd < -2.5 ? "text-red-400" : undefined} />
              </Section>
            )}
            {hasBTM && (
              <Section title="Lab / BTM">
                <Field label="VitD" value={profile.vitd} unit="ng/mL" color={profile.vitd && profile.vitd < 20 ? "text-amber-400" : undefined} />
                <Field label="CTx" value={profile.ctx} />
                <Field label="P1NP" value={profile.p1np} />
                <Field label="HbA1c" value={profile.hba1c} unit="%" color={profile.hba1c && profile.hba1c > 7 ? "text-red-400" : undefined} />
                {hasBTMfu && (
                  <>
                    <div className="border-t border-border/30 mt-1.5 pt-1.5">
                      <p className="text-[9px] text-muted-foreground/70 mb-1">F/U</p>
                    </div>
                    <Field label="VitD f/u" value={profile.vitd_fu} unit="ng/mL" />
                    <Field label="CTx f/u" value={profile.ctx_fu} />
                    <Field label="P1NP f/u" value={profile.p1np_fu} />
                    {profile.btm_fu_date && <Field label="F/U date" value={profile.btm_fu_date} />}
                  </>
                )}
              </Section>
            )}
          </div>
        )}

        {/* Surgical / Spine / Comorbidities */}
        <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2.5 space-y-3">
          {hasSurgical && (
            <Section title="수술 정보">
              <Field label="Op time" value={profile.op_time} unit="min" />
              <Field label="EBL" value={profile.ebl} unit="mL" />
              <Field label="수술후 재원" value={profile.postop_los} unit="일" />
              <Field label="총 재원" value={profile.total_los} unit="일" />
            </Section>
          )}
          {hasSpine && (
            <Section title="척추 정렬">
              <Field label="PI" value={profile.pi} unit="°" />
              <Field label="PT" value={profile.pt} unit="°" />
              <Field label="SS" value={profile.ss} unit="°" />
            </Section>
          )}
          {comorbidities && (
            <Section title="기저질환">
              {comorbidities}
            </Section>
          )}
          {profile.pmhx && (
            <Section title="PMHx">
              <p className="text-xs text-muted-foreground leading-relaxed">{profile.pmhx}</p>
            </Section>
          )}
        </div>
      </div>

      {/* Notes / Complications */}
      {(profile.cx || profile.note) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {profile.cx && (
            <div className="rounded-lg bg-red-950/20 border border-red-500/15 px-3 py-2.5">
              <Section title="합병증 (Cx)">
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{profile.cx}</p>
              </Section>
            </div>
          )}
          {profile.note && (
            <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2.5">
              <Section title="Note">
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{profile.note}</p>
              </Section>
            </div>
          )}
        </div>
      )}

      {/* Cost */}
      {hasCost && (
        <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2.5">
          <Section title="비용 (만원)">
            <div className="flex gap-4">
              <Field label="총 비용" value={profile.cost_total} />
              <Field label="환자 부담" value={profile.cost_patient} />
              <Field label="공단 부담" value={profile.cost_insurance} />
            </div>
          </Section>
        </div>
      )}

      {/* Links */}
      <div className="flex gap-2">
        {profile.obsidian_link && (
          <a href={profile.obsidian_link} target="_blank" rel="noreferrer"
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
            Obsidian ↗
          </a>
        )}
      </div>
    </div>
  )
}
