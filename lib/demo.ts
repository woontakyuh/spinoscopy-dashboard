// Pure, framework-free helpers shared by middleware (edge), server layout, and client.
// MUST NOT import React or use "use client" — middleware imports this.

export const DEMO_HOST = "dashboard1.takmd.com"

/** Agent ids visible in demo mode (grid + sidebar). */
export const DEMO_AGENT_IDS = ["elon", "brian"] as const

/** True when the request host is the public demo domain. */
export function isDemoHost(host: string | null | undefined): boolean {
  if (!host) return false
  const bare = host.split(":")[0].toLowerCase()
  return bare === DEMO_HOST
}

/**
 * In demo mode, only Elon and Brian agent pages are reachable.
 * Non-`/agents/*` paths are always allowed.
 */
export function isAllowedAgentPath(pathname: string): boolean {
  if (!pathname.startsWith("/agents/")) return true
  return DEMO_AGENT_IDS.some(
    (id) => pathname === `/agents/${id}` || pathname.startsWith(`/agents/${id}/`),
  )
}

/** Login accepts the main dashboard password OR the demo password. */
export function isValidDashboardPassword(
  input: string,
  dashboardPassword: string,
  demoPassword: string | undefined,
): boolean {
  if (!input) return false
  if (input === dashboardPassword) return true
  return !!demoPassword && input === demoPassword
}
