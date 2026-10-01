import { QueryClient } from "@tanstack/react-query";

// Exported so lib/session can wipe it at session boundaries — cached data outlives logout.
// Defaults escolhidos para economizar leituras do Firestore (cota diária do plano Spark):
// sem refetch a cada foco de janela e dados considerados frescos por 60s, então navegar
// entre telas reaproveita o cache em vez de reler as coleções.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
