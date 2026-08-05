import {
  LO_CHAT_MODEL,
  LoChatProviderUnavailableError,
  type LoChatProvider,
  type LoChatProviderRequest,
  type LoChatProviderResponse,
} from "./index"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

type FetchLike = typeof fetch

/** Minimal official Responses API adapter; no provider SDK or transcript store is required. */
export function createOpenAIResponsesProvider({
  apiKey,
  fetchImpl = fetch,
}: {
  apiKey: string
  fetchImpl?: FetchLike
}): LoChatProvider {
  const key = apiKey.trim()
  if (!key) throw new LoChatProviderUnavailableError()

  return {
    async respond(request: LoChatProviderRequest): Promise<LoChatProviderResponse> {
      try {
        const response = await fetchImpl(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: LO_CHAT_MODEL,
            instructions: request.instructions,
            input: request.input,
            tools: request.tools,
            ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
            store: false,
          }),
        })
        if (!response.ok) throw new LoChatProviderUnavailableError()

        const payload: unknown = await response.json()
        if (!isResponsePayload(payload)) throw new LoChatProviderUnavailableError()
        return { output: payload.output }
      } catch (error) {
        if (error instanceof LoChatProviderUnavailableError) throw error
        throw new LoChatProviderUnavailableError()
      }
    },
  }
}

function isResponsePayload(value: unknown): value is { output: Record<string, unknown>[] } {
  return typeof value === "object"
    && value !== null
    && "output" in value
    && Array.isArray(value.output)
    && value.output.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))
}
