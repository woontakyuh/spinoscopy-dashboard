"use client"

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { WeatherDetail } from "./WeatherDetail"
import type { WeatherData } from "@/lib/types/weather"
import dynamic from "next/dynamic"

const WeatherMap = dynamic(() => import("./WeatherMap").then(m => ({ default: m.WeatherMap })), {
  ssr: false,
  loading: () => <div className="h-[200px] flex items-center justify-center text-zinc-500 text-sm">Loading map...</div>,
})

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

  if (denied || !coords || isLoading || !data) return null

  const { current } = data

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-left text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer text-base">
          It&apos;s {current.temp}°C and {current.description}, feels like {current.feels_like}°. High {current.temp_max}°, Low {current.temp_min}°.
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
          <WeatherMap lat={coords.lat} lon={coords.lon} data={data} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
