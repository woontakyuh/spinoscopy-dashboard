"use client"

import { useState } from "react"

interface AthleteAvatarProps {
  name: string
  imageUrl?: string
  size?: number
  className?: string
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// 이름 기반 고정 색상
function nameToColor(name: string): string {
  const colors = [
    "#a855f7", "#3b82f6", "#22c55e", "#ef4444", "#f97316",
    "#eab308", "#06b6d4", "#ec4899", "#8b5cf6", "#14b8a6",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function AthleteAvatar({ name, imageUrl, size = 40, className = "" }: AthleteAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const initials = getInitials(name)
  const color = nameToColor(name)

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        className={`rounded-xl object-cover ${className}`}
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div
      className={`rounded-xl flex items-center justify-center font-semibold text-white shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: `${color}1e`,
        border: `1px solid ${color}30`,
        fontSize: size * 0.35,
        color,
      }}
    >
      {initials}
    </div>
  )
}
