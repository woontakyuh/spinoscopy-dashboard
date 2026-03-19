"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { WeatherDetail } from "./WeatherDetail"
import type { WeatherData } from "@/lib/types/weather"
import dynamic from "next/dynamic"

const WeatherMap = dynamic(() => import("./WeatherMap").then(m => ({ default: m.WeatherMap })), {
  ssr: false,
  loading: () => <div className="h-[280px] flex items-center justify-center text-zinc-500 text-sm">Loading map...</div>,
})

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`)
  if (!res.ok) throw new Error("날씨 로딩 실패")
  return res.json()
}

// 대전 기본 좌표 (지오로케이션 실패 시 폴백)
const DEFAULT_COORDS = { lat: 36.3504, lon: 127.3845 }

function useGeolocation() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(DEFAULT_COORDS)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setCoords(DEFAULT_COORDS),
      { timeout: 10000, maximumAge: 600000 }
    )
  }, [])

  return { coords }
}

export function WeatherInline() {
  const { coords } = useGeolocation()
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["weather", coords?.lat, coords?.lon],
    queryFn: () => fetchWeather(coords!.lat, coords!.lon),
    enabled: !!coords,
    staleTime: 600000,
    refetchInterval: 600000,
  })

  const handleMouseEnter = useCallback(() => {
    if (pinned) return
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setOpen(true)
  }, [pinned])

  const handleMouseLeave = useCallback(() => {
    if (pinned) return
    hoverTimeout.current = setTimeout(() => setOpen(false), 200)
  }, [pinned])

  const handleClick = useCallback(() => {
    if (pinned) {
      setPinned(false)
      setOpen(false)
    } else {
      setPinned(true)
      setOpen(true)
    }
  }, [pinned])

  const handleOpenChange = useCallback((value: boolean) => {
    if (!value) {
      setPinned(false)
      setOpen(false)
    }
  }, [])

  if (!coords || isLoading || !data) return null

  const { current } = data

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            onClick={handleClick}
            className="inline-flex items-center gap-1 text-left text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer text-sm"
          >
            <span>It&apos;s {current.temp}°C and {current.description}, feels like {current.feels_like}°. High {current.temp_max}°, Low {current.temp_min}°.</span>
            <img
              src={`https://openweathermap.org/img/wn/${current.icon}@2x.png`}
              alt={current.description}
              className="w-6 h-6 -my-0.5"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[520px] bg-zinc-900 border-zinc-700 p-0 max-h-[80vh] overflow-y-auto scrollbar-hide"
          align="start"
          sideOffset={8}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="p-4 space-y-4">
            <WeatherDetail data={data} />
            <WeatherMap lat={coords.lat} lon={coords.lon} data={data} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** 도시명을 외부에서 가져갈 수 있도록 export */
export function useWeatherLocation() {
  const { coords } = useGeolocation()

  const { data } = useQuery({
    queryKey: ["weather", coords?.lat, coords?.lon],
    queryFn: () => fetchWeather(coords!.lat, coords!.lon),
    enabled: !!coords,
    staleTime: 600000,
  })

  return data?.location ?? null
}
