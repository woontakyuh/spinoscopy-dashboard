import type { WeatherData } from "@/lib/types/weather"

export function WeatherDetail({ data }: { data: WeatherData }) {
  return <div>{data.location}</div>
}
