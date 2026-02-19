"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Sidebar } from "./Sidebar"
import { usePathname } from "next/navigation"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30000 } },
  }))
  const pathname = usePathname()
  const isLogin = pathname === "/login"

  return (
    <QueryClientProvider client={queryClient}>
      {isLogin ? (
        children
      ) : (
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      )}
    </QueryClientProvider>
  )
}
