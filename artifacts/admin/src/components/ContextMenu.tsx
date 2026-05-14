import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ContextMenuItem {
  label: string;
  /** Optional descriptive line shown under the label (e.g. inferred target path). */
  hint?: string;
  /** Disable the item without hiding it. */
  disabled?: boolean;
  /** Render the item with a destructive (red) accent. */
  danger?: boolean;
  onSelect: () => void;
}

export interface ContextMenuProps {
  /** Anchor point in viewport coordinates (typically the mouse event's clientX/Y). */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  /** Optional small heading at the top of the menu. */
  title?: ReactNode;
}

/**
 * Lightweight right-click menu. Floats at the supplied viewport coordinates
 * with edge clamping so it never opens off-screen. Closes on outside click,
 * scroll, ESC, or window resize.
 */
export function ContextMenu({ x, y, items, onClose, title }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  // Clamp the menu to the viewport once it's mounted so it never spills off-screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width + pad > window.innerWidth) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height + pad > window.innerHeight) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setPos({ left, top });
  }, [x, y]);

  // Dismiss on the obvious ways out.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = (): void => onClose();
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 min-w-[12rem] overflow-hidden rounded-md border border-zinc-700 bg-zinc-900/95 py-1 text-sm text-zinc-100 shadow-2xl backdrop-blur"
    >
      {title ? (
        <div className="border-b border-zinc-800 px-3 py-1.5 text-xs uppercase tracking-wider text-zinc-500">
          {title}
        </div>
      ) : null}
      {items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-zinc-500">No actions</div>
      ) : (
        items.map((item, i) => (
          <button
            key={`${item.label}-${i}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
            className={`block w-full px-3 py-1.5 text-left transition-colors ${
              item.disabled
                ? "cursor-not-allowed text-zinc-600"
                : item.danger
                  ? "text-red-300 hover:bg-red-900/40"
                  : "text-zinc-100 hover:bg-zinc-800"
            }`}
          >
            <div>{item.label}</div>
            {item.hint ? (
              <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                {item.hint}
              </div>
            ) : null}
          </button>
        ))
      )}
    </div>
  );
}
