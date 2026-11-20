import {
  deleteStoredLevel,
  listLevels,
  loadStoredLevel,
  saveStoredLevel,
  type StoredLevel,
} from "./levelStorage.ts";
import type { Tower } from "./tower.ts";

export type SavedLevel = StoredLevel;

export function listSavedLevels(): SavedLevel[] {
  return listLevels("saved");
}

export function saveLevel(tower: Tower): SavedLevel | null {
  return saveStoredLevel("saved", tower);
}

export function loadSavedLevel(id: string): Tower | null {
  return loadStoredLevel("saved", id);
}

export function deleteSavedLevel(id: string): boolean {
  return deleteStoredLevel("saved", id);
}
