import {
  deleteStoredLevel,
  listLevels,
  loadStoredLevel,
  replaceStoredLevel,
  saveStoredLevel,
  type StoredLevel,
} from "./levelStorage.ts";
import type { Tower } from "./tower.ts";

/** Separate from player Saved levels — tower campaign drafts for authoring/testing. */
export type AuthoredLevel = StoredLevel;

export function listAuthoredLevels(): AuthoredLevel[] {
  return listLevels("authored");
}

export function saveAuthoredLevel(tower: Tower): AuthoredLevel | null {
  return saveStoredLevel("authored", tower);
}

/** Overwrite an existing draft by id (keeps the same id). */
export function replaceAuthoredLevel(id: string, tower: Tower): AuthoredLevel | null {
  return replaceStoredLevel("authored", id, tower);
}

export function loadAuthoredLevel(id: string): Tower | null {
  return loadStoredLevel("authored", id);
}

export function deleteAuthoredLevel(id: string): boolean {
  return deleteStoredLevel("authored", id);
}
