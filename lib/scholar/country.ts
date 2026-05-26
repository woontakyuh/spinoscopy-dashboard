// lib/scholar/country.ts
// Affiliations 텍스트에서 국가명을 추출하는 유틸리티

const COUNTRY_ALIASES: Record<string, string> = {
  // Full names → standardized
  "united states": "USA",
  "united states of america": "USA",
  "u.s.a.": "USA",
  "usa": "USA",
  "south korea": "Korea",
  "republic of korea": "Korea",
  "korea": "Korea",
  "people's republic of china": "China",
  "p.r. china": "China",
  "china": "China",
  "japan": "Japan",
  "germany": "Germany",
  "united kingdom": "UK",
  "england": "UK",
  "scotland": "UK",
  "wales": "UK",
  "france": "France",
  "italy": "Italy",
  "canada": "Canada",
  "australia": "Australia",
  "spain": "Spain",
  "brazil": "Brazil",
  "india": "India",
  "turkey": "Turkey",
  "türkiye": "Turkey",
  "netherlands": "Netherlands",
  "the netherlands": "Netherlands",
  "switzerland": "Switzerland",
  "sweden": "Sweden",
  "taiwan": "Taiwan",
  "iran": "Iran",
  "egypt": "Egypt",
  "thailand": "Thailand",
  "singapore": "Singapore",
  "hong kong": "Hong Kong",
  "belgium": "Belgium",
  "austria": "Austria",
  "denmark": "Denmark",
  "norway": "Norway",
  "finland": "Finland",
  "poland": "Poland",
  "portugal": "Portugal",
  "greece": "Greece",
  "israel": "Israel",
  "mexico": "Mexico",
  "argentina": "Argentina",
  "chile": "Chile",
  "colombia": "Colombia",
  "saudi arabia": "Saudi Arabia",
  "malaysia": "Malaysia",
  "indonesia": "Indonesia",
  "pakistan": "Pakistan",
  "czech republic": "Czech Republic",
  "czechia": "Czech Republic",
  "ireland": "Ireland",
  "new zealand": "New Zealand",
  "south africa": "South Africa",
  "nigeria": "Nigeria",
  "russia": "Russia",
  "russian federation": "Russia",
  "philippines": "Philippines",
  "vietnam": "Vietnam",
  "nepal": "Nepal",
  "bangladesh": "Bangladesh",
  "sri lanka": "Sri Lanka",
  "lebanon": "Lebanon",
  "jordan": "Jordan",
  "qatar": "Qatar",
  "uae": "UAE",
  "united arab emirates": "UAE",
  "kuwait": "Kuwait",
  "oman": "Oman",
  "hungary": "Hungary",
  "romania": "Romania",
  "croatia": "Croatia",
  "serbia": "Serbia",
  "slovakia": "Slovakia",
  "slovenia": "Slovenia",
  "luxembourg": "Luxembourg",
  "iceland": "Iceland",
  "estonia": "Estonia",
  "latvia": "Latvia",
  "lithuania": "Lithuania",
  "cyprus": "Cyprus",
  "malta": "Malta",
  "morocco": "Morocco",
  "tunisia": "Tunisia",
  "algeria": "Algeria",
  "kenya": "Kenya",
  "ghana": "Ghana",
  "ethiopia": "Ethiopia",
  "tanzania": "Tanzania",
  "uganda": "Uganda",
  "peru": "Peru",
  "venezuela": "Venezuela",
  "ecuador": "Ecuador",
  "uruguay": "Uruguay",
  "cuba": "Cuba",
  "jamaica": "Jamaica",
}

// 국가 플래그 이모지
const COUNTRY_FLAGS: Record<string, string> = {
  "USA": "🇺🇸", "Korea": "🇰🇷", "China": "🇨🇳", "Japan": "🇯🇵",
  "Germany": "🇩🇪", "UK": "🇬🇧", "France": "🇫🇷", "Italy": "🇮🇹",
  "Canada": "🇨🇦", "Australia": "🇦🇺", "Spain": "🇪🇸", "Brazil": "🇧🇷",
  "India": "🇮🇳", "Turkey": "🇹🇷", "Netherlands": "🇳🇱", "Switzerland": "🇨🇭",
  "Sweden": "🇸🇪", "Taiwan": "🇹🇼", "Iran": "🇮🇷", "Egypt": "🇪🇬",
  "Thailand": "🇹🇭", "Singapore": "🇸🇬", "Hong Kong": "🇭🇰", "Belgium": "🇧🇪",
  "Austria": "🇦🇹", "Denmark": "🇩🇰", "Norway": "🇳🇴", "Finland": "🇫🇮",
  "Poland": "🇵🇱", "Portugal": "🇵🇹", "Greece": "🇬🇷", "Israel": "🇮🇱",
  "Mexico": "🇲🇽", "Saudi Arabia": "🇸🇦", "Malaysia": "🇲🇾",
  "Russia": "🇷🇺", "Ireland": "🇮🇪", "New Zealand": "🇳🇿",
  "South Africa": "🇿🇦", "Czech Republic": "🇨🇿",
}

