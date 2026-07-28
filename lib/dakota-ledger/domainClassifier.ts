/**
 * 도메인 LLM 분류. dakota-todo-sync/dakota-conversation-sync가 공유한다.
 *
 * promote.ts의 codex 호출 플루밍(구조화 출력 스키마 파일, --output-schema,
 * extractAgentMessage로 codex JSONL에서 agent_message 뽑기)을 그대로 재사용한다.
 * promote.ts의 Promoter/promotionSchema는 과제+세션 승격 전용이라 여기 그대로
 * 쓸 수는 없지만, "codex를 한 번 더 얹지 않는다"는 원칙에 따라 같은 실행 경로
 * (execFileSync + --output-schema + extractAgentMessage)를 그대로 따른다.
 */
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { z } from "zod"
import { extractAgentMessage } from "./promote"
import { LEDGER_DOMAINS, type LedgerDomain } from "./types"

const domainClassificationSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      domain: z.enum(LEDGER_DOMAINS as [LedgerDomain, ...LedgerDomain[]]),
    })
  ),
})

export type DomainClassificationResult = z.infer<typeof domainClassificationSchema>
export type DomainClassifier = (prompt: string) => Promise<DomainClassificationResult>

export interface DomainClassificationItem {
  key: string
  text: string
}

export function buildDomainClassificationPrompt(items: DomainClassificationItem[]): string {
  const list = items.map((i) => `- ${i.key} | ${i.text}`).join("\n")
  return `다음 항목들을 9개 도메인 중 하나로 분류하세요: ${LEDGER_DOMAINS.join(", ")}.
투자·시장·지출은 Finance, BJJ·운동은 Training, 일상 잡무·행정은 Operations입니다.
입력에 있는 key만 사용하세요. 없는 key를 지어내지 마세요. 모든 항목에 답하세요.

## 항목
${list}`
}

/**
 * items를 batchSize개씩 잘라 classifier(codex)를 호출하고, key -> domain 맵으로 합친다.
 * 배치 하나가 일부만 답해도(누락) 나머지는 조용히 빠진다 — 호출자가 결과 맵에
 * key가 없는 항목을 감지해 처리해야 한다.
 */
export async function classifyDomains(
  items: DomainClassificationItem[],
  classifier: DomainClassifier,
  batchSize = 40
): Promise<Map<string, LedgerDomain>> {
  const result = new Map<string, LedgerDomain>()
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    if (batch.length === 0) continue
    const prompt = buildDomainClassificationPrompt(batch)
    const res = await classifier(prompt)
    for (const item of res.items) result.set(item.key, item.domain)
  }
  return result
}

export function createCodexDomainClassifier(): DomainClassifier {
  const bin = process.env.CODEX_BIN ?? "codex"
  // dakota-ledger-sync.ts의 createCodexPromoter와 같은 이유로 PID별 스키마 파일을 쓴다:
  // 겹쳐 도는 프로세스가 고정 공유 경로를 두고 경합하는 걸 막는다.
  const schemaPath = path.join(os.tmpdir(), `dakota-domain-classify-schema.${process.pid}.json`)
  writeFileSync(schemaPath, JSON.stringify(z.toJSONSchema(domainClassificationSchema, { target: "draft-7" })))

  const args = [
    "exec", "--json", "--ignore-user-config",
    "--output-schema", schemaPath,
    "--skip-git-repo-check", "--sandbox", "read-only",
  ]
  const model = process.env.DAKOTA_LEDGER_MODEL
  if (model) args.push("--model", model)

  return async (prompt: string) => {
    const stdout = execFileSync(bin, [...args, prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    })
    const message = extractAgentMessage(stdout)
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch (e) {
      const preview = message.length > 300 ? `${message.slice(0, 300)}…` : message
      throw new Error(`codex agent_message가 JSON이 아닙니다: ${(e as Error).message}\n본문: ${preview}`)
    }
    return domainClassificationSchema.parse(parsed)
  }
}
