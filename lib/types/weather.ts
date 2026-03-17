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
