"use client"

import type { ReactNode } from "react"

interface AgentGreeterProps {
  image: string
  name: string
  message: ReactNode
  loading?: boolean
}

export function AgentGreeter({ image, name, message, loading }: AgentGreeterProps) {
  return (
    <div className="flex items-start gap-3 md:gap-4 mb-4 md:mb-6 animate-fade-in-up">
      <div className="flex flex-col items-center shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={name}
          className="w-16 h-16 md:w-24 md:h-24 rounded-full object-cover border border-border shadow-md"
          draggable={false}
        />
        <span className="mt-1.5 text-xs md:text-sm font-semibold text-foreground/90">{name}</span>
      </div>
      <div className="relative flex-1 min-w-0 mt-1 md:mt-2">
        <div className="relative bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 md:px-5 md:py-4 shadow-lg">
          <span
            aria-hidden
            className="absolute -left-2 top-3 w-3 h-3 rotate-45 bg-card border-l border-t border-border"
          />
          <p className="text-foreground/90 text-sm md:text-base leading-relaxed">
            {loading ? <span className="text-muted-foreground">…</span> : message}
          </p>
        </div>
      </div>
    </div>
  )
}
