import type { Strategy } from "@/lib/types/sensei"
import { getVideoForLesson } from "./lessonVideos"

// ─── 내 기본 전략 시드 ──────────────────────────────────────

export const MY_STRATEGIES: Strategy[] = [
  {
    id: "my-gi-main",
    name: "코요테 하프가드 시스템",
    description: "하프가드 기반. 스승(조준용) 스타일.",
    ruleSet: "gi",
    type: "mine",
    createdAt: "2026-03-24",
    updatedAt: "2026-03-24",
    tags: ["coyote", "half-guard", "sweep"],
    flow: [
      {
        positionId: "standing",
        action: "가드풀 → 클로즈 or 버터플라이",
        branches: [
          { condition: "테이크다운 당하면", nextStepIndex: 3 },
        ],
      },
      {
        positionId: "closed",
        action: "클로즈 가드에서 그립 잡고 공격 위협",
        branches: [
          { condition: "상대가 포스처업", nextStepIndex: 2 },
          { condition: "상대가 한 다리 넘기면", nextStepIndex: 3 },
        ],
      },
      {
        positionId: "open",
        action: "오픈가드 → 거리 관리",
        branches: [
          { condition: "발 걸 수 있으면", nextStepIndex: 6 },
          { condition: "상대가 다가오면", nextStepIndex: 3 },
        ],
      },
      {
        positionId: "hg",
        action: "★ 하프가드 — 언더훅 확보가 최우선",
        lessonNumber: 47,
        videoUrl: getVideoForLesson(47)?.url,
        notes: "니쉴드로 거리 만들고 → 언더훅 → 싯업",
        branches: [
          { condition: "언더훅 잡으면", nextStepIndex: 4 },
          { condition: "상대가 눌러오면", nextStepIndex: 5 },
          { condition: "상대가 서면", nextStepIndex: 6 },
        ],
      },
      {
        positionId: "situp",
        action: "★ 싯업 가드 → 코요테 스윕 or 암드래그",
        lessonNumber: 35,
        notes: "싱글레그 그립 → 스윕 → 탑",
        branches: [
          { condition: "스윕 성공", nextStepIndex: 7 },
          { condition: "상대가 막으면", nextStepIndex: 8 },
          { condition: "다시 눕혀지면", nextStepIndex: 3 },
        ],
      },
      {
        positionId: "dhg",
        action: "딥하프 → 호머 스윕",
        notes: "밑으로 파고들어서 스윕",
        branches: [
          { condition: "스윕 성공", nextStepIndex: 7 },
          { condition: "실패", nextStepIndex: 3 },
        ],
      },
      {
        positionId: "dlr",
        action: "DLR → SLX or 싯업으로 전환",
        branches: [
          { condition: "훅 잡으면", nextStepIndex: 4 },
          { condition: "상대 무너지면", nextStepIndex: 3 },
        ],
      },
      {
        positionId: "side_top",
        action: "★ 사이드 컨트롤 → 마운트 or 백",
        lessonNumber: 2,
        branches: [
          { condition: "마운트 전환", nextStepIndex: 9 },
          { condition: "백테이크 기회", nextStepIndex: 8 },
        ],
      },
      {
        positionId: "back_top",
        action: "★ 백 컨트롤 → RNC 피니쉬",
        lessonNumber: 51,
      },
      {
        positionId: "mount_top",
        action: "마운트 → 초크 or 암바",
        lessonNumber: 38,
      },
    ],
  },
  {
    id: "my-escape-plan",
    name: "이스케이프 플랜",
    description: "불리한 포지션에서 탈출 우선순위",
    ruleSet: "gi",
    type: "mine",
    createdAt: "2026-03-24",
    updatedAt: "2026-03-24",
    tags: ["escape", "defense"],
    flow: [
      {
        positionId: "side_bottom",
        action: "사이드 당함 → 새우빼기 → 하프가드 만들기",
        lessonNumber: 1,
        videoUrl: getVideoForLesson(1)?.url,
        branches: [
          { condition: "하프가드 만들면", nextStepIndex: 3 },
          { condition: "못 빠지면", nextStepIndex: 0 },
        ],
      },
      {
        positionId: "mount_bottom",
        action: "마운트 당함 → 엘보우-니 탈출 → 하프가드",
        lessonNumber: 42,
        videoUrl: getVideoForLesson(42)?.url,
        branches: [
          { condition: "하프가드 만들면", nextStepIndex: 3 },
        ],
      },
      {
        positionId: "back_bottom",
        action: "백 당함 → 벽 만들고 → 하프가드로 전환",
        lessonNumber: 52,
        videoUrl: getVideoForLesson(52)?.url,
      },
      {
        positionId: "hg",
        action: "★ 하프가드 도착 → 메인 게임 시작",
        notes: "여기서부터 코요테 시스템 가동",
      },
    ],
  },
]

// ─── localStorage CRUD ───────────────────────────────────────

const STORAGE_KEY = "sensei-strategies"

export function loadMyStrategies(): Strategy[] {
  if (typeof window === "undefined") return MY_STRATEGIES
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return MY_STRATEGIES
}

