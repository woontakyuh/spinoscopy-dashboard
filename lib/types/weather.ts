export interface WeatherCurrent {
  temp: number
  feels_like: number
  humidity: number
  wind_speed: number
  wind_deg: number        // 풍향 각도 (0-360)
  wind_gust?: number      // 돌풍 m/s
  pressure: number        // 기압 hPa
  visibility: number      // 가시거리 km
  description: string
  icon: string
  temp_min: number
  temp_max: number
  sunrise: string         // "06:32" 형태
  sunset: string          // "18:45" 형태
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
  hourly: WeatherHourly[]   // 최대 8개 (3시간 간격, 24시간)
  daily: WeatherDaily[]     // 5일
  location: string          // 도시명
}
