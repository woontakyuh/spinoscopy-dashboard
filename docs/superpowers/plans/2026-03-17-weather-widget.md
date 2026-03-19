# Weather Widget Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MorningBriefing 컴포넌트에 날씨 인라인 표시 + 클릭 시 팝오버 상세/지도 위젯을 추가한다.

**Architecture:** 브라우저 geolocation으로 좌표를 얻고, Next.js API route(`/api/weather`)에서 OpenWeatherMap을 호출하여 날씨 데이터를 반환한다. 클라이언트는 React Query로 데이터를 캐싱하고, 팝오버(Radix Popover) 안에 상세 탭과 Leaflet 지도 탭을 표시한다.

**Tech Stack:** OpenWeatherMap API (Current + 5-Day Forecast), Leaflet + react-leaflet, Radix Popover (shadcn), React Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-17-weather-widget-design.md`

---

## File Structure

```
lib/types/weather.ts                  — TypeScript 타입 (API 응답, 컴포넌트 props)
app/api/weather/route.ts              — API route: OWM Current + Forecast 프록시
components/dashboard/WeatherInline.tsx — 인라인 날씨 + Popover 컨테이너
components/dashboard/WeatherDetail.tsx — 팝오버 탭1: 상세 날씨
components/dashboard/WeatherMap.tsx    — 팝오버 탭2: Leaflet 지도 (dynamic import)
components/dashboard/MorningBriefing.tsx — 기존 파일 수정 (WeatherInline 삽입)
```

---

## Task 0: 의존성 설치

**Files:** `package.json`

- [ ] **Step 1: shadcn Popover 컴포넌트 추가**

```bash
npx shadcn@latest add popover
```

Expected: `components/ui/popover.tsx` 생성됨

- [ ] **Step 2: Leaflet + testing-library 패키지 설치**

```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet @testing-library/react @testing-library/jest-dom
```

Expected: `package.json`에 `leaflet`, `react-leaflet`, `@types/leaflet`, `@testing-library/react` 추가됨

- [ ] **Step 3: 설치 확인**

```bash
ls components/ui/popover.tsx && node -e "require('leaflet'); console.log('OK')"
```

Expected: `OK` 출력

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json components/ui/popover.tsx
git commit -m "chore: add popover component + leaflet dependencies for weather widget"
```

---

## Task 1: TypeScript 타입 정의

**Files:**
- Create: `lib/types/weather.ts`
- Test: `lib/types/weather.test.ts`

- [ ] **Step 1: 타입 정의 파일 작성**

```typescript
// lib/types/weather.ts

export interface WeatherCurrent {
  temp: number
  feels_like: number
  humidity: number
  wind_speed: number
  description: string
  icon: string
  temp_min: number
  temp_max: number
}

export interface WeatherHourly {
  time: string        // "15:00" 형태
  temp: number
  icon: string
  pop: number         // 강수확률 0~1
}

export interface WeatherDaily {
  date: string        // "3/18 (화)" 형태
  temp_min: number
  temp_max: number
  icon: string
  pop: number
}

export interface WeatherData {
  current: WeatherCurrent
  hourly: WeatherHourly[]   // 4개 (3시간 간격, 12시간)
  daily: WeatherDaily[]     // 5일
  location: string          // 도시명
}

```

- [ ] **Step 2: 타입 import 테스트 작성**

```typescript
// lib/types/weather.test.ts
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
```

- [ ] **Step 3: 테스트 실행**

```bash
npx vitest run lib/types/weather.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/types/weather.ts lib/types/weather.test.ts
git commit -m "feat(weather): add TypeScript type definitions"
```

---

## Task 2: API Route (`/api/weather`)

