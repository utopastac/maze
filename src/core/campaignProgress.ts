import { CAMPAIGN_FLOORS, CAMPAIGN_LIVES } from "./campaign.ts";
import { MAX_HEARTS_CAP } from "./tower.ts";

const STORAGE_KEY = "maze.campaignProgress";
const STORAGE_KEY_V2 = "maze.campaignSaves";
const MAX_SAVES = 20;
/** Reserved id for the single tower-run autosave slot. */
export const AUTOSAVE_ID = "autosave";

export interface CampaignProgress {
  id: string;
  seed: number;
  floor: number;
  lives: number;
  seconds: number;
  drops: number;
  savedAt: number;
}

export type CampaignProgressInput = Omit<CampaignProgress, "id" | "savedAt"> & { id?: string };

export function isCampaignAutosave(id: string): boolean {
  return id === AUTOSAVE_ID;
}

export function listCampaignProgress(): CampaignProgress[] {
  const all = readAll().sort((a, b) => b.savedAt - a.savedAt);
  const auto = all.find((entry) => entry.id === AUTOSAVE_ID);
  const rest = all.filter((entry) => entry.id !== AUTOSAVE_ID);
  return auto ? [auto, ...rest] : rest;
}

export function loadCampaignProgress(id?: string): CampaignProgress | null {
  const all = readAll();
  if (id) return all.find((entry) => entry.id === id) ?? null;
  return listCampaignProgress()[0] ?? null;
}

export function saveCampaignProgress(progress: CampaignProgressInput): CampaignProgress | null {
  const id = progress.id && progress.id.length > 0 ? progress.id : makeId();
  const entry: CampaignProgress = {
    id,
    seed: progress.seed >>> 0,
    floor: clampFloor(progress.floor),
    lives: clampLives(progress.lives),
    seconds: Math.max(0, progress.seconds),
    drops: Math.max(0, Math.round(progress.drops)),
    savedAt: Date.now(),
  };
  const next = packSaves([entry, ...readAll().filter((item) => item.id !== entry.id)]);
  if (!writeAll(next)) return null;
  return entry;
}

/** Overwrite the reserved autosave slot after clearing a tower floor. */
export function saveCampaignAutosave(
  progress: Omit<CampaignProgressInput, "id">,
): CampaignProgress | null {
  return saveCampaignProgress({ ...progress, id: AUTOSAVE_ID });
}

export function clearCampaignAutosave(): boolean {
  return deleteCampaignProgress(AUTOSAVE_ID);
}

export function deleteCampaignProgress(id: string): boolean {
  const all = readAll();
  const next = all.filter((item) => item.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}

/** Keep autosave when trimming to MAX_SAVES. */
function packSaves(entries: CampaignProgress[]): CampaignProgress[] {
  const sorted = [...entries].sort((a, b) => b.savedAt - a.savedAt);
  const auto = sorted.find((entry) => entry.id === AUTOSAVE_ID);
  const rest = sorted.filter((entry) => entry.id !== AUTOSAVE_ID);
  const limit = auto ? Math.max(0, MAX_SAVES - 1) : MAX_SAVES;
  return auto ? [auto, ...rest.slice(0, limit)] : rest.slice(0, limit);
}

/** @deprecated Prefer deleteCampaignProgress(id). Clears every tower save. */
export function clearCampaignProgress(): void {
  writeAll([]);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode / blocked storage.
  }
}

function readAll(): CampaignProgress[] {
  try {
    const v2 = localStorage.getItem(STORAGE_KEY_V2);
    if (v2) {
      const parsed = JSON.parse(v2) as unknown;
      if (Array.isArray(parsed)) return parsed.filter(isProgress);
    }

    const legacy = localStorage.getItem(STORAGE_KEY);
    if (!legacy) return [];
    const parsed = JSON.parse(legacy) as unknown;
    const migrated = migrateLegacy(parsed);
    if (migrated.length > 0) {
      writeAll(migrated);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Keep going even if legacy key can't be removed.
      }
    }
    return migrated;
  } catch {
    return [];
  }
}

function writeAll(entries: CampaignProgress[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function migrateLegacy(value: unknown): CampaignProgress[] {
  if (Array.isArray(value)) return value.filter(isProgress);
  if (!value || typeof value !== "object") return [];
  const item = value as Partial<CampaignProgress>;
  if (
    typeof item.seed === "number"
    && Number.isFinite(item.seed)
    && typeof item.floor === "number"
    && Number.isFinite(item.floor)
    && item.floor >= 1
    && item.floor <= CAMPAIGN_FLOORS
    && typeof item.lives === "number"
    && Number.isFinite(item.lives)
    && typeof item.seconds === "number"
    && Number.isFinite(item.seconds)
    && typeof item.drops === "number"
    && Number.isFinite(item.drops)
    && typeof item.savedAt === "number"
    && Number.isFinite(item.savedAt)
  ) {
    return [{
      id: typeof item.id === "string" && item.id.length > 0 ? item.id : makeId(),
      seed: item.seed,
      floor: item.floor,
      lives: item.lives,
      seconds: item.seconds,
      drops: item.drops,
      savedAt: item.savedAt,
    }];
  }
  return [];
}

function clampFloor(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(CAMPAIGN_FLOORS, Math.max(1, Math.round(value)));
}

function clampLives(value: number): number {
  if (!Number.isFinite(value)) return CAMPAIGN_LIVES;
  return Math.min(MAX_HEARTS_CAP, Math.max(0, Math.round(value)));
}

function isProgress(value: unknown): value is CampaignProgress {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CampaignProgress>;
  return typeof item.id === "string"
    && item.id.length > 0
    && typeof item.seed === "number"
    && Number.isFinite(item.seed)
    && typeof item.floor === "number"
    && Number.isFinite(item.floor)
    && item.floor >= 1
    && item.floor <= CAMPAIGN_FLOORS
    && typeof item.lives === "number"
    && Number.isFinite(item.lives)
    && typeof item.seconds === "number"
    && Number.isFinite(item.seconds)
    && typeof item.drops === "number"
    && Number.isFinite(item.drops)
    && typeof item.savedAt === "number"
    && Number.isFinite(item.savedAt);
}

function makeId(): string {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `tower-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    if (id !== AUTOSAVE_ID) return id;
  }
  return `tower-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
