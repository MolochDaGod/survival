export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-md mx-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8 text-emerald-400"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h1 className="text-2xl font-semibold">404 — Page not found</h1>
        </div>
        <p className="text-sm text-zinc-400">
          The asset studio doesn't have a page at this URL.
        </p>
      </div>
    </div>
  );
}
