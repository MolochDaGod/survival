import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TokenGate } from "./components/TokenGate";
import { Sidebar, MobileTopBar } from "./components/Sidebar";
import { DashboardPage } from "./pages/DashboardPage";
import { PrefabsPage } from "./pages/PrefabsPage";
import { AssetsPage } from "./pages/AssetsPage";
import { CharactersPage } from "./pages/CharactersPage";
import {
  getAdminToken,
  subscribeAdminToken,
} from "./lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

function useHasAdminToken(): boolean {
  const [hasToken, setHasToken] = useState<boolean>(() => !!getAdminToken());
  useEffect(() => {
    const update = (): void => setHasToken(!!getAdminToken());
    const offSubscribe = subscribeAdminToken(update);
    const onStorage = (e: StorageEvent): void => {
      if (e.key === "grudge_admin_token") update();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      offSubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return hasToken;
}

function ShellRoutes() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />

      {/* Grudge Nexus game panel */}
      <Route path="/grudge/prefabs" component={PrefabsPage} />
      <Route path="/grudge/assets" component={AssetsPage} />
      <Route path="/grudge/characters" component={CharactersPage} />

      {/* Legacy redirects from the previous flat URL layout */}
      <Route path="/prefabs">
        <Redirect to="/grudge/prefabs" />
      </Route>
      <Route path="/assets">
        <Redirect to="/grudge/assets" />
      </Route>
      <Route path="/characters">
        <Redirect to="/grudge/characters" />
      </Route>

      <Route>
        <div className="mx-auto max-w-3xl px-6 py-12 text-center text-zinc-400">
          <h1 className="text-2xl font-semibold text-zinc-100">Not found</h1>
          <p className="mt-2 text-sm">That admin page does not exist.</p>
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  const hasToken = useHasAdminToken();
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        {hasToken ? (
          <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileTopBar />
              <main className="flex-1">
                <ShellRoutes />
              </main>
            </div>
          </div>
        ) : (
          <TokenGate />
        )}
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
