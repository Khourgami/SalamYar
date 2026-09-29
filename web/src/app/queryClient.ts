import { QueryClient } from '@tanstack/react-query'

/**
 * Mutations never retry (a double-submitted message or evaluation would be harmful);
 * queries retry once, which covers a transient blip without hiding a real outage.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5_000,
      },
    },
  })
}
