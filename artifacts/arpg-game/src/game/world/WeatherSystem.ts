/**
 * WeatherSystem — schedules rain so it runs roughly 10% of the time.
 *
 * Two-state machine:
 *   • DRY  – every CHECK_INTERVAL seconds, roll dice. On a hit, transition
 *            to WET and pick a random shower duration.
 *   • WET  – rain runs for that duration, then back to DRY (with the
 *            check-interval timer reset).
 *
 * Tuning math (renewal-process limit):
 *   E[dry phase]    = CHECK_INTERVAL / RAIN_PROB
 *   E[wet phase]    = mean(SHOWER_MIN, SHOWER_MAX)
 *   wet fraction    = E[wet] / (E[dry] + E[wet])
 *
 * With the defaults below:
 *   E[dry] = 60 / 0.07 ≈ 857 s
 *   E[wet] = 95 s
 *   wet fraction ≈ 95 / (857 + 95) ≈ 0.0998   (about 10% of play time is rainy)
 *
 * The system also drives FogSystem.setStorm() so atmospherics (extra fog
 * density, cooler tint, gloom) ramp in/out smoothly with the shower instead
 * of snapping on at the same instant the rain mesh becomes visible.
 */
import type { RainSystem } from './RainSystem';
import type { FogSystem } from './FogSystem';

const CHECK_INTERVAL = 60;   // seconds between re-rolls while DRY
const RAIN_PROB      = 0.07; // chance of starting a shower per re-roll
const SHOWER_MIN     = 80;   // seconds — shortest shower
const SHOWER_MAX     = 110;  // seconds — longest shower

type WeatherState = 'dry' | 'wet';

export class WeatherSystem {
  private readonly rain: RainSystem;
  private readonly fog:  FogSystem;

  private state:        WeatherState = 'dry';
  private remaining     = 0;                // seconds left in current shower
  private nextCheckIn   = CHECK_INTERVAL;   // seconds until next dry-state roll

  /** Returns the wet/dry state for HUD/debug consumers. */
  get currentState(): WeatherState { return this.state; }

  constructor(rain: RainSystem, fog: FogSystem, initialState: WeatherState = 'dry') {
    this.rain = rain;
    this.fog  = fog;
    if (initialState === 'wet') this.startShower();
    else                        this.endShower();
  }

  update(dt: number): void {
    if (this.state === 'dry') {
      this.nextCheckIn -= dt;
      if (this.nextCheckIn <= 0) {
        this.nextCheckIn = CHECK_INTERVAL;
        if (Math.random() < RAIN_PROB) this.startShower();
      }
    } else {
      this.remaining -= dt;
      if (this.remaining <= 0) this.endShower();
    }

    // FogSystem.setStorm already smooths via dt-scaled lerp, so a hard
    // 0/1 target produces a gentle ramp (a couple of seconds either way).
    this.fog.setStorm(this.state === 'wet' ? 1.0 : 0.0, dt);
  }

  /** Force-start a shower. Useful for debug overlays / dev keybinds. */
  startShower(): void {
    this.state        = 'wet';
    this.remaining    = SHOWER_MIN + Math.random() * (SHOWER_MAX - SHOWER_MIN);
    this.rain.enabled = true;
  }

  /** Force-end any shower. */
  endShower(): void {
    this.state        = 'dry';
    this.nextCheckIn  = CHECK_INTERVAL;
    this.rain.enabled = false;
  }
}
