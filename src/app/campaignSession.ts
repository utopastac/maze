import { generateCampaign, type Campaign } from "../core/campaign.ts";
import {
  AUTOSAVE_ID,
  clearCampaignAutosave,
  deleteCampaignProgress,
  loadCampaignProgress,
  saveCampaignAutosave,
  saveCampaignProgress,
  type CampaignProgress,
} from "../core/campaignProgress.ts";

/** Live run stats the session needs to persist; owned by App (shared with free play). */
export interface CampaignRunState {
  floor: number;
  lives: number;
  seconds: number;
  drops: number;
}

/** Owns the active tower campaign and its save slot; App owns run stats and UI side effects. */
export class CampaignSession {
  campaign: Campaign | null = null;
  saveId: string | null = null;

  /** Drop the campaign and its save binding (leaving tower mode). */
  reset(): void {
    this.campaign = null;
    this.saveId = null;
  }

  /** Start a brand-new random campaign with no save attached. */
  beginNew(): Campaign {
    this.saveId = null;
    this.campaign = generateCampaign(Math.floor(Math.random() * 0x7fffffff));
    return this.campaign;
  }

  /** Rebuild the current campaign from its seed (replay); keeps the save binding. */
  replay(): boolean {
    if (!this.campaign) return false;
    this.campaign = generateCampaign(this.campaign.seed);
    return true;
  }

  /** Latest stored copy of `save` (falls back to the passed one). */
  fresh(save: CampaignProgress): CampaignProgress {
    return loadCampaignProgress(save.id) ?? save;
  }

  /** Attach a stored save; returns the lives to resume with. */
  load(save: CampaignProgress): number {
    this.saveId = save.id;
    this.campaign = generateCampaign(save.seed);
    return Math.max(1, save.lives);
  }

  /** True when the bound save still exists in storage. */
  hasSave(): boolean {
    return this.saveId !== null && loadCampaignProgress(this.saveId) !== null;
  }

  /** Manual save into a named slot (never the reserved autosave id). Null on failure/no campaign. */
  saveManual(run: CampaignRunState): CampaignProgress | null {
    const campaign = this.campaign;
    if (!campaign) return null;
    // Keep manual saves off the reserved autosave id so the slot stays distinct.
    const manualId = this.saveId && this.saveId !== AUTOSAVE_ID ? this.saveId : undefined;
    const saved = saveCampaignProgress({
      id: manualId,
      seed: campaign.seed,
      floor: run.floor,
      lives: run.lives,
      seconds: run.seconds,
      drops: run.drops,
    });
    if (saved) this.saveId = saved.id;
    return saved;
  }

  /** Overwrite the autosave slot; binds it as the save id if none is bound yet. */
  autosave(run: CampaignRunState): void {
    const campaign = this.campaign;
    if (!campaign) return;
    const saved = saveCampaignAutosave({
      seed: campaign.seed,
      floor: run.floor,
      lives: run.lives,
      seconds: run.seconds,
      drops: run.drops,
    });
    if (!saved) return;
    if (!this.saveId) this.saveId = saved.id;
  }

  /** Detach from the save without deleting it (e.g. save & leave). */
  detachSave(): void {
    this.saveId = null;
  }

  /** Delete the bound save from storage and unbind it. */
  forgetActive(): void {
    if (this.saveId) deleteCampaignProgress(this.saveId);
    this.saveId = null;
  }

  /** Run finished (win/loss): drop the bound save and the autosave slot. */
  endRun(): void {
    this.forgetActive();
    clearCampaignAutosave();
  }
}
