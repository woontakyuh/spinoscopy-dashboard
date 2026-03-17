// @vitest-environment jsdom
// components/dashboard/WeatherDetail.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { WeatherDetail } from "./WeatherDetail"
import type { WeatherData } from "@/lib/types/weather"

const mockData: WeatherData = {
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
    { time: "15:00", temp: 14, icon: "01d", pop: 0.2 },
    { time: "18:00", temp: 12, icon: "02d", pop: 0.1 },
    { time: "21:00", temp: 9, icon: "01n", pop: 0 },
    { time: "00:00", temp: 7, icon: "01n", pop: 0 },
  ],
  daily: [
    { date: "3/18 (화)", temp_min: 7, temp_max: 16, icon: "02d", pop: 0.1 },
    { date: "3/19 (수)", temp_min: 5, temp_max: 14, icon: "03d", pop: 0.3 },
  ],
  location: "Daegu",
}

describe("WeatherDetail", () => {
  it("should render current temperature", () => {
    render(<WeatherDetail data={mockData} />)
    expect(screen.getByText("12°C")).toBeDefined()
  })

  it("should render weather description", () => {
    render(<WeatherDetail data={mockData} />)
    expect(screen.getByText("맑음")).toBeDefined()
  })

  it("should render hourly forecast", () => {
    render(<WeatherDetail data={mockData} />)
    expect(screen.getByText("15:00")).toBeDefined()
    expect(screen.getByText("18:00")).toBeDefined()
  })

  it("should render daily forecast", () => {
    render(<WeatherDetail data={mockData} />)
    expect(screen.getByText("3/18 (화)")).toBeDefined()
    expect(screen.getByText("3/19 (수)")).toBeDefined()
  })
})
