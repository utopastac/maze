import { beforeEach, describe, expect, it } from "vitest";
import { AUTOSAVE_ID, listCampaignProgress } from "../core/campaignProgress.ts";
import { CampaignSession } from "./campaignSession.ts";

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

describe("CampaignSession", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it("begins a new campaign without a save id", () => {
    const session = new CampaignSession();
    const campaign = session.beginNew();
    expect(campaign.floors.length).toBeGreaterThan(0);
    expect(session.saveId).toBeNull();
    expect(session.campaign).toBe(campaign);
  });

  it("manual save and autosave share progress storage", () => {
    const session = new CampaignSession();
    session.beginNew();
    const saved = session.saveManual({ floor: 3, lives: 2, seconds: 12, drops: 1 });
    expect(saved).not.toBeNull();
    expect(session.saveId).toBe(saved!.id);
    expect(session.hasSave()).toBe(true);

    session.autosave({ floor: 4, lives: 2, seconds: 20, drops: 1 });
    const list = listCampaignProgress();
    expect(list.some((entry) => entry.id === AUTOSAVE_ID)).toBe(true);
    expect(list.some((entry) => entry.id === saved!.id)).toBe(true);
  });

  it("load attaches save and returns lives", () => {
    const session = new CampaignSession();
    session.beginNew();
    const saved = session.saveManual({ floor: 5, lives: 0, seconds: 1, drops: 0 });
    expect(saved).not.toBeNull();

    const next = new CampaignSession();
    const lives = next.load(saved!);
    expect(lives).toBe(1);
    expect(next.saveId).toBe(saved!.id);
    expect(next.campaign?.seed).toBe(saved!.seed);
  });

  it("endRun clears active save and autosave", () => {
    const session = new CampaignSession();
    session.beginNew();
    session.saveManual({ floor: 2, lives: 3, seconds: 0, drops: 0 });
    session.autosave({ floor: 2, lives: 3, seconds: 0, drops: 0 });
    session.endRun();
    expect(session.saveId).toBeNull();
    expect(listCampaignProgress()).toHaveLength(0);
  });
});
