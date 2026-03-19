"use client"

import { useState } from "react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { WeatherData } from "@/lib/types/weather"

interface WeatherMapProps {
  lat: number
  lon: number
  data: WeatherData
}

type WeatherLayer = "precipitation" | "clouds" | "wind"

const LAYERS: { key: WeatherLayer; label: string; tile: string }[] = [
  { key: "precipitation", label: "강수", tile: "precipitation_new" },
  { key: "clouds", label: "구름", tile: "clouds_new" },
  { key: "wind", label: "바람", tile: "wind_new" },
]

// 지도 중심 재설정 컴포넌트
function RecenterMap({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  map.setView([lat, lon])
  return null
}

export function WeatherMap({ lat, lon, data }: WeatherMapProps) {
  const [layer, setLayer] = useState<WeatherLayer>("precipitation")
  const [mapError, setMapError] = useState(false)
  const tileKey = process.env.NEXT_PUBLIC_OPENWEATHERMAP_API_KEY ?? ""

  if (mapError) {
    return (
      <div className="h-[280px] flex items-center justify-center text-zinc-500 text-sm rounded-xl bg-zinc-800/50 border border-zinc-700/50">
        지도를 불러올 수 없습니다
      </div>
    )
  }

  const activeLayer = LAYERS.find(l => l.key === layer)!

  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 overflow-hidden">
      {/* 헤더 */}
      <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">날씨 지도</p>
        <span className="text-[11px] text-zinc-500">{data.location}</span>
      </div>
      <div className="border-t border-zinc-700/50" />

      {/* 레이어 토글 */}
      <div className="px-3 pt-2 pb-1">
        <div className="inline-flex bg-zinc-900/80 rounded-lg p-0.5 gap-0.5">
          {LAYERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setLayer(key)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                layer === key
                  ? "bg-zinc-700 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 지도 */}
      <div className="relative m-2 rounded-lg overflow-hidden" style={{ height: 280 }}>
        <MapContainer
          center={[lat, lon]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <RecenterMap lat={lat} lon={lon} />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            eventHandlers={{ tileerror: () => setMapError(true) }}
          />
          {tileKey && (
            <TileLayer
              key={layer}
              url={`https://tile.openweathermap.org/map/${activeLayer.tile}/{z}/{x}/{y}.png?appid=${tileKey}`}
              opacity={0.9}
            />
          )}
        </MapContainer>

        {/* 범례 */}
        <div className="absolute bottom-2 left-2 z-[1000] pointer-events-none">
          <MapLegend layer={layer} />
        </div>

        {/* 현재 위치 표시 */}
        <div className="absolute top-2 right-2 z-[1000] bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 pointer-events-none">
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-zinc-200">{data.current.temp}°</span>
            <span className="text-zinc-400">{data.current.description}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MapLegend({ layer }: { layer: WeatherLayer }) {
  if (layer === "precipitation") {
    return (
      <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
        <p className="text-[9px] text-zinc-400 mb-1">강수량 (mm/h)</p>
        <div className="flex items-center gap-0.5">
          <div className="h-2 w-12 rounded-sm bg-gradient-to-r from-blue-300/60 via-blue-500 via-yellow-400 to-red-500" />
        </div>
        <div className="flex justify-between text-[8px] text-zinc-500 mt-0.5">
          <span>0</span>
          <span>5</span>
          <span>20+</span>
        </div>
      </div>
    )
  }

  if (layer === "clouds") {
    return (
      <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
        <p className="text-[9px] text-zinc-400 mb-1">구름량 (%)</p>
        <div className="flex items-center gap-0.5">
          <div className="h-2 w-12 rounded-sm bg-gradient-to-r from-transparent via-zinc-400/50 to-white/80" />
        </div>
        <div className="flex justify-between text-[8px] text-zinc-500 mt-0.5">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
    )
  }

  // wind
  return (
    <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
      <p className="text-[9px] text-zinc-400 mb-1">풍속 (m/s)</p>
      <div className="flex items-center gap-0.5">
        <div className="h-2 w-12 rounded-sm bg-gradient-to-r from-green-300/60 via-yellow-400 to-red-500" />
      </div>
      <div className="flex justify-between text-[8px] text-zinc-500 mt-0.5">
        <span>0</span>
        <span>15</span>
        <span>30+</span>
      </div>
    </div>
  )
}
