import { describe, expect, it } from "vitest"

import {
  assertLocalGatewayHost,
  assertLoGatewaySecret,
  createNonceReplayGuard,
  resolveLoGatewaySecret,
  signLoGatewayRequest,
  verifyLoGatewayRequest,
} from "./contract"

const secret = "test-gateway-secret"
const body = JSON.stringify({ name: "lo.profile.get", input: {} })
const timestamp = "1785844800"
const nonce = "gateway-test-nonce-0001"

describe("Lo gateway HMAC request contract", () => {
  it("signs an exact versioned request envelope and verifies it in constant time", () => {
    const signature = signLoGatewayRequest({ secret, body, timestamp, nonce })

    expect(signature).toBe("sha256=dffd885307608cc4141ba28b82fb61a611bf29f27bb64dfe42e223aad2216705")
    expect(verifyLoGatewayRequest({
      secret,
      body,
      timestamp,
      nonce,
      signature,
      now: new Date("2026-08-04T12:00:00.000Z"),
    })).toBeUndefined()
  })

  it("rejects tampered, stale, and replayed remote requests", () => {
    const signature = signLoGatewayRequest({ secret, body, timestamp, nonce })
    const now = new Date("2026-08-04T12:00:00.000Z")

    expect(() => verifyLoGatewayRequest({
      secret,
      body: `${body} `,
      timestamp,
      nonce,
      signature,
      now,
    })).toThrow(/signature/i)
    expect(() => verifyLoGatewayRequest({
      secret,
      body,
      timestamp: "1785844199",
      nonce,
      signature,
      now,
      maxClockSkewSeconds: 300,
    })).toThrow(/timestamp/i)

    const replayGuard = createNonceReplayGuard({ now: () => now, ttlMs: 300_000 })
    replayGuard.assertUnused(nonce)
    expect(() => replayGuard.assertUnused(nonce)).toThrow(/replay/i)
  })

  it("fails closed before startup when the configured HMAC secret is too short", () => {
    expect(() => assertLoGatewaySecret("short-secret")).toThrow(/at least 16 characters/)
  })

  it("uses an explicit gateway secret or a domain-separated local Telegram secret", () => {
    expect(resolveLoGatewaySecret({
      LO_GATEWAY_HMAC_SECRET: "explicit-gateway-secret",
      TELEGRAM_SECRET_TOKEN: "telegram-secret-token-value",
    })).toBe("explicit-gateway-secret")

    const derived = resolveLoGatewaySecret({
      TELEGRAM_SECRET_TOKEN: "telegram-secret-token-value",
    })
    expect(derived).toMatch(/^[a-f0-9]{64}$/)
    expect(derived).toBe(resolveLoGatewaySecret({
      TELEGRAM_SECRET_TOKEN: "telegram-secret-token-value",
    }))
    expect(() => resolveLoGatewaySecret({})).toThrow(/gateway secret/i)
  })

  it("allows only loopback bind addresses for the Mac gateway", () => {
    expect(() => assertLocalGatewayHost("127.0.0.1")).not.toThrow()
    expect(() => assertLocalGatewayHost("::1")).not.toThrow()
    expect(() => assertLocalGatewayHost("localhost")).not.toThrow()
    expect(() => assertLocalGatewayHost("0.0.0.0")).toThrow(/loopback/i)
    expect(() => assertLocalGatewayHost("192.168.0.10")).toThrow(/loopback/i)
  })
})
