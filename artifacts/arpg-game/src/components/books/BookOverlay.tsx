import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useSpriteSheet } from './useSpriteSheet';
import { CloseGlyph, ArrowLeftGlyph, ArrowRightGlyph } from './BookIcons';
import './books.css';

/**
 * Recoverable error panel used when a single book page throws while
 * rendering. Keeps the book chrome alive so the player can navigate to
 * another page or close the book — without this, a render bug in any
 * page would unmount the entire React tree (white screen + game loop
 * still running underneath, which is exactly the kind of "freeze" the
 * bestiary work was guarding against).
 */
function PageErrorPanel({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="book-page left" style={{ padding: 16 }}>
      <h2 className="book-h1" style={{ color: '#8a2020' }}>Page torn</h2>
      <p className="book-text" style={{ fontSize: 12 }}>
        Something went wrong rendering this page. The book is still safe to
        close or navigate.
      </p>
      <p className="book-text" style={{ fontSize: 11, opacity: 0.65, fontFamily: 'monospace' }}>
        {error instanceof Error ? error.message : 'unknown error'}
      </p>
      <button
        onClick={resetErrorBoundary}
        style={{
          marginTop: 8,
          padding: '4px 10px',
          background: '#3a1f10',
          color: '#fbe9b8',
          border: '1px solid #6b2c0a',
          borderRadius: 3,
          fontFamily: 'Cinzel, serif',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}

/**
 * BookOverlay — full-screen modal that animates a Craftpix book opening,
 * shows page content, animates page turns on demand, and animates closing
 * on dismiss.
 *
 * Lifecycle:
 *   OPENING  → plays open_book.png (12 frames, 4×3)
 *   READING  → renders pageContent (fade-in via pages_appear)
 *   TURNING  → plays turn_left/turn_right.png (16 frames, 4×4)
 *   CLOSING  → plays close_book.png (12 frames, 4×3)  → calls onClose
 */

export type BookKind = 'bestiary' | 'adventure' | 'magic';

/** Navigation helpers exposed to each page's `render` function so a page
 *  can imperatively jump to a sibling page (e.g. a Bestiary index thumb
 *  jumping to its detail entry). */
export interface PageNavApi {
  goTo: (pageId: string) => void;
  goNext: () => void;
  goPrev: () => void;
  currentIndex: number;
  pageCount: number;
}

interface PageDef {
  id: string;
  /** Optional badge for spine bookmark sidebar */
  badge?: { color: string; label: string };
  render: (nav: PageNavApi) => React.ReactNode;
}

interface BookOverlayProps {
  kind: BookKind;
  pages: PageDef[];
  onClose: () => void;
  /** Optional initial page index */
  initialPage?: number;
}

const ASSET_BASE: Record<BookKind, string> = {
  bestiary:  '/books/bestiary',
  adventure: '/books/adventure',
  magic:     '/books/magic',
};

// Display size — the source spritesheet renders one book frame at 272×272.
// We scale that up to a comfortable reading size. PREFERRED_SCALE (4.32) is
// 1.8× the previous 2.4 so the book has roughly 3.2× the parchment area to
// work with, which makes inventory grids / bestiary cards far more legible.
// `useBookSize` clamps that to the viewport so the book always fits with a
// sensible margin no matter the user's window size or aspect ratio.
const FRAME = 272;
const PREFERRED_SCALE = 4.32;
// Minimum book size needs to be tall/wide enough that the close button (52px)
// and the side page-turn buttons (64px each) don't overlap content. ~520px is
// the smallest dimension where both controls + two pages of text breathe.
const MIN_SIZE = 520;

function computeBookSize(): number {
  if (typeof window === 'undefined') return FRAME * PREFERRED_SCALE;
  const maxFromHeight = window.innerHeight * 0.92;
  const maxFromWidth  = window.innerWidth  * 0.85;
  const ideal = Math.min(FRAME * PREFERRED_SCALE, maxFromHeight, maxFromWidth);
  // Floor the ideal at MIN_SIZE so chrome stays usable; on tiny windows
  // the book may overflow the viewport — that's a deliberate trade-off
  // versus stomping the close button.
  return Math.floor(Math.max(ideal, MIN_SIZE));
}

function useBookSize(): number {
  const [size, setSize] = useState(computeBookSize);
  useEffect(() => {
    const onResize = () => setSize(computeBookSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

type Phase = 'OPENING' | 'READING' | 'TURNING_LEFT' | 'TURNING_RIGHT' | 'CLOSING';

export function BookOverlay({ kind, pages, onClose, initialPage = 0 }: BookOverlayProps) {
  const base = ASSET_BASE[kind];
  // Book sprite sheets (open_book.png, close_book.png, turn_*.png) are not
  // yet on R2. Skip the sprite animation phases and go straight to READING
  // so the book content is immediately visible. When sprite assets are
  // uploaded, revert this to 'OPENING'.
  const [phase, setPhase] = useState<Phase>('READING');
  const [pageIndex, setPageIndex] = useState(initialPage);
  const W = useBookSize();
  const H = W; // book art is square
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Open animation: 12 frames @ 30 fps = ~400 ms
  const open = useSpriteSheet({
    url: `${base}/open_book.png`,
    cols: 4, rows: 3, totalFrames: 12, fps: 30,
    playing: phase === 'OPENING',
    displayWidth: W, displayHeight: H,
    onComplete: () => setPhase('READING'),
  });

  // Close animation: 12 frames @ 30 fps
  const close = useSpriteSheet({
    url: `${base}/close_book.png`,
    cols: 4, rows: 3, totalFrames: 12, fps: 30,
    playing: phase === 'CLOSING',
    displayWidth: W, displayHeight: H,
    onComplete: () => onCloseRef.current(),
  });

  // Turn left & right (16 frames @ 32 fps = ~500 ms)
  const turnLeft = useSpriteSheet({
    url: `${base}/turn_left.png`,
    cols: 4, rows: 4, totalFrames: 16, fps: 32,
    playing: phase === 'TURNING_LEFT',
    displayWidth: W, displayHeight: H,
    onComplete: () => setPhase('READING'),
  });

  const turnRight = useSpriteSheet({
    url: `${base}/turn_right.png`,
    cols: 4, rows: 4, totalFrames: 16, fps: 32,
    playing: phase === 'TURNING_RIGHT',
    displayWidth: W, displayHeight: H,
    onComplete: () => setPhase('READING'),
  });

  // Open frame — also serves as the static "fully open" backdrop while reading,
  // by holding on its last frame.
  const openStatic = useSpriteSheet({
    url: `${base}/open_book.png`,
    cols: 4, rows: 3, totalFrames: 12, fps: 30,
    playing: false,
    displayWidth: W, displayHeight: H,
  });
  // Force the static layer to the last frame
  const lastFrameStyle = {
    ...openStatic.style,
    backgroundPosition: `-${(11 % 4) * W}px -${Math.floor(11 / 4) * H}px`,
  };

  // ── Keyboard ownership while a book is open ───────────────────────────────
  // Two distinct ownership groups while the book is mounted:
  //
  //  1) OWNED — these keys are exclusively the book's. They are SWALLOWED
  //     (stopImmediatePropagation) so they never reach GameEngine /
  //     GameCanvas / PlayerController:
  //        • Escape         → close-book animation (also bound to KEYBINDS.
  //                           PAUSE in GameEngine; double-firing toggled
  //                           pause + fought pointer-lock).
  //        • ArrowLeft/Right→ page-turn (PlayerController also calls
  //                           preventDefault on these but doesn't use them
  //                           for movement; we pre-empt anyway for safety).
  //        • KeyI / Tab     → would mount a second modal (InventoryBook /
  //                           survival inv) on top of this one.
  //
  //  2) PASS-THROUGH — KeyK, KeyP, KeyC, KeyB are intentionally NOT blocked
  //     because GameCanvas already implements close-this-then-open-that
  //     hot-swap logic for K/P (and survival hotkeys C/B simply no-op while
  //     a book is open thanks to the modal-guard at GameCanvas:513).
  //
  // Strategy: register on `window` in CAPTURE phase so we run before any
  // bubble-phase window or document-bubble listeners (the engine listens on
  // document with default bubble phase — capture-phase window listeners run
  // first in the dispatch order).
  useEffect(() => {
    const BLOCKED = new Set([
      'Escape',
      'ArrowLeft', 'ArrowRight',
      'KeyI',
      'Tab',
    ]);
    const handler = (e: KeyboardEvent) => {
      if (!BLOCKED.has(e.code)) return;
      // Always swallow — even outside READING phase — so a stray keypress
      // during the open/close animation can't leak through to game systems.
      e.stopImmediatePropagation();
      e.preventDefault();
      if (phase !== 'READING') return;
      if (e.code === 'Escape' || e.code === 'KeyI')                       onCloseRef.current();
      else if (e.code === 'ArrowRight' && pageIndex < pages.length - 1) { setPageIndex(p => p + 1); }
      else if (e.code === 'ArrowLeft'  && pageIndex > 0)                { setPageIndex(p => p - 1); }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as any);
  }, [phase, pageIndex, pages.length]);

  // Because the book sprite assets are missing, bypass animation phases
  // entirely — close immediately, page-turns are instant index swaps.
  // When sprites are uploaded, restore the CLOSING / TURNING_* transitions.
  const handleClose = () => {
    if (phase === 'READING') onCloseRef.current();
  };

  const goPrev = () => {
    if (phase === 'READING' && pageIndex > 0) {
      setPageIndex(pageIndex - 1);
    }
  };
  const goNext = () => {
    if (phase === 'READING' && pageIndex < pages.length - 1) {
      setPageIndex(pageIndex + 1);
    }
  };
  const goTo = (pageId: string) => {
    if (phase !== 'READING') return;
    const idx = pages.findIndex(p => p.id === pageId);
    if (idx < 0 || idx === pageIndex) return;
    setPageIndex(idx);
  };

  const navApi: PageNavApi = {
    goTo, goNext, goPrev,
    currentIndex: pageIndex,
    pageCount: pages.length,
  };

  // Pick which sprite layer is currently active
  let activeStyle: React.CSSProperties;
  if (phase === 'OPENING')        activeStyle = open.style;
  else if (phase === 'CLOSING')   activeStyle = close.style;
  else if (phase === 'TURNING_LEFT')  activeStyle = turnLeft.style;
  else if (phase === 'TURNING_RIGHT') activeStyle = turnRight.style;
  else                            activeStyle = lastFrameStyle;

  const showContent = phase === 'READING';
  const currentPage = pages[Math.min(pageIndex, pages.length - 1)];

  return (
    <div
      className="book-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="book-stage" style={{ width: W, height: H }}>
        {/* Animated book sprite */}
        <div className="book-sprite" style={activeStyle} />

        {/* Content overlay (fades in once book is open). The visible
         * parchment-page borders are drawn here so they sit ABOVE the
         * sprite (which has its own border art) but BELOW interactive
         * widgets, giving each book a clear "two paper pages" look. */}
        {showContent && currentPage && (
          <div className="book-pages fade-in" key={currentPage.id}>
            <div className="book-page-frame left" aria-hidden />
            <div className="book-page-frame right" aria-hidden />
            {/* Per-page error boundary. `resetKeys` ties retry state to the
             * page id so flipping to another page automatically clears any
             * caught error from the previous page. */}
            <ErrorBoundary FallbackComponent={PageErrorPanel} resetKeys={[currentPage.id]}>
              {currentPage.render(navApi)}
            </ErrorBoundary>
          </div>
        )}

        {/* Bookmark sidebar — only when there are sections to jump to.
         * Each PageDef.badge renders a colored tab on the right edge of
         * the book, anchored to the gold border. Clicking jumps directly
         * to that page (with an animated turn). */}
        {phase === 'READING' && pages.length > 1 && pages.some(p => p.badge) && (
          <div className="book-bookmarks">
            {pages.map((p, i) => p.badge && (
              <button
                key={p.id}
                className={'book-bookmark' + (i === pageIndex ? ' active' : '')}
                style={{ background: p.badge.color }}
                onClick={() => {
                  if (phase !== 'READING' || i === pageIndex) return;
                  setPageIndex(i);
                }}
                title={p.badge.label}
              >
                <span>{p.badge.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Close button */}
        {phase === 'READING' && (
          <button className="book-close" onClick={handleClose} aria-label="Close book">
            <CloseGlyph size={22} />
          </button>
        )}

        {/* Page-turn nav */}
        {phase === 'READING' && pages.length > 1 && (
          <>
            <button className="page-turn prev" onClick={goPrev} disabled={pageIndex === 0} aria-label="Previous page">
              <ArrowLeftGlyph size={28} />
            </button>
            <button className="page-turn next" onClick={goNext} disabled={pageIndex === pages.length - 1} aria-label="Next page">
              <ArrowRightGlyph size={28} />
            </button>
            <div className="book-page-num">
              {pageIndex + 1} / {pages.length}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
