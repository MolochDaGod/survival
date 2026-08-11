/**
 * CinemaDirector — Three.js cinematic camera rails + optional session record.
 *
 * • Scripted camera paths (lerp position + lookAt)
 * • Freeze player input via GameModeController 'cinema'
 * • MediaRecorder capture of the WebGL canvas (webm) for highlight clips
 *
 * Does not replace ThirdPersonCamera during play — only while mode is cinema.
 */

import * as THREE from 'three';

export interface CinemaKeyframe {
  /** Seconds from clip start. */
  t: number;
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov?: number;
}

export interface CinemaClip {
  id: string;
  duration: number;
  keys: CinemaKeyframe[];
  /** Optional ease: linear | smoothstep */
  ease?: 'linear' | 'smoothstep';
}

export interface CinemaDirectorOpts {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
}

export class CinemaDirector {
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;

  private clip: CinemaClip | null = null;
  private elapsed = 0;
  private playing = false;
  private savedFov = 60;

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recording = false;

  onClipEnd: ((id: string) => void) | null = null;
  onRecordReady: ((blob: Blob, url: string) => void) | null = null;
  /** Lore title cards during intro cinema (UI subscribes). */
  onTitleCard: ((title: string, subtitle: string) => void) | null = null;
  private titleCards: Array<{ t: number; title: string; subtitle: string }> = [];
  private titleCardIdx = 0;

  constructor(opts: CinemaDirectorOpts) {
    this.camera = opts.camera;
    this.canvas = opts.canvas;
    this.renderer = opts.renderer;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Play a scripted camera clip. Caller should set GameMode to 'cinema'.
   */
  play(clip: CinemaClip): void {
    if (clip.keys.length < 2) {
      console.warn('[Cinema] Clip needs ≥2 keyframes');
      return;
    }
    this.clip = clip;
    this.elapsed = 0;
    this.playing = true;
    this.savedFov = this.camera.fov;
    this.applyAt(0);
    console.info(`[Cinema] Play "${clip.id}" (${clip.duration.toFixed(1)}s)`);
  }

  /** Orbit showcase around a point (auto-built keys). */
  playOrbit(
    center: THREE.Vector3,
    radius = 12,
    height = 4,
    duration = 8,
    id = 'orbit',
  ): void {
    const keys: CinemaKeyframe[] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      keys.push({
        t: (i / steps) * duration,
        position: new THREE.Vector3(
          center.x + Math.cos(a) * radius,
          center.y + height,
          center.z + Math.sin(a) * radius,
        ),
        lookAt: center.clone(),
        fov: 50,
      });
    }
    this.play({ id, duration, keys, ease: 'smoothstep' });
  }

  /**
   * Arrival pan: high wide → player shoulder.
   * Optional lore title cards (compendium / video intro beats).
   */
  playArrival(
    playerPos: THREE.Vector3,
    duration = 5,
    titleCards?: Array<{ t: number; title: string; subtitle: string }>,
  ): void {
    const look = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.titleCards = titleCards ?? [];
    this.titleCardIdx = 0;
    this.play({
      id: 'arrival',
      duration,
      ease: 'smoothstep',
      keys: [
        {
          t: 0,
          position: playerPos.clone().add(new THREE.Vector3(40, 35, 40)),
          lookAt: look.clone(),
          fov: 55,
        },
        {
          t: duration * 0.55,
          position: playerPos.clone().add(new THREE.Vector3(14, 8, 14)),
          lookAt: look.clone(),
          fov: 50,
        },
        {
          t: duration,
          position: playerPos.clone().add(new THREE.Vector3(4.5, 2.2, 5.5)),
          lookAt: look.clone(),
          fov: 48,
        },
      ],
    });
    // Fire first card immediately
    if (this.titleCards[0]) {
      this.onTitleCard?.(this.titleCards[0].title, this.titleCards[0].subtitle);
      this.titleCardIdx = 1;
    }
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.camera.fov = this.savedFov;
    this.camera.updateProjectionMatrix();
    const id = this.clip?.id ?? 'unknown';
    this.clip = null;
    this.onClipEnd?.(id);
  }

  update(dt: number): boolean {
    if (!this.playing || !this.clip) return false;
    this.elapsed += dt;
    // Advance lore title cards
    while (
      this.titleCardIdx < this.titleCards.length &&
      this.elapsed >= this.titleCards[this.titleCardIdx].t
    ) {
      const card = this.titleCards[this.titleCardIdx];
      this.onTitleCard?.(card.title, card.subtitle);
      this.titleCardIdx++;
    }
    if (this.elapsed >= this.clip.duration) {
      this.applyAt(this.clip.duration);
      this.onTitleCard?.('', ''); // clear
      this.stop();
      return false;
    }
    this.applyAt(this.elapsed);
    return true;
  }

  private applyAt(t: number): void {
    const clip = this.clip;
    if (!clip) return;
    const keys = clip.keys;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(1e-4, b.t - a.t);
    let u = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
    if (clip.ease === 'smoothstep') {
      u = u * u * (3 - 2 * u);
    }
    this.camera.position.lerpVectors(a.position, b.position, u);
    const look = new THREE.Vector3().lerpVectors(a.lookAt, b.lookAt, u);
    this.camera.lookAt(look);
    const fovA = a.fov ?? this.savedFov;
    const fovB = b.fov ?? this.savedFov;
    this.camera.fov = THREE.MathUtils.lerp(fovA, fovB, u);
    this.camera.updateProjectionMatrix();
  }

  // ── MediaRecorder ─────────────────────────────────────────────────────────

  startRecording(mime = 'video/webm;codecs=vp9'): boolean {
    if (this.recording) return true;
    try {
      const stream = this.canvas.captureStream(30);
      // Prefer vp9, fall back to default webm
      const types = [mime, 'video/webm', 'video/webm;codecs=vp8'];
      const pick = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, pick ? { mimeType: pick } : undefined);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: pick || 'video/webm' });
        const url = URL.createObjectURL(blob);
        this.onRecordReady?.(blob, url);
        console.info(`[Cinema] Record ready ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
      };
      this.mediaRecorder.start(250);
      this.recording = true;
      console.info('[Cinema] Recording started');
      return true;
    } catch (err) {
      console.warn('[Cinema] Recording unsupported:', err);
      return false;
    }
  }

  stopRecording(): void {
    if (!this.recording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.recording = false;
    this.mediaRecorder = null;
  }

  toggleRecording(): boolean {
    if (this.recording) {
      this.stopRecording();
      return false;
    }
    return this.startRecording();
  }
}
