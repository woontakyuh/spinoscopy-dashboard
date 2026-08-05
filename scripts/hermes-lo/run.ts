import { fileURLToPath } from "node:url"
import path from "node:path"

import { callHermesLoGateway } from "../../services/lo-gateway/hermes-client"
import { resolveLoGatewaySecret } from "../../services/lo-gateway/contract"

export async function runHermesLo(args: readonly string[], environment = process.env): Promise<string> {
  if (args.length !== 1) throw new Error("Usage: run.ts <user message>")

  const secret = resolveLoGatewaySecret(environment)

  return callHermesLoGateway(args[0], {
    secret,
    port: portFromEnvironment(environment.LO_GATEWAY_PORT),
  })
}

function portFromEnvironment(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("LO_GATEWAY_PORT must be an integer from 1024 to 65535")
  }
  return port
}

async function main(): Promise<void> {
  try {
    const answer = await runHermesLo(process.argv.slice(2))
    process.stdout.write(`${answer}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[hermes-lo] ${message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main()
}
