import { createHmac, timingSafeEqual } from "node:crypto"

export const LO_GATEWAY_PROTOCOL = "lo-gateway-v1"
export const LO_GATEWAY_SIGNATURE_PREFIX = "sha256="
export const LO_GATEWAY_MAX_CLOCK_SKEW_SECONDS = 300

export interface LoGatewaySigningInput {
  secret: string
  body: string
  timestamp: string
  nonce: string
}

export interface LoGatewayVerificationInput extends LoGatewaySigningInput {
  signature: string | undefined
  now?: Date
  maxClockSkewSeconds?: number
}

export interface NonceReplayGuard {
  assertUnused(nonce: string): void
}

export interface LoGatewaySecretEnvironment {
  [key: string]: string | undefined
  LO_GATEWAY_HMAC_SECRET?: string
  TELEGRAM_SECRET_TOKEN?: string
}

/**
 * Keeps the gateway secret out of repository files. An explicit secret wins;
 * otherwise derive a domain-separated local secret from the existing
 * high-entropy Telegram webhook secret loaded by both gateway processes.
 */
export function resolveLoGatewaySecret(environment: LoGatewaySecretEnvironment): string {
  const explicit = environment.LO_GATEWAY_HMAC_SECRET?.trim()
  if (explicit) {
    assertLoGatewaySecret(explicit)
    return explicit
  }

  const localSeed = environment.TELEGRAM_SECRET_TOKEN?.trim()
  if (!localSeed) throw new Error("Lo gateway secret is not configured")
  const derived = createHmac("sha256", localSeed)
    .update("lo-gateway-hmac-secret-v1", "utf8")
    .digest("hex")
  assertLoGatewaySecret(derived)
  return derived
}

/** A typed auth failure lets the HTTP adapter return 401 without exposing internals. */
export class LoGatewayAuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LoGatewayAuthenticationError"
  }
}

/**
 * The raw JSON body is intentionally part of the HMAC input. This prevents
 * parser-dependent canonicalization and binds method payload, timestamp, and
 * nonce into one deterministic remote-request contract.
 */
export function canonicalLoGatewayRequest({ body, timestamp, nonce }: Omit<LoGatewaySigningInput, "secret">): string {
  return `${LO_GATEWAY_PROTOCOL}\n${timestamp}\n${nonce}\n${body}`
}

export function signLoGatewayRequest({ secret, body, timestamp, nonce }: LoGatewaySigningInput): string {
  assertSecret(secret)
  assertTimestamp(timestamp)
  assertNonce(nonce)
  return `${LO_GATEWAY_SIGNATURE_PREFIX}${createHmac("sha256", secret)
    .update(canonicalLoGatewayRequest({ body, timestamp, nonce }), "utf8")
    .digest("hex")}`
}

/** Verifies a signed request before JSON parsing or tool dispatch. */
export function verifyLoGatewayRequest({
  secret,
  body,
  timestamp,
  nonce,
  signature,
  now = new Date(),
  maxClockSkewSeconds = LO_GATEWAY_MAX_CLOCK_SKEW_SECONDS,
}: LoGatewayVerificationInput): void {
  assertSecret(secret)
  assertTimestamp(timestamp)
  assertNonce(nonce)
  if (!Number.isInteger(maxClockSkewSeconds) || maxClockSkewSeconds < 0) {
    throw new Error("maxClockSkewSeconds must be a non-negative integer")
  }
  const requestTimestamp = Number(timestamp)
  const nowTimestamp = Math.floor(now.getTime() / 1_000)
  if (Math.abs(nowTimestamp - requestTimestamp) > maxClockSkewSeconds) {
    throw new LoGatewayAuthenticationError("Gateway request timestamp is outside the allowed clock skew")
  }
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) {
    throw new LoGatewayAuthenticationError("Gateway request signature is malformed")
  }

  const expected = signLoGatewayRequest({ secret, body, timestamp, nonce })
  const receivedBuffer = Buffer.from(signature, "utf8")
  const expectedBuffer = Buffer.from(expected, "utf8")
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new LoGatewayAuthenticationError("Gateway request signature is invalid")
  }
}

/** Keeps the service impossible to bind to a LAN or public network interface. */
export function assertLocalGatewayHost(host: string): void {
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
    throw new Error("Lo gateway must bind to a loopback host")
  }
}

/** In-memory replay protection is sufficient because this gateway has one local process. */
export function createNonceReplayGuard({
  now = () => new Date(),
  ttlMs = LO_GATEWAY_MAX_CLOCK_SKEW_SECONDS * 1_000,
}: {
  now?: () => Date
  ttlMs?: number
} = {}): NonceReplayGuard {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new Error("ttlMs must be a positive integer")
  const seen = new Map<string, number>()

  return {
    assertUnused(nonce: string): void {
      assertNonce(nonce)
      const currentTime = now().getTime()
      for (const [seenNonce, expiresAt] of seen) {
        if (expiresAt <= currentTime) seen.delete(seenNonce)
      }
      if (seen.has(nonce)) throw new LoGatewayAuthenticationError("Gateway request nonce replay detected")
      seen.set(nonce, currentTime + ttlMs)
    },
  }
}

export function assertLoGatewaySecret(secret: string): void {
  if (secret.length < 16) throw new Error("LO_GATEWAY_HMAC_SECRET must be at least 16 characters")
}

function assertSecret(secret: string): void {
  assertLoGatewaySecret(secret)
}

function assertTimestamp(timestamp: string): void {
  if (!/^\d{10}$/.test(timestamp)) {
    throw new LoGatewayAuthenticationError("Gateway request timestamp must be a Unix timestamp in seconds")
  }
}

function assertNonce(nonce: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    throw new LoGatewayAuthenticationError("Gateway request nonce must contain 16 to 128 URL-safe characters")
  }
}
