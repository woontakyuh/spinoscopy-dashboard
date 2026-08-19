import { render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SenseiNavMap } from "@/components/sensei/SenseiNavMap"

export function renderNavMap() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <SenseiNavMap />
    </QueryClientProvider>,
  )
}
