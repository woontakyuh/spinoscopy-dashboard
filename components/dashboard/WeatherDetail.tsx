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
