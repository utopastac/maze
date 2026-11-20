import { formatTime } from "../core/format.ts";
import type { Maze } from "../core/maze.ts";
import type { FloorThemeId } from "../core/theme.ts";
import { iconSvg } from "./icons.ts";
import { renderMazeBoardPreview } from "./mazeBoardPreview.ts";
import { TowerMap } from "./towerMap.ts";
import styles from "./towerPause.module.css";

export interface TowerPauseStats {
  mode: "campaign" | "free";
  floor: number;
  total: number;
  lives: number;
  seconds: number;
  sizes: number[];
  themes: FloorThemeId[];
  maze: Maze | null;
  showGoal: boolean;
  landing: boolean;
  hasSave: boolean;
  note?: string;
}

export interface TowerPauseCallbacks {
  onResume: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onSave: () => void;
  onSaveLeave: () => void;
  onClearSave: () => void;
  onNewRun: () => void;
  onRemix: () => void;
  onSaveLevel: () => void;
}

export class TowerPause {
  private readonly root: HTMLElement;
  private readonly callbacks: TowerPauseCallbacks;
  private readonly metaEl: HTMLElement;
  private readonly floorEl: HTMLElement;
  private readonly livesEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly floorLabel: HTMLElement;
  private readonly floorThumb: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly saveLeaveBtn: HTMLButtonElement;
  private readonly clearBtn: HTMLButtonElement;
  private readonly newBtn: HTMLButtonElement;
  private readonly quitBtn: HTMLButtonElement;
  private readonly remixBtn: HTMLButtonElement;
  private readonly saveLevelBtn: HTMLButtonElement;
  private readonly mapSlot: HTMLElement;
  private readonly tower: TowerMap;
  private open = false;

  constructor(root: HTMLElement, callbacks: TowerPauseCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div class="${styles.scrim}" data-scrim></div>
      <div class="${styles.card}">
        <header class="${styles.head}">
          <div class="${styles.brand}">
            <h2 class="${styles.title}">Paused</h2>
            <p class="${styles.meta}" data-meta></p>
          </div>
          <div class="${styles.stats}">
            <p class="${styles.stat}"><strong data-floor>1 of 100</strong><span>Floor</span></p>
            <p class="${styles.stat}"><strong data-lives>3</strong><span>Hearts</span></p>
            <p class="${styles.stat}"><strong data-time>0:00.0</strong><span>Time</span></p>
          </div>
          <button type="button" class="glass-btn ${styles.close}" data-close aria-label="Resume">${iconSvg("close")}</button>
        </header>
        <div class="${styles.body}">
          <div class="${styles.mapSlot}" data-map></div>
          <div class="${styles.floorPanel}">
            <p class="${styles.floorLabel}" data-floor-label>Current floor</p>
            <div class="${styles.floorThumb}" data-floor-thumb></div>
          </div>
        </div>
        <div class="${styles.actions}">
          <button type="button" class="glass-pill metal-ring ${styles.primary}" data-resume>Resume</button>
          <button type="button" class="glass-pill ${styles.primary}" data-settings>Settings</button>
          <button type="button" class="glass-pill ${styles.primary}" data-remix data-free-only>Remix</button>
          <button type="button" class="glass-pill ${styles.primary}" data-save-level data-free-only>Save</button>
          <button type="button" class="glass-pill ${styles.primary}" data-save data-campaign-only>Save</button>
          <button type="button" class="glass-pill ${styles.ghost}" data-save-leave data-campaign-only>Save & leave</button>
          <button type="button" class="glass-pill ${styles.ghost}" data-clear data-campaign-only hidden>Delete this save</button>
          <button type="button" class="glass-pill ${styles.ghost}" data-new data-campaign-only>New run</button>
          <button type="button" class="glass-pill ${styles.ghost}" data-quit data-free-only>Quit</button>
        </div>
      </div>
    `;
    this.metaEl = this.require("[data-meta]");
    this.floorEl = this.require("[data-floor]");
    this.livesEl = this.require("[data-lives]");
    this.timeEl = this.require("[data-time]");
    this.floorLabel = this.require("[data-floor-label]");
    this.floorThumb = this.require("[data-floor-thumb]");
    this.saveBtn = this.require("[data-save]");
    this.saveLeaveBtn = this.require("[data-save-leave]");
    this.clearBtn = this.require("[data-clear]");
    this.newBtn = this.require("[data-new]");
    this.quitBtn = this.require("[data-quit]");
    this.remixBtn = this.require("[data-remix]");
    this.saveLevelBtn = this.require("[data-save-level]");
    this.mapSlot = this.require("[data-map]");
    this.tower = new TowerMap(this.mapSlot, "full");
    this.require("[data-close]").addEventListener("click", () => this.callbacks.onResume());
    this.require("[data-scrim]").addEventListener("click", () => this.callbacks.onResume());
    this.require("[data-resume]").addEventListener("click", () => this.callbacks.onResume());
    this.require("[data-settings]").addEventListener("click", () => this.callbacks.onSettings());
    this.quitBtn.addEventListener("click", () => this.callbacks.onQuit());
    this.saveBtn.addEventListener("click", () => this.callbacks.onSave());
    this.saveLeaveBtn.addEventListener("click", () => this.callbacks.onSaveLeave());
    this.clearBtn.addEventListener("click", () => this.callbacks.onClearSave());
    this.newBtn.addEventListener("click", () => this.callbacks.onNewRun());
    this.remixBtn.addEventListener("click", () => this.callbacks.onRemix());
    this.saveLevelBtn.addEventListener("click", () => this.callbacks.onSaveLevel());
  }

  isOpen(): boolean {
    return this.open;
  }

  show(stats: TowerPauseStats): void {
    this.open = true;
    this.apply(stats);
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
      this.tower.setCurrent(stats.floor);
    });
  }

  update(stats: TowerPauseStats): void {
    if (!this.open) return;
    this.apply(stats);
  }

  hide(): void {
    this.open = false;
    this.tower.hide();
    this.floorThumb.replaceChildren();
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  private apply(stats: TowerPauseStats): void {
    this.root.dataset.mode = stats.mode;
    const note = stats.note?.trim() ?? "";
    this.metaEl.textContent = note;
    this.metaEl.hidden = note.length === 0;
    this.floorEl.textContent = `${stats.floor} of ${stats.total}`;
    this.livesEl.textContent = String(stats.lives);
    this.timeEl.textContent = formatTime(stats.seconds);
    this.floorLabel.textContent = `Floor ${stats.floor}`;
    this.clearBtn.hidden = stats.mode !== "campaign" || !stats.hasSave;
    this.tower.setRun(stats.sizes, stats.floor, stats.mode === "campaign", stats.themes);
    this.floorThumb.replaceChildren();
    if (stats.maze) {
      this.floorThumb.append(renderMazeBoardPreview(stats.maze, {
        showGoal: stats.showGoal,
        landing: stats.landing,
      }));
    }
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
