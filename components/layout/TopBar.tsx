"use client"

import { useEffect, useState } from "react"
import { ThemeToggle } from "@/components/ui/theme-toggle"

interface TopBarProps {
  title: string
  icon?: string
}

export function TopBar({ title, icon }: TopBarProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  })

  const timeStr = now.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  return (
    <div className="h-12 md:h-14 border-b border-border bg-card flex items-center justify-between px-3 md:px-6">
      <h1 className="text-foreground font-semibold text-sm md:text-base truncate flex items-center gap-2">
        {icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" className="w-9 h-9 rounded-full object-cover" />
        )}
        {title}
      </h1>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span className="text-muted-foreground text-xs md:text-sm">
          <span className="hidden sm:inline">{dateStr} · </span>{timeStr}
        </span>
        <ThemeToggle />
      </div>
    </div>
  )
}
