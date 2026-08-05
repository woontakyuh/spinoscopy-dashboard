import { NextResponse } from "next/server"
import { z } from "zod"

import {
  callLoMemoryCandidateGateway,
  type LoMemoryCandidateGatewayOptions,
} from "@/services/lo-gateway/memory-candidate-client"
import { resolveLoGatewaySecret } from "@/services/lo-gateway/contract"

const decisionSchema = z.object({
  candidateId: z.string().trim().min(1).max(200),
  decision: z.enum(["approve", "reject"]),
}).strict()

interface Dependencies {
  gatewayConfig: () => LoMemoryCandidateGatewayOptions | undefined
  callGateway: typeof callLoMemoryCandidateGateway
}

export function createLoMemoryCandidatesHandlers(dependencies: Dependencies) {
  return {
    GET: async () => {
      const config = dependencies.gatewayConfig()
      if (!config) return json({ error: "gateway_unavailable" }, 503)
      try {
        return json(await dependencies.callGateway({ action: "list" }, config), 200)
      } catch {
        return json({ error: "gateway_error" }, 502)
      }
    },
    POST: async (request: Request) => {
      const parsed = decisionSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return json({ error: "invalid_request" }, 400)
      const config = dependencies.gatewayConfig()
      if (!config) return json({ error: "gateway_unavailable" }, 503)
      try {
        return json(await dependencies.callGateway({
          action: parsed.data.decision,
          candidateId: parsed.data.candidateId,
        }, config), 200)
      } catch {
        return json({ error: "gateway_error" }, 502)
      }
    },
  }
}

const handlers = createLoMemoryCandidatesHandlers({
  gatewayConfig: () => gatewayConfigFrom(process.env),
  callGateway: callLoMemoryCandidateGateway,
})

export const GET = handlers.GET
export const POST = handlers.POST

function gatewayConfigFrom(environment: NodeJS.ProcessEnv): LoMemoryCandidateGatewayOptions | undefined {
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
  return { secret, baseUrl, access: { clientId, clientSecret } }
}

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}
