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

const stepStartPartSchema = z.strictObject({
  type: z.literal("step-start"),
})

const userMessageSchema = z.looseObject({
  id: z.string().trim().min(1).max(200),
  role: z.literal("user"),
  parts: z.array(textPartSchema).min(1).max(20),
})

const assistantMessageSchema = z.looseObject({
  id: z.string().trim().min(1).max(200),
  role: z.literal("assistant"),
  parts: z.array(z.union([textPartSchema, stepStartPartSchema])).min(1).max(20),
})

const conversationRequestSchema = z.looseObject({
  messages: z.array(z.discriminatedUnion("role", [
    userMessageSchema,
    assistantMessageSchema,
  ])).min(1).max(50),
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

    const latestUser = parsed.data.messages.findLast(
      (message): message is z.infer<typeof userMessageSchema> => message.role === "user",
    )
    if (!latestUser) return json({ error: "invalid_request" }, 400)
    const latestText = latestUser.parts.map((part) => part.text).join("").trim()
    const config = dependencies.gatewayConfig()
    if (!config) return json({ error: "gateway_unavailable" }, 503)

    try {
      const answer = formatLoAnswerForDisplay(await dependencies.callGateway(
        latestText,
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
