import { describe, it, expect } from "vitest"
import type { WeatherData, WeatherCurrent, WeatherHourly, WeatherDaily } from "./weather"

describe("Weather types", () => {
  it("should accept valid WeatherData", () => {
    const data: WeatherData = {
      current: {
        temp: 12,
        feels_like: 10,
        humidity: 65,
        wind_speed: 3.5,
        description: "맑음",
        icon: "01d",
        temp_min: 8,
        temp_max: 15,
      },
      hourly: [
        { time: "15:00", temp: 14, icon: "01d", pop: 0 },
      ],
      daily: [
        { date: "3/18 (화)", temp_min: 7, temp_max: 16, icon: "02d", pop: 0.1 },
      ],
      location: "대구",
    }
    expect(data.current.temp).toBe(12)
    expect(data.hourly).toHaveLength(1)
    expect(data.daily).toHaveLength(1)
  })
})
