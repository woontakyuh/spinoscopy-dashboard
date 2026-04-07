"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const NAV_ITEMS = [
  { icon: "🩺", image: "/opdb.png", label: "Op DB", href: "/agents/clinicus", active: true, color: "bg-emerald-600" },
  { icon: "📋", image: "/dakota.png", label: "Dakota", href: "/agents/dakota", active: true, color: "bg-blue-600" },
  { icon: "🔬", image: "/brian.png", label: "Brian", href: "/agents/scholar", active: true, color: "bg-indigo-600" },
  { icon: "💰", image: "/warren.png", label: "Warren", href: "/agents/vault", active: true, color: "bg-amber-600" },
  { icon: "🥋", image: "/lo.png", label: "Lo", href: "/agents/sensei", active: true, color: "bg-orange-600" },
  { icon: "🛰️", image: "/andrej.png", label: "Andrej", href: "/agents/radar", active: true, color: "bg-cyan-600" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-14 md:w-60 min-h-screen bg-card border-r border-border flex flex-col shrink-0 transition-[width] duration-200">
      <div className="p-2 md:p-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2 justify-center md:justify-start hover:opacity-80 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tak.png" alt="Tak" className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover shrink-0" />
          <div className="hidden md:block">
            <p className="text-foreground font-semibold text-sm">Tak, MD</p>
            <p className="text-muted-foreground text-xs">Dashboard</p>
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
                  {"image" in item && item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.label} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <span className="text-2xl">{item.icon}</span>
              )}
                  <span className="hidden md:inline text-muted-foreground text-sm">{item.label}</span>
                </div>
                <Badge variant="outline" className="hidden md:inline-flex text-xs border-border text-muted-foreground/70">
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
                  ? `${item.color} text-white`
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {"image" in item && item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.label} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <span className="text-2xl">{item.icon}</span>
              )}
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-2 md:p-4 border-t border-border">
        <p className="hidden md:block text-muted-foreground/70 text-xs text-center">Spinoscopy AI v0.1</p>
        <p className="md:hidden text-muted-foreground/70 text-[10px] text-center">v0.1</p>
      </div>
    </aside>
  )
}
