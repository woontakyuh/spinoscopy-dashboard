const DROPBOX_DIR = process.env.DROPBOX_SCHOLAR_DIR ?? "/Scholar PDFs"

export function dropboxPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}.pdf`
}

// ─── 인증 ───
// 24/7 워커는 refresh 토큰 방식(장기)을 써야 한다. Dropbox "Generated access token"은
// 단기(약 4h)라 워커에는 부적합. 다음 우선순위로 액세스 토큰을 확보한다:
//   1) DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + DROPBOX_APP_SECRET → 자동 갱신(권장)
//   2) DROPBOX_TOKEN (단기, 개발/테스트용)
let cached: { token: string; exp: number } = {
  token: process.env.DROPBOX_TOKEN ?? "",
  exp: process.env.DROPBOX_TOKEN ? Number.POSITIVE_INFINITY : 0,
}

async function accessToken(): Promise<string> {
  const now = Date.now()
  if (cached.token && now < cached.exp) return cached.token

  const refresh = process.env.DROPBOX_REFRESH_TOKEN
  const key = process.env.DROPBOX_APP_KEY
  const secret = process.env.DROPBOX_APP_SECRET
  if (refresh && key && secret) {
    const res = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
    })
    if (!res.ok) throw new Error(`Dropbox 토큰 갱신 실패 ${res.status}: ${await res.text()}`)
    const j = (await res.json()) as { access_token: string; expires_in: number }
    cached = { token: j.access_token, exp: now + (j.expires_in - 60) * 1000 }
    return cached.token
  }

  if (cached.token) return cached.token // 단기 토큰(만료 시 여기서 그대로 반환 → 호출부에서 401)
  throw new Error(
    "Dropbox 인증 정보 없음: DROPBOX_REFRESH_TOKEN+DROPBOX_APP_KEY+DROPBOX_APP_SECRET(권장) 또는 DROPBOX_TOKEN 필요"
  )
}

export function parseCreateLinkResponse(json: unknown): string | null {
  const j = json as {
    url?: string
    error?: { shared_link_already_exists?: { metadata?: { url?: string } } }
  }
  if (j?.url) return j.url
  return j?.error?.shared_link_already_exists?.metadata?.url ?? null
}

async function uploadBytes(path: string, pdf: Buffer): Promise<void> {
  const token = await accessToken()
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", mute: true }),
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(pdf),
  })
  if (!res.ok) throw new Error(`Dropbox upload ${res.status}: ${await res.text()}`)
}

async function createShareLink(path: string): Promise<string> {
  const token = await accessToken()
  const res = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
  const json = await res.json()
  const url = parseCreateLinkResponse(json)
  if (!url) throw new Error(`Dropbox share link 실패 ${res.status}: ${JSON.stringify(json)}`)
  return url
}

export async function saveToDropbox(pdf: Buffer, name: string): Promise<{ shareUrl: string }> {
  const path = dropboxPath(DROPBOX_DIR, name)
  await uploadBytes(path, pdf)
  const shareUrl = await createShareLink(path)
  return { shareUrl }
}
