import { randomBytes } from "node:crypto"

import { formatLoAnswerForDisplay } from "@/lib/lo/chat/persona"
import type { LoConversationSurface } from "@/lib/lo/episodic/store"
import { signLoGatewayRequest } from "./contract"

const DEFAULT_GATEWAY_PORT = 4318
const MAX_MESSAGE_LENGTH = 8_000

type HermesLoFetchResponse = Pick<Response, "ok" | "status" | "text">
type HermesLoFetch = (url: string, init: RequestInit) => Promise<HermesLoFetchResponse>

export interface HermesLoGatewayOptions {
  secret: string
  port?: number
  baseUrl?: string
  access?: {
    clientId: string
    clientSecret: string
  }
  turn?: {
    surface: LoConversationSurface
    contextKey: string
    externalTurnId: string
  }
  now?: () => Date
  nonce?: () => string
  fetchImpl?: HermesLoFetch
}

/**
 * Calls only the local Lo conversation endpoint. It has no process-spawning,
 * Telegram, or persistence capability; the gateway owns all model and Notion
 * access behind the existing versioned HMAC boundary.
 */
export async function callHermesLoGateway(message: string, {
  secret,
  port = DEFAULT_GATEWAY_PORT,
  baseUrl,
  access,
  turn,
  now = () => new Date(),
  nonce = createNonce,
  fetchImpl = fetch,
}: HermesLoGatewayOptions): Promise<string> {
  const normalizedMessage = message.trim()
  if (!normalizedMessage || normalizedMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Lo message must contain 1 to ${MAX_MESSAGE_LENGTH} characters`)
  }
  assertPort(port)

  const timestamp = String(Math.floor(now().getTime() / 1_000))
  const requestNonce = nonce()
  const scopedTurn = turn ?? {
    surface: "hermes",
    contextKey: "hermes:default",
    externalTurnId: `hermes:${requestNonce}`,
  } as const
  const body = JSON.stringify({ message: normalizedMessage, ...scopedTurn })
  const signature = signLoGatewayRequest({ secret, body, timestamp, nonce: requestNonce })
  const endpoint = conversationEndpoint(baseUrl, port)
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lo-Timestamp": timestamp,
      "X-Lo-Nonce": requestNonce,
      "X-Lo-Signature": signature,
      ...(access ? {
        "CF-Access-Client-Id": requiredCredential("Cloudflare Access client ID", access.clientId),
        "CF-Access-Client-Secret": requiredCredential("Cloudflare Access client secret", access.clientSecret),
      } : {}),
    },
    body,
    signal: AbortSignal.timeout(60_000),
  })
  const responseBody = await response.text()
  if (!response.ok) throw new Error(`Lo gateway conversation failed (${response.status})`)

  const answer = answerFrom(responseBody)
  return formatLoAnswerForDisplay(answer)
}

function createNonce(): string {
  return randomBytes(24).toString("base64url")
}

function assertPort(port: number): void {
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("LO_GATEWAY_PORT must be an integer from 1024 to 65535")
  }
}

function conversationEndpoint(baseUrl: string | undefined, port: number): string {
  if (!baseUrl) return `http://127.0.0.1:${port}/v1/conversation`
  const url = new URL(baseUrl)
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost"
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Remote Lo gateway URL must use HTTPS")
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Lo gateway URL must be an origin without credentials or query parameters")
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/v1/conversation`
  return url.toString()
}

function requiredCredential(label: string, value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} must not be empty`)
  return normalized
}

function answerFrom(responseBody: string): string {
  let value: unknown
  try {
    value = JSON.parse(responseBody)
  } catch {
    throw new Error("Lo gateway returned an invalid response")
  }
  if (!isAnswer(value)) throw new Error("Lo gateway returned no answer")
  return value.answer
}

function isAnswer(value: unknown): value is { answer: string } {
  return typeof value === "object"
    && value !== null
    && "answer" in value
    && typeof value.answer === "string"
    && value.answer.trim().length > 0
}
