import {
  createDashboardLoToolAdapter,
  LoChatCitationError,
  runLoConversation,
  type LoChatProvider,
  type LoDashboardToolService,
} from "@/lib/lo/chat"
import { formatLoAnswerForDisplay } from "@/lib/lo/chat/persona"
import type { LoMemoryCandidateQueue } from "@/lib/lo/episodic/candidates"
import type { LoConversationSurface, LoEpisodicStore } from "@/lib/lo/episodic/store"

const CITATION_FALLBACK = "Tak, 이번 답변은 근거 연결이 정확하지 않아서 보내지 않았어. 같은 질문을 한 번만 다시 해줘."

export interface LoGatewayConversationInput {
  message: string
  surface: LoConversationSurface
  contextKey: string
  externalTurnId: string
}
export interface LoGatewayConversationService {
  respond(input: LoGatewayConversationInput): Promise<string>
}

/**
 * Reuses the dashboard's bounded Luna loop for a single Hermes message.
 * `runLoConversation` seeds only the dedicated Lo Memory search and excludes
 * memory writes, so this adapter neither stores nor returns a transcript.
 */
export function createLoGatewayConversationService({
  service,
  provider,
  store,
  candidates,
}: {
  service: LoDashboardToolService
  provider: LoChatProvider
  store: LoEpisodicStore
  candidates: Pick<LoMemoryCandidateQueue, "considerTurn">
}): LoGatewayConversationService {
  const adapter = createDashboardLoToolAdapter(service)

  return {
    async respond(input): Promise<string> {
      const recent = store.recentMessages({
        surface: input.surface,
        contextKey: input.contextKey,
        limit: 20,
      })
      let answer: string
      try {
        const result = await runLoConversation([
          ...recent,
          { role: "user", content: input.message },
        ], { adapter, provider })
        answer = formatLoAnswerForDisplay(result.answer)
      } catch (error) {
        if (!(error instanceof LoChatCitationError)) throw error
        answer = CITATION_FALLBACK
      }
      const turn = store.appendTurn({
        surface: input.surface,
        contextKey: input.contextKey,
        externalTurnId: input.externalTurnId,
        userText: input.message,
        assistantText: answer,
      })
      candidates.considerTurn(turn)
      return answer
    },
  }
}
