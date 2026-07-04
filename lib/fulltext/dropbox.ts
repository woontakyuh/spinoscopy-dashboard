const DROPBOX_TOKEN = process.env.DROPBOX_TOKEN ?? ""
const DROPBOX_DIR = process.env.DROPBOX_SCHOLAR_DIR ?? "/Scholar PDFs"

export function dropboxPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}.pdf`
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
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DROPBOX_TOKEN}`,
      "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", mute: true }),
      "Content-Type": "application/octet-stream",
    },
    body: pdf as any,
  })
  if (!res.ok) throw new Error(`Dropbox upload ${res.status}: ${await res.text()}`)
}

async function createShareLink(path: string): Promise<string> {
  const res = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
    method: "POST",
    headers: { Authorization: `Bearer ${DROPBOX_TOKEN}`, "Content-Type": "application/json" },
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
