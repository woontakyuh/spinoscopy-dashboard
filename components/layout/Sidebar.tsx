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
  { icon: "📋", label: "Jarvis", href: "#", active: false },
  { icon: "💰", label: "Vault", href: "#", active: false },
  { icon: "🥋", label: "Sensei", href: "#", active: false },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 min-h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <div>
            <p className="text-white font-semibold text-sm">Spinoscopy</p>
            <p className="text-zinc-500 text-xs">Dr. Yuh</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isCurrentPage = item.href !== "#" && (
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          )

          if (!item.active) {
            return (
              <div
                key={item.label}
                className="flex items-center justify-between px-3 py-2 rounded-lg opacity-40 cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-zinc-500 text-sm">{item.label}</span>
                </div>
                <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-600">
                  준비중
                </Badge>
              </div>
            )
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                isCurrentPage
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <p className="text-zinc-600 text-xs text-center">Spinoscopy AI v0.1</p>
      </div>
    </aside>
  )
}
