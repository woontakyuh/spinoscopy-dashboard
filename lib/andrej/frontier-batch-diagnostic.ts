import {
  AiFrontierAnalysisError,
  type AiFrontierAnalysisFailurePhase,
} from "@/lib/andrej/frontier-analysis"
import { NotionRequestError } from "@/lib/notion/client"
import {
  AiFrontierPersistenceError,
  type AiFrontierPersistenceStage,
} from "@/lib/notion/ai-frontier-import"

export type FrontierBatchDiagnostic = {
  readonly name: string
  readonly message: string
  readonly phase?: AiFrontierAnalysisFailurePhase
  readonly stage?: AiFrontierPersistenceStage
  readonly status?: number | null
  readonly retryable?: boolean
}

export function safeBatchDiagnostic(error: unknown): FrontierBatchDiagnostic {
  if (error instanceof AiFrontierAnalysisError) {
    return {
      name: error.name,
      message: error.message,
      phase: error.phase,
      status: error.status,
      retryable: error.retryable,
    }
  }
  if (error instanceof AiFrontierPersistenceError) {
    return {
      name: error.name,
      message: error.message,
      stage: error.stage,
      status: error.status,
    }
  }
  if (error instanceof NotionRequestError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
    }
  }
  return { name: "UpstreamError", message: "Upstream operation failed." }
}
