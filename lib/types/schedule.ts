export interface ScheduleItem {
  page_id: string
  url: string
  name: string
  date_start: string | null
  date_end: string | null
  place: string
  category: string
  status: string
}

export interface ScheduleCreateInput {
  name: string
  date_start: string
  date_end?: string
  place?: string
  category?: string
  society?: string[]
  targets?: Array<"notion" | "gcal">
  calendarId?: string
  status?: string
  topic?: string
  link?: string
  abstract_deadline?: string
}

export interface ScheduleCreateResult {
  success: boolean
  notion?:
    | { page_id: string; url: string }
    | { skipped: true; message: string; page_id: string; url: string }
  google_calendar?: { success: boolean; message: string; eventId?: string; eventUrl?: string }
  error?: string
}
