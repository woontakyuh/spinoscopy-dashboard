import { NextResponse } from "next/server"
import { z } from "zod"

import {
  WarrenChatProviderUnavailableError,
  WarrenChatResponseError,
  createOpenAIWarrenProvider,
  loadWarrenMarketSnapshot,
  type WarrenChatRequest,
  type WarrenMarketSnapshot,
} from "@/lib/warren/chat"

export const dynamic = "force-dynamic"

const textPartSchema = z.looseObject({
  type: z.literal("text"),
  text: z.string().trim().min(1).max(8_000),
})

const messageSchema = z.looseObject({
  id: z.string().trim().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  parts: z.array(textPartSchema).min(1).max(20),
})

const conversationRequestSchema = z.looseObject({
  messages: z.array(messageSchema).min(1).max(50),
})

interface WarrenConversationRouteDependencies {
  apiKey(): string | undefined
  loadMarket(request: Request): Promise<WarrenMarketSnapshot>
  respond(request: WarrenChatRequest, apiKey: string): Promise<string>
}

export function createWarrenConversationPostHandler(
  dependencies: WarrenConversationRouteDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: "invalid_request" }, 400)
    }

    const parsed = conversationRequestSchema.safeParse(body)
    if (!parsed.success) return json({ error: "invalid_request" }, 400)

    const apiKey = dependencies.apiKey()?.trim()
    if (!apiKey) return json({ error: "provider_unavailable" }, 503)

    const messages = parsed.data.messages.map((message) => ({
      role: message.role,
      content: message.parts.map((part) => part.text).join(""),
    }))
    if (!messages.some((message) => message.role === "user")) {
      return json({ error: "invalid_request" }, 400)
    }

    try {
      const market = await dependencies.loadMarket(request)
      const answer = await dependencies.respond({ messages, market }, apiKey)
      return new Response(answer, {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      })
    } catch (error) {
      if (
        error instanceof WarrenChatProviderUnavailableError
        || error instanceof WarrenChatResponseError
      ) {
        return json({ error: "provider_error" }, 502)
      }
      return json({ error: "internal_error" }, 500)
    }
  }
}

export const POST = createWarrenConversationPostHandler({
  apiKey: () => process.env.OPENAI_API_KEY,
  loadMarket: loadWarrenMarketSnapshot,
  respond: (request, apiKey) => createOpenAIWarrenProvider({ apiKey }).respond(request),
})

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}
