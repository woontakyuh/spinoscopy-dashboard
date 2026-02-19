"use client"

import { useEffect, useState } from "react"

interface TopBarProps {
  title: string
}

export function TopBar({ title }: TopBarProps) {
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
    <div className="h-14 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-6">
      <h1 className="text-white font-semibold">{title}</h1>
      <div className="text-zinc-400 text-sm">
        {dateStr} · {timeStr}
      </div>
    </div>
  )
}
