import { decodeLevel, encodeLevel } from "./share.ts";
import { DEFAULT_FLOOR_THEME, parseFloorTheme, type FloorThemeId } from "./theme.ts";
import { cloneTower, levelNameOf, type Tower } from "./tower.ts";

export interface StoredLevel {
  id: string;
  name: string;
  savedAt: number;
  floors: number;
  cols: number;
  rows: number;
  theme: FloorThemeId;
  code: string;
}

export type LevelStoreKind = "saved" | "authored";

interface LevelStoreConfig {
  key: string;
  max: number;
  idPrefix: string;
}

const STORES: Record<LevelStoreKind, LevelStoreConfig> = {
  saved: { key: "maze.savedLevels", max: 40, idPrefix: "lvl" },
  authored: { key: "maze.authoredLevels", max: 60, idPrefix: "auth" },
};

export function listLevels(kind: LevelStoreKind): StoredLevel[] {
  return readAll(kind).sort((a, b) => b.savedAt - a.savedAt);
}

export function saveStoredLevel(kind: LevelStoreKind, tower: Tower): StoredLevel | null {
  const clean = cloneTower(tower);
  const code = encodeLevel(clean);
  if (!code) return null;
  const floor = clean.floors[0];
  const entry: StoredLevel = {
    id: makeId(kind),
    name: levelNameOf(clean),
    savedAt: Date.now(),
    floors: clean.floors.length,
    cols: floor?.cols ?? 0,
    rows: floor?.rows ?? 0,
    theme: parseFloorTheme(floor?.theme ?? DEFAULT_FLOOR_THEME),
    code,
  };
  const next = [entry, ...readAll(kind).filter((item) => item.id !== entry.id)].slice(
    0,
    STORES[kind].max,
  );
  writeAll(kind, next);
  return entry;
}

/** Overwrite an existing entry by id (keeps the same id). Falls back to save if missing. */
export function replaceStoredLevel(
  kind: LevelStoreKind,
  id: string,
  tower: Tower,
): StoredLevel | null {
  const clean = cloneTower(tower);
  const code = encodeLevel(clean);
  if (!code) return null;
  const all = readAll(kind);
  const prev = all.find((item) => item.id === id);
  if (!prev) return saveStoredLevel(kind, tower);
  const floor = clean.floors[0];
  const entry: StoredLevel = {
    id,
    name: levelNameOf(clean),
    savedAt: Date.now(),
    floors: clean.floors.length,
    cols: floor?.cols ?? 0,
    rows: floor?.rows ?? 0,
    theme: parseFloorTheme(floor?.theme ?? DEFAULT_FLOOR_THEME),
    code,
  };
  writeAll(kind, [entry, ...all.filter((item) => item.id !== id)].slice(0, STORES[kind].max));
  return entry;
}

export function loadStoredLevel(kind: LevelStoreKind, id: string): Tower | null {
  const entry = readAll(kind).find((item) => item.id === id);
  if (!entry) return null;
  return decodeLevel(entry.code);
}

export function deleteStoredLevel(kind: LevelStoreKind, id: string): boolean {
  const all = readAll(kind);
  const next = all.filter((item) => item.id !== id);
  if (next.length === all.length) return false;
  writeAll(kind, next);
  return true;
}

function readAll(kind: LevelStoreKind): StoredLevel[] {
  try {
    const raw = localStorage.getItem(STORES[kind].key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredLevel);
  } catch {
    return [];
  }
}

function writeAll(kind: LevelStoreKind, entries: StoredLevel[]): void {
  try {
    localStorage.setItem(STORES[kind].key, JSON.stringify(entries));
  } catch {
    // Quota or private mode — keep the UI responsive.
  }
}

function isStoredLevel(value: unknown): value is StoredLevel {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredLevel>;
  return typeof item.id === "string"
    && item.id.length > 0
    && typeof item.name === "string"
    && typeof item.savedAt === "number"
    && Number.isFinite(item.savedAt)
    && typeof item.floors === "number"
    && typeof item.cols === "number"
    && typeof item.rows === "number"
    && typeof item.theme === "string"
    && typeof item.code === "string"
    && item.code.length > 0;
}

function makeId(kind: LevelStoreKind): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${STORES[kind].idPrefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
