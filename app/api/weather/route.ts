import { NextResponse } from "next/server"
import type { WeatherData, WeatherCurrent, WeatherHourly, WeatherDaily } from "@/lib/types/weather"

const OWM_BASE = "https://api.openweathermap.org/data/2.5"

interface OWMCurrentResponse {
  name: string
  main: { temp: number; feels_like: number; humidity: number; temp_min: number; temp_max: number }
  weather: Array<{ description: string; icon: string }>
  wind: { speed: number }
}

interface OWMForecastItem {
  dt: number
  main: { temp: number; temp_min: number; temp_max: number }
  weather: Array<{ icon: string; description: string }>
  pop: number
}

interface OWMForecastResponse {
  list: OWMForecastItem[]
}

function formatTime(dt: number): string {
  return new Date(dt * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

function formatDate(dt: number): string {
  const date = new Date(dt * 1000)
  const month = date.toLocaleDateString("ko-KR", { month: "numeric", timeZone: "Asia/Seoul" })
  const day = date.toLocaleDateString("ko-KR", { day: "numeric", timeZone: "Asia/Seoul" })
  const weekday = date.toLocaleDateString("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" })
  return `${month.replace("월", "")}/${day.replace("일", "")} (${weekday})`
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OPENWEATHERMAP_API_KEY not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const lat = searchParams.get("lat")
    const lon = searchParams.get("lon")

    if (!lat || !lon) {
      return NextResponse.json({ error: "lat and lon are required" }, { status: 400 })
    }

    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${OWM_BASE}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`),
      fetch(`${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`),
    ])

    if (!currentRes.ok || !forecastRes.ok) {
      return NextResponse.json({ error: "OpenWeatherMap API 호출 실패" }, { status: 502 })
    }

    const currentData = (await currentRes.json()) as OWMCurrentResponse
    const forecastData = (await forecastRes.json()) as OWMForecastResponse

    const current: WeatherCurrent = {
      temp: Math.round(currentData.main.temp),
      feels_like: Math.round(currentData.main.feels_like),
      humidity: currentData.main.humidity,
      wind_speed: currentData.wind.speed,
      description: currentData.weather[0]?.description ?? "",
      icon: currentData.weather[0]?.icon ?? "01d",
      temp_min: Math.round(currentData.main.temp_min),
      temp_max: Math.round(currentData.main.temp_max),
    }

    const hourly: WeatherHourly[] = forecastData.list.slice(0, 4).map((item) => ({
      time: formatTime(item.dt),
      temp: Math.round(item.main.temp),
      icon: item.weather[0]?.icon ?? "01d",
      pop: item.pop,
    }))

    const dailyMap = new Map<string, { temps: number[]; item: OWMForecastItem }>()
    for (const item of forecastData.list) {
      const dateKey = new Date(item.dt * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
      const existing = dailyMap.get(dateKey)
      if (!existing) {
        dailyMap.set(dateKey, { temps: [item.main.temp_min, item.main.temp_max], item })
      } else {
        existing.temps.push(item.main.temp_min, item.main.temp_max)
        const hour = new Date(item.dt * 1000).getHours()
        if (hour >= 11 && hour <= 13) {
          existing.item = item
        }
      }
    }

    const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    const daily: WeatherDaily[] = Array.from(dailyMap.entries())
      .filter(([key]) => key !== todayKey)
      .slice(0, 5)
      .map(([, { temps, item }]) => ({
        date: formatDate(item.dt),
        temp_min: Math.round(Math.min(...temps)),
        temp_max: Math.round(Math.max(...temps)),
        icon: item.weather[0]?.icon ?? "01d",
        pop: item.pop,
      }))

    const weatherData: WeatherData = {
      current,
      hourly,
      daily,
      location: currentData.name,
    }

    return NextResponse.json(weatherData, {
      headers: { "Cache-Control": "public, max-age=600" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
