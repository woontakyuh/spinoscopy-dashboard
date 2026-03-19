// components/dashboard/WeatherDetail.tsx
import type { WeatherData } from "@/lib/types/weather"
import { Droplets, Gauge, Sunrise, Sunset, Thermometer, Wind } from "lucide-react"

const OWM_ICON_URL = "https://openweathermap.org/img/wn"

function windDegToArrow(deg: number): string {
  // 풍향은 바람이 불어오는 방향이므로 화살표는 반대
  const arrows = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]
  const idx = Math.round(deg / 45) % 8
  return arrows[idx]
}

export function WeatherDetail({ data }: { data: WeatherData }) {
  const { current, hourly, daily } = data

  // 주간 온도 범위 (바 차트용)
  const allTemps = [current.temp_min, current.temp_max, ...daily.flatMap(d => [d.temp_min, d.temp_max])]
  const globalMin = Math.min(...allTemps)
  const globalMax = Math.max(...allTemps)
  const tempRange = globalMax - globalMin || 1

  return (
    <div className="space-y-4 text-zinc-100">
      {/* 현재 날씨 헤더 */}
      <div className="text-center pb-2">
        <p className="text-sm text-zinc-400">{data.location}</p>
        <p className="text-5xl font-light tracking-tight mt-1 num">{current.temp}°</p>
        <p className="text-sm text-zinc-300 mt-1 capitalize">{current.description}</p>
        <p className="text-sm text-zinc-400 mt-0.5">
          최고 {current.temp_max}° · 최저 {current.temp_min}°
        </p>
      </div>

      {/* 시간별 예보 - 가로 스크롤 */}
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 overflow-hidden">
        <div className="px-3 pt-3 pb-1.5">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">시간별 예보</p>
        </div>
        <div className="border-t border-zinc-700/50" />
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-0 px-2 py-3 min-w-max">
            {hourly.map((h, i) => (
              <div key={h.time} className="flex flex-col items-center gap-1.5 px-3 min-w-[52px]">
                <span className="text-xs font-medium text-zinc-300">
                  {i === 0 ? "지금" : h.time}
                </span>
                <img src={`${OWM_ICON_URL}/${h.icon}@2x.png`} alt="" className="w-7 h-7" />
                {h.pop > 0.1 && (
                  <span className="text-[10px] text-blue-400 font-medium">{Math.round(h.pop * 100)}%</span>
                )}
                <span className="text-sm font-medium num">{h.temp}°</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5일 예보 */}
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 overflow-hidden">
        <div className="px-3 pt-3 pb-1.5">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">5일 예보</p>
        </div>
        <div className="border-t border-zinc-700/50" />
        <div className="px-3 py-2 space-y-1">
          {/* 오늘 */}
          <DayRow
            label="오늘"
            icon={current.icon}
            pop={hourly[0]?.pop ?? 0}
            tempMin={current.temp_min}
            tempMax={current.temp_max}
            currentTemp={current.temp}
            globalMin={globalMin}
            tempRange={tempRange}
          />
          {daily.map((d) => (
            <DayRow
              key={d.date}
              label={d.date}
              icon={d.icon}
              pop={d.pop}
              tempMin={d.temp_min}
              tempMax={d.temp_max}
              globalMin={globalMin}
              tempRange={tempRange}
            />
          ))}
        </div>
      </div>

      {/* 상세 정보 — compact grid */}
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-3 py-2.5">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          <Stat icon={<Thermometer className="w-3 h-3" />} label="체감" value={`${current.feels_like}°`} />
          <Stat icon={<Droplets className="w-3 h-3" />} label="습도" value={`${current.humidity}%`} />
          <Stat icon={<Gauge className="w-3 h-3" />} label="기압" value={`${current.pressure}`} unit="hPa" />
          <Stat icon={<Wind className="w-3 h-3" />} label="바람" value={`${current.wind_speed}m/s ${windDegToArrow(current.wind_deg)}`} />
          <Stat icon={<Sunrise className="w-3 h-3" />} label="일출" value={current.sunrise} />
          <Stat icon={<Sunset className="w-3 h-3" />} label="일몰" value={current.sunset} />
        </div>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] text-zinc-500">
        {icon}{label}
      </span>
      <span className="text-sm text-zinc-200">
        {value}{unit && <span className="text-[10px] text-zinc-400 ml-0.5">{unit}</span>}
      </span>
    </div>
  )
}

function DayRow({
  label,
  icon,
  pop,
  tempMin,
  tempMax,
  currentTemp,
  globalMin,
  tempRange,
}: {
  label: string
  icon: string
  pop: number
  tempMin: number
  tempMax: number
  currentTemp?: number
  globalMin: number
  tempRange: number
}) {
  const leftPct = ((tempMin - globalMin) / tempRange) * 100
  const widthPct = ((tempMax - tempMin) / tempRange) * 100

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-700/30 last:border-0">
      <span className="w-[72px] text-xs text-zinc-300 shrink-0 truncate">{label}</span>
      <img src={`${OWM_ICON_URL}/${icon}.png`} alt="" className="w-6 h-6 shrink-0" />
      {pop > 0.1 ? (
        <span className="w-8 text-[10px] text-blue-400 font-medium text-right shrink-0">
          {Math.round(pop * 100)}%
        </span>
      ) : (
        <span className="w-8 shrink-0" />
      )}
      <span className="text-xs text-zinc-500 w-7 text-right shrink-0">{tempMin}°</span>
      {/* 온도 바 */}
      <div className="flex-1 h-1 bg-zinc-700/50 rounded-full relative mx-1 min-w-[60px]">
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-blue-400 via-green-400 to-orange-400"
          style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%` }}
        />
        {currentTemp !== undefined && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border border-zinc-600 shadow-sm"
            style={{ left: `${((currentTemp - globalMin) / tempRange) * 100}%` }}
          />
        )}
      </div>
      <span className="text-xs text-zinc-200 w-7 text-right shrink-0">{tempMax}°</span>
    </div>
  )
}
