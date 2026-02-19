import { anthropic } from "@ai-sdk/anthropic"
import { streamText } from "ai"

const SYSTEM_PROMPTS: Record<string, string> = {
  clinicus: `You are Clinicus, a clinical assistant for Dr. Woon Tak Yuh, a spine neurosurgeon in Seoul, Korea.
You assist with PROM data interpretation, case documentation, and clinical decision support.
Always respond in Korean unless asked otherwise.
You have expertise in spine surgery, UBE (Unilateral Biportal Endoscopy), and clinical outcomes research.`,
  default: `You are a medical assistant for Dr. Woon Tak Yuh, a spine neurosurgeon. Respond in Korean.`,
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI 미설정: ANTHROPIC_API_KEY가 없습니다." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )
  }

  const { messages, agentId } = await req.json()
  const systemPrompt = SYSTEM_PROMPTS[agentId as string] ?? SYSTEM_PROMPTS.default

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: systemPrompt,
    messages,
  })

  return result.toTextStreamResponse()
}
