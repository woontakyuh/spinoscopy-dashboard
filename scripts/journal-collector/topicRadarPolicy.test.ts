import { describe, expect, it } from "vitest"
import { passesTopicRadarGate, resolveGroqModel } from "./topicRadarPolicy"

describe("resolveGroqModel", () => {
  it("활성 기본 모델을 사용한다", () => {
    // Given
    const configuredModel = undefined

    // When
    const model = resolveGroqModel(configuredModel)

    // Then
    expect(model).toBe("openai/gpt-oss-120b")
  })

  it("운영 환경의 모델 override를 우선한다", () => {
    // Given
    const configuredModel = "qwen/qwen3.6-27b"

    // When
    const model = resolveGroqModel(configuredModel)

    // Then
    expect(model).toBe(configuredModel)
  })
})

describe("passesTopicRadarGate", () => {
  it("OpenAlex에 아직 없는 핵심술기는 보존한다", () => {
    // Given
    const candidate = { core: true, score: 8, impact: -1 }

    // When
    const passes = passesTopicRadarGate(candidate, 8, 1.3)

    // Then
    expect(passes).toBe(true)
  })

  it("impact가 없는 비핵심 논문은 보류한다", () => {
    // Given
    const candidate = { core: false, score: 9, impact: -1 }

    // When
    const passes = passesTopicRadarGate(candidate, 8, 1.3)

    // Then
    expect(passes).toBe(false)
  })

  it("점수와 impact 기준을 모두 충족한 비핵심 논문은 통과한다", () => {
    // Given
    const candidate = { core: false, score: 8, impact: 2.4 }

    // When
    const passes = passesTopicRadarGate(candidate, 8, 1.3)

    // Then
    expect(passes).toBe(true)
  })

  it("impact가 확인된 저영향 핵심술기는 기존대로 제외한다", () => {
    // Given
    const candidate = { core: true, score: 9, impact: 0.8 }

    // When
    const passes = passesTopicRadarGate(candidate, 8, 1.3)

    // Then
    expect(passes).toBe(false)
  })
})
