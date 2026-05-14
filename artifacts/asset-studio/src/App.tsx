import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotFound from "@/pages/not-found";
import { StudioPage } from "./pages/StudioPage";

// Catalog requests are heavy (~31k entries today) but the server caches
// for 15s, so we let React Query keep the data fresh for ~30s without
// re-firing on every focus event.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Switch>
          <Route path="/" component={StudioPage} />
          <Route component={NotFound} />
        </Switch>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