**Files:**
- Create: `app/api/weather/route.ts`
- Test: `app/api/weather/route.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// app/api/weather/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock global fetch for OWM API calls
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Set env var
vi.stubEnv("OPENWEATHERMAP_API_KEY", "test-key")

describe("GET /api/weather", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("should return 400 if lat/lon missing", async () => {
    const { GET } = await import("./route")
    const req = new Request("http://localhost/api/weather")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("should return weather data for valid coordinates", async () => {
    const { GET } = await import("./route")

    // Mock current weather response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Daegu",
        main: { temp: 12, feels_like: 10, humidity: 65, temp_min: 8, temp_max: 15 },
        weather: [{ description: "clear sky", icon: "01d" }],
        wind: { speed: 3.5 },
      }),
    })

    // Mock forecast response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        list: Array.from({ length: 40 }, (_, i) => ({
          dt: Math.floor(Date.now() / 1000) + i * 10800,
          main: { temp: 12 + i, temp_min: 8, temp_max: 16 },
          weather: [{ icon: "01d", description: "clear" }],
          pop: 0,
        })),
      }),
    })

    const req = new Request("http://localhost/api/weather?lat=35.87&lon=128.60")
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.location).toBe("Daegu")
    expect(data.current.temp).toBe(12)
    expect(data.hourly.length).toBeLessThanOrEqual(4)
    expect(data.daily.length).toBeLessThanOrEqual(5)
  })

  it("should return 500 if OPENWEATHERMAP_API_KEY is missing", async () => {
    vi.stubEnv("OPENWEATHERMAP_API_KEY", "")
    // Re-import to pick up new env
    vi.resetModules()
    const { GET } = await import("./route")
    const req = new Request("http://localhost/api/weather?lat=35&lon=128")
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run app/api/weather/route.test.ts
```

Expected: FAIL (route.ts 없음)

- [ ] **Step 3: API Route 구현**

