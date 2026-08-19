import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts"
import { calculateOvr } from "@/lib/sensei/ovr"
import type {
  Archetype,
  BjjAttributes,
  Position,
  PositionLayer,
} from "@/lib/types/sensei"
import {
  STAT_BARS as CHARACTER_STAT_BARS,
  cosineSimilarity,
} from "@/components/sensei/character/statConfig"
import { CountryFlag } from "@/components/sensei/character/CountryFlag"

const DETAIL_LABEL = "text-[10px] font-medium tracking-wide text-muted-foreground"

const LAYER_COLORS: Readonly<Record<PositionLayer, string>> = {
  standing: "#71717a",
  guard: "#3b82f6",
  passing: "#22c55e",
  control: "#f59e0b",
  submission: "#ef4444",
  leglock: "#dc2626",
}

interface AthleteSectionProps {
  readonly athlete: Archetype
}

interface AthleteComparisonSectionProps extends AthleteSectionProps {
  readonly attributes: BjjAttributes
}

export function AthleteIdentity({
  athlete,
  attributes,
}: AthleteComparisonSectionProps) {
  return (
    <section aria-labelledby="athlete-identity-label" className="space-y-1.5">
      <h5 id="athlete-identity-label" className={DETAIL_LABEL}>선수 정보</h5>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="flex items-center gap-1.5 text-base font-bold text-foreground">
            <CountryFlag flag={athlete.flag} className="h-4 w-6 rounded-[2px] shadow-sm" />
            {athlete.name}
          </h4>
          <p className="text-xs text-muted-foreground">
            {athlete.nickname} · {athlete.team}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="num text-lg font-bold text-amber-500">
            {calculateOvr(athlete.stats).ovr}
          </span>
          <span className="ml-1 text-[10px] text-muted-foreground">OVR</span>
          <p className="text-[10px] text-muted-foreground">
            <span className="num">{cosineSimilarity(attributes, athlete.stats)}</span>% match
          </p>
        </div>
      </div>
    </section>
  )
}

export function AthleteStyle({
  athlete,
  attributes,
}: AthleteComparisonSectionProps) {
  const radarData = CHARACTER_STAT_BARS.map((stat) => ({
    subject: stat.name,
    value: attributes[stat.key],
    compare: athlete.stats[stat.key],
  }))

  return (
    <section aria-labelledby="athlete-style-label" className="space-y-1.5">
      <h5 id="athlete-style-label" className={DETAIL_LABEL}>스타일</h5>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">{athlete.playstyle}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {CHARACTER_STAT_BARS.map((stat) => (
              <div
                key={stat.name}
                data-testid={`compare-row-${stat.key}`}
                className="flex items-center gap-1.5 text-[10px]"
              >
                <span className="w-16 shrink-0 text-muted-foreground">{stat.name}</span>
                <span className="num w-5 text-right font-semibold text-foreground">
                  {attributes[stat.key]}
                </span>
                <span className="text-muted-foreground/60">vs</span>
                <span
                  className="num w-5 font-semibold"
                  style={{ color: athlete.stats[stat.key] > attributes[stat.key] ? "#f87171" : "#4ade80" }}
                >
                  {athlete.stats[stat.key]}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div data-testid="athlete-mini-radar" className="hidden md:block">
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
                <Radar dataKey="value" stroke="#f97316" strokeWidth={1.5} fill="#f97316" fillOpacity={0.15} />
                <Radar dataKey="compare" stroke="#f87171" strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}

export function AthleteStrengths({ athlete }: AthleteSectionProps) {
  return (
    <section aria-labelledby="athlete-strengths-label" className="space-y-1.5">
      <h5 id="athlete-strengths-label" className={DETAIL_LABEL}>시그니처 강점</h5>
      {athlete.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {athlete.tags.map((tag) => (
            <span key={tag} className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground/70">
          등록된 시그니처 기술이 없습니다
        </p>
      )}
    </section>
  )
}

interface AthleteGameplanProps extends AthleteSectionProps {
  readonly positions: readonly Position[]
  readonly onNavigate: (tab: string) => void
}

export function AthleteGameplan({
  athlete,
  positions,
  onNavigate,
}: AthleteGameplanProps) {
  return (
    <section aria-labelledby="athlete-gameplan-label" className="space-y-1.5">
      <h5 id="athlete-gameplan-label" className={DETAIL_LABEL}>게임플랜</h5>
      {athlete.gameplan.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card p-2">
            <svg
              viewBox={`0 0 ${Math.max(athlete.gameplan.length * 140, 400)} 80`}
              className="w-full"
              style={{ minHeight: 70 }}
            >
              {athlete.gameplan.map((step, index) => {
                const x = 70 + index * 130
                const position = positions.find(
                  (item) => item.id === step.position
                    || item.name === step.position
                    || item.nameKr === step.position,
                )
                const color = position ? LAYER_COLORS[position.layer] : "#71717a"
                return (
                  <g key={`${step.position}:${index}`}>
                    {index > 0 && (
                      <path
                        d={`M${x - 95},40 Q${x - 60},25 ${x - 25},40`}
                        stroke={color}
                        strokeWidth={1.5}
                        fill="none"
                        markerEnd="url(#gp-arrow)"
                        opacity={0.6}
                      />
                    )}
                    <circle
                      cx={x}
                      cy={40}
                      r={16}
                      fill={color}
                      fillOpacity={0.15}
                      stroke={color}
                      strokeWidth={1.5}
                      className="cursor-pointer"
                      onClick={() => onNavigate("map")}
                    />
                    <text x={x} y={43} textAnchor="middle" fill={color} fontSize={8} fontWeight={700}>
                      {step.position.slice(0, 4)}
                    </text>
                    <text x={x} y={72} textAnchor="middle" fill="var(--muted-foreground)" fontSize={7} opacity={0.8}>
                      {step.action.slice(0, 18)}
                    </text>
                  </g>
                )
              })}
              <defs>
                <marker id="gp-arrow" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <polygon points="0 0, 6 2.5, 0 5" fill="var(--muted-foreground)" opacity={0.5} />
                </marker>
              </defs>
            </svg>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("map")}
            className="text-[10px] text-blue-400 hover:text-blue-300"
          >
            Map에서 자세히 보기 →
          </button>
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground/70">
          등록된 게임플랜이 없습니다
        </p>
      )}
    </section>
  )
}
