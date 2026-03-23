import { NextRequest, NextResponse } from "next/server"
import type { BjjStats } from "@/lib/types/sensei"

function buildSystemPrompt(stats: BjjStats): string {
  const gi = stats.gi
  const nogi = stats.nogi
  return `너는 BJJ 코치 AI야. 유저의 수련 데이터를 기반으로 개인화된 코칭을 제공해.

유저 프로필:
- 벨트: ${stats.belt} ${stats.beltStripes}그랄 / 수련: ${stats.trainingMonths}개월
- Gi: Guard ${gi.attributes.guard}, Passing ${gi.attributes.passing}, Control ${gi.attributes.control}, Finishing ${gi.attributes.finishing}, Takedowns ${gi.attributes.takedowns}, LegLocks ${gi.attributes.legLocks} / OVR ${gi.ovr} (${gi.ovrRole})
- No-Gi: Guard ${nogi.attributes.guard}, Passing ${nogi.attributes.passing}, Control ${nogi.attributes.control}, Finishing ${nogi.attributes.finishing}, Takedowns ${nogi.attributes.takedowns}, LegLocks ${nogi.attributes.legLocks} / OVR ${nogi.ovr} (${nogi.ovrRole})
- Gi 아키타입: ${gi.closestArchetype ?? "N/A"} / No-Gi: ${nogi.closestArchetype ?? "N/A"}
- 최근 포커스: ${stats.recentFocus.join(", ")}
- 스승: 조준용 (코요테 하프가드, Lucas Leite 계보)
- 수련 패턴: 주 5일 (Gi 위주)

코칭 원칙:
1. 구체적으로 답해. "가드를 연습하세요" 대신 "하프가드에서 니쉴드 리텐션 → 싯업 → 싱글레그 체인을 연습하세요"
2. 유저의 스승(조준용) 스타일을 존중. 코요테 하프가드 계보를 이해하고 관련 기술을 우선 추천
3. 약점을 지적하되 강점을 살리는 방향으로
4. 대회 준비 질문에는 현실적인 게임플랜 제시
5. 한글로 답변. 주짓수 용어는 영어 원문 병기.`
}

interface CoachRequest {
  message: string
  history?: Array<{ role: "user" | "assistant"; content: string }>
  stats?: BjjStats
  mode?: "oneliner" | "chat"
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CoachRequest
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 500 })
    }

    const systemPrompt = body.stats
      ? buildSystemPrompt(body.stats)
      : "너는 BJJ 코치 AI야. 한글로 답변하고 주짓수 용어는 영어 병기해."

    const messages = body.mode === "oneliner"
      ? [{ role: "user" as const, content: "내 현재 스탯과 최근 수련 패턴을 보고, 이번 주에 가장 필요한 한 줄 추천을 해줘. 60자 이내." }]
      : [
          ...(body.history ?? []),
          { role: "user" as const, content: body.message },
        ]

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: body.mode === "oneliner" ? 100 : 1000,
        system: systemPrompt,
        messages,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `API error: ${text}` }, { status: res.status })
    }

    const data = await res.json() as { content: Array<{ text: string }> }
    const reply = data.content?.[0]?.text ?? ""

    return NextResponse.json({ reply })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
