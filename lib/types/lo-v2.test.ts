import { describe, expect, it } from "vitest"
import {
  BJJ_TRAINING_DB_ID,
  DEFAULT_LO_PROFILE,
  FITNESS_LOG_DB_ID,
  LO_MEMORY_CATEGORIES,
  LO_MEMORY_SOURCE_KINDS,
} from "./lo-v2"

describe("Lo V2 data contract constants", () => {
  it("preserves the current hardcoded BJJ profile as the seed profile", () => {
    expect(DEFAULT_LO_PROFILE).toMatchObject({
      name: "여운탁",
      belt: "blue",
      stripes: 3,
      trainingStartDate: "2019-11-27",
      gym: "DT Wire",
      instructor: "조준용",
      role: "student",
      baseStats: {
        gi: { guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0 },
        nogi: { guard: 0, passing: 0, control: 0, finishing: 0, takedowns: 0, legLocks: 0 },
      },
    })
  })

  it("preserves all nine legacy promotions, including their ceremonies", () => {
    expect(DEFAULT_LO_PROFILE.promotionHistory).toEqual([
      { date: "2019-11-27", belt: "white", stripes: 0, label: "화이트벨트 시작", ceremony: false },
      { date: "2020-06-20", belt: "white", stripes: 1, label: "화이트 1그랄", ceremony: false },
      { date: "2021-01-19", belt: "white", stripes: 2, label: "화이트 2그랄", ceremony: false },
      { date: "2023-11-10", belt: "white", stripes: 3, label: "화이트 3그랄", ceremony: false },
      { date: "2024-03-08", belt: "white", stripes: 4, label: "화이트 4그랄", ceremony: false },
      { date: "2024-07-19", belt: "blue", stripes: 0, label: "블루벨트 승급", ceremony: false },
      { date: "2025-09-26", belt: "blue", stripes: 1, label: "블루 1그랄", ceremony: true },
      { date: "2025-09-26", belt: "blue", stripes: 2, label: "블루 2그랄", ceremony: true },
      { date: "2026-03-20", belt: "blue", stripes: 3, label: "블루 3그랄", ceremony: true },
    ])
  })

  it("uses the existing Fitness Log and BJJ Training databases", () => {
    expect(FITNESS_LOG_DB_ID).toBe("3af908af-25b9-81bb-ac97-d7b0462f5e64")
    expect(BJJ_TRAINING_DB_ID).toBe("2e7908af-25b9-8097-8098-c857bdc0acbe")
  })

  it("limits memory to durable categories and source metadata kinds", () => {
    expect(LO_MEMORY_CATEGORIES).toEqual([
      "profile", "preference", "person", "project", "rule", "fact", "event",
    ])
    expect(LO_MEMORY_SOURCE_KINDS).toEqual([
      "manual", "chat", "bjj_training", "fitness_log", "gateway", "migration",
    ])
  })
})
