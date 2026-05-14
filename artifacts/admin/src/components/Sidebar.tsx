import { Link, useLocation } from "wouter";
import { clearAdminToken, notifyAdminTokenChanged } from "../lib/auth";

type NavItem = { href: string; label: string };
type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
  disabled?: boolean;
};

const SECTIONS: NavSection[] = [
  {
    id: "admin",
    title: "Admin",
    items: [{ href: "/", label: "Dashboard" }],
  },
  {
    id: "grudge",
    title: "Grudges",
    items: [
      { href: "/grudge/prefabs", label: "Prefabs" },
      { href: "/grudge/assets", label: "Assets" },
      { href: "/grudge/characters", label: "Characters" },
    ],
  },
];

function isActive(location: string, href: string): boolean {
  if (href === "/") return location === "/" || location === "";
  return location === href || location.startsWith(`${href}/`);
}

export function Sidebar() {
  const [location] = useLocation();

  function handleSignOut(): void {
    clearAdminToken();
    notifyAdminTokenChanged();
  }

  return (
    <aside className="hidden w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 lg:flex lg:flex-col">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-zinc-100">
            Grudge Studio
          </span>
        </div>
        <p className="mt-0.5 text-xs uppercase tracking-widest text-emerald-500">
          Admin Console
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.id} className="mb-6">
            <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(location, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-md px-3 py-1.5 text-sm transition ${
                        active
                          ? "bg-zinc-800 text-zinc-50"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="mb-6">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Coming soon
          </div>
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-md border border-dashed border-zinc-800 px-3 py-1.5 text-left text-sm text-zinc-600"
          >
            + Add game
          </button>
        </div>
      </nav>

      <div className="border-t border-zinc-800 px-5 py-3">
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

/**
 * Mobile top bar — shown on screens smaller than `lg` since the Sidebar is
 * desktop-only. Keeps a minimal nav so the admin remains usable on a phone.
 */
export function MobileTopBar() {
  const [location] = useLocation();
  const flatItems: NavItem[] = SECTIONS.flatMap((s) => s.items);
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight text-zinc-100">
          Grudge Admin
        </span>
        <nav className="ml-auto flex gap-1 overflow-x-auto">
          {flatItems.map((item) => {
            const active = isActive(location, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-2 py-1 text-xs transition ${
                  active
                    ? "bg-zinc-800 text-zinc-50"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
