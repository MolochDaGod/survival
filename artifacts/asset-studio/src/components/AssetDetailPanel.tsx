/**
 * Right-hand detail panel — full preview, metadata, and tag editor for
 * the currently selected asset. Slides in/out so it never displaces
 * the gallery, and dismisses with ESC or backdrop click.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioAsset } from "@workspace/api-client-react";
import { formatBytes, formatDate } from "../lib/format";
import type { AssetTag } from "../lib/tags";
import { GlbViewer, type GlbStats } from "./GlbViewer";
import {
  CloseIcon,
  CopyIcon,
  CheckIcon,
  ExternalIcon,
  TrashIcon,
} from "./Icons";

interface Props {
  asset: StudioAsset;
  tag: AssetTag | undefined;
  onClose: () => void;
  onSaveTag: (key: string, tag: Partial<AssetTag>) => void;
  onClearTag: (key: string) => void;
}

interface ImageInfo {
  width: number;
  height: number;
}
interface VideoInfo {
  width: number;
  height: number;
  duration: number;
}
interface AudioInfo {
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: number[];
}

export function AssetDetailPanel({ asset, tag, onClose, onSaveTag, onClearTag }: Props) {
  // Local form state so users can edit without each keystroke writing
  // through to localStorage. We commit on blur / Save.
  const [gearSlot, setGearSlot] = useState(tag?.gearSlot ?? "");
  const [characterForm, setCharacterForm] = useState(tag?.characterForm ?? "");
  const [grudgeUuid, setGrudgeUuid] = useState(tag?.grudgeUuid ?? "");
  const [notes, setNotes] = useState(tag?.notes ?? "");
  const [copied, setCopied] = useState(false);

  // Per-asset extracted media metadata.
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const [glbStats, setGlbStats] = useState<GlbStats | null>(null);

  // Reload form whenever the selected asset (or its tag) changes.
  useEffect(() => {
    setGearSlot(tag?.gearSlot ?? "");
    setCharacterForm(tag?.characterForm ?? "");
    setGrudgeUuid(tag?.grudgeUuid ?? "");
    setNotes(tag?.notes ?? "");
    setCopied(false);
    setImageInfo(null);
    setVideoInfo(null);
    setAudioInfo(null);
    setAudioErr(null);
    setGlbStats(null);
  }, [asset.key, tag]);

  const url = asset.publicUrl;

  // Extract image dimensions
  useEffect(() => {
    if (!url || asset.kind !== "texture") return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      setImageInfo({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, asset.kind, asset.key]);

  // Extract video resolution & duration
  useEffect(() => {
    if (!url || asset.kind !== "vfx") return;
    if (!(asset.ext === "webm" || asset.ext === "mp4" || asset.ext === "mov")) return;
    let cancelled = false;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      if (cancelled) return;
      setVideoInfo({
        width: v.videoWidth,
        height: v.videoHeight,
        duration: v.duration,
      });
    };
    v.src = url;
    return () => {
      cancelled = true;
      v.removeAttribute("src");
    };
  }, [url, asset.kind, asset.ext, asset.key]);

  // Extract audio metadata + waveform peaks
  useEffect(() => {
    if (!url || asset.kind !== "audio") return;
    let cancelled = false;
    const ACtor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ACtor) {
      setAudioErr("Web Audio API unavailable");
      return;
    }
    const ctx = new ACtor();
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf.slice(0));
        if (cancelled) return;
        const ch = audio.getChannelData(0);
        const buckets = 96;
        const blockSize = Math.max(1, Math.floor(ch.length / buckets));
        const peaks: number[] = [];
        for (let i = 0; i < buckets; i++) {
          let max = 0;
          const start = i * blockSize;
          const end = Math.min(ch.length, start + blockSize);
          for (let j = start; j < end; j++) {
            const v = Math.abs(ch[j] ?? 0);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        setAudioInfo({
          duration: audio.duration,
          sampleRate: audio.sampleRate,
          channels: audio.numberOfChannels,
          peaks,
        });
      } catch (e) {
        if (cancelled) return;
        setAudioErr((e as Error).message ?? "Failed to decode audio");
      } finally {
        void ctx.close().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
      void ctx.close().catch(() => {});
    };
  }, [url, asset.kind, asset.key]);

  const onGlbStats = useCallback((s: GlbStats) => setGlbStats(s), []);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onCopyUrl = async (): Promise<void> => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  const onSave = (): void => {
    onSaveTag(asset.key, {
      gearSlot: gearSlot.trim() || undefined,
      characterForm: characterForm.trim() || undefined,
      grudgeUuid: grudgeUuid.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="detail-backdrop"
    >
      <aside
        className="flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="detail-panel"
      >
        <header className="flex items-start justify-between gap-2 border-b border-zinc-800 p-4">
          <div className="min-w-0">
            <div
              className="truncate text-sm font-semibold text-zinc-100"
              title={asset.filename}
            >
              {asset.filename}
            </div>
            <div
              className="truncate font-mono text-[11px] text-zinc-500"
              title={asset.key}
            >
              {asset.key}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-zinc-100"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Preview */}
          <div className="relative h-72 w-full bg-black">
            <PreviewBody asset={asset} onGlbStats={onGlbStats} />
          </div>

          <div className="space-y-4 p-4">
            {/* Metadata */}
            <section className="grid grid-cols-2 gap-3 text-xs" data-testid="asset-meta">
              <Meta label="Type" value={asset.kind} />
              <Meta label="Extension" value={asset.ext || "—"} mono />
              <Meta label="Size" value={formatBytes(asset.size)} />
              <Meta label="Modified" value={formatDate(asset.lastModified)} />
              <Meta label="MIME" value={asset.contentType} mono />
              {imageInfo ? (
                <Meta
                  label="Dimensions"
                  value={`${imageInfo.width} × ${imageInfo.height}`}
                  testId="meta-dimensions"
                />
              ) : null}
              {imageInfo ? (
                <Meta
                  label="Megapixels"
                  value={`${((imageInfo.width * imageInfo.height) / 1_000_000).toFixed(2)} MP`}
                />
              ) : null}
              {videoInfo ? (
                <Meta
                  label="Resolution"
                  value={`${videoInfo.width} × ${videoInfo.height}`}
                  testId="meta-resolution"
                />
              ) : null}
              {videoInfo ? (
                <Meta
                  label="Duration"
                  value={formatDuration(videoInfo.duration)}
                  testId="meta-video-duration"
                />
              ) : null}
              {audioInfo ? (
                <Meta
                  label="Duration"
                  value={formatDuration(audioInfo.duration)}
                  testId="meta-audio-duration"
                />
              ) : null}
              {audioInfo ? (
                <Meta
                  label="Sample rate"
                  value={`${(audioInfo.sampleRate / 1000).toFixed(1)} kHz`}
                  testId="meta-sample-rate"
                />
              ) : null}
              {audioInfo ? (
                <Meta
                  label="Channels"
                  value={audioInfo.channels === 1 ? "Mono" : audioInfo.channels === 2 ? "Stereo" : `${audioInfo.channels}-ch`}
                />
              ) : null}
              {glbStats ? (
                <Meta
                  label="Triangles"
                  value={glbStats.triangles.toLocaleString()}
                  testId="meta-triangles"
                />
              ) : null}
              {glbStats ? (
                <Meta
                  label="Vertices"
                  value={glbStats.vertices.toLocaleString()}
                  testId="meta-vertices"
                />
              ) : null}
              {glbStats ? (
                <Meta label="Meshes" value={glbStats.meshes.toLocaleString()} />
              ) : null}
              <Meta label="Bucket key" value={asset.key} mono span />
            </section>

            {asset.kind === "audio" ? (
              <section
                className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3"
                data-testid="audio-waveform-section"
              >
                <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                  Waveform
                </div>
                {audioInfo ? (
                  <Waveform peaks={audioInfo.peaks} />
                ) : audioErr ? (
                  <div className="text-[11px] text-rose-300">Couldn’t analyze: {audioErr}</div>
                ) : (
                  <div className="text-[11px] text-zinc-500">Analyzing audio…</div>
                )}
              </section>
            ) : null}

            {/* URL row */}
            {url ? (
              <section className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                <code className="flex-1 truncate font-mono text-[11px] text-zinc-300" title={url}>
                  {url}
                </code>
                <button
                  type="button"
                  onClick={onCopyUrl}
                  className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                  data-testid="copy-url"
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-3 w-3 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                >
                  <ExternalIcon className="h-3 w-3" />
                  Open
                </a>
              </section>
            ) : (
              <div className="rounded border border-amber-700/40 bg-amber-950/30 p-2 text-xs text-amber-300">
                No public URL configured for this asset (set OBJECT_STORAGE_PUBLIC_URL).
              </div>
            )}

            {/* Tag editor */}
            <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Cloud tags
                </h3>
                {tag ? (
                  <button
                    type="button"
                    onClick={() => onClearTag(asset.key)}
                    className="inline-flex items-center gap-1 rounded border border-rose-800/60 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-900/60"
                    data-testid="clear-tag"
                  >
                    <TrashIcon className="h-3 w-3" />
                    Clear
                  </button>
                ) : null}
              </div>

              <Field
                label="Gear slot"
                value={gearSlot}
                onChange={setGearSlot}
                placeholder="e.g. head / main_hand / legs"
                testId="tag-gearSlot"
              />
              <Field
                label="Character form"
                value={characterForm}
                onChange={setCharacterForm}
                placeholder="e.g. human, demon, wraith"
                testId="tag-characterForm"
              />
              <Field
                label="Grudge UUID"
                value={grudgeUuid}
                onChange={setGrudgeUuid}
                placeholder="00000000-0000-0000-0000-000000000000"
                mono
                testId="tag-grudgeUuid"
              />
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-400">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Designer notes…"
                  data-testid="tag-notes"
                  className="w-full resize-y rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>{tag?.updatedAt ? `Updated ${formatDate(tag.updatedAt)}` : "Unsaved"}</span>
                <button
                  type="button"
                  onClick={onSave}
                  data-testid="save-tag"
                  className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-emerald-50 hover:bg-emerald-500"
                >
                  Save tag
                </button>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
  span,
  testId,
}: {
  label: string;
  value: string;
  mono?: boolean;
  span?: boolean;
  testId?: string;
}) {
  return (
    <div className={span ? "col-span-2" : ""} data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`truncate ${mono ? "font-mono" : ""} text-zinc-200`} title={value}>
        {value}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)} ms`;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  if (m === 0) return `${s.toFixed(2)}s`;
  return `${m}m ${s.toFixed(1)}s`;
}

function Waveform({ peaks }: { peaks: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const mid = cssH / 2;
    const n = peaks.length || 1;
    const slot = cssW / n;
    const barW = Math.max(1, slot * 0.6);

    // Center axis
    ctx.fillStyle = "rgba(63,63,70,0.6)";
    ctx.fillRect(0, mid - 0.5, cssW, 1);

    ctx.fillStyle = "#10b981";
    for (let i = 0; i < n; i++) {
      const peak = Math.min(1, peaks[i] ?? 0);
      const h = Math.max(1, peak * (cssH - 2));
      const x = i * slot + (slot - barW) / 2;
      ctx.fillRect(x, mid - h / 2, barW, h);
    }
  }, [peaks]);

  return (
    <canvas
      ref={canvasRef}
      className="h-16 w-full"
      data-testid="audio-waveform"
      aria-label="Audio waveform"
    />
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-400">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className={[
          "w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100",
          "placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none",
          mono ? "font-mono" : "",
        ].join(" ")}
      />
    </div>
  );
}

function PreviewBody({
  asset,
  onGlbStats,
}: {
  asset: StudioAsset;
  onGlbStats: (s: GlbStats) => void;
}) {
  const url = asset.publicUrl;
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
        No public URL — preview unavailable.
      </div>
    );
  }
  if (asset.kind === "model" && (asset.ext === "glb" || asset.ext === "gltf")) {
    return <GlbViewer url={url} className="h-full w-full" onStats={onGlbStats} />;
  }
  if (asset.kind === "model") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-zinc-400">
        <div>Inline viewer doesn’t support .{asset.ext}</div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
        >
          Download model
        </a>
      </div>
    );
  }
  if (asset.kind === "texture") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[length:16px_16px] bg-[linear-gradient(45deg,#27272a_25%,transparent_25%),linear-gradient(-45deg,#27272a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#27272a_75%),linear-gradient(-45deg,transparent_75%,#27272a_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0]">
        <img
          src={url}
          alt={asset.filename}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }
  if (asset.kind === "vfx") {
    if (asset.ext === "webm" || asset.ext === "mp4" || asset.ext === "mov") {
      return (
        <video
          src={url}
          controls
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full bg-black object-contain"
        />
      );
    }
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
        VFX file (.{asset.ext}) — preview not supported.
      </div>
    );
  }
  if (asset.kind === "audio") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4">
        <audio src={url} controls className="w-full max-w-sm" />
        <div className="text-[11px] text-zinc-500">{asset.filename}</div>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
      No inline preview for .{asset.ext}.
    </div>
  );
}
