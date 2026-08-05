import { createOpenAIResponsesProvider } from "../../lib/lo/chat/openai"
import { createLoDashboardService } from "../../lib/lo/dashboard"
import { createLoMemoryCandidateQueue } from "../../lib/lo/episodic/candidates"
import { createLoEpisodicStore } from "../../lib/lo/episodic/store"
import { createLoMemory } from "../../lib/notion/loMemory"
import { createLoGatewayConversationService } from "../../services/lo-gateway/conversation"
import { resolveLoGatewaySecret } from "../../services/lo-gateway/contract"
import { createLoGatewayHttpServer, listenLoGateway } from "../../services/lo-gateway/server"

const HOST = "127.0.0.1"
const DEFAULT_PORT = 4318

async function main(): Promise<void> {
  const secret = resolveLoGatewaySecret(process.env)

  const port = portFromEnvironment(process.env.LO_GATEWAY_PORT)
  const service = createLoDashboardService()
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured")
  const store = createLoEpisodicStore()
  const candidates = createLoMemoryCandidateQueue()
  const conversation = createLoGatewayConversationService({
    service,
    provider: createOpenAIResponsesProvider({ apiKey }),
    store,
    candidates,
  })
  const candidateService = {
    list: () => candidates.list({ status: "pending" }),
    approve: (candidateId: string) => candidates.approve({
      candidateId,
      promote: createLoMemory,
    }),
    reject: (candidateId: string) => candidates.reject(candidateId),
  }
  const server = createLoGatewayHttpServer({
    host: HOST,
    secret,
    service,
    conversation,
    candidates: candidateService,
  })

  server.on("error", (error) => {
    console.error(`[lo-gateway] ${error.message}`)
  })
  const close = () => server.close(() => {
    candidates.close()
    store.close()
  })
  process.once("SIGINT", close)
  process.once("SIGTERM", close)

  await listenLoGateway(server, port, HOST)
  console.log(`[lo-gateway] listening on http://${HOST}:${port}`)
}

function portFromEnvironment(raw: string | undefined): number {
  if (!raw) return DEFAULT_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("LO_GATEWAY_PORT must be an integer from 1024 to 65535")
  }
  return port
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[lo-gateway] ${message}`)
  process.exitCode = 1
})
