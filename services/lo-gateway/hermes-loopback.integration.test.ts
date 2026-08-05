import type { Server } from "node:http"

import { describe, expect, it, vi } from "vitest"

import { callHermesLoGateway } from "./hermes-client"
import { createLoGatewayHttpServer, listenLoGateway } from "./server"

const secret = "test-gateway-secret"

describe("Hermes Lo authenticated loopback", () => {
  it("uses the existing HMAC boundary over a real loopback server and returns only a formatted answer", async () => {
    const respond = vi.fn().mockResolvedValue("언더훅부터 잡아. [citation:notion:memory:memory-1]")
    const server = createLoGatewayHttpServer({
      host: "127.0.0.1",
      secret,
      service: { executeTool: vi.fn() },
      conversation: { respond },
    })
    await listenLoGateway(server, 0)

    try {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("Expected a TCP loopback address")

      await expect(callHermesLoGateway("하프가드 우선순위 알려줘", {
        secret,
        port: address.port,
      })).resolves.toBe("언더훅부터 잡아.")
      expect(respond).toHaveBeenCalledWith({
        message: "하프가드 우선순위 알려줘",
        surface: "hermes",
        contextKey: "hermes:default",
        externalTurnId: expect.stringMatching(/^hermes:/),
      })
    } finally {
      await close(server)
    }
  })
})

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}
