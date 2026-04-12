"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

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
    <aside className="w-16 min-h-screen bg-card border-r border-border flex flex-col shrink-0">
      {/* Profile */}
      <div className="p-2 py-3 border-b border-border">
        <Link href="/" className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tak.png" alt="Tak" className="w-10 h-10 rounded-full object-cover" />
          <span className="text-[9px] text-muted-foreground font-medium">Tak</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-1.5 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isCurrentPage = item.href !== "#" && (
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          )

          return (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg transition-colors",
                isCurrentPage
                  ? `${item.color} text-white`
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {"image" in item && item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.label} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <span className="text-xl">{item.icon}</span>
              )}
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-2 border-t border-border">
        <p className="text-muted-foreground/70 text-[9px] text-center">v0.1</p>
      </div>
    </aside>
  )
}
