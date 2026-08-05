import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

import { ZodError, z } from "zod"

import { listLoToolDefinitions, type LoToolResult } from "@/lib/lo/dashboard"
import { LO_CONVERSATION_SURFACES } from "@/lib/lo/episodic/store"
import type { LoMemoryCandidate } from "@/lib/lo/episodic/candidates"
import {
  LO_GATEWAY_PROTOCOL,
  LoGatewayAuthenticationError,
  assertLocalGatewayHost,
  assertLoGatewaySecret,
  createNonceReplayGuard,
  type NonceReplayGuard,
  verifyLoGatewayRequest,
} from "./contract"
import type { LoGatewayConversationService } from "./conversation"

const MAX_REQUEST_BODY_BYTES = 64 * 1_024
const conversationRequestSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  surface: z.enum(LO_CONVERSATION_SURFACES),
  contextKey: z.string().trim().min(1).max(500),
  externalTurnId: z.string().trim().min(1).max(500),
}).strict()
const candidateRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z.object({
    action: z.enum(["approve", "reject"]),
    candidateId: z.string().trim().min(1).max(200),
  }).strict(),
])

export interface LoGatewayToolService {
  executeTool(call: unknown): Promise<LoToolResult>
}

export interface LoGatewayRequest {
  method: string
  path: string
  headers: Record<string, string | undefined>
  body: string
}

export interface LoGatewayResponse {
  status: number
  body: Record<string, unknown>
}

export interface LoGatewayHandlerOptions {
  secret: string
  service: LoGatewayToolService
  /** Optional so existing tool-only gateway deployments keep working unchanged. */
  conversation?: LoGatewayConversationService
  candidates?: {
    list(): LoMemoryCandidate[]
    approve(candidateId: string): Promise<LoMemoryCandidate>
    reject(candidateId: string): LoMemoryCandidate
  }
  now?: () => Date
  replayGuard?: NonceReplayGuard
}

export interface LoGatewayHttpServerOptions extends LoGatewayHandlerOptions {
  host?: string
}

/**
 * Pure request boundary used by the local HTTP server. It validates the HMAC
 * before JSON parsing and dispatches only the static Lo tool catalog.
 */
export async function handleLoGatewayRequest(
  request: LoGatewayRequest,
  options: LoGatewayHandlerOptions,
): Promise<LoGatewayResponse> {
  if (request.method === "GET" && request.path === "/health") {
    return {
      status: 200,
      body: {
        status: "ok",
        protocol: LO_GATEWAY_PROTOCOL,
        tools: listLoToolDefinitions(),
      },
    }
  }
  if (request.method !== "POST" || ![
    "/v1/tools",
    "/v1/conversation",
    "/v1/memory-candidates",
  ].includes(request.path)) {
    return { status: 404, body: { error: "Not found" } }
  }
  if (Buffer.byteLength(request.body, "utf8") > MAX_REQUEST_BODY_BYTES) {
    return { status: 413, body: { error: "Request body too large" } }
  }

  try {
    verifyLoGatewayRequest({
      secret: options.secret,
      body: request.body,
      timestamp: header(request.headers, "x-lo-timestamp") ?? "",
      nonce: header(request.headers, "x-lo-nonce") ?? "",
      signature: header(request.headers, "x-lo-signature"),
      now: options.now?.(),
    })
    const replayGuard = options.replayGuard ?? createNonceReplayGuard({ now: options.now })
    replayGuard.assertUnused(header(request.headers, "x-lo-nonce") ?? "")
  } catch (error) {
    if (error instanceof LoGatewayAuthenticationError) {
      return { status: 401, body: { error: "Unauthorized" } }
    }
    throw error
  }

  let call: unknown
  try {
    call = JSON.parse(request.body)
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } }
  }

  if (request.path === "/v1/conversation") {
    if (!options.conversation) return { status: 404, body: { error: "Not found" } }
    const parsed = conversationRequestSchema.safeParse(call)
    if (!parsed.success) return { status: 400, body: { error: "Invalid conversation input" } }

    try {
      return { status: 200, body: { answer: await options.conversation.respond(parsed.data) } }
    } catch (error) {
      console.error("[lo-gateway] conversation failed", error)
      return { status: 500, body: { error: "Conversation failed" } }
    }
  }

  if (request.path === "/v1/memory-candidates") {
    if (!options.candidates) return { status: 404, body: { error: "Not found" } }
    const parsed = candidateRequestSchema.safeParse(call)
    if (!parsed.success) return { status: 400, body: { error: "Invalid candidate input" } }
    try {
      if (parsed.data.action === "list") {
        return { status: 200, body: { candidates: options.candidates.list() } }
      }
      const candidate = parsed.data.action === "approve"
        ? await options.candidates.approve(parsed.data.candidateId)
        : options.candidates.reject(parsed.data.candidateId)
      return { status: 200, body: { candidate } }
    } catch {
      return { status: 500, body: { error: "Candidate decision failed" } }
    }
  }

  try {
    const result = await options.service.executeTool(call)
    return { status: 200, body: result as unknown as Record<string, unknown> }
  } catch (error) {
    if (error instanceof ZodError) return { status: 400, body: { error: "Invalid tool input" } }
    return { status: 500, body: { error: "Tool execution failed" } }
  }
}

/**
 * Creates an HTTP server that can only bind to loopback. The caller must pass
 * it to listen with the same host; `listenLoGateway` below enforces that.
 */
export function createLoGatewayHttpServer(options: LoGatewayHttpServerOptions): Server {
  const host = options.host ?? "127.0.0.1"
  assertLocalGatewayHost(host)
  assertLoGatewaySecret(options.secret)
  const replayGuard = options.replayGuard ?? createNonceReplayGuard({ now: options.now })

  return createServer(async (request, response) => {
    const body = await readBody(request).catch(() => null)
    if (body === null) {
      sendJson(response, { status: 413, body: { error: "Request body too large" } })
      return
    }
    const result = await handleLoGatewayRequest({
      method: request.method ?? "GET",
      path: request.url ? new URL(request.url, "http://localhost").pathname : "/",
      headers: headersFrom(request),
      body,
    }, { ...options, replayGuard })
    sendJson(response, result)
  })
}

/** Starts the strictly loopback service and resolves only after it is listening. */
export async function listenLoGateway(server: Server, port: number, host = "127.0.0.1"): Promise<void> {
  assertLocalGatewayHost(host)
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(port, host)
  })
}

function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  const direct = headers[name]
  if (direct !== undefined) return direct
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  return found?.[1]
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      request.destroy()
      throw new Error("request body too large")
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function headersFrom(request: IncomingMessage): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join(",") : value,
  ]))
}

function sendJson(response: ServerResponse, result: LoGatewayResponse): void {
  response.writeHead(result.status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  })
  response.end(JSON.stringify(result.body))
}
