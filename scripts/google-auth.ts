/**
 * Google Calendar OAuth 토큰 발급 스크립트
 *
 * 사용법:
 *   npx tsx scripts/google-auth.ts
 *
 * 사전 준비:
 *   1. Google Cloud Console → APIs & Services → Enable "Google Calendar API"
 *   2. Credentials → Create OAuth 2.0 Client ID (Desktop app)
 *   3. Download JSON → ~/.config/schedule-agent/credentials.json 에 저장
 *
 * 실행하면 브라우저가 열리고, 구글 로그인 후 토큰이 자동 저장됩니다.
 * 저장된 token.json 내용을 Vercel 환경변수 GOOGLE_TOKEN 에 설정하면 됩니다.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import http from "node:http"
import { google } from "googleapis"

const CONFIG_DIR = path.join(os.homedir(), ".config", "schedule-agent")
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json")
const TOKEN_PATH = path.join(CONFIG_DIR, "token.json")
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
const PORT = 3099

async function main() {
  if (!existsSync(CREDENTIALS_PATH)) {
    console.error(`\n❌ credentials.json 이 없습니다.`)
    console.error(`   경로: ${CREDENTIALS_PATH}`)
    console.error(`\n📋 설정 방법:`)
    console.error(`   1. https://console.cloud.google.com/ 접속`)
    console.error(`   2. APIs & Services → Library → "Google Calendar API" 활성화`)
    console.error(`   3. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID`)
    console.error(`   4. Application type: Desktop app`)
    console.error(`   5. Download JSON 클릭`)
    console.error(`   6. 파일을 아래 경로에 저장:`)
    console.error(`      mkdir -p ~/.config/schedule-agent`)
    console.error(`      mv ~/Downloads/client_secret_*.json ${CREDENTIALS_PATH}`)
    console.error(`\n   저장 후 이 스크립트를 다시 실행하세요.`)
    process.exit(1)
  }

  const raw = readFileSync(CREDENTIALS_PATH, "utf-8")
  const creds = JSON.parse(raw)
  const { client_id, client_secret } = creds.installed || creds.web || {}

  if (!client_id || !client_secret) {
    console.error("❌ credentials.json 형식이 올바르지 않습니다.")
    process.exit(1)
  }

  const redirectUri = `http://localhost:${PORT}`
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri)

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  })

  console.log(`\n🔐 브라우저에서 Google 인증을 진행하세요...`)
  console.log(`   ${authUrl}\n`)

  // 브라우저 자동 열기
  const { exec } = await import("node:child_process")
  exec(`open "${authUrl}"`)

  // 콜백 서버
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`)
      const code = url.searchParams.get("code")
      const error = url.searchParams.get("error")

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end("<h2>❌ 인증 실패</h2><p>브라우저를 닫으세요.</p>")
        server.close()
        reject(new Error(error))
        return
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end("<h2>✅ 인증 완료!</h2><p>이 탭을 닫으셔도 됩니다.</p>")
        server.close()
        resolve(code)
      }
    })

    server.listen(PORT, () => {
      console.log(`   콜백 서버 대기 중 (localhost:${PORT})...`)
    })

    setTimeout(() => {
      server.close()
      reject(new Error("타임아웃: 2분 내에 인증을 완료하세요"))
    }, 120_000)
  })

  const { tokens } = await oauth2Client.getToken(code)
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf-8")

  console.log(`\n✅ 토큰 저장 완료: ${TOKEN_PATH}`)
  console.log(`\n📋 Vercel 환경변수 설정:`)
  console.log(`\n--- GOOGLE_CREDENTIALS (이 내용을 복사) ---`)
  console.log(readFileSync(CREDENTIALS_PATH, "utf-8").trim())
  console.log(`\n--- GOOGLE_TOKEN (이 내용을 복사) ---`)
  console.log(readFileSync(TOKEN_PATH, "utf-8").trim())
  console.log(`\n위 두 JSON을 Vercel Dashboard → Settings → Environment Variables 에 각각 추가하세요.`)

  process.exit(0)
}

main().catch((err) => {
  console.error("오류:", err.message)
  process.exit(1)
})
