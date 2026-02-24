export interface Presentation {
  page_id: string
  url: string
  name: string
  date_start: string | null
  date_end: string | null
  place: string
  category: string
  society: string[]
  topic: string
  preparation_status: string
  attendance_type: string
  link: string | null
  abstract_deadline: string | null
}

export interface PresentationFilter {
  attendance_type?: string
  society?: string
  preparation_status?: string
  date_from?: string
  date_after?: string
  upcoming_only?: boolean
}

export interface DdayInfo {
  days: number | null
  label: string
  isPast: boolean
}

export interface PresentationsResponse {
  presentations: Presentation[]
}
