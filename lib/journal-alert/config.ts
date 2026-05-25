export interface JournalSource {
  key: string
  name: string
  pubmedQuery: string
}

export const JOURNAL_SOURCES: JournalSource[] = [
  { key: "spinej", name: "TSJ", pubmedQuery: "Spine J" },
  { key: "spine", name: "Spine", pubmedQuery: "Spine (Phila Pa 1976)" },
  { key: "jns_spine", name: "JNS Spine", pubmedQuery: "J Neurosurg Spine" },
  { key: "neurospine", name: "Neurospine", pubmedQuery: "Neurospine" },
  { key: "eur_spine_j", name: "ESJ", pubmedQuery: "Eur Spine J" },
  { key: "global_spine_j", name: "GSJ", pubmedQuery: "Global Spine J" },
]

// 🔴 필독 — 본인 핵심 관심 영역. regex 로 단어 경계 처리해서 ube/prom/odi 같은 짧은 약자가
// tube/promise/modify 등에 false-positive 매칭되는 것을 차단.
export const MUST_READ_PATTERNS: RegExp[] = [
  // UBE / Endoscopic spine — 본인 메인
  /endoscop/i,
  /biportal/i,
  /\bube\b/i,
  /unilateral biportal/i,

  // PROM (Patient-Reported Outcome Measures) — 신규 추가
  /patient[-\s]reported outcome/i,
  /\bproms?\b/i,            // PROM / PROMs
  /\bpromis\b/i,            // PROMIS scale
  /\bodi\b/i,               // Oswestry Disability Index
  /\bndi\b/i,               // Neck Disability Index
  /\bvas\b(?!\s*deferens)/i,// VAS score, vas deferens 회피
  /\bmjoa\b/i,              // modified JOA
  /\beq[-\s]?5d\b/i,        // EQ-5D
  /\bsf[-\s]?36\b/i,        // SF-36

  // Registry / 대형 데이터 — 신규 추가
  /\bregistry\b/i,
  /national database/i,
  /insurance claims/i,

  // AI / ML — 본인 두 번째 관심
  /artificial intelligence/i,
  /deep learning/i,
  /machine learning/i,
  /neural network/i,
  /large language model/i,
  /computer vision/i,
  /natural language processing/i,
]

// 🟡 관심 — 키워드 없이도 pub type 만으로 관심 등급 부여. 강한 evidence level 만 인정.
export const STRONG_METHOD_PUBTYPES = [
  "randomized controlled trial",
  "meta-analysis",
  "systematic review",
]

// ⚪ 참고 강등 — 논문이 아니라 서신류
export const LOW_PRIORITY_TYPES = [
  "letter",
  "comment",
  "erratum",
  "published erratum",
  "editorial",
]
