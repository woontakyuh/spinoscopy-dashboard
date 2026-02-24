export type TimeFilter = "all" | "past" | "upcoming"
export type AttendanceFilter = "all" | "참석" | "불참" | "발표"
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
  time?: TimeFilter
  attendance?: AttendanceFilter
  society?: string
}
export interface DdayInfo {
  days: number | null
  label: string
  isPast: boolean
}
export interface PresentationsResponse {
  presentations: Presentation[]
}
