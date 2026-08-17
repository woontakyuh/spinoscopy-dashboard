import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "./proxy"

vi.mock("@/lib/demo", () => ({
  isDemoHost: vi.fn(),
  isAllowedAgentPath: vi.fn(),
}))

import { isDemoHost, isAllowedAgentPath } from "@/lib/demo"

function createRequest(
  pathname: string,
  cookies?: Record<string, string>,
  host = "localhost",
): NextRequest {
  const url = new URL(`http://${host}${pathname}`)
  const req = new NextRequest(url)

  if (cookies) {
    Object.entries(cookies).forEach(([key, value]) => {
      req.cookies.set(key, value)
    })
  }

  return req
}

describe("proxy middleware — authentication gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isDemoHost).mockReturnValue(false)
    vi.mocked(isAllowedAgentPath).mockReturnValue(true)
    process.env.DASHBOARD_PASSWORD = "spinoscopy2026"
    delete process.env.DEMO_PASSWORD
  })

  describe("public static assets — no authentication required", () => {
    it("allows a Dakota image without an authentication cookie", () => {
      const req = createRequest("/dakota/by-outfit/office/whitejacket5.png")
      const response = proxy(req)

      expect(response.status).not.toBe(307)
      expect(response.headers.get("location")).toBeNull()
    })
  })

  describe("/api/lo/* — require authentication", () => {
    it("redirects anonymous /api/lo/dashboard to login", () => {
      const req = createRequest("/api/lo/dashboard")
      const response = proxy(req)

      expect(response.status).toBe(307)
      const location = response.headers.get("location")
      expect(location).toContain("/login")
      expect(location).toContain("from=%2Fapi%2Flo%2Fdashboard")
    })

    it("redirects anonymous /api/lo/chat to login", () => {
      const req = createRequest("/api/lo/chat")
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/login")
    })

    it("allows /api/lo/dashboard with valid dashboard-auth cookie", () => {
      const req = createRequest("/api/lo/dashboard", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("allows /api/lo/chat with valid dashboard-auth cookie", () => {
      const req = createRequest("/api/lo/chat", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("allows /api/lo routes with demo password on demo host", () => {
      process.env.DEMO_PASSWORD = "demo123"
      vi.mocked(isDemoHost).mockReturnValue(true)

      const req = createRequest(
        "/api/lo/dashboard",
        { "dashboard-auth": "demo123" },
        "dashboard1.takmd.com",
      )
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("redirects /api/lo routes on demo host if password is invalid", () => {
      process.env.DEMO_PASSWORD = "demo123"
      vi.mocked(isDemoHost).mockReturnValue(true)

      const req = createRequest(
        "/api/lo/dashboard",
        { "dashboard-auth": "wrong-password" },
        "dashboard1.takmd.com",
      )
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/login")
    })

    it("rejects /api/lo routes with invalid dashboard password", () => {
      const req = createRequest("/api/lo/dashboard", {
        "dashboard-auth": "wrong-password",
      })
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/login")
    })
  })

  describe("/api/andrej/* — require the same authentication as /api/lo", () => {
    it("redirects anonymous /api/andrej/frontier to login", () => {
      const req = createRequest("/api/andrej/frontier")
      const response = proxy(req)

      expect(response.status).toBe(307)
      const location = response.headers.get("location")
      expect(location).toContain("/login")
      expect(location).toContain("from=%2Fapi%2Fandrej%2Ffrontier")
    })

    it("redirects anonymous /api/andrej/frontier/episodes/[pageId] to login", () => {
      const req = createRequest("/api/andrej/frontier/episodes/3b2908af25b981fb88e7c85a93ac62f4")
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/login")
    })

    it("redirects anonymous /api/andrej/conversation to login", () => {
      const req = createRequest("/api/andrej/conversation")
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/login")
    })

    it("allows /api/andrej/frontier with valid dashboard-auth cookie", () => {
      const req = createRequest("/api/andrej/frontier", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("allows /api/andrej/frontier/episodes/[pageId] with valid dashboard-auth cookie", () => {
      const req = createRequest("/api/andrej/frontier/episodes/3b2908af25b981fb88e7c85a93ac62f4", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("rejects /api/andrej/frontier with an invalid dashboard password", () => {
      const req = createRequest("/api/andrej/frontier", {
        "dashboard-auth": "wrong-password",
      })
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/login")
    })

    it("allows /api/andrej routes with demo password on demo host", () => {
      process.env.DEMO_PASSWORD = "demo123"
      vi.mocked(isDemoHost).mockReturnValue(true)

      const req = createRequest(
        "/api/andrej/frontier",
        { "dashboard-auth": "demo123" },
        "dashboard1.takmd.com",
      )
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("does not apply demo page-path restrictions to /api/andrej routes", () => {
      process.env.DEMO_PASSWORD = "demo123"
      vi.mocked(isDemoHost).mockReturnValue(true)
      vi.mocked(isAllowedAgentPath).mockReturnValue(false)

      const req = createRequest(
        "/api/andrej/frontier",
        { "dashboard-auth": "demo123" },
        "dashboard1.takmd.com",
      )
      const response = proxy(req)

      expect(response.status).not.toBe(307)
      expect(response.headers.get("location")).toBeNull()
    })

    it("does not protect an unrelated route that merely shares the /api/andrej prefix string", () => {
      const req = createRequest("/api/andrejaeger/status")
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })
  })

  describe("legacy /api/* routes — no authentication required", () => {
    it("allows anonymous /api/ai-feed without auth", () => {
      const req = createRequest("/api/ai-feed")
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })


    it("allows anonymous /api/ai/chat without auth", () => {
      const req = createRequest("/api/ai/chat")
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("allows anonymous /api/dashboard/surgery without auth", () => {
      const req = createRequest("/api/dashboard/surgery")
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("allows anonymous /api/vault/prices without auth", () => {
      const req = createRequest("/api/vault/prices")
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("allows anonymous /api/notion/query without auth (cron integration)", () => {
      const req = createRequest("/api/notion/query")
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })
  })

  describe("/login route — always accessible", () => {
    it("allows anonymous access to /login", () => {
      const req = createRequest("/login")
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("allows authenticated access to /login", () => {
      const req = createRequest("/login", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })
  })

  describe("page routes — authentication required", () => {
    it("redirects anonymous request to / to login", () => {
      const req = createRequest("/")
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/login")
    })

    it("allows / with valid dashboard-auth cookie", () => {
      const req = createRequest("/", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("allows /agents/dakota with valid dashboard-auth cookie", () => {
      const req = createRequest("/agents/dakota", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("redirects anonymous /agents/elon to login", () => {
      const req = createRequest("/agents/elon")
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/login")
    })
  })

  describe("demo host — path restrictions apply to pages, not /api/lo", () => {
    it("allows authenticated demo host access to allowed agent pages", () => {
      vi.mocked(isDemoHost).mockReturnValue(true)
      vi.mocked(isAllowedAgentPath).mockReturnValue(true)

      const req = createRequest(
        "/agents/elon",
        { "dashboard-auth": "spinoscopy2026" },
        "dashboard1.takmd.com",
      )
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("redirects demo host to home when path is not allowed", () => {
      vi.mocked(isDemoHost).mockReturnValue(true)
      vi.mocked(isAllowedAgentPath).mockReturnValue(false)

      const req = createRequest(
        "/agents/warren",
        { "dashboard-auth": "spinoscopy2026" },
        "dashboard1.takmd.com",
      )
      const response = proxy(req)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/")
    })

    it("includes x-demo header for demo host page access", () => {
      vi.mocked(isDemoHost).mockReturnValue(true)
      vi.mocked(isAllowedAgentPath).mockReturnValue(true)

      const req = createRequest(
        "/agents/elon",
        { "dashboard-auth": "spinoscopy2026" },
        "dashboard1.takmd.com",
      )
      const response = proxy(req)

      expect(response.headers.get("x-middleware-request-x-demo")).toBe("1")
    })

    it("does not apply path restrictions to /api/lo routes (API only checks auth)", () => {
      vi.mocked(isDemoHost).mockReturnValue(true)
      // isAllowedAgentPath returning false should not affect /api/lo routes
      vi.mocked(isAllowedAgentPath).mockReturnValue(false)

      const req = createRequest(
        "/api/lo/dashboard",
        { "dashboard-auth": "demo123" },
        "dashboard1.takmd.com",
      )
      process.env.DEMO_PASSWORD = "demo123"
      const response = proxy(req)

      // Should pass through, not redirect to home
      expect(response.status).not.toBe(307)
      expect(response.headers.get("location")).toBeNull()
    })
  })

  describe("environment-based password handling", () => {
    it("uses default password when DASHBOARD_PASSWORD is not set", () => {
      delete process.env.DASHBOARD_PASSWORD

      const req = createRequest("/api/lo/dashboard", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("uses DASHBOARD_PASSWORD when set", () => {
      process.env.DASHBOARD_PASSWORD = "custom-password"

      const req = createRequest("/api/lo/dashboard", {
        "dashboard-auth": "custom-password",
      })
      const response = proxy(req)

      expect(response.status).not.toBe(307)
    })

    it("rejects wrong password even when environment-configured", () => {
      process.env.DASHBOARD_PASSWORD = "custom-password"

      const req = createRequest("/api/lo/dashboard", {
        "dashboard-auth": "spinoscopy2026",
      })
      const response = proxy(req)

      expect(response.status).toBe(307)
    })
  })
})
