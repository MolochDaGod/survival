import { useEffect, useRef, useState } from 'react';

/**
 * Sprite-sheet animator hook.
 *
 * Steps through frames of a sprite-sheet image laid out as a grid (cols x rows).
 * Returns a `style` you spread onto a div: it sets the background image,
 * sized to the displayed cell, with `background-position` advancing per frame.
 *
 * @param opts.url        public URL of the sheet
 * @param opts.cols       number of columns in the sheet
 * @param opts.rows       number of rows in the sheet
 * @param opts.totalFrames optional override (defaults to cols*rows)
 * @param opts.fps        playback speed (frames per second)
 * @param opts.loop       whether to loop forever (default false)
 * @param opts.reverse    play backwards (default false)
 * @param opts.playing    pause / resume control (default true)
 * @param opts.onComplete callback fired once when the last frame is reached
 * @param opts.displayWidth  rendered width in CSS pixels (frame width × scale)
 * @param opts.displayHeight rendered height in CSS pixels
 */
export interface SpriteSheetOptions {
  url: string;
  cols: number;
  rows: number;
  totalFrames?: number;
  fps?: number;
  loop?: boolean;
  reverse?: boolean;
  playing?: boolean;
  onComplete?: () => void;
  displayWidth: number;
  displayHeight: number;
}

export function useSpriteSheet(opts: SpriteSheetOptions) {
  const {
    url, cols, rows,
    totalFrames = cols * rows,
    fps = 30,
    loop = false,
    reverse = false,
    playing = true,
    onComplete,
    displayWidth,
    displayHeight,
  } = opts;

  const initialFrame = reverse ? totalFrames - 1 : 0;
  const [frame, setFrame] = useState(initialFrame);
  // Frame ref is the SOURCE OF TRUTH for completion logic. We don't read
  // back from React state because functional setState updaters aren't
  // guaranteed to run synchronously — under concurrent rendering the
  // updater may be deferred, so a `didFinish` flag mutated inside it can
  // be observed as `false` on the very tick the animation completes,
  // dropping the onComplete callback (this would leave the book stuck in
  // OPENING/CLOSING/TURNING). Driving the math from a ref makes
  // completion deterministic per RAF tick regardless of React scheduling.
  const frameRef = useRef(initialFrame);
  const finishedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    finishedRef.current = false;
    frameRef.current = initialFrame;
    setFrame(initialFrame);
    // initialFrame is derived from reverse + totalFrames, both of which
    // are in the dep array; ESLint exhaustive-deps would also accept it.
  }, [url, reverse, totalFrames, initialFrame]);

  useEffect(() => {
    if (!playing) return;
    const stepMs = 1000 / fps;
    let last = performance.now();
    let raf = 0;
    // Cancellation flag for the queued onComplete microtask: if the hook
    // is torn down (book unmounted, phase changed, deps swapped) between
    // queue time and microtask flush, we must not invoke a stale callback
    // against a parent that has already moved on.
    let cancelled = false;

    const tick = (now: number) => {
      if (now - last >= stepMs) {
        last = now;
        // Compute next frame deterministically from the ref, BEFORE any
        // React state update.
        let next = reverse ? frameRef.current - 1 : frameRef.current + 1;
        const done = reverse ? next < 0 : next >= totalFrames;

        if (done) {
          if (loop) {
            next = reverse ? totalFrames - 1 : 0;
          } else {
            // Hold on last frame, schedule onComplete exactly once.
            if (!finishedRef.current) {
              finishedRef.current = true;
              // Defer so any current render/commit finishes first — calling
              // a parent setState synchronously inside our own setState
              // tree (or inside a RAF within React's commit window) trips
              // the "update component while rendering" warning.
              queueMicrotask(() => {
                if (!cancelled) onCompleteRef.current?.();
              });
            }
            raf = requestAnimationFrame(tick);
            return;
          }
        }

        frameRef.current = next;
        setFrame(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [playing, fps, totalFrames, loop, reverse]);

  const col = frame % cols;
  const row = Math.floor(frame / cols);

  const style: React.CSSProperties = {
    width:  displayWidth,
    height: displayHeight,
    backgroundImage: `url("${url}")`,
    backgroundSize: `${cols * displayWidth}px ${rows * displayHeight}px`,
    backgroundPosition: `-${col * displayWidth}px -${row * displayHeight}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };

  return { style, frame, finished: finishedRef.current };
}
