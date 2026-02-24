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

export const MUST_READ_KEYWORDS = [
  "endoscop",
  "biportal",
  "ube",
  "unilateral biportal",
  "full-endoscopic",
  "percutaneous endoscopic",
  "artificial intelligence",
  "deep learning",
  "machine learning",
  "neural network",
  "large language model",
  "computer vision",
  "natural language processing",
]

export const INTEREST_KEYWORDS = [
  "minimally invasive",
  "mis",
  "miss",
  "stenosis",
  "disc herniation",
  "lumbar fusion",
  "decompression",
  "laminectomy",
  "foraminotomy",
  "cervical",
  "acdf",
  "outcome prediction",
  "radiomics",
  "automated",
  "robot",
  "navigation",
  "augmented reality",
  "virtual reality",
  "simulation",
  "education",
  "training",
  "learning curve",
  "surgical technique",
]

export const LOW_PRIORITY_TYPES = [
  "letter",
  "comment",
  "erratum",
  "published erratum",
  "editorial",
]
