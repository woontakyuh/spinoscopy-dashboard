"use client"

import type { GameplanStep } from "@/lib/types/sensei"

interface GameplanFlowProps {
  gameplan: GameplanStep[]
  playerName: string
}

const POSITION_COLORS: Record<string, string> = {
  // Guard
  HG: "#a855f7", DHG: "#a855f7", DLR: "#a855f7", RDLR: "#a855f7", SLX: "#a855f7",
  XG: "#a855f7", Butterfly: "#a855f7", Closed: "#a855f7", Open: "#a855f7",
  Spider: "#a855f7", Lasso: "#a855f7", "Sit-up": "#a855f7", KShield: "#a855f7",
  Bolo: "#a855f7", KGuard: "#a855f7",
  // Passing
  KCP: "#22c55e", Torreando: "#22c55e", Smash: "#22c55e", Stack: "#22c55e",
  LongStep: "#22c55e", HQ: "#22c55e",
  // Control
  Mount: "#f97316", "S-Mount": "#f97316", SideCtrl: "#f97316", BackTake: "#f97316",
  BackMount: "#f97316", KoB: "#f97316",
  // Finishing
  RNC: "#ef4444", ArmB: "#ef4444", Triangle: "#ef4444", Omo: "#ef4444",
  Darce: "#ef4444", Guillotine: "#ef4444", CrossChoke: "#ef4444",
  // Takedowns
  Takedown: "#06b6d4", SingleLeg: "#06b6d4", DoubleLeg: "#06b6d4",
  // LegLocks
  Ashi: "#eab308", Saddle: "#eab308", IHH: "#eab308", OHH: "#eab308",
  // Sweeps
  SingleSweep: "#a855f7", HipSweep: "#a855f7",
}

function getColor(position: string): string {
  return POSITION_COLORS[position] || "#71717a"
}

export function GameplanFlow({ gameplan, playerName }: GameplanFlowProps) {
  if (gameplan.length === 0) return null

  return (
    <div>
      <h4 className="text-[12px] text-[rgba(255,255,255,0.5)] mb-3">
        {playerName}의 시그니처 게임플랜
      </h4>
      <div className="space-y-1">
        {gameplan.map((step, i) => {
          const color = getColor(step.position)
          const isLast = step.next.length === 0

          return (
            <div key={`${step.position}-${String(i)}`} className="flex items-stretch gap-2">
              {/* Vertical line connector */}
              <div className="flex flex-col items-center w-5 shrink-0">
                <div
                  className="w-3 h-3 rounded-full border-2 shrink-0 mt-2.5"
                  style={{ borderColor: color, background: isLast ? color : "transparent" }}
                />
                {!isLast && (
                  <div className="w-px flex-1 min-h-4" style={{ background: `${color}20` }} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[12px] font-mono font-semibold px-1.5 py-0.5 rounded-lg"
                    style={{ color, background: `${color}12`, border: `1px solid ${color}20` }}
                  >
                    {step.position}
                  </span>
                  {step.next.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[rgba(255,255,255,0.25)]">→</span>
                      {step.next.map((n) => (
                        <span
                          key={n}
                          className="text-[11px] font-mono px-1 py-0.5 rounded-lg"
                          style={{ color: getColor(n), background: `${getColor(n)}0d` }}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[rgba(255,255,255,0.5)] mt-0.5">{step.action}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
