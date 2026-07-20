import { CalendarDays, FileText } from "lucide-react"
import type { ReactNode } from "react"

interface ScheduleSourceLinksProps {
  source: "notion" | "gcal" | "both"
  notionUrl?: string
  gcalUrl?: string
}

function SourceIcon({
  href,
  label,
  children,
  className,
}: {
  href?: string
  label: string
  children: ReactNode
  className: string
}) {
  const content = (
    <span
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-opacity ${className} ${href ? "hover:opacity-75" : "opacity-55"}`}
    >
      {children}
    </span>
  )

  if (!href) return content
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={`${label} 열기`}>
      {content}
    </a>
  )
}

/** A merged schedule is one item; its two source systems remain directly reachable. */
export function ScheduleSourceLinks({ source, notionUrl, gcalUrl }: ScheduleSourceLinksProps) {
  return (
    <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {(source === "gcal" || source === "both") && (
        <SourceIcon href={gcalUrl} label="Google Calendar" className="border-green-500/50 text-green-300">
          <CalendarDays size={14} strokeWidth={1.8} />
        </SourceIcon>
      )}
      {(source === "notion" || source === "both") && (
        <SourceIcon href={notionUrl} label="Notion" className="border-blue-500/50 text-blue-300">
          <FileText size={14} strokeWidth={1.8} />
        </SourceIcon>
      )}
    </div>
  )
}
