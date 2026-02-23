import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { google, calendar_v3 } from "googleapis"
import type { Credentials } from "google-auth-library"

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
const TIMEZONE = "Asia/Seoul"
const CONFIG_DIR = path.join(os.homedir(), ".config", "schedule-agent")
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json")
const TOKEN_PATH = path.join(CONFIG_DIR, "token.json")

interface OAuthInstalledCredentials {
  client_id: string
  client_secret: string
  redirect_uris: string[]
}

interface CredentialsFile {
  installed?: OAuthInstalledCredentials
}

export interface GoogleCalendarResult {
  success: boolean
  message: string
  eventId?: string
  eventUrl?: string
}

export interface GoogleCalendarCreateInput {
  name: string
  date_start: string
  date_end?: string
  place?: string
  description?: string
}

export interface GoogleCalendarEventSummary {
  id: string
  title: string
  start: string
  end: string | null
  location: string
  url: string
}

function loadCredentials(): OAuthInstalledCredentials | null {
  if (!existsSync(CREDENTIALS_PATH)) {
    return null
  }

  const raw = readFileSync(CREDENTIALS_PATH, "utf-8")
  const parsed = JSON.parse(raw) as CredentialsFile

  if (!parsed.installed) {
    throw new Error("Invalid credentials.json: missing installed key")
  }

  return parsed.installed
}

function loadStoredTokens(): Credentials | null {
  if (!existsSync(TOKEN_PATH)) {
    return null
  }

  const raw = readFileSync(TOKEN_PATH, "utf-8")
  return JSON.parse(raw) as Credentials
}

function saveTokens(tokens: Credentials): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf-8")
}

export async function getAuthorizedClient(): Promise<InstanceType<typeof google.auth.OAuth2> | null> {
  const credentials = loadCredentials()
  if (!credentials) {
    return null
  }

  const storedTokens = loadStoredTokens()
  if (!storedTokens) {
    return null
  }

  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris[0] ?? "http://localhost:3000"
  )

  oauth2Client.setCredentials(storedTokens)
  oauth2Client.on("tokens", (tokens: Credentials) => {
    saveTokens({ ...oauth2Client.credentials, ...tokens, scope: SCOPES.join(" ") })
  })

  return oauth2Client
}

function hasTimeComponent(dateStr: string): boolean {
  return dateStr.includes("T")
}

function extractDate(dateStr: string): string {
  return dateStr.slice(0, 10)
}

function ensureTimezone(dateTimeStr: string): string {
  if (/[+-]\d{2}:\d{2}$/u.test(dateTimeStr) || dateTimeStr.endsWith("Z")) {
    return dateTimeStr
  }
  return `${dateTimeStr}+09:00`
}

function nextDay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const d = new Date(year, month - 1, day + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function buildEventTiming(
  dateStart: string,
  dateEnd?: string
): { start: calendar_v3.Schema$EventDateTime; end: calendar_v3.Schema$EventDateTime } {
  const isTimed = hasTimeComponent(dateStart)

  if (isTimed) {
    const endStr = dateEnd && hasTimeComponent(dateEnd)
      ? ensureTimezone(dateEnd)
      : ensureTimezone(dateStart)

    return {
      start: { dateTime: ensureTimezone(dateStart), timeZone: TIMEZONE },
      end: { dateTime: endStr, timeZone: TIMEZONE },
    }
  }

  return {
    start: { date: extractDate(dateStart), timeZone: TIMEZONE },
    end: {
      date: dateEnd ? nextDay(extractDate(dateEnd)) : nextDay(extractDate(dateStart)),
      timeZone: TIMEZONE,
    },
  }
}

export async function createGoogleCalendarEvent(input: GoogleCalendarCreateInput): Promise<GoogleCalendarResult> {
  const auth = await getAuthorizedClient()
  if (!auth) {
    return {
      success: false,
      message: "Google Calendar not configured. Missing credentials or token files.",
    }
  }

  const calendar = google.calendar({ version: "v3", auth })
  const timing = buildEventTiming(input.date_start, input.date_end)

  const event: calendar_v3.Schema$Event = {
    summary: input.name,
    location: input.place,
    description: input.description,
    start: timing.start,
    end: timing.end,
  }

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
  })

  return {
    success: true,
    message: "Event created in Google Calendar",
    eventId: res.data.id ?? undefined,
    eventUrl: res.data.htmlLink ?? undefined,
  }
}

export async function findGoogleCalendarEvent(
  name: string,
  dateStart: string
): Promise<{ exists: boolean; eventId?: string; eventUrl?: string }> {
  const auth = await getAuthorizedClient()
  if (!auth) {
    return { exists: false }
  }

  const dateOnly = extractDate(dateStart)
  const calendar = google.calendar({ version: "v3", auth })
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: `${dateOnly}T00:00:00+09:00`,
    timeMax: `${nextDay(dateOnly)}T00:00:00+09:00`,
    q: name,
    singleEvents: true,
    maxResults: 5,
  })

  const match = (res.data.items ?? []).find(
    (event) => event.summary?.toLowerCase() === name.toLowerCase()
  )

  if (match) {
    return {
      exists: true,
      eventId: match.id ?? undefined,
      eventUrl: match.htmlLink ?? undefined,
    }
  }

  return { exists: false }
}

export async function listGoogleCalendarEventsForDate(date: string): Promise<GoogleCalendarEventSummary[]> {
  const auth = await getAuthorizedClient()
  if (!auth) {
    return []
  }

  const calendar = google.calendar({ version: "v3", auth })
  const start = `${date}T00:00:00+09:00`
  const end = `${nextDay(date)}T00:00:00+09:00`

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: start,
    timeMax: end,
    singleEvents: true,
    orderBy: "startTime",
  })

  return (res.data.items ?? [])
    .filter((event): event is calendar_v3.Schema$Event & { id: string } => Boolean(event.id))
    .map((event) => ({
      id: event.id,
      title: event.summary ?? "(제목 없음)",
      start: event.start?.dateTime ?? event.start?.date ?? "",
      end: event.end?.dateTime ?? event.end?.date ?? null,
      location: event.location ?? "",
      url: event.htmlLink ?? "",
    }))
    .filter((event) => event.start.length > 0)
}
