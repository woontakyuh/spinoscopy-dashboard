export interface NavMapGamePlan {
  readonly id: string
  readonly label: string
  readonly positionIds: readonly string[]
  readonly isStrategy: boolean
}

export const BUILTIN_GAME_PLANS = [
  { id: "all", label: "전체", positionIds: [] as string[] },
  { id: "dlr", label: "DLR 게임", positionIds: ["dlr", "rdlr", "standing", "berimbolo", "backtake", "rnc", "open", "kguard", "slx", "butterfly"] },
  { id: "half", label: "하프가드", positionIds: ["hg", "dhg", "kshield", "halfbutt", "waiter", "underhook", "side", "mount", "standing"] },
  { id: "pass", label: "패스 게임", positionIds: ["standing", "hq", "smash", "side", "mount", "kob", "north", "open", "closed", "hg"] },
  { id: "leglock", label: "레그락", positionIds: ["slx", "xg", "ashi", "insideashi", "outsideashi", "5050", "honeyhole", "heelhook", "kneebar", "butterfly"] },
  { id: "back", label: "백→피니시", positionIds: ["backtake", "backcontrol", "rnc", "armbar", "triangle", "mount"] },
  { id: "closed", label: "클로즈 가드", positionIds: ["closed", "armbar", "triangle", "omoplata", "standing", "mount", "side"] },
]
