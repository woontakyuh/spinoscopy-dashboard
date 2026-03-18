"use client"

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
        <button className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
          <img
            src={`${OWM_ICON_URL}/${data.current.icon}@2x.png`}
            alt={data.current.description}
            className="w-8 h-8"
          />
          <span className="text-base font-medium text-zinc-200">{data.current.temp}°C</span>
          <span className="text-sm">{data.current.description}</span>
          <span className="text-zinc-600">|</span>
          <span className="text-sm">체감 {data.current.feels_like}°</span>
          <span className="text-zinc-600">|</span>
          <span className="text-sm">습도 {data.current.humidity}%</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 md:w-96 bg-zinc-900 border-zinc-700 p-0"
        align="start"
        sideOffset={8}
      >
        <div className="p-4">
          <WeatherDetail data={data} />
        </div>
        <div className="border-t border-zinc-800 p-2">
          <WeatherMap lat={coords.lat} lon={coords.lon} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
