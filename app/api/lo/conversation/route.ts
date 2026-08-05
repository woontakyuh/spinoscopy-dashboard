import { NextResponse } from "next/server"
import { z } from "zod"

import { formatLoAnswerForDisplay } from "@/lib/lo/chat/persona"
import {
  callHermesLoGateway,
  type HermesLoGatewayOptions,
} from "@/services/lo-gateway/hermes-client"
import { resolveLoGatewaySecret } from "@/services/lo-gateway/contract"

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

interface LoConversationRouteDependencies {
  gatewayConfig: () => HermesLoGatewayOptions | undefined
  callGateway: typeof callHermesLoGateway
}

export function createLoConversationPostHandler(dependencies: LoConversationRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: "invalid_request" }, 400)
    }

    const parsed = conversationRequestSchema.safeParse(body)
    if (!parsed.success) return json({ error: "invalid_request" }, 400)

    const latestUser = parsed.data.messages.findLast((message) => message.role === "user")
    if (!latestUser) return json({ error: "invalid_request" }, 400)
    const config = dependencies.gatewayConfig()
    if (!config) return json({ error: "gateway_unavailable" }, 503)

    try {
      const answer = formatLoAnswerForDisplay(await dependencies.callGateway(
        latestUser.parts.map((part) => part.text).join(""),
        {
          ...config,
          turn: {
            surface: "dashboard",
            contextKey: `dashboard:${parsed.data.messages[0].id}`,
            externalTurnId: latestUser.id,
          },
        },
      ))
      return new Response(answer, {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      })
    } catch (error) {
      console.error("[lo/conversation] gateway request failed", error)
      return json({ error: "gateway_error" }, 502)
    }
  }
}

export const POST = createLoConversationPostHandler({
  gatewayConfig: () => gatewayConfigFrom(process.env),
  callGateway: callHermesLoGateway,
})

function gatewayConfigFrom(environment: NodeJS.ProcessEnv): HermesLoGatewayOptions | undefined {
  let secret: string
  try {
    secret = resolveLoGatewaySecret(environment)
  } catch {
    return undefined
  }
  const baseUrl = environment.LO_GATEWAY_BASE_URL?.trim()
  const clientId = environment.LO_GATEWAY_ACCESS_CLIENT_ID?.trim()
  const clientSecret = environment.LO_GATEWAY_ACCESS_CLIENT_SECRET?.trim()
  if (!baseUrl) return { secret }
  if (!clientId || !clientSecret) return undefined
  return {
    secret,
    baseUrl,
    access: { clientId, clientSecret },
  }
}

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}
