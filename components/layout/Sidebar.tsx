"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useDemoMode } from "@/components/layout/DemoModeContext"
import { DEMO_AGENT_IDS } from "@/lib/demo"

const NAV_ITEMS = [
  { icon: "📋", image: "/dakota.png", label: "Dakota", href: "/agents/dakota", active: true, color: "bg-blue-600" },
  { icon: "🩺", image: "/elon.png", label: "Elon", href: "/agents/elon", active: true, color: "bg-emerald-600" },
  { icon: "🔬", image: "/brian.png", label: "Brian", href: "/agents/brian", active: true, color: "bg-indigo-600" },
  { icon: "💰", image: "/warren.png", label: "Warren", href: "/agents/warren", active: true, color: "bg-amber-600" },
  { icon: "🥋", image: "/lo.png", label: "Lo", href: "/agents/lo", active: true, color: "bg-orange-600" },
  { icon: "🛰️", image: "/andrej.png", label: "Andrej", href: "/agents/andrej", active: true, color: "bg-cyan-600" },
]

const HOME_ITEM = {
  image: "/tak.png",
  label: "Home",
  href: "/",
  color: "bg-zinc-700",
} as const

export function Sidebar() {
  const pathname = usePathname()
  const demo = useDemoMode()
  const navItems = demo
    ? NAV_ITEMS.filter((item) =>
        (DEMO_AGENT_IDS as readonly string[]).some(
          (id) => item.href === `/agents/${id}`,
        ),
      )
    : NAV_ITEMS

  function forceNavigate(href: string) {
    window.location.assign(href)
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden h-dvh w-16 flex-col overflow-y-auto border-r border-border bg-card md:flex">
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
          {navItems.map((item) => {
            const isCurrentPage = item.href !== "#" && (
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            )

            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg transition-colors touch-manipulation select-none pointer-events-auto",
                  isCurrentPage
                    ? `${item.color} text-white`
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={(event) => {
                  event.preventDefault()
                  forceNavigate(item.href)
                }}
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

      <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-border bg-card/95 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden pointer-events-auto">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {[HOME_ITEM, ...navItems].map((item) => {
            const isCurrentPage = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)

            return (
              <Link
                key={item.label}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "flex min-w-12 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 transition-colors touch-manipulation select-none pointer-events-auto",
                  isCurrentPage
                    ? `${item.color} text-white`
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={(event) => {
                  event.preventDefault()
                  forceNavigate(item.href)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt="" className="h-7 w-7 rounded-full object-cover" />
                <span className="text-[9px] font-medium leading-none">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
