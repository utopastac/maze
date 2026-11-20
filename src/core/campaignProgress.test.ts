import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTOSAVE_ID,
  clearCampaignAutosave,
  deleteCampaignProgress,
  isCampaignAutosave,
  listCampaignProgress,
  loadCampaignProgress,
  saveCampaignAutosave,
  saveCampaignProgress,
} from "./campaignProgress.ts";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("campaignProgress", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it("saves and lists progress newest first", () => {
    const a = saveCampaignProgress({
      seed: 1,
      floor: 2,
      lives: 3,
      seconds: 12,
      drops: 0,
    });
    const b = saveCampaignProgress({
      seed: 2,
      floor: 4,
      lives: 2,
      seconds: 40,
      drops: 1,
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const list = listCampaignProgress();
    expect(list[0]!.id).toBe(b!.id);
    expect(loadCampaignProgress(a!.id)?.seed).toBe(1);
  });

  it("keeps autosave reserved and identifiable", () => {
    expect(isCampaignAutosave(AUTOSAVE_ID)).toBe(true);
    const saved = saveCampaignAutosave({
      seed: 9,
      floor: 5,
      lives: 3,
      seconds: 1,
      drops: 0,
    });
    expect(saved?.id).toBe(AUTOSAVE_ID);
    expect(listCampaignProgress()[0]!.id).toBe(AUTOSAVE_ID);
    expect(clearCampaignAutosave()).toBe(true);
    expect(loadCampaignProgress(AUTOSAVE_ID)).toBeNull();
  });

  it("clamps floor and lives", () => {
    const saved = saveCampaignProgress({
      seed: 3,
      floor: 999,
      lives: 99,
      seconds: -4,
      drops: -2,
    });
    expect(saved).not.toBeNull();
    expect(saved!.floor).toBeLessThanOrEqual(100);
    expect(saved!.lives).toBeLessThanOrEqual(5);
    expect(saved!.seconds).toBe(0);
    expect(saved!.drops).toBe(0);
  });

  it("deletes by id", () => {
    const saved = saveCampaignProgress({
      seed: 4,
      floor: 1,
      lives: 3,
      seconds: 0,
      drops: 0,
    });
    expect(deleteCampaignProgress(saved!.id)).toBe(true);
    expect(listCampaignProgress()).toHaveLength(0);
  });

  it("migrates legacy single-save storage", () => {
    localStorage.setItem(
      "maze.campaignProgress",
      JSON.stringify({
        seed: 42,
        floor: 7,
        lives: 2,
        seconds: 33,
        drops: 1,
        savedAt: 1000,
      }),
    );
    const list = listCampaignProgress();
    expect(list).toHaveLength(1);
    expect(list[0]!.seed).toBe(42);
    expect(list[0]!.floor).toBe(7);
    expect(localStorage.getItem("maze.campaignSaves")).toBeTruthy();
  });
});
