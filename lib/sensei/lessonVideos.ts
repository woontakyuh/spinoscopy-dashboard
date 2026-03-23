import type { LessonVideo } from "@/lib/types/sensei"

export const LESSON_VIDEOS: Record<string, LessonVideo> = {
  // 필수 드릴
  drill_1: { title: "Shrimp Drill", titleKr: "새우드릴", url: "https://youtu.be/NPa6i80EB4Y", category: "drill" },
  drill_2: { title: "Bridge Drill", titleKr: "브릿지", url: "https://youtu.be/1B-5Sf7SKHE", category: "drill" },
  drill_3: { title: "Scissors Drill", titleKr: "시저스드릴", url: "https://youtu.be/lekug6uoFu0", category: "drill" },
  drill_4: { title: "Jacare Drill", titleKr: "자카레(악어)드릴", url: "https://youtu.be/l9_03JtjqW8", category: "drill" },
  drill_5: { title: "Pendulum Drill", titleKr: "펜듈럼드릴", url: "https://youtu.be/eF_Qn3-m9oA", category: "drill" },
  drill_6: { title: "Technical Stand", titleKr: "손없이 일어나기", url: "https://youtu.be/IkbR5zeO2Hw", category: "drill" },
  drill_7: { title: "Granby Roll", titleKr: "콩벌레드릴", url: "https://youtu.be/FYF32eps8Fg", category: "drill" },

  // Side Control
  lesson_01: { title: "Side Escape Basic", titleKr: "사이드 탈출 기본", url: "https://youtu.be/6-ulq2sGcmU", category: "side_escape" },
  lesson_02: { title: "Side Control", titleKr: "사이드 컨트롤", url: "https://youtu.be/t2gX8j9v3GI", category: "side_control" },
  lesson_03: { title: "Side Escape Advanced", titleKr: "곁누르기 탈출 정석", url: "https://youtu.be/6ukPXrLRFr8", category: "side_escape" },
  lesson_04: { title: "Side Armbar", titleKr: "사이드 암바", url: "https://youtu.be/ftYzqo2Hx2M", category: "side_submission" },

  // Closed Guard
  lesson_05: { title: "Closed Guard Choke", titleKr: "클로즈가드 초크", url: "https://youtu.be/5DEYmS_KNZM", category: "closed_guard" },
  lesson_32: { title: "Scissor Sweep", titleKr: "시저스 스윕", url: "https://youtu.be/iAqczQq6Xnk", category: "closed_guard" },
  lesson_33: { title: "Flower Sweep", titleKr: "플라워 스윕", url: "https://youtu.be/36Zf9DdmtFI", category: "closed_guard" },
  lesson_34: { title: "Triangle Timing", titleKr: "삼각 타이밍", url: "https://youtu.be/2m_adMiFyaE", category: "closed_guard" },
  lesson_49: { title: "Arm Drag Back Take", titleKr: "암드래그 백테이크", url: "https://youtu.be/9hrB1zY5yRY", category: "closed_guard" },

  // Guard Pass
  lesson_06: { title: "Closed Guard Escape", titleKr: "클로즈가드 탈출", url: "https://youtu.be/eCEUHBUnj2s", category: "guard_pass" },
  lesson_07: { title: "Knee Slide Pass", titleKr: "니슬라이드 패스", url: "https://youtu.be/ow3EnQs04PA", category: "guard_pass" },
  lesson_09: { title: "Guard Pass Concept", titleKr: "가드패스 개념", url: "https://youtu.be/RamtxTf9CFY", category: "guard_pass" },
  lesson_10: { title: "Guard Pass Drill", titleKr: "가드패스 연습법", url: "https://youtu.be/EhCKlSDeeE4", category: "guard_pass" },
  lesson_11: { title: "Leg Drag Pass", titleKr: "레그드래그 패스", url: "https://youtu.be/oSzUfDGHq08", category: "guard_pass" },
  lesson_12: { title: "Torreando Pass", titleKr: "토레안도 패스", url: "https://youtu.be/kRAVRPa5kVk", category: "guard_pass" },
  lesson_13: { title: "Over-Under Pass", titleKr: "오버언더 패스", url: "https://youtu.be/tVBdGGFZxHM", category: "guard_pass" },
  lesson_14: { title: "Pass Connection", titleKr: "가드패스 연결", url: "https://youtu.be/MfhFwUqLbz4", category: "guard_pass" },
  lesson_15a: { title: "Grip Fight Upper", titleKr: "그립싸움 상체", url: "https://youtu.be/XL-HCUTvK9I", category: "guard_pass" },
  lesson_15b: { title: "Grip Fight Lower", titleKr: "그립싸움 다리", url: "https://youtu.be/jnjk4zB222k", category: "guard_pass" },
  lesson_16: { title: "Sitting Guard Pass", titleKr: "시팅가드 패스", url: "https://youtu.be/sjr171aXiL0", category: "guard_pass" },

  // Half Guard Pass
  lesson_43: { title: "HG Pass Concept", titleKr: "하프가드 패스 개념", url: "https://youtu.be/XEStvs9qx1Y", category: "half_pass" },
  lesson_44: { title: "HG Pass Underhook", titleKr: "하프가드 패스 정석", url: "https://youtu.be/REU5Swm9IaA", category: "half_pass" },
  lesson_45: { title: "HG Pass Crossface", titleKr: "크로스페이스 하프패스", url: "https://youtu.be/FALryYqrgeM", category: "half_pass" },
  lesson_46: { title: "HG Pass Backstep", titleKr: "하프가드 백스텝패스", url: "https://youtu.be/LmRCOvKYLV0", category: "half_pass" },

  // Half Guard (bottom)
  lesson_47: { title: "Half Guard Sweep", titleKr: "하프가드 스윕", url: "https://youtu.be/sd2TnHk1D5E", category: "half_guard" },
  lesson_48: { title: "Half Guard Recovery", titleKr: "하프가드 리커버리", url: "https://youtu.be/teMz7H8gBqo", category: "half_guard" },

  // Connections
  lesson_08: { title: "Chapter 1 Connection", titleKr: "챕터1 연결동작", url: "https://youtu.be/aROXeIdpViM", category: "connection" },
  lesson_21: { title: "Chapter 1-2 Connection", titleKr: "챕터1-2 연결동작", url: "https://youtu.be/8w27YzPg9sU", category: "connection" },
  lesson_36: { title: "Chapter 1-3 Connection", titleKr: "챕터1-3 연결동작 전개도", url: "https://youtu.be/IldsuB6O-IY", category: "connection" },

  // KoB
  lesson_17: { title: "Knee on Belly", titleKr: "니온벨리", url: "https://youtu.be/VeY1EU0MTgQ", category: "kob_control" },
  lesson_18: { title: "KoB Submission", titleKr: "니온벨리 서브미션", url: "https://youtu.be/uJezbt4jKa0", category: "kob_submission" },
  lesson_19: { title: "KoB Escape", titleKr: "니온벨리 탈출", url: "https://youtu.be/CUB5DMR7Ysw", category: "kob_escape" },

  // Butterfly / SLX
  lesson_20: { title: "Double Hook Sweep", titleKr: "더블훅 스윕", url: "https://youtu.be/Re7_cinlFak", category: "butterfly" },
  lesson_23: { title: "SLX Setup", titleKr: "SLX 세팅", url: "https://youtu.be/rG-6_WVQPkw", category: "slx" },
  lesson_24: { title: "SLX Sweep", titleKr: "SLX 스윕", url: "https://youtu.be/vRpssJ9foSs", category: "slx" },
  lesson_25: { title: "SLX Pass", titleKr: "SLX 패스", url: "https://youtu.be/GniTZbbW2f0", category: "slx_pass" },
  lesson_26: { title: "SLX Recovery", titleKr: "SLX 리커버리", url: "https://youtu.be/BPTxHrs8TCE", category: "slx" },

  // Guard Recovery
  lesson_22: { title: "Guard Recovery Basic", titleKr: "가드 리커버리 기본", url: "https://youtu.be/Vn4dHzteUw4", category: "guard_recovery" },
  lesson_27: { title: "vs Knee Slide", titleKr: "니슬라이드 방어", url: "https://youtu.be/-0wMqxr9uP0", category: "guard_recovery" },
  lesson_28: { title: "vs Leg Drag", titleKr: "레그드래그 방어", url: "https://youtu.be/7trYNywk2vM", category: "guard_recovery" },
  lesson_29: { title: "vs Torreando", titleKr: "토레안도 방어", url: "https://youtu.be/kwHzJ7wmjb8", category: "guard_recovery" },
  lesson_30: { title: "vs Over-Under", titleKr: "오버언더 리커버리", url: "https://youtu.be/_SuJtWQ6O1c", category: "guard_recovery" },
  lesson_31: { title: "Recovery Final", titleKr: "가드리커버리 종결", url: "https://youtu.be/K6LhxmbRilI", category: "guard_recovery" },

  // Sitting Guard
  lesson_35a: { title: "Sitting Guard Recovery", titleKr: "시팅가드 리커버리", url: "https://youtu.be/qYlWgm9q-FA", category: "sitting_guard" },
  lesson_35b: { title: "Sitting Guard Attack", titleKr: "시팅가드 공격 세팅", url: "https://youtu.be/xXyyBMBMu68", category: "sitting_guard" },

  // Mount
  lesson_37: { title: "Side to Mount", titleKr: "사이드→마운트 전환", url: "https://youtu.be/mvlPT77RsP8", category: "mount_control" },
  lesson_38: { title: "Mount Choke", titleKr: "마운트 초크&기착", url: "https://youtu.be/R08GDh_eWRs", category: "mount_submission" },
  lesson_39: { title: "Mount Armbar", titleKr: "마운트 암바", url: "https://youtu.be/rr--YXtb31Q", category: "mount_submission" },
  lesson_40: { title: "Mount Escape Bridge", titleKr: "마운트 탈출 보조지", url: "https://youtu.be/4u_RSdlqQ1M", category: "mount_escape" },
  lesson_41: { title: "Mount Escape Key", titleKr: "마운트 탈출 핵심", url: "https://youtu.be/yx225A44b_k", category: "mount_escape" },
  lesson_42: { title: "Mount to Half Guard", titleKr: "마운트→하프 탈출", url: "https://youtu.be/dRxY3eKITdo", category: "mount_escape" },

  // Side to Back
  lesson_50: { title: "Side to Back Take", titleKr: "사이드→백테이크", url: "https://youtu.be/a8aq6S4I_Pw", category: "side_transition" },

  // Back
  lesson_51: { title: "Back Choke", titleKr: "백 초크", url: "https://youtu.be/m9CWEVT9KCI", category: "back_submission" },
  lesson_52: { title: "Back Escape", titleKr: "백 탈출", url: "https://youtu.be/-RlveuaWuyo", category: "back_escape" },
  lesson_53: { title: "Back Control", titleKr: "백 컨트롤 유지", url: "https://youtu.be/GG7cl8midng", category: "back_control" },

  // Turtle
  lesson_54: { title: "Turtle Back Take", titleKr: "터틀→백테이크", url: "https://youtu.be/F7eEmmWbNFo", category: "turtle_attack" },
  lesson_55a: { title: "Turtle Submission", titleKr: "터틀 서브미션", url: "https://youtu.be/0DoiwDE2wXk", category: "turtle_attack" },
  lesson_55b: { title: "Turtle Kimura Trap", titleKr: "터틀 기무라트랩", url: "https://youtu.be/25QEI2tByuE", category: "turtle_attack" },
  lesson_56a: { title: "Turtle Quick Escape", titleKr: "터틀 빠른탈출", url: "https://youtu.be/ICRPdT6z68w", category: "turtle_escape" },
  lesson_56b: { title: "Turtle Late Escape", titleKr: "터틀 늦은탈출", url: "https://youtu.be/Y1SzFFf_Fxw", category: "turtle_escape" },

  // Standing
  lesson_57: { title: "Ankle Pick", titleKr: "앵클픽", url: "https://youtu.be/ZCHC4pouwds", category: "standing" },
  lesson_58: { title: "Collar Drag", titleKr: "카라드래그", url: "https://youtu.be/OQ_CZFszGJU", category: "standing" },
  lesson_59: { title: "Takedown Combo", titleKr: "테이크다운 콤비네이션", url: "https://youtu.be/n8bDwvSM95I", category: "standing" },
  lesson_60: { title: "Self Guard (Pull)", titleKr: "셀프가드", url: "https://youtu.be/i-w12Rw8jBM", category: "standing" },
}

export function getVideoForLesson(lessonNumber: number): LessonVideo | null {
  const key = `lesson_${String(lessonNumber).padStart(2, "0")}`
  return LESSON_VIDEOS[key] ?? null
}
