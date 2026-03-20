import { NextRequest, NextResponse } from "next/server"
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { google } from "googleapis"

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
]
const CONFIG_DIR = path.join(os.homedir(), ".config", "schedule-agent")
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json")
const TOKEN_PATH = path.join(CONFIG_DIR, "token.json")

function loadCredentials() {
  if (existsSync(CREDENTIALS_PATH)) {
    const parsed = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"))
    return parsed.installed
  }
  const envCreds = process.env.GOOGLE_CREDENTIALS
  if (envCreds) {
    const parsed = JSON.parse(envCreds)
    return parsed.installed
  }
  return null
}

// GET: 인증 URL 생성 또는 콜백 처리
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const creds = loadCredentials()

  if (!creds) {
    return NextResponse.json({ error: "Google credentials not configured" }, { status: 500 })
  }

  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    `${req.nextUrl.origin}/api/google/auth`
  )

  // 콜백: code가 있으면 토큰 교환
  if (code) {
    try {
      const { tokens } = await oauth2Client.getToken(code)
      mkdirSync(CONFIG_DIR, { recursive: true })
      writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf-8")
      // 홈으로 리다이렉트
      return NextResponse.redirect(new URL("/", req.url))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token exchange failed"
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // 인증 URL 생성
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  })

  return NextResponse.redirect(authUrl)
}
