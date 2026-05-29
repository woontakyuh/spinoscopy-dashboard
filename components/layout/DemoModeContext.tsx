"use client"

import { createContext, useContext } from "react"

const DemoModeContext = createContext(false)

export function DemoModeProvider({
  value,
  children,
}: {
  value: boolean
  children: React.ReactNode
}) {
  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>
}

/** True when rendered under the demo domain (dashboard1.takmd.com). */
export function useDemoMode(): boolean {
  return useContext(DemoModeContext)
}
