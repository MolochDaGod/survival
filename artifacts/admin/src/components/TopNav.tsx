import { Link, useLocation } from "wouter";
import { clearAdminToken, notifyAdminTokenChanged } from "../lib/auth";

const TABS = [
  { href: "/prefabs", label: "Prefabs" },
  { href: "/assets", label: "Assets" },
  { href: "/characters", label: "Characters" },
];

export function TopNav() {
  const [location] = useLocation();

  function handleSignOut(): void {
    clearAdminToken();
    notifyAdminTokenChanged();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <div className="flex items-center gap-3">
          <img
            src="/grudges-logo.png"
            alt="Grudges"
            className="h-9 w-9 object-contain drop-shadow"
          />
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight text-zinc-100">
              Grudges
            </span>
            <span className="text-xs uppercase tracking-widest text-emerald-500">
              Admin
            </span>
          </div>
        </div>
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const active =
              location === tab.href || location.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-zinc-800 text-zinc-50"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={handleSignOut}
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
