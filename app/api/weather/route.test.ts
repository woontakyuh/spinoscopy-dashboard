import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock global fetch for OWM API calls
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Set env var
vi.stubEnv("OPENWEATHERMAP_API_KEY", "test-key")

describe("GET /api/weather", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("should return 400 if lat/lon missing", async () => {
    const { GET } = await import("./route")
    const req = new Request("http://localhost/api/weather")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("should return weather data for valid coordinates", async () => {
    const { GET } = await import("./route")

    // Mock current weather response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Daegu",
        main: { temp: 12, feels_like: 10, humidity: 65, temp_min: 8, temp_max: 15 },
        weather: [{ description: "clear sky", icon: "01d" }],
        wind: { speed: 3.5 },
      }),
    })

    // Mock forecast response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        list: Array.from({ length: 40 }, (_, i) => ({
          dt: Math.floor(Date.now() / 1000) + i * 10800,
          main: { temp: 12 + i, temp_min: 8, temp_max: 16 },
          weather: [{ icon: "01d", description: "clear" }],
          pop: 0,
        })),
      }),
    })

    const req = new Request("http://localhost/api/weather?lat=35.87&lon=128.60")
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.location).toBe("Daegu")
    expect(data.current.temp).toBe(12)
    expect(data.hourly.length).toBeLessThanOrEqual(4)
    expect(data.daily.length).toBeLessThanOrEqual(5)
  })

  it("should return 500 if OPENWEATHERMAP_API_KEY is missing", async () => {
    vi.stubEnv("OPENWEATHERMAP_API_KEY", "")
    vi.resetModules()
    const { GET } = await import("./route")
    const req = new Request("http://localhost/api/weather?lat=35&lon=128")
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})
