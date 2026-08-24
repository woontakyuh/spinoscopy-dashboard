// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { describe, vi } from "vitest"
import { registerComparisonTests } from "./nav-map/testing/comparison-tests"
import { registerInteractionTests } from "./nav-map/testing/interaction-tests"
import { registerLayoutTests } from "./nav-map/testing/layout-tests"
import { registerNavMapTestEnvironment } from "./nav-map/testing/test-environment"
import { registerTrainingAndScoringTests } from "./nav-map/testing/training-and-scoring-tests"

vi.mock("@/lib/sensei/useSenseiData", async () => {
  const { senseiData } = await import("./nav-map/testing/fixtures")
  return {
    useSenseiData: () => senseiData,
  }
})

vi.mock("@/lib/sensei/strategies", () => ({
  loadMyStrategies: () => [],
}))

describe("SenseiNavMap", () => {
  registerNavMapTestEnvironment()
  registerInteractionTests()
  registerTrainingAndScoringTests()
  registerLayoutTests()
  registerComparisonTests()
})
