import { clamp } from "./math.ts";

export type SettingKey =
  | "tilt"
  | "sensitivity"
  | "response"
  | "gravity"
  | "grip"
  | "damping"
  | "zoom"
  | "angle"
  | "orbit"
  | "field"
  | "pixels"
  | "shade"
  | "skyPixels"
  | "skyShade";

export type SettingGroup = "Controls" | "Physics" | "Camera" | "Picture";

export interface SettingSpec {
  key: SettingKey;
  label: string;
  group: SettingGroup;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

export const SETTING_SPECS: readonly SettingSpec[] = [
  { key: "tilt", label: "Tilt", group: "Controls", min: 4, max: 22, step: 0.5, format: (value) => `${value.toFixed(1)}°` },
  { key: "sensitivity", label: "Sensitivity", group: "Controls", min: 0.4, max: 2.4, step: 0.05, format: (value) => `${value.toFixed(2)}×` },
  { key: "response", label: "Response", group: "Controls", min: 2, max: 16, step: 0.1, format: (value) => value.toFixed(1) },
  { key: "gravity", label: "Gravity", group: "Physics", min: 8, max: 48, step: 0.5, format: (value) => value.toFixed(0) },
  { key: "grip", label: "Grip", group: "Physics", min: 0.15, max: 2, step: 0.05, format: (value) => `${value.toFixed(2)}×` },
  { key: "damping", label: "Damping", group: "Physics", min: 0, max: 1.8, step: 0.01, format: (value) => value.toFixed(2) },
  { key: "zoom", label: "Zoom", group: "Camera", min: 0.75, max: 1.5, step: 0.01, format: (value) => `${value.toFixed(2)}×` },
  { key: "angle", label: "Angle", group: "Camera", min: 22, max: 80, step: 0.5, format: (value) => `${value.toFixed(1)}°` },
  { key: "orbit", label: "Orbit", group: "Camera", min: -180, max: 180, step: 1, format: (value) => `${value.toFixed(0)}°` },
  { key: "field", label: "Field", group: "Camera", min: 20, max: 48, step: 1, format: (value) => `${value.toFixed(0)}°` },
  { key: "pixels", label: "Pixels", group: "Picture", min: 1, max: 6, step: 1, format: formatPixels },
  { key: "shade", label: "Shade", group: "Picture", min: 2, max: 6, step: 0.1, format: (value) => `${value.toFixed(1)} steps` },
  { key: "skyPixels", label: "Sky pixels", group: "Picture", min: 1, max: 12, step: 1, format: (value) => `${value.toFixed(0)}×` },
  { key: "skyShade", label: "Sky shade", group: "Picture", min: 6, max: 30, step: 1, format: (value) => `${value.toFixed(0)} steps` },
];

export const SETTING_DEFAULTS: Record<SettingKey, number> = {
  tilt: 11.5,
  sensitivity: 1,
  response: 8,
  gravity: 24,
  grip: 1,
  damping: 0.55,
  zoom: 1,
  angle: 46.5,
  orbit: 0,
  field: 30,
  pixels: 3,
  shade: 3,
  skyPixels: 4,
  skyShade: 6,
};

const STORAGE_KEY = "maze.settings";

export class PlaySettings {
  readonly values: Record<SettingKey, number> = { ...SETTING_DEFAULTS };
  invertY = false;
  normalLook = false;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.load();
  }

  get tiltRad(): number {
    return (this.values.tilt * Math.PI) / 180;
  }

  pitchSign(): number {
    return this.invertY ? -1 : 1;
  }

  set(key: SettingKey, value: number): void {
    const next = clampSetting(key, value);
    if (next === this.values[key]) return;
    this.values[key] = next;
    this.save();
    this.emit();
  }

  setInvertY(value: boolean): void {
    if (this.invertY === value) return;
    this.invertY = value;
    this.save();
    this.emit();
  }

  setNormalLook(value: boolean): void {
    if (this.normalLook === value) return;
    this.normalLook = value;
    this.save();
    this.emit();
  }

  reset(): void {
    for (const spec of SETTING_SPECS) this.values[spec.key] = SETTING_DEFAULTS[spec.key];
    this.invertY = false;
    this.normalLook = false;
    this.save();
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const record = parsed as Partial<Record<SettingKey, unknown>> & {
        invertY?: unknown;
        normalLook?: unknown;
      };
      for (const spec of SETTING_SPECS) {
        const value = record[spec.key];
        if (typeof value === "number") this.values[spec.key] = clampSetting(spec.key, value);
      }
      if (typeof record.invertY === "boolean") this.invertY = record.invertY;
      if (typeof record.normalLook === "boolean") this.normalLook = record.normalLook;
    } catch {
      // Keep the defaults when storage is unavailable or unreadable.
    }
  }

  private save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...this.values, invertY: this.invertY, normalLook: this.normalLook }),
      );
    } catch {
      // Private mode can reject storage writes. The live values still apply.
    }
  }
}

export function pixelStep(): number {
  const dpr = window.devicePixelRatio || 1;
  return 1 / dpr;
}

export function snapPixels(value: number): number {
  const dpr = window.devicePixelRatio || 1;
  const minDevice = Math.max(1, Math.round(dpr));
  const maxDevice = Math.max(minDevice, Math.round(6 * dpr));
  const device = Math.min(maxDevice, Math.max(minDevice, Math.round(value * dpr)));
  return device / dpr;
}

function formatPixels(value: number): string {
  const css = snapPixels(value);
  if (Math.abs(css - Math.round(css)) < 1e-6) return `${Math.round(css)} px`;
  return `${css.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} px`;
}

function clampSetting(key: SettingKey, value: number): number {
  const spec = SETTING_SPECS.find((item) => item.key === key);
  if (!spec || !Number.isFinite(value)) return SETTING_DEFAULTS[key];
  const next = clamp(value, spec.min, spec.max);
  return key === "pixels" ? snapPixels(next) : next;
}
