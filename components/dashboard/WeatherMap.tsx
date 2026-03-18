"use client"

import { useState } from "react"
import { MapContainer, TileLayer } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { WeatherData } from "@/lib/types/weather"

interface WeatherMapProps {
  lat: number
  lon: number
  data: WeatherData
}

type WeatherLayer = "precipitation" | "wind"

const LAYER_LABELS: Record<WeatherLayer, string> = {
  precipitation: "비구름",
  wind: "풍속",
}

export function WeatherMap({ lat, lon, data }: WeatherMapProps) {
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
      <div className="flex items-center justify-between">
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
        <span className="text-xs text-zinc-500">{data.location}</span>
      </div>

      {/* 지도 + 오버레이 */}
      <div className="relative rounded-lg overflow-hidden border border-zinc-700" style={{ height: 200 }}>
        <MapContainer
          center={[lat, lon]}
          zoom={7}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            eventHandlers={{ tileerror: () => setMapError(true) }}
          />
          {tileKey && (
            <TileLayer
              key={layer}
              url={`https://tile.openweathermap.org/map/${layer === "precipitation" ? "precipitation_new" : "wind_new"}/{z}/{x}/{y}.png?appid=${tileKey}`}
              opacity={0.85}
            />
          )}
        </MapContainer>

        {/* 날씨 정보 오버레이 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pointer-events-none z-[1000]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-zinc-100 font-medium">
                {layer === "precipitation" ? "강수" : "풍속"}
              </span>
              {layer === "precipitation" ? (
                <span className="text-zinc-300">
                  확률 {data.hourly[0] ? `${Math.round(data.hourly[0].pop * 100)}%` : "-"}
                </span>
              ) : (
                <span className="text-zinc-300">
                  {data.current.wind_speed}m/s
                </span>
              )}
            </div>
            <div className="flex gap-3 text-zinc-400">
              <span>{data.current.temp}° {data.current.description}</span>
              <span>습도 {data.current.humidity}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
