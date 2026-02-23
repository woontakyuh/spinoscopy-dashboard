import { NextRequest, NextResponse } from "next/server"
import { createSchedule, findDuplicateSchedule } from "@/lib/notion/schedule"
import {
  createGoogleCalendarEvent,
  findGoogleCalendarEvent,
} from "@/lib/google/calendar"
import type { ScheduleCreateInput, ScheduleCreateResult } from "@/lib/types/schedule"

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ScheduleCreateInput
    const name = body.name?.trim() ?? ""
    const dateStart = body.date_start?.trim() ?? ""

    if (!name || !dateStart) {
      return NextResponse.json<ScheduleCreateResult>(
        { success: false, error: "name and date_start are required" },
        { status: 400 }
      )
    }

    const input: ScheduleCreateInput = {
      ...body,
      name,
      date_start: dateStart,
    }

    const duplicate = await findDuplicateSchedule(name, dateStart)
    const notionResult = duplicate
      ? {
          skipped: true as const,
          message: "이미 동일한 일정이 Notion에 존재합니다.",
          page_id: duplicate.page_id,
          url: duplicate.url,
        }
      : await createSchedule(input)

    let googleResult: ScheduleCreateResult["google_calendar"]

    try {
      const existing = await findGoogleCalendarEvent(name, dateStart)
      if (existing.exists) {
        googleResult = {
          success: true,
          message: "이미 동일한 일정이 Google Calendar에 존재합니다.",
          eventId: existing.eventId,
          eventUrl: existing.eventUrl,
        }
      } else {
        googleResult = await createGoogleCalendarEvent({
          name,
          date_start: dateStart,
          date_end: input.date_end,
          place: input.place,
          description: input.topic,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Google Calendar error"
      googleResult = {
        success: false,
        message,
      }
    }

    return NextResponse.json<ScheduleCreateResult>({
      success: true,
      notion: notionResult,
      google_calendar: googleResult,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json<ScheduleCreateResult>(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
