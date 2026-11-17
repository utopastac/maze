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
  | "uiPixels"
  | "shade"
  | "skyPixels"
  | "skyShade"
  | "skyTheme";

export type SettingGroup = "Controls" | "Physics" | "Camera" | "Picture";

export type PhysicsSettingKey = "gravity" | "grip" | "damping";

export const PHYSICS_KEYS: readonly PhysicsSettingKey[] = ["gravity", "grip", "damping"];

/** Optional per-floor overrides for the Physics settings group. */
export type FloorPhysics = Partial<Record<PhysicsSettingKey, number>>;

export interface SettingSpec {
  key: SettingKey;
  label: string;
  group: SettingGroup;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

export const SKY_THEMES = [
  { id: "neon", label: "Neon" },
  { id: "sunset", label: "Sunset" },
  { id: "aurora", label: "Aurora" },
  { id: "ocean", label: "Ocean" },
  { id: "candy", label: "Candy" },
  { id: "ember", label: "Ember" },
  { id: "ice", label: "Ice" },
  { id: "noir", label: "Noir" },
] as const;

export type SkyThemeId = (typeof SKY_THEMES)[number]["id"];

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
  { key: "uiPixels", label: "UI pixels", group: "Picture", min: 1, max: 6, step: 1, format: formatPixels },
  { key: "shade", label: "Shade", group: "Picture", min: 2, max: 6, step: 0.1, format: (value) => `${value.toFixed(1)} steps` },
  { key: "skyTheme", label: "Sky theme", group: "Picture", min: 0, max: SKY_THEMES.length - 1, step: 1, format: formatSkyTheme },
  { key: "skyPixels", label: "Sky pixels", group: "Picture", min: 0.5, max: 12, step: 0.5, format: formatSkyPixels },
  { key: "skyShade", label: "Sky shade", group: "Picture", min: 6, max: 30, step: 1, format: (value) => `${value.toFixed(0)} steps` },
];

export const SETTING_DEFAULTS: Record<SettingKey, number> = {
  tilt: 15,
  sensitivity: 2.4,
  response: 12,
  gravity: 48,
  grip: 2,
  damping: 0.55,
  zoom: 1,
  angle: 60,
  orbit: 0,
  field: 40,
  pixels: 1.5,
  uiPixels: 2,
  shade: 6,
  skyTheme: 0,
  skyPixels: 0.5,
  skyShade: 20,
};

export function skyThemeAt(index: number): (typeof SKY_THEMES)[number] {
  const clamped = Math.max(0, Math.min(SKY_THEMES.length - 1, Math.round(index)));
  return SKY_THEMES[clamped] ?? SKY_THEMES[0];
}

const STORAGE_KEY = "maze.settings";

export class PlaySettings {
  readonly values: Record<SettingKey, number> = { ...SETTING_DEFAULTS };
  invertY = true;
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
    this.invertY = true;
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

function formatSkyPixels(value: number): string {
  if (Math.abs(value - Math.round(value)) < 1e-6) return `${Math.round(value)}×`;
  return `${value.toFixed(1)}×`;
}

function formatSkyTheme(value: number): string {
  return skyThemeAt(value).label;
}

export function clampSetting(key: SettingKey, value: number): number {
  const spec = SETTING_SPECS.find((item) => item.key === key);
  if (!spec || !Number.isFinite(value)) return SETTING_DEFAULTS[key];
  const next = clamp(value, spec.min, spec.max);
  if (key === "pixels" || key === "uiPixels") return snapPixels(next);
  if (key === "skyPixels") return Math.round(next * 2) / 2;
  return next;
}

export function cloneFloorPhysics(physics: FloorPhysics | undefined): FloorPhysics | undefined {
  if (!physics) return undefined;
  const next: FloorPhysics = {};
  for (const key of PHYSICS_KEYS) {
    const value = physics[key];
    if (typeof value === "number") next[key] = clampSetting(key, value);
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function defaultFloorPhysics(): FloorPhysics {
  return {
    gravity: SETTING_DEFAULTS.gravity,
    grip: SETTING_DEFAULTS.grip,
    damping: SETTING_DEFAULTS.damping,
  };
}

/** Global play settings with optional floor overrides on top. */
export function resolveFloorPhysics(
  settings: PlaySettings,
  physics: FloorPhysics | undefined,
): Record<PhysicsSettingKey, number> {
  const resolved = {
    gravity: settings.values.gravity,
    grip: settings.values.grip,
    damping: settings.values.damping,
  };
  if (!physics) return resolved;
  for (const key of PHYSICS_KEYS) {
    const value = physics[key];
    if (typeof value === "number") resolved[key] = clampSetting(key, value);
  }
  return resolved;
}
