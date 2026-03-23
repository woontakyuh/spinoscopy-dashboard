import type { Position, Transition } from "@/lib/types/sensei"
import { LESSON_VIDEOS } from "./lessonVideos"

// ─── Positions ───────────────────────────────────────────────

export const POSITIONS: Position[] = [
  // Standing
  { id: "standing", name: "Standing", nameKr: "스탠딩", layer: "standing", perspective: "neutral", lessonNumbers: [57, 58, 59, 60], ruleSet: "common" },

  // Guard — Closed Family
  { id: "closed", name: "Closed Guard", nameKr: "클로즈 가드", layer: "guard", family: "closed", perspective: "bottom", lessonNumbers: [5, 24, 32, 33, 49], ruleSet: "common" },

  // Guard — Half Family
  { id: "hg", name: "Half Guard", nameKr: "하프 가드", layer: "guard", family: "half", perspective: "bottom", lessonNumbers: [47, 48], ruleSet: "common" },
  { id: "dhg", name: "Deep Half", nameKr: "딥 하프", layer: "guard", family: "half", perspective: "bottom", parent: "hg", ruleSet: "common" },
  { id: "kshield", name: "Knee Shield", nameKr: "니쉴드", layer: "guard", family: "half", perspective: "bottom", parent: "hg", ruleSet: "common" },
  { id: "halfbutt", name: "Half Butterfly", nameKr: "하프 버터플라이", layer: "guard", family: "half", perspective: "bottom", parent: "hg", ruleSet: "common" },
  { id: "waiter", name: "Waiter Guard", nameKr: "웨이터 가드", layer: "guard", family: "half", perspective: "bottom", parent: "hg", ruleSet: "common" },

  // Guard — Sitting Family
  { id: "situp", name: "Sit-up Guard", nameKr: "싯업 가드", layer: "guard", family: "sitting", perspective: "bottom", lessonNumbers: [35, 36], ruleSet: "common" },

  // Guard — Open Family
  { id: "open", name: "Open Guard", nameKr: "오픈 가드", layer: "guard", family: "open", perspective: "bottom", lessonNumbers: [22, 27, 28, 29, 30, 31], ruleSet: "common" },
  { id: "dlr", name: "De La Riva", nameKr: "DLR", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "common" },
  { id: "rdlr", name: "Reverse DLR", nameKr: "리버스 DLR", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "common" },
  { id: "spider", name: "Spider Guard", nameKr: "스파이더", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "gi" },
  { id: "lasso", name: "Lasso Guard", nameKr: "라쏘", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "gi" },
  { id: "kguard", name: "K Guard", nameKr: "K가드", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "nogi" },
  { id: "lapel", name: "Lapel Guard", nameKr: "라펠 가드", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "gi" },
  { id: "worm", name: "Worm Guard", nameKr: "웜 가드", layer: "guard", family: "open", perspective: "bottom", parent: "lapel", ruleSet: "gi" },
  { id: "squid", name: "Squid Guard", nameKr: "스퀴드", layer: "guard", family: "open", perspective: "bottom", parent: "lapel", ruleSet: "gi" },
  { id: "rubber", name: "Rubber Guard", nameKr: "러버 가드", layer: "guard", family: "open", perspective: "bottom", parent: "open", ruleSet: "nogi" },
  { id: "bolo", name: "Berimbolo", nameKr: "베림볼로", layer: "guard", family: "open", perspective: "bottom", parent: "dlr", ruleSet: "common" },

  // Guard — Butterfly/SLX Family
  { id: "butterfly", name: "Butterfly Guard", nameKr: "더블훅 가드", layer: "guard", family: "butterfly", perspective: "bottom", lessonNumbers: [20, 21], ruleSet: "common" },
  { id: "slx", name: "Single Leg X", nameKr: "싱글렉 X", layer: "guard", family: "butterfly", perspective: "bottom", lessonNumbers: [23, 24, 25, 26], ruleSet: "common" },
  { id: "xg", name: "X Guard", nameKr: "X가드", layer: "guard", family: "butterfly", perspective: "bottom", parent: "slx", ruleSet: "common" },

  // Passing (탑)
  { id: "hq", name: "Headquarters", nameKr: "본부 자세", layer: "passing", perspective: "top", lessonNumbers: [9, 10], ruleSet: "common" },
  { id: "kcp", name: "Knee Cut Pass", nameKr: "니슬라이드", layer: "passing", perspective: "top", lessonNumbers: [7], ruleSet: "common" },
  { id: "torreando", name: "Torreando", nameKr: "토레안도", layer: "passing", perspective: "top", lessonNumbers: [12], ruleSet: "common" },
  { id: "overunder", name: "Over-Under", nameKr: "오버언더", layer: "passing", perspective: "top", lessonNumbers: [13], ruleSet: "common" },
  { id: "legdrag", name: "Leg Drag", nameKr: "레그드래그", layer: "passing", perspective: "top", lessonNumbers: [11], ruleSet: "common" },
  { id: "halfpass", name: "Half Guard Pass", nameKr: "하프가드 패스", layer: "passing", perspective: "top", lessonNumbers: [44, 45, 46], ruleSet: "common" },
  { id: "smash", name: "Smash Pass", nameKr: "스매시", layer: "passing", perspective: "top", ruleSet: "common" },
  { id: "longstep", name: "Long Step", nameKr: "롱스텝", layer: "passing", perspective: "top", ruleSet: "common" },

  // Control — Top (유리)
  { id: "side_top", name: "Side Control", nameKr: "사이드 컨트롤", layer: "control", perspective: "top", lessonNumbers: [2, 4, 37, 50], ruleSet: "common" },
  { id: "kob_top", name: "Knee on Belly", nameKr: "니온벨리", layer: "control", perspective: "top", lessonNumbers: [17, 18], ruleSet: "common" },
  { id: "mount_top", name: "Mount", nameKr: "마운트", layer: "control", perspective: "top", lessonNumbers: [38, 39], ruleSet: "common" },
  { id: "back_top", name: "Back Control", nameKr: "백 컨트롤", layer: "control", perspective: "top", lessonNumbers: [51, 53, 55], ruleSet: "common" },
  { id: "ns_top", name: "North-South", nameKr: "노스사우스", layer: "control", perspective: "top", ruleSet: "common" },
  { id: "turtle_top", name: "Turtle (attacking)", nameKr: "터틀 공격", layer: "control", perspective: "top", lessonNumbers: [54], ruleSet: "common" },

  // Control — Bottom (불리)
  { id: "side_bottom", name: "Side (bottom)", nameKr: "사이드 당함", layer: "control", perspective: "bottom", lessonNumbers: [1, 3], ruleSet: "common" },
  { id: "kob_bottom", name: "KoB (bottom)", nameKr: "니온벨리 당함", layer: "control", perspective: "bottom", lessonNumbers: [19], ruleSet: "common" },
  { id: "mount_bottom", name: "Mount (bottom)", nameKr: "마운트 당함", layer: "control", perspective: "bottom", lessonNumbers: [40, 41, 42], ruleSet: "common" },
  { id: "back_bottom", name: "Back (defending)", nameKr: "백 당함", layer: "control", perspective: "bottom", lessonNumbers: [52], ruleSet: "common" },
  { id: "turtle_bottom", name: "Turtle (defending)", nameKr: "터틀 방어", layer: "control", perspective: "bottom", lessonNumbers: [56], ruleSet: "common" },

  // Leg Lock Entanglements
  { id: "ashi", name: "Ashi Garami", nameKr: "아시가라미", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  { id: "slashi", name: "Single Leg Ashi", nameKr: "싱글렉 아시", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  { id: "saddle", name: "Saddle/411", nameKr: "새들", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  { id: "outashi", name: "Outside Ashi", nameKr: "아웃사이드 아시", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },
  { id: "5050", name: "50/50", nameKr: "피프티피프티", layer: "leglock", perspective: "neutral", ruleSet: "nogi" },

  // Submissions
  { id: "rnc", name: "RNC", nameKr: "RNC", layer: "submission", ruleSet: "common" },
  { id: "triangle", name: "Triangle", nameKr: "삼각", layer: "submission", ruleSet: "common" },
  { id: "armb", name: "Armbar", nameKr: "암바", layer: "submission", ruleSet: "common" },
  { id: "kimura", name: "Kimura", nameKr: "키무라", layer: "submission", ruleSet: "common" },
  { id: "guillotine", name: "Guillotine", nameKr: "기요틴", layer: "submission", ruleSet: "common" },
  { id: "darce", name: "D'arce", nameKr: "다스", layer: "submission", ruleSet: "common" },
  { id: "crosschoke", name: "Cross Choke", nameKr: "크로스초크", layer: "submission", ruleSet: "gi" },
  { id: "bowarrow", name: "Bow & Arrow", nameKr: "보우앤아로우", layer: "submission", ruleSet: "gi" },
  { id: "ezekiel", name: "Ezekiel", nameKr: "이지키엘", layer: "submission", ruleSet: "gi" },
  { id: "americana", name: "Americana", nameKr: "아메리카나", layer: "submission", ruleSet: "common" },
  { id: "ihh", name: "Inside Heel Hook", nameKr: "인사이드 힐훅", layer: "submission", ruleSet: "nogi" },
  { id: "ohh", name: "Outside Heel Hook", nameKr: "아웃사이드 힐훅", layer: "submission", ruleSet: "nogi" },
  { id: "sfl", name: "Straight Foot Lock", nameKr: "스트레이트 풋락", layer: "submission", ruleSet: "common" },
  { id: "kneebar", name: "Knee Bar", nameKr: "니바", layer: "submission", ruleSet: "nogi" },
  { id: "toehold", name: "Toe Hold", nameKr: "토홀드", layer: "submission", ruleSet: "nogi" },
]

// ─── Helper: resolve videoUrl from lessonNumber ──────────────

function videoForLesson(n: number): string | undefined {
  const key = `lesson_${String(n).padStart(2, "0")}`
  return LESSON_VIDEOS[key]?.url
}

// ─── Transitions ─────────────────────────────────────────────

export const TRANSITIONS: Transition[] = [
  // Standing → Guard
  { from: "standing", to: "closed", action: "풀가드", actionEn: "Guard Pull", type: "guard_pull", lessonNumber: 60, videoUrl: videoForLesson(60), ruleSet: "common" },
  { from: "standing", to: "butterfly", action: "시팅 가드풀", actionEn: "Sitting Guard Pull", type: "guard_pull", ruleSet: "common" },
  { from: "standing", to: "dlr", action: "DLR 가드풀", actionEn: "DLR Guard Pull", type: "guard_pull", ruleSet: "common" },
  // Standing → Top
  { from: "standing", to: "side_top", action: "테이크다운", actionEn: "Takedown", type: "takedown", lessonNumber: 59, videoUrl: videoForLesson(59), ruleSet: "common" },

  // Guard → Guard (Half family)
  { from: "hg", to: "dhg", action: "밑으로 파고들기", actionEn: "Underhook deep", condition: "상대 무게 실리면", type: "transition", ruleSet: "common" },
  { from: "hg", to: "kshield", action: "무릎 세우기", actionEn: "Frame with knee", condition: "거리 필요할 때", type: "transition", ruleSet: "common" },
  { from: "hg", to: "situp", action: "언더훅 잡고 일어나기", actionEn: "Underhook sit-up", condition: "언더훅 확보 시", type: "transition", ruleSet: "common" },
  { from: "hg", to: "halfbutt", action: "버터플라이 훅", actionEn: "Butterfly hook", condition: "한쪽 훅 걸면", type: "transition", ruleSet: "common" },
  { from: "hg", to: "dlr", action: "발 걸기", actionEn: "DLR hook", condition: "상대가 서면", type: "transition", ruleSet: "common" },
  { from: "hg", to: "closed", action: "풀가드 리커버리", actionEn: "Full guard recovery", condition: "다리 넣기 성공", type: "recovery", lessonNumber: 48, videoUrl: videoForLesson(48), ruleSet: "common" },
  { from: "hg", to: "open", action: "오픈가드 리커버리", actionEn: "Open guard recovery", condition: "프레임 + 힙이스케이프", type: "recovery", lessonNumber: 48, videoUrl: videoForLesson(48), ruleSet: "common" },
  { from: "kshield", to: "hg", action: "하프로 전환", actionEn: "Back to half", type: "transition", ruleSet: "common" },
  { from: "kshield", to: "situp", action: "싯업 전환", actionEn: "Sit-up transition", type: "transition", ruleSet: "common" },
  { from: "dhg", to: "butterfly", action: "더블훅 전환", actionEn: "Butterfly transition", type: "transition", ruleSet: "common" },

  // Guard → Guard (Open family)
  { from: "closed", to: "open", action: "다리 풀기", actionEn: "Open legs", type: "transition", ruleSet: "common" },
  { from: "closed", to: "hg", action: "한쪽 넘어가면", actionEn: "Half guard", condition: "상대 한쪽 다리 통과", type: "transition", ruleSet: "common" },
  { from: "open", to: "closed", action: "다리 잠그기", actionEn: "Close guard", type: "transition", ruleSet: "common" },
  { from: "open", to: "situp", action: "일어나기", actionEn: "Sit up", type: "transition", ruleSet: "common" },
  { from: "open", to: "dlr", action: "DLR 훅", actionEn: "DLR hook", condition: "상대가 서면", type: "transition", ruleSet: "common" },
  { from: "open", to: "slx", action: "SLX 세팅", actionEn: "SLX setup", type: "transition", lessonNumber: 23, videoUrl: videoForLesson(23), ruleSet: "common" },
  { from: "open", to: "butterfly", action: "훅 세팅", actionEn: "Hook setup", type: "transition", ruleSet: "common" },
  { from: "situp", to: "open", action: "눕혀지면", actionEn: "Pushed down", type: "transition", ruleSet: "common" },
  { from: "dlr", to: "rdlr", action: "리버스 전환", actionEn: "Switch to RDLR", type: "transition", ruleSet: "common" },
  { from: "dlr", to: "bolo", action: "베림볼로", actionEn: "Berimbolo", type: "transition", ruleSet: "common" },
  { from: "dlr", to: "slx", action: "SLX 진입", actionEn: "Enter SLX", type: "transition", ruleSet: "common" },
  { from: "dlr", to: "kguard", action: "K가드", actionEn: "K Guard entry", type: "transition", ruleSet: "nogi" },
  { from: "rdlr", to: "dlr", action: "DLR 복귀", actionEn: "Back to DLR", type: "transition", ruleSet: "common" },
  { from: "rdlr", to: "bolo", action: "베림볼로", actionEn: "Berimbolo", type: "transition", ruleSet: "common" },
  { from: "butterfly", to: "slx", action: "SLX 전환", actionEn: "Transition to SLX", condition: "한쪽 훅 리프트", type: "transition", lessonNumber: 23, videoUrl: videoForLesson(23), ruleSet: "common" },
  { from: "butterfly", to: "xg", action: "X가드 전환", actionEn: "X Guard", type: "transition", ruleSet: "common" },
  { from: "slx", to: "xg", action: "X가드 전환", actionEn: "X Guard", type: "transition", ruleSet: "common" },
  { from: "slx", to: "butterfly", action: "버터플라이 복귀", actionEn: "Back to butterfly", type: "transition", ruleSet: "common" },
  // Gi-only guard transitions
  { from: "spider", to: "lasso", action: "라쏘 전환", actionEn: "Lasso transition", type: "transition", ruleSet: "gi" },
  { from: "lasso", to: "spider", action: "스파이더 복귀", actionEn: "Back to spider", type: "transition", ruleSet: "gi" },
  { from: "lapel", to: "worm", action: "웜가드", actionEn: "Worm Guard", type: "transition", ruleSet: "gi" },
  { from: "worm", to: "squid", action: "스퀴드", actionEn: "Squid Guard", type: "transition", ruleSet: "gi" },
  // Leglock entries
  { from: "slx", to: "ashi", action: "아시 진입", actionEn: "Ashi entry", type: "transition", ruleSet: "nogi" },
  { from: "slx", to: "saddle", action: "새들 진입", actionEn: "Saddle entry", type: "transition", ruleSet: "nogi" },
  { from: "kguard", to: "ashi", action: "아시 진입", actionEn: "Ashi entry", type: "transition", ruleSet: "nogi" },

  // Sweeps (Guard → Top)
  { from: "closed", to: "mount_top", action: "시저스 스윕", actionEn: "Scissor Sweep", type: "sweep", lessonNumber: 32, videoUrl: videoForLesson(32), ruleSet: "common" },
  { from: "closed", to: "mount_top", action: "플라워 스윕", actionEn: "Flower Sweep", type: "sweep", lessonNumber: 33, videoUrl: videoForLesson(33), ruleSet: "common" },
  { from: "closed", to: "back_top", action: "암드래그 백테이크", actionEn: "Arm Drag Back Take", type: "sweep", lessonNumber: 49, videoUrl: videoForLesson(49), ruleSet: "common" },
  { from: "hg", to: "side_top", action: "하프가드 스윕", actionEn: "Half Guard Sweep", type: "sweep", lessonNumber: 47, videoUrl: videoForLesson(47), ruleSet: "common" },
  { from: "situp", to: "side_top", action: "코요테 스윕", actionEn: "Coyote Sweep", type: "sweep", ruleSet: "common" },
  { from: "butterfly", to: "side_top", action: "더블앵클 스윕", actionEn: "Double Ankle Sweep", type: "sweep", lessonNumber: 20, videoUrl: videoForLesson(20), ruleSet: "common" },
  { from: "slx", to: "side_top", action: "SLX 스윕", actionEn: "SLX Sweep", type: "sweep", lessonNumber: 24, videoUrl: videoForLesson(24), ruleSet: "common" },
  { from: "xg", to: "side_top", action: "X가드 스윕", actionEn: "X Guard Sweep", type: "sweep", ruleSet: "common" },
  { from: "bolo", to: "back_top", action: "베림볼로 백테이크", actionEn: "Berimbolo Back Take", type: "sweep", ruleSet: "common" },
  { from: "spider", to: "mount_top", action: "스파이더 스윕", actionEn: "Spider Sweep", type: "sweep", ruleSet: "gi" },
  { from: "lasso", to: "mount_top", action: "라쏘 스윕", actionEn: "Lasso Sweep", type: "sweep", ruleSet: "gi" },

  // Passes (Top → Side)
  { from: "hq", to: "side_top", action: "니슬라이드", actionEn: "Knee Cut Pass", type: "pass", lessonNumber: 7, videoUrl: videoForLesson(7), ruleSet: "common" },
  { from: "hq", to: "side_top", action: "토레안도", actionEn: "Torreando", type: "pass", lessonNumber: 12, videoUrl: videoForLesson(12), ruleSet: "common" },
  { from: "hq", to: "side_top", action: "레그드래그", actionEn: "Leg Drag", type: "pass", lessonNumber: 11, videoUrl: videoForLesson(11), ruleSet: "common" },
  { from: "hq", to: "side_top", action: "오버언더", actionEn: "Over-Under", type: "pass", lessonNumber: 13, videoUrl: videoForLesson(13), ruleSet: "common" },
  { from: "halfpass", to: "side_top", action: "하프패스", actionEn: "Half Guard Pass", type: "pass", lessonNumber: 44, videoUrl: videoForLesson(44), ruleSet: "common" },

  // Control → Control (Top transitions)
  { from: "side_top", to: "mount_top", action: "마운트 전환", actionEn: "Mount transition", type: "transition", lessonNumber: 37, videoUrl: videoForLesson(37), ruleSet: "common" },
  { from: "side_top", to: "kob_top", action: "니온벨리", actionEn: "Knee on Belly", type: "transition", ruleSet: "common" },
  { from: "side_top", to: "back_top", action: "백테이크", actionEn: "Back Take", type: "transition", lessonNumber: 50, videoUrl: videoForLesson(50), ruleSet: "common" },
  { from: "side_top", to: "ns_top", action: "노스사우스", actionEn: "North-South", type: "transition", ruleSet: "common" },
  { from: "kob_top", to: "mount_top", action: "마운트", actionEn: "Mount", type: "transition", ruleSet: "common" },
  { from: "kob_top", to: "side_top", action: "사이드 복귀", actionEn: "Back to side", type: "transition", ruleSet: "common" },
  { from: "mount_top", to: "back_top", action: "백테이크", actionEn: "Back Take", condition: "상대가 뒤집으려 하면", type: "transition", ruleSet: "common" },
  { from: "turtle_top", to: "back_top", action: "터틀 백테이크", actionEn: "Turtle Back Take", type: "transition", lessonNumber: 54, videoUrl: videoForLesson(54), ruleSet: "common" },

  // Escapes (Bottom → Guard)
  { from: "side_bottom", to: "hg", action: "사이드 탈출 → 하프", actionEn: "Side Escape to HG", type: "escape", lessonNumber: 1, videoUrl: videoForLesson(1), ruleSet: "common" },
  { from: "side_bottom", to: "closed", action: "사이드 탈출 → 풀가드", actionEn: "Side Escape to Closed", type: "escape", lessonNumber: 3, videoUrl: videoForLesson(3), ruleSet: "common" },
  { from: "mount_bottom", to: "hg", action: "하프가드 전환 탈출", actionEn: "Mount Escape to HG", type: "escape", lessonNumber: 42, videoUrl: videoForLesson(42), ruleSet: "common" },
  { from: "mount_bottom", to: "slx", action: "SLX 전환 탈출", actionEn: "Mount Escape to SLX", type: "escape", lessonNumber: 41, videoUrl: videoForLesson(41), ruleSet: "common" },
  { from: "mount_bottom", to: "open", action: "보조지 탈출", actionEn: "Bridge Escape", type: "escape", lessonNumber: 40, videoUrl: videoForLesson(40), ruleSet: "common" },
  { from: "kob_bottom", to: "open", action: "니온벨리 탈출", actionEn: "KoB Escape", type: "escape", lessonNumber: 19, videoUrl: videoForLesson(19), ruleSet: "common" },
  { from: "back_bottom", to: "hg", action: "백 탈출", actionEn: "Back Escape", type: "escape", lessonNumber: 52, videoUrl: videoForLesson(52), ruleSet: "common" },
  { from: "turtle_bottom", to: "open", action: "터틀 빠른탈출", actionEn: "Turtle Quick Escape", type: "escape", lessonNumber: 56, ruleSet: "common" },
  { from: "turtle_bottom", to: "standing", action: "터틀 스탠딩 탈출", actionEn: "Turtle Stand", type: "escape", lessonNumber: 56, ruleSet: "common" },

  // Submissions
  { from: "closed", to: "triangle", action: "삼각", actionEn: "Triangle", type: "submission", lessonNumber: 34, videoUrl: videoForLesson(34), ruleSet: "common" },
  { from: "closed", to: "crosschoke", action: "크로스 초크", actionEn: "Cross Choke", type: "submission", lessonNumber: 5, videoUrl: videoForLesson(5), ruleSet: "gi" },
  { from: "side_top", to: "armb", action: "사이드 암바", actionEn: "Side Armbar", type: "submission", lessonNumber: 4, videoUrl: videoForLesson(4), ruleSet: "common" },
  { from: "side_top", to: "kimura", action: "기무라", actionEn: "Kimura", type: "submission", ruleSet: "common" },
  { from: "side_top", to: "americana", action: "아메리카나", actionEn: "Americana", type: "submission", ruleSet: "common" },
  { from: "kob_top", to: "armb", action: "니온벨리 서브", actionEn: "KoB Submission", type: "submission", lessonNumber: 18, videoUrl: videoForLesson(18), ruleSet: "common" },
  { from: "mount_top", to: "crosschoke", action: "마운트 초크", actionEn: "Mount Cross Choke", type: "submission", lessonNumber: 38, videoUrl: videoForLesson(38), ruleSet: "gi" },
  { from: "mount_top", to: "ezekiel", action: "이지키엘", actionEn: "Ezekiel", type: "submission", lessonNumber: 38, videoUrl: videoForLesson(38), ruleSet: "gi" },
  { from: "mount_top", to: "armb", action: "마운트 암바", actionEn: "Mount Armbar", type: "submission", lessonNumber: 39, videoUrl: videoForLesson(39), ruleSet: "common" },
  { from: "back_top", to: "rnc", action: "RNC", actionEn: "Rear Naked Choke", type: "submission", lessonNumber: 51, videoUrl: videoForLesson(51), ruleSet: "common" },
  { from: "back_top", to: "bowarrow", action: "보우앤아로우", actionEn: "Bow and Arrow", type: "submission", lessonNumber: 51, videoUrl: videoForLesson(51), ruleSet: "gi" },

  // Leglock submissions
  { from: "ashi", to: "ihh", action: "인사이드 힐훅", actionEn: "Inside Heel Hook", type: "submission", ruleSet: "nogi" },
  { from: "ashi", to: "sfl", action: "풋락", actionEn: "Straight Foot Lock", type: "submission", ruleSet: "common" },
  { from: "ashi", to: "slashi", action: "싱글렉 아시", actionEn: "Single Leg Ashi", type: "transition", ruleSet: "nogi" },
  { from: "slashi", to: "kneebar", action: "니바", actionEn: "Knee Bar", type: "submission", ruleSet: "nogi" },
  { from: "saddle", to: "ihh", action: "인사이드 힐훅", actionEn: "Inside Heel Hook", type: "submission", ruleSet: "nogi" },
  { from: "saddle", to: "ohh", action: "아웃사이드 힐훅", actionEn: "Outside Heel Hook", type: "submission", ruleSet: "nogi" },
  { from: "outashi", to: "ohh", action: "아웃사이드 힐훅", actionEn: "Outside Heel Hook", type: "submission", ruleSet: "nogi" },
  { from: "outashi", to: "kneebar", action: "니바", actionEn: "Knee Bar", type: "submission", ruleSet: "nogi" },
  { from: "5050", to: "ihh", action: "힐훅", actionEn: "Heel Hook", type: "submission", ruleSet: "nogi" },
  { from: "5050", to: "toehold", action: "토홀드", actionEn: "Toe Hold", type: "submission", ruleSet: "nogi" },
  { from: "5050", to: "sfl", action: "풋락", actionEn: "Straight Foot Lock", type: "submission", ruleSet: "common" },
]

// ─── Helpers ─────────────────────────────────────────────────

export function getPositionById(id: string): Position | undefined {
  return POSITIONS.find((p) => p.id === id)
}

export function getTransitionsFrom(positionId: string): Transition[] {
  return TRANSITIONS.filter((t) => t.from === positionId)
}

export function getTransitionsTo(positionId: string): Transition[] {
  return TRANSITIONS.filter((t) => t.to === positionId)
}

export function getPositionsByLayer(layer: Position["layer"]): Position[] {
  return POSITIONS.filter((p) => p.layer === layer)
}

export function getPositionsByFamily(family: string): Position[] {
  return POSITIONS.filter((p) => p.family === family)
}