/**
 * Affiliation 텍스트에서 국가명 추출
 * 보통 affiliation 마지막 부분이 국가 (쉼표 or 마침표로 구분)
 */
export function extractCountry(affiliations: string): string | null {
  if (!affiliations || affiliations.trim().length === 0) return null

  // 여러 affiliation이 ; 로 구분된 경우 마지막 것 사용 (corresponding author가 보통 마지막)
  const parts = affiliations.split(/;\s*/)
  const lastAffiliation = parts[parts.length - 1].trim()

  // 마지막 요소에서 국가명 매칭 (끝에서부터 쉼표로 분리된 토큰을 확인)
  const tokens = lastAffiliation.split(/[,.]/).map(t => t.trim()).filter(Boolean)

  // 끝에서부터 국가명 찾기
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 3); i--) {
    const token = tokens[i].toLowerCase().replace(/\.$/, "")
    const country = COUNTRY_ALIASES[token]
    if (country) return country
  }

  // 전체 텍스트에서 국가명 검색 (폴백)
  const lowerText = lastAffiliation.toLowerCase()
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (alias.length >= 4 && lowerText.includes(alias)) {
      return country
    }
  }

  return null
}

export function getCountryFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? "🌍"
}

// 주제 키워드 그룹 (트렌드 분석용)
// 키 삽입 순서 = 차트 표시 우선순위. Tak 의 관심사 순으로 정렬됨.
// 한 paper 가 여러 그룹에 매칭되면 multi-tag (예: UBE paper 는 UBE + Endoscopy 둘 다).
export const TOPIC_GROUPS: Record<string, string[]> = {
  "Endoscopy":   ["endoscop", "biportal", "full-endoscop", "percutaneous endoscop", "unilateral biportal", "ube "],
  "UBE":         ["ube ", "biportal", "unilateral biportal"],
  "MIS":         ["minimally invasive", "mis ", "mini-open", "tubular", "percutaneous"],
  "AI/ML":       ["artificial intelligence", "machine learning", "deep learning", "neural network", "ai-", "ai "],
  "PROM":        ["patient-reported outcome", "patient reported outcome", "prom ", "promis", "odi ", "ndi ", "vas score", "mjoa", "eq-5d", "sf-36"],
  "Registry":    ["registry", "national database", "insurance claims", "nationwide"],
  "Trauma":      ["fracture", "trauma", "burst", "compression fracture"],
  "Cervical":    ["cervical", "anterior cervical", "acdf", "arthroplasty", "myelopathy"],
  "Other degen": ["stenosis", "claudication", "decompression", "disc herniation", "discectomy", "disc degeneration", "lumbar disc", "fusion", "interbody", "plif", "tlif", "alif", "olif", "xlif", "llif", "deformity", "scoliosis"],
}

// 차트 표시 우선순위 — TOPIC_GROUPS 키 순서 그대로
export const TOPIC_PRIORITY: readonly string[] = Object.keys(TOPIC_GROUPS)

// 논문 유형 정규화
export const ARTICLE_TYPES: Record<string, string[]> = {
  "Original Article": ["journal article", "original", "research article", "clinical study"],
  "Review": ["review", "systematic review", "narrative review", "scoping review"],
  "Meta-analysis": ["meta-analysis", "meta analysis"],
  "Case Report": ["case report", "case series"],
  "RCT": ["randomized controlled trial", "rct", "randomised"],
  "Video Article": ["video", "surgical technique"],
  "Letter/Editorial": ["letter", "editorial", "comment", "correspondence", "erratum"],
}

/**
 * 논문 제목+초록+키워드에서 주제 그룹 매칭
 */
export function classifyTopics(title: string, abstract: string, keywords: string[]): string[] {
  const text = `${title} ${abstract} ${keywords.join(" ")}`.toLowerCase()
  const matched: string[] = []

  for (const [topic, terms] of Object.entries(TOPIC_GROUPS)) {
    if (terms.some(term => text.includes(term))) {
      matched.push(topic)
    }
  }

  return matched
}

/**
 * pub_type 문자열에서 논문 유형 정규화
 */
export function normalizeArticleType(pubType: string): string {
  const lower = pubType.toLowerCase()

  for (const [normalized, terms] of Object.entries(ARTICLE_TYPES)) {
    if (terms.some(term => lower.includes(term))) {
      return normalized
    }
  }

  return "Other"
}
