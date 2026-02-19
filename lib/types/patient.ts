export type Timepoint = "pre" | "1mo" | "3mo" | "6mo" | "1y"

export interface PromScores {
  vas?: string
  odi?: string
  joa?: string
  ndi?: string
  eq5d?: string
}

export interface PatientSearchResult {
  page_id: string
  url: string
  name: string
  pt_no: string
  age: string
  sex: string
  op_date: string | null
  op_name: string
  hospital: string[]
}

export interface PatientDetail extends PatientSearchResult {
  prom: Record<string, string>
  class_a: string[]
  class_b: string[]
  level: string
  op_category: string[]
  landmark: string[]
  preop_dx: string
  surgeon: string[]
}

export type NewCaseInput = {
  name: string
  pt_no: string
  age: string
  sex: string
  hospital: string
  op_date: string
  op_name: string
  level: string
  class_a: string[]
  class_b: string[]
  op_category: string[]
  landmark: string[]
  surgeon: string[]
  preop_dx: string
  prom: PromScores
}
