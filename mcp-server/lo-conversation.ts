import { z } from "zod"

import { callHermesLoGateway } from "../services/lo-gateway/hermes-client"
import { resolveLoGatewaySecret } from "../services/lo-gateway/contract"

const inputSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  surface: z.enum(["claude-code", "claude-desktop"]),
  contextKey: z.string().trim().min(1).max(500),
  externalTurnId: z.string().trim().min(1).max(500),
}).strict()

export type LoMcpConversationInput = z.infer<typeof inputSchema>
export type LoMcpConversation = (input: LoMcpConversationInput) => Promise<string>

export const LO_MCP_CONVERSATION_TOOL = {
  name: "lo.conversation",
  description: "Send one scoped Claude turn through the persistent Lo gateway. Use this for every Lo conversation.",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string", minLength: 1, maxLength: 8_000 },
      surface: { type: "string", enum: ["claude-code", "claude-desktop"] },
      contextKey: { type: "string", minLength: 1, maxLength: 500 },
      externalTurnId: { type: "string", minLength: 1, maxLength: 500 },
    },
    required: ["message", "surface", "contextKey", "externalTurnId"],
    additionalProperties: false,
  },
} as const

export function createLoopbackLoMcpConversation(
  environment: NodeJS.ProcessEnv,
): LoMcpConversation {
  const secret = resolveLoGatewaySecret(environment)
  return (input) => callHermesLoGateway(input.message, {
    secret,
    turn: {
      surface: input.surface,
      contextKey: input.contextKey,
      externalTurnId: input.externalTurnId,
    },
  })
}

export function parseLoMcpConversationInput(value: unknown): LoMcpConversationInput {
  return inputSchema.parse(value)
}
