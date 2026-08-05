import { describe, expect, it, vi } from "vitest"

import { createLoConversationPostHandler } from "./route"

function request(body: string): Request {
  return new Request("http://localhost/api/lo/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

const messages = [{
  id: "message-1",
  role: "user",
  parts: [{ type: "text", text: "최근 훈련을 요약해줘" }],
}]

describe("POST /api/lo/conversation", () => {
  it("rejects malformed dashboard chat payloads", async () => {
    const callGateway = vi.fn()
    const POST = createLoConversationPostHandler({
      gatewayConfig: () => gatewayConfig,
      callGateway,
    })

    const response = await POST(request(JSON.stringify({ messages: [] })))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" })
    expect(callGateway).not.toHaveBeenCalled()
  })

  it("sends only the latest scoped turn through Access and HMAC", async () => {
    const callGateway = vi.fn().mockResolvedValue(
      "최근 훈련 요약입니다. [citation:notion:training:training-1]",
    )
    const POST = createLoConversationPostHandler({
      gatewayConfig: () => gatewayConfig,
      callGateway,
    })

    const response = await POST(request(JSON.stringify({ messages })))

    expect(callGateway).toHaveBeenCalledWith("최근 훈련을 요약해줘", {
      secret: "gateway-hmac-secret",
      baseUrl: "https://lo-gateway.example.com",
      access: {
        clientId: "access-client-id",
        clientSecret: "access-client-secret",
      },
      turn: {
        surface: "dashboard",
        contextKey: "dashboard:message-1",
        externalTurnId: "message-1",
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    await expect(response.text()).resolves.toBe("최근 훈련 요약입니다.")
  })

  it("accepts AI SDK metadata parts from an earlier assistant turn", async () => {
    const callGateway = vi.fn().mockResolvedValue("언더훅부터 고쳐.")
    const POST = createLoConversationPostHandler({
      gatewayConfig: () => gatewayConfig,
      callGateway,
    })
    const followUpMessages = [
      ...messages,
      {
        id: "message-2",
        role: "assistant",
        parts: [
          { type: "step-start" },
          { type: "text", text: "7월은 하프가드 분기를 만든 달이야.", state: "done" },
        ],
      },
      {
        id: "message-3",
        role: "user",
        parts: [{ type: "text", text: "그중에서 뭐부터 고칠까?" }],
      },
    ]

    const response = await POST(request(JSON.stringify({ messages: followUpMessages })))

    expect(response.status).toBe(200)
    expect(callGateway).toHaveBeenCalledWith("그중에서 뭐부터 고칠까?", expect.objectContaining({
      turn: {
        surface: "dashboard",
        contextKey: "dashboard:message-1",
        externalTurnId: "message-3",
      },
    }))
  })

  it("rejects unsupported AI SDK message part types", async () => {
    const callGateway = vi.fn()
    const POST = createLoConversationPostHandler({
      gatewayConfig: () => gatewayConfig,
      callGateway,
    })
    const unsupportedMessages = [
      ...messages,
      {
        id: "message-2",
        role: "assistant",
        parts: [{ type: "tool-call", toolName: "unknown" }],
      },
      {
        id: "message-3",
        role: "user",
        parts: [{ type: "text", text: "계속해줘" }],
      },
    ]

    const response = await POST(request(JSON.stringify({ messages: unsupportedMessages })))

    expect(response.status).toBe(400)
    expect(callGateway).not.toHaveBeenCalled()
  })

  it("returns gateway_unavailable when remote gateway configuration is incomplete", async () => {
    const callGateway = vi.fn()
    const POST = createLoConversationPostHandler({
      gatewayConfig: () => undefined,
      callGateway,
    })

    const response = await POST(request(JSON.stringify({ messages })))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: "gateway_unavailable" })
    expect(callGateway).not.toHaveBeenCalled()
  })
})

const gatewayConfig = {
  secret: "gateway-hmac-secret",
  baseUrl: "https://lo-gateway.example.com",
  access: {
    clientId: "access-client-id",
    clientSecret: "access-client-secret",
  },
}
