/**
 * Procedural SFX via Web Audio. No asset files required — every "sound"
 * is a short oscillator + envelope tuned per event. If you later drop MP3
 * files in /public/audio/, swap `play()` to use Howler instead (already
 * installed); the call sites here don't need to change.
 *
 * Browsers won't allow audio until the user has interacted with the page,
 * so the AudioContext is created lazily on the first call.
 */

export type SfxEvent =
  | 'attack'   // melee swing
  | 'hit'      // bullet/melee impact on enemy
  | 'kill'     // enemy dies
  | 'cast'     // ability fires
  | 'pickup'   // loot picked up
  | 'levelup'  // player levels up
  | 'block'    // shield raised
  | 'jump'
  | 'damage';  // player takes damage

interface ToneSpec {
  freq: number;        // start frequency Hz
  freq2?: number;      // optional sweep target
  duration: number;    // seconds
  type: OscillatorType;
  gain: number;        // peak volume 0-1
  noise?: boolean;     // mix in noise burst
}

const PRESETS: Record<SfxEvent, ToneSpec> = {
  attack:  { freq: 220, freq2: 110, duration: 0.12, type: 'sawtooth', gain: 0.18 },
  hit:     { freq: 320, freq2: 80,  duration: 0.10, type: 'square',   gain: 0.22, noise: true },
  kill:    { freq: 180, freq2: 40,  duration: 0.35, type: 'sawtooth', gain: 0.30, noise: true },
  cast:    { freq: 440, freq2: 880, duration: 0.18, type: 'triangle', gain: 0.20 },
  pickup:  { freq: 660, freq2: 990, duration: 0.10, type: 'sine',     gain: 0.18 },
  levelup: { freq: 523, freq2: 1047,duration: 0.45, type: 'triangle', gain: 0.30 },
  block:   { freq: 150, duration: 0.08, type: 'square', gain: 0.20, noise: true },
  jump:    { freq: 380, freq2: 520, duration: 0.08, type: 'sine',     gain: 0.12 },
  damage:  { freq: 90,  freq2: 60,  duration: 0.20, type: 'sawtooth', gain: 0.28, noise: true },
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Last play time per event, used to throttle spam. */
  private lastPlay: Map<SfxEvent, number> = new Map();
  private throttleMs = 35; // ignore same-event plays within this window
  enabled = true;
  volume = 0.6;

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  play(event: SfxEvent) {
    if (!this.enabled) return;
    const now = performance.now();
    const last = this.lastPlay.get(event) ?? 0;
    if (now - last < this.throttleMs) return;
    this.lastPlay.set(event, now);

    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const p = PRESETS[event];
    const t0 = ctx.currentTime;
    const t1 = t0 + p.duration;

    const osc = ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.freq, t0);
    if (p.freq2 !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.freq2), t1);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(p.gain, t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t1 + 0.02);

    if (p.noise) {
      // Short noise burst layered with the tone — adds "punch".
      const bufferSize = Math.floor(ctx.sampleRate * Math.min(0.06, p.duration));
      const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const nGain = ctx.createGain();
      nGain.gain.value = p.gain * 0.5;
      src.connect(nGain).connect(this.master);
      src.start(t0);
    }
  }

  dispose() {
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.master = null;
  }
}
