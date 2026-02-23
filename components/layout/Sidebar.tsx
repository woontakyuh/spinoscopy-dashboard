"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const NAV_ITEMS = [
  { icon: "🏠", label: "Dashboard", href: "/", active: true },
  { icon: "🩺", label: "Clinicus", href: "/agents/clinicus", active: true },
  { icon: "🔬", label: "Scholar", href: "/agents/scholar", active: true },
  { icon: "🎓", label: "Maestro", href: "#", active: false },
  { icon: "📋", label: "Jarvis", href: "/agents/jarvis", active: true },
  { icon: "💰", label: "Vault", href: "/agents/vault", active: true },
  { icon: "🥋", label: "Sensei", href: "/agents/sensei", active: true },
  { icon: "🛰️", label: "AI Radar", href: "/agents/radar", active: true },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-14 md:w-60 min-h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 transition-[width] duration-200">
      <div className="p-2 md:p-4 border-b border-zinc-800">
        <Link href="/" className="flex items-center gap-2 justify-center md:justify-start hover:opacity-80 transition-opacity">
          <span className="text-2xl">🧠</span>
          <div className="hidden md:block">
            <p className="text-white font-semibold text-sm">Spinoscopy</p>
            <p className="text-zinc-500 text-xs">Dr. Yuh</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-1.5 md:p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isCurrentPage = item.href !== "#" && (
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          )

          if (!item.active) {
            return (
              <div
                key={item.label}
                className="flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-lg opacity-40 cursor-not-allowed"
                title={item.label}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{item.icon}</span>
                  <span className="hidden md:inline text-zinc-500 text-sm">{item.label}</span>
                </div>
                <Badge variant="outline" className="hidden md:inline-flex text-xs border-zinc-700 text-zinc-600">
                  준비중
                </Badge>
              </div>
            )
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center justify-center md:justify-start gap-3 px-2 md:px-3 py-2 rounded-lg transition-colors text-sm",
                isCurrentPage
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-2 md:p-4 border-t border-zinc-800">
        <p className="hidden md:block text-zinc-600 text-xs text-center">Spinoscopy AI v0.1</p>
        <p className="md:hidden text-zinc-600 text-[10px] text-center">v0.1</p>
      </div>
    </aside>
  )
}
