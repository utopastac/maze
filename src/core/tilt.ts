import { clamp } from "./math.ts";
import type { PlaySettings } from "./playSettings.ts";

const DRAG_SPAN = 170;
const BASE_KEY_RATE = 0.62;
const BASE_TILT = (11.5 * Math.PI) / 180;

export class TiltController {
  targetPitch = 0;
  targetRoll = 0;
  pitch = 0;
  roll = 0;
  private readonly settings: PlaySettings;

  constructor(settings: PlaySettings) {
    this.settings = settings;
  }

  drag(dx: number, dy: number): void {
    const perPx = (this.limit() * this.settings.values.sensitivity) / DRAG_SPAN;
    this.targetRoll -= dx * perPx;
    this.targetPitch -= dy * perPx * this.settings.pitchSign();
    this.clampTargets();
  }

  applyKeys(dt: number, keys: ReadonlySet<string>): void {
    const rate = BASE_KEY_RATE * this.settings.values.sensitivity * (this.limit() / BASE_TILT);
    const pitch = rate * this.settings.pitchSign();
    if (keys.has("arrowleft") || keys.has("a")) this.targetRoll += rate * dt;
    if (keys.has("arrowright") || keys.has("d")) this.targetRoll -= rate * dt;
    if (keys.has("arrowup") || keys.has("w")) this.targetPitch += pitch * dt;
    if (keys.has("arrowdown") || keys.has("s")) this.targetPitch -= pitch * dt;
    this.clampTargets();
  }

  setAbsolute(pitch: number, roll: number): void {
    const limit = this.limit();
    this.targetPitch = clamp(pitch, -limit, limit);
    this.targetRoll = clamp(roll, -limit, limit);
  }

  level(): void {
    this.targetPitch = 0;
    this.targetRoll = 0;
  }

  snap(): void {
    this.level();
    this.pitch = 0;
    this.roll = 0;
  }

  smooth(dt: number): void {
    const k = 1 - Math.exp(-this.settings.values.response * dt);
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.roll += (this.targetRoll - this.roll) * k;
    this.clampTargets();
  }

  private limit(): number {
    return this.settings.tiltRad;
  }

  private clampTargets(): void {
    const limit = this.limit();
    this.targetPitch = clamp(this.targetPitch, -limit, limit);
    this.targetRoll = clamp(this.targetRoll, -limit, limit);
  }
}
