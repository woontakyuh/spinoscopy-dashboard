import { NextResponse } from "next/server"
import { z } from "zod"

import {
  AndrejChatProviderUnavailableError,
  AndrejChatResponseError,
  createOpenAIAndrejProvider,
  loadAndrejFeedSnapshot,
} from "@/lib/andrej/chat"
import type {
  AndrejChatRequest,
  AndrejFeedSnapshot,
} from "@/lib/andrej/chat"

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

interface AndrejConversationRouteDependencies {
  apiKey(): string | undefined
  loadFeed(request: Request): Promise<AndrejFeedSnapshot>
  respond(request: AndrejChatRequest, apiKey: string): Promise<string>
}

export function createAndrejConversationPostHandler(
  dependencies: AndrejConversationRouteDependencies,
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
      const feed = await dependencies.loadFeed(request)
      const answer = await dependencies.respond({ messages, feed }, apiKey)
      return new Response(answer, {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      })
    } catch (error) {
      if (
        error instanceof AndrejChatProviderUnavailableError
        || error instanceof AndrejChatResponseError
      ) {
        return json({ error: "provider_error" }, 502)
      }
      return json({ error: "internal_error" }, 500)
    }
  }
}

export const POST = createAndrejConversationPostHandler({
  apiKey: () => process.env.OPENAI_API_KEY,
  loadFeed: loadAndrejFeedSnapshot,
  respond: (request, apiKey) => createOpenAIAndrejProvider({ apiKey }).respond(request),
})

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}