```typescript
// app/api/weather/route.ts
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

    // 두 API를 병렬로 호출
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${OWM_BASE}/weather?lat=${lat}&lon=${lon}&units=metric&lang=kr&appid=${apiKey}`),
      fetch(`${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&units=metric&lang=kr&appid=${apiKey}`),
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

    // 시간별: 다음 4개 슬롯 (3시간 간격 = 12시간)
    const hourly: WeatherHourly[] = forecastData.list.slice(0, 4).map((item) => ({
      time: formatTime(item.dt),
      temp: Math.round(item.main.temp),
      icon: item.weather[0]?.icon ?? "01d",
      pop: item.pop,
    }))

    // 일별: 매일 12:00 슬롯을 대표로, 없으면 첫 슬롯 사용
    const dailyMap = new Map<string, { temps: number[]; item: OWMForecastItem }>()
    for (const item of forecastData.list) {
      const dateKey = new Date(item.dt * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
      const existing = dailyMap.get(dateKey)
      if (!existing) {
        dailyMap.set(dateKey, { temps: [item.main.temp_min, item.main.temp_max], item })
      } else {
        existing.temps.push(item.main.temp_min, item.main.temp_max)
        // 12:00 슬롯 우선
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run app/api/weather/route.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/weather/route.ts app/api/weather/route.test.ts
git commit -m "feat(weather): add /api/weather route with OWM proxy"
```

---

## Task 3: WeatherInline 컴포넌트 (인라인 + 팝오버 컨테이너)

**Files:**
- Create: `components/dashboard/WeatherInline.tsx`

- [ ] **Step 1: WeatherInline 컴포넌트 작성**

```tsx
// components/dashboard/WeatherInline.tsx
"use client"

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { WeatherDetail } from "./WeatherDetail"
import type { WeatherData } from "@/lib/types/weather"
import dynamic from "next/dynamic"

const WeatherMap = dynamic(() => import("./WeatherMap").then(m => ({ default: m.WeatherMap })), {
  ssr: false,
  loading: () => <div className="h-[200px] flex items-center justify-center text-zinc-500 text-sm">지도 로딩 중...</div>,
})

const OWM_ICON_URL = "https://openweathermap.org/img/wn"

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`)
  if (!res.ok) throw new Error("날씨 로딩 실패")
  return res.json()
}

function useGeolocation() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) {
      setDenied(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setDenied(true),
      { timeout: 10000, maximumAge: 600000 }
    )
  }, [])

  return { coords, denied }
}

export function WeatherInline() {
  const { coords, denied } = useGeolocation()

  const { data, isLoading } = useQuery({
    queryKey: ["weather", coords?.lat, coords?.lon],
    queryFn: () => fetchWeather(coords!.lat, coords!.lon),
    enabled: !!coords,
    staleTime: 600000,
    refetchInterval: 600000,
  })

  // 위치 거부 또는 로딩 중 또는 에러 → 표시 안 함
  if (denied || !coords || isLoading || !data) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
          <span className="text-zinc-600">·</span>
          <img
            src={`${OWM_ICON_URL}/${data.current.icon}@2x.png`}
            alt={data.current.description}
            className="w-6 h-6 -my-1"
          />
          <span className="text-base">{data.current.temp}°C</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 md:w-96 bg-zinc-900 border-zinc-700 p-0"
        align="start"
        sideOffset={8}
      >
        <Tabs defaultValue="detail">
          <TabsList className="w-full rounded-none border-b border-zinc-700 bg-zinc-900">
            <TabsTrigger value="detail" className="flex-1 text-xs">상세</TabsTrigger>
            <TabsTrigger value="map" className="flex-1 text-xs">지도</TabsTrigger>
          </TabsList>
          <TabsContent value="detail" className="p-4">
            <WeatherDetail data={data} />
          </TabsContent>
          <TabsContent value="map" className="p-2">
            <WeatherMap lat={coords.lat} lon={coords.lon} />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: 빌드 확인 (WeatherDetail, WeatherMap 미구현이므로 stub 먼저)**

이 컴포넌트는 Task 4, 5에서 만들 WeatherDetail, WeatherMap에 의존하므로, 먼저 stub을 만들어 빌드가 되는지 확인한다.

```tsx
// components/dashboard/WeatherDetail.tsx (stub)
import type { WeatherData } from "@/lib/types/weather"
export function WeatherDetail({ data }: { data: WeatherData }) {
  return <div>{data.location}</div>
}
```

```tsx
// components/dashboard/WeatherMap.tsx (stub)
export function WeatherMap({ lat, lon }: { lat: number; lon: number }) {
  return <div>Map: {lat},{lon}</div>
}
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/WeatherInline.tsx components/dashboard/WeatherDetail.tsx components/dashboard/WeatherMap.tsx
git commit -m "feat(weather): add WeatherInline component with popover container + stubs"
```

---

## Task 4: WeatherDetail 컴포넌트 (상세 탭)

**Files:**
- Modify: `components/dashboard/WeatherDetail.tsx` (stub → 완성)

- [ ] **Step 1: WeatherDetail 완성**

```tsx
// components/dashboard/WeatherDetail.tsx
import type { WeatherData } from "@/lib/types/weather"

const OWM_ICON_URL = "https://openweathermap.org/img/wn"

export function WeatherDetail({ data }: { data: WeatherData }) {
  const { current, hourly, daily } = data

  return (
    <div className="space-y-4 text-zinc-100">
      {/* 현재 날씨 */}
      <div className="flex items-center gap-3">
        <img
          src={`${OWM_ICON_URL}/${current.icon}@2x.png`}
          alt={current.description}
          className="w-12 h-12"
        />
        <div>
          <div className="text-2xl font-semibold">{current.temp}°C</div>
          <div className="text-sm text-zinc-400">{current.description}</div>
        </div>
        <div className="ml-auto text-right text-xs text-zinc-400 space-y-0.5">
          <div>체감 {current.feels_like}°C</div>
          <div>습도 {current.humidity}%</div>
          <div>풍속 {current.wind_speed}m/s</div>
        </div>
      </div>

      {/* 오늘 최고/최저 */}
      <div className="flex gap-4 text-sm text-zinc-400 border-t border-zinc-800 pt-3">
        <span>최고 <span className="text-zinc-200">{current.temp_max}°C</span></span>
        <span>최저 <span className="text-zinc-200">{current.temp_min}°C</span></span>
        {hourly[0] && (
          <span>강수확률 <span className="text-zinc-200">{Math.round(hourly[0].pop * 100)}%</span></span>
        )}
      </div>

      {/* 시간별 예보 */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">시간별</h4>
        <div className="grid grid-cols-4 gap-2">
          {hourly.map((h) => (
            <div key={h.time} className="text-center space-y-1">
              <div className="text-xs text-zinc-400">{h.time}</div>
              <img src={`${OWM_ICON_URL}/${h.icon}.png`} alt="" className="w-8 h-8 mx-auto" />
              <div className="text-sm">{h.temp}°</div>
            </div>
          ))}
        </div>
      </div>

      {/* 주간 예보 */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">주간</h4>
        <div className="space-y-1.5">
          {daily.map((d) => (
            <div key={d.date} className="flex items-center gap-2 text-sm">
              <span className="w-20 text-zinc-400 text-xs">{d.date}</span>
              <img src={`${OWM_ICON_URL}/${d.icon}.png`} alt="" className="w-6 h-6" />
              <span className="text-zinc-300">{d.temp_max}°</span>
              <span className="text-zinc-500">{d.temp_min}°</span>
              {d.pop > 0.1 && (
                <span className="text-blue-400 text-xs ml-auto">{Math.round(d.pop * 100)}%</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: WeatherDetail 렌더 테스트 작성**

```typescript
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
```

- [ ] **Step 3: 테스트 실행**

```bash
npx vitest run components/dashboard/WeatherDetail.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/WeatherDetail.tsx components/dashboard/WeatherDetail.test.tsx
git commit -m "feat(weather): implement WeatherDetail component with current/hourly/daily display"
```

---

## Task 5: WeatherMap 컴포넌트 (지도 탭)

**Files:**
- Modify: `components/dashboard/WeatherMap.tsx` (stub → 완성)

- [ ] **Step 1: WeatherMap 완성**

```tsx
// components/dashboard/WeatherMap.tsx
"use client"

import { useState } from "react"
import { MapContainer, TileLayer } from "react-leaflet"
import "leaflet/dist/leaflet.css"

interface WeatherMapProps {
  lat: number
  lon: number
}

type WeatherLayer = "precipitation" | "wind"

const LAYER_LABELS: Record<WeatherLayer, string> = {
  precipitation: "비구름",
  wind: "풍속",
}

export function WeatherMap({ lat, lon }: WeatherMapProps) {
  const [layer, setLayer] = useState<WeatherLayer>("precipitation")
  const [mapError, setMapError] = useState(false)
  const tileKey = process.env.NEXT_PUBLIC_OPENWEATHERMAP_API_KEY ?? ""

  if (mapError) {
    return (
      <div className="h-[200px] flex items-center justify-center text-zinc-500 text-sm">
        지도를 불러올 수 없습니다
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* 레이어 토글 */}
      <div className="flex gap-1">
        {(Object.entries(LAYER_LABELS) as [WeatherLayer, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setLayer(key)}
            className={`px-2 py-1 text-xs rounded ${
              layer === key
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 지도 */}
      <div className="rounded-lg overflow-hidden border border-zinc-700" style={{ height: 200 }}>
        <MapContainer
          center={[lat, lon]}
          zoom={7}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
          whenReady={() => {}}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            eventHandlers={{ tileerror: () => setMapError(true) }}
          />
          {tileKey && (
            <TileLayer
              key={layer}
              url={`https://tile.openweathermap.org/map/${layer === "precipitation" ? "precipitation_new" : "wind_new"}/{z}/{x}/{y}.png?appid=${tileKey}`}
              opacity={0.6}
            />
          )}
        </MapContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/WeatherMap.tsx
git commit -m "feat(weather): implement WeatherMap component with Leaflet + OWM tile layers"
```

---

## Task 6: MorningBriefing에 WeatherInline 통합

**Files:**
- Modify: `components/dashboard/MorningBriefing.tsx:189-191`

- [ ] **Step 1: MorningBriefing 수정**

기존 코드 (line 189-191):
```tsx
        <p className="text-zinc-500 text-base mt-2">{dateStr}</p>
```

변경:
```tsx
        <div className="flex items-center gap-1 mt-2">
          <p className="text-zinc-500 text-base">{dateStr}</p>
          <WeatherInline />
        </div>
```

파일 상단에 import 추가:
```tsx
import { WeatherInline } from "@/components/dashboard/WeatherInline"
```

- [ ] **Step 2: 개발 서버에서 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:4321` 접속 → 위치 권한 허용 → 날짜 옆에 날씨 아이콘+온도 표시 확인 → 클릭 시 팝오버 확인

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/MorningBriefing.tsx
git commit -m "feat(weather): integrate WeatherInline into MorningBriefing"
```

---

## Task 7: 환경변수 설정 + 최종 확인

- [ ] **Step 1: `.env.local`에 환경변수 추가**

```
OPENWEATHERMAP_API_KEY=<your-key>
NEXT_PUBLIC_OPENWEATHERMAP_API_KEY=<your-key>
```

(OpenWeatherMap에서 무료 API 키 발급: https://openweathermap.org/api)

- [ ] **Step 2: 전체 테스트 실행**

```bash
npm run test
```

Expected: 모든 테스트 PASS

- [ ] **Step 3: 최종 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공

- [ ] **Step 4: 최종 Commit**

```bash
git add -A
git commit -m "feat(weather): complete weather widget with detail popover and map"
```
