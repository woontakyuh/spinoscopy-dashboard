import { describe, expect, it, vi } from "vitest"

import { createLoMemoryCandidatesHandlers } from "./route"

const gatewayConfig = {
  secret: "gateway-hmac-secret",
  baseUrl: "https://lo-gateway.example.com",
  access: {
    clientId: "access-client-id",
    clientSecret: "access-client-secret",
  },
}

describe("/api/lo/memory-candidates", () => {
  it("lists pending Mac mini candidates through Access and HMAC", async () => {
    const callGateway = vi.fn().mockResolvedValue({ candidates: [{ candidateId: "candidate-1" }] })
    const { GET } = createLoMemoryCandidatesHandlers({
      gatewayConfig: () => gatewayConfig,
      callGateway,
    })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ candidates: [{ candidateId: "candidate-1" }] })
    expect(callGateway).toHaveBeenCalledWith({ action: "list" }, gatewayConfig)
  })

  it("forwards only validated approve or reject decisions", async () => {
    const callGateway = vi.fn().mockResolvedValue({
      candidate: { candidateId: "candidate-1", status: "approved" },
    })
    const { POST } = createLoMemoryCandidatesHandlers({
      gatewayConfig: () => gatewayConfig,
      callGateway,
    })
    const request = new Request("http://localhost/api/lo/memory-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: "candidate-1", decision: "approve" }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(callGateway).toHaveBeenCalledWith({
      action: "approve",
      candidateId: "candidate-1",
    }, gatewayConfig)
  })
})
