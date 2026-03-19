import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: string
  message: string
  className?: string
}

export function EmptyState({ icon, message, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-6 gap-2", className)}>
      {icon && <span className="text-2xl opacity-30">{icon}</span>}
      <p className="text-zinc-500 text-sm">{message}</p>
    </div>
  )
}
