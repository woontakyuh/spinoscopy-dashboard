import { NextResponse } from "next/server"

import { createLoDashboardService } from "@/lib/lo/dashboard"
import {
  LoChatProviderUnavailableError,
  createDashboardLoToolAdapter,
  loChatRequestSchema,
  runLoChat,
  type LoChatRequest,
} from "@/lib/lo/chat"
import { createOpenAIResponsesProvider } from "@/lib/lo/chat/openai"

export const dynamic = "force-dynamic"

interface LoChatRouteDependencies {
  apiKey: () => string | undefined
  run: (request: LoChatRequest, apiKey: string) => Promise<unknown>
}

/**
 * The query palette posts only a command ID and consumes only { accepted: true }.
 * Generated text remains request-local: it is validated for citations, then discarded
 * because the current palette has no answer-rendering transport.
 */
export function createLoChatPostHandler(dependencies: LoChatRouteDependencies) {
  return async function POST(request: Request): Promise<NextResponse> {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: "invalid_request" }, 400)
    }

    const parsed = loChatRequestSchema.safeParse(body)
    if (!parsed.success) return json({ error: "invalid_request" }, 400)

    const apiKey = dependencies.apiKey()?.trim()
    if (!apiKey) return json({ error: "provider_unavailable" }, 503)

    try {
      await dependencies.run(parsed.data, apiKey)
      return json({ accepted: true }, 200)
    } catch (error) {
      if (error instanceof LoChatProviderUnavailableError) {
        return json({ error: "provider_unavailable" }, 503)
      }
      return json({ error: "internal_error" }, 500)
    }
  }
}

export const POST = createLoChatPostHandler({
  apiKey: () => process.env.OPENAI_API_KEY,
  run: async (request, apiKey) => runLoChat(request, {
    adapter: createDashboardLoToolAdapter(createLoDashboardService()),
    provider: createOpenAIResponsesProvider({ apiKey }),
  }),
})

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}
