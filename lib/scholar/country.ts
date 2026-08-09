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
  "uk": "UK",
  "u.k": "UK",
  "ukraine": "Ukraine",
}

// 미국 저널은 자국 논문 affiliation 에 USA 를 아예 안 붙이는 경우가 많다
// ("Rothman Orthopedic Institute, Philadelphia, PA."). 주 약어만으로 USA 로 본다.
// 국가명 매칭이 먼저 돌고 실패했을 때만 쓰는 폴백이라, "Milano, MI, Italy" 처럼
// 국가가 적힌 비미국 주소를 잘못 집어삼키지는 않는다.
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV",
  "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN",
  "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC", "PR",
])

// JNS 계열은 주를 풀네임으로 쓰고 국가를 생략한다 ("Pittsburgh, Pennsylvania.").
// Georgia 는 동명의 국가가 있지만, 국가명 매칭이 항상 먼저 돌기 때문에
// 실제 조지아(국가) 주소는 "Tbilisi, Georgia" 로 여기까지 오지 않는다.
const US_STATE_NAMES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
  "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
  "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
  "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming", "puerto rico",
])

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

// PubMed 는 비ASCII 를 수치 엔티티로 흘려보낸다 ("T&#xfc;rkiye"). 디코딩하지 않으면
// 별칭 표의 "türkiye" 같은 항목이 영원히 매칭되지 않는다.
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
}

// affiliation 끝에 붙는 연락처는 마침표로 토큰이 잘게 쪼개져서 정작 국가를
// 창 밖으로 밀어낸다 ("...Rochester, NY, USA. Ram_Haddas@URMC.rochester.edu").
function stripContacts(segment: string): string {
  return segment
    .replace(/electronic address:.*$/i, "")
    .replace(/[\w.+-]+@[\w.-]+/g, "")
    .trim()
}

function tokenize(segment: string): string[] {
  // "Washington D.C." 는 마침표 분해에 부서지므로 먼저 붙여 놓는다.
  return segment.replace(/\bD\.\s*C\./g, "DC").split(/[,.]/).map(t => t.trim()).filter(Boolean)
}

function matchCountryName(segment: string): string | null {
  const tokens = tokenize(segment)
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 3); i--) {
    const token = tokens[i].toLowerCase().replace(/\.$/, "")
    const country = COUNTRY_ALIASES[token]
    if (country) return country
  }

  // 전체 텍스트에서 국가명 검색 (폴백)
  const lowerText = segment.toLowerCase()
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (alias.length >= 4 && lowerText.includes(alias)) {
      return country
    }
  }
  return null
}

function matchUsState(segment: string): string | null {
  const tokens = tokenize(segment)
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 3); i--) {
    // 우편번호가 붙는 경우가 있다 ("MA 02115").
    const code = tokens[i].replace(/\s+\d{5}(-\d{4})?$/, "").trim()
    if (code.length === 2 && US_STATE_CODES.has(code.toUpperCase()) && code === code.toUpperCase()) {
      return "USA"
    }
    // 토큰 전체가 주 이름이거나("Pennsylvania"), 기관명 끝에 주가 붙은 경우
    // ("Investigation performed at the University of Utah").
    const lower = code.toLowerCase()
    for (const state of US_STATE_NAMES) {
      if (lower === state || lower.endsWith(` ${state}`)) return "USA"
    }
  }
  return null
}

/**
 * Affiliation 텍스트에서 국가명 추출
 * 보통 affiliation 마지막 부분이 국가 (쉼표 or 마침표로 구분)
 */
export function extractCountry(affiliations: string): string | null {
  if (!affiliations || affiliations.trim().length === 0) return null

  const segments = decodeEntities(affiliations)
    .split(/;\s*/)
    .map((s) => stripContacts(s))
    .filter((s) => s.length > 0)
  if (segments.length === 0) return null

  // 마지막 affiliation 이 corresponding author 인 경우가 많아 그것을 먼저 본다.
  // 거기서 아무 단서도 안 나오면 앞쪽 소속으로 후퇴한다 — 마지막 줄에 국가를
  // 빼먹은 논문까지 "국가 불명" 으로 버리지 않기 위해서다.
  const ordered = [segments[segments.length - 1], ...segments.slice(0, -1).reverse()]
  for (const segment of ordered) {
    const country = matchCountryName(segment) ?? matchUsState(segment)
    if (country) return country
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
