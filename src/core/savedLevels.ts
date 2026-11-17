import { decodeLevel, encodeLevel } from "./share.ts";
import { DEFAULT_FLOOR_THEME, parseFloorTheme, type FloorThemeId } from "./theme.ts";
import { cloneTower, levelNameOf, type Tower } from "./tower.ts";

const STORAGE_KEY = "maze.savedLevels";
const MAX_SAVED = 40;

export interface SavedLevel {
  id: string;
  name: string;
  savedAt: number;
  floors: number;
  cols: number;
  rows: number;
  theme: FloorThemeId;
  code: string;
}

export function listSavedLevels(): SavedLevel[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveLevel(tower: Tower): SavedLevel | null {
  const clean = cloneTower(tower);
  const code = encodeLevel(clean);
  if (!code) return null;
  const floor = clean.floors[0];
  const entry: SavedLevel = {
    id: makeId(),
    name: levelNameOf(clean),
    savedAt: Date.now(),
    floors: clean.floors.length,
    cols: floor?.cols ?? 0,
    rows: floor?.rows ?? 0,
    theme: parseFloorTheme(floor?.theme ?? DEFAULT_FLOOR_THEME),
    code,
  };
  const next = [entry, ...readAll().filter((item) => item.id !== entry.id)].slice(0, MAX_SAVED);
  writeAll(next);
  return entry;
}

export function loadSavedLevel(id: string): Tower | null {
  const entry = readAll().find((item) => item.id === id);
  if (!entry) return null;
  return decodeLevel(entry.code);
}

export function deleteSavedLevel(id: string): boolean {
  const all = readAll();
  const next = all.filter((item) => item.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}

function readAll(): SavedLevel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedLevel);
  } catch {
    return [];
  }
}

function writeAll(entries: SavedLevel[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota or private mode — keep the UI responsive.
  }
}

function isSavedLevel(value: unknown): value is SavedLevel {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedLevel>;
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

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lvl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
