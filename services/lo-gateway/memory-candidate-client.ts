import { randomBytes } from "node:crypto"

import type { LoMemoryCandidate } from "@/lib/lo/episodic/candidates"
import { signLoGatewayRequest } from "./contract"

export type LoMemoryCandidateGatewayCall =
  | { action: "list" }
  | { action: "approve" | "reject"; candidateId: string }

export interface LoMemoryCandidateGatewayOptions {
  secret: string
  baseUrl?: string
  access?: {
    clientId: string
    clientSecret: string
  }
  now?: () => Date
  nonce?: () => string
  fetchImpl?: typeof fetch
}

export async function callLoMemoryCandidateGateway(
  call: LoMemoryCandidateGatewayCall,
  {
    secret,
    baseUrl,
    access,
    now = () => new Date(),
    nonce = () => randomBytes(18).toString("base64url"),
    fetchImpl = fetch,
  }: LoMemoryCandidateGatewayOptions,
): Promise<{ candidates: LoMemoryCandidate[] } | { candidate: LoMemoryCandidate }> {
  const endpoint = new URL("/v1/memory-candidates", gatewayOrigin(baseUrl))
  const body = JSON.stringify(call)
  const timestamp = String(Math.floor(now().getTime() / 1_000))
  const requestNonce = nonce()
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(access ? {
        "CF-Access-Client-Id": credential("Cloudflare Access client ID", access.clientId),
        "CF-Access-Client-Secret": credential("Cloudflare Access client secret", access.clientSecret),
      } : {}),
      "X-Lo-Timestamp": timestamp,
      "X-Lo-Nonce": requestNonce,
      "X-Lo-Signature": signLoGatewayRequest({
        secret,
        body,
        timestamp,
        nonce: requestNonce,
      }),
    },
    body,
    cache: "no-store",
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Lo memory candidate gateway failed (${response.status})`)
  const parsed: unknown = text ? JSON.parse(text) : null
  if (!parsed || typeof parsed !== "object") throw new Error("Lo memory candidate gateway returned invalid JSON")
  return parsed as { candidates: LoMemoryCandidate[] } | { candidate: LoMemoryCandidate }
}

function gatewayOrigin(baseUrl: string | undefined): URL {
  if (!baseUrl) return new URL("http://127.0.0.1:4318")
  const url = new URL(baseUrl)
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost"
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Remote Lo gateway URL must use HTTPS")
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Lo gateway URL must be an origin without credentials or query parameters")
  }
  return url
}

function credential(label: string, value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} must not be empty`)
  return normalized
}
