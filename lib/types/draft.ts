export type MemoCategory = "patient" | "research" | "idea"

export interface MemoDraft {
  id: string
  title: string
  rawInput: string
  markdown: string
  category: MemoCategory
  createdAt: string
}

export interface FormattedMemo {
  title: string
  markdown: string
  category: MemoCategory
}
