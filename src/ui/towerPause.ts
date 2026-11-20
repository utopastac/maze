import { formatTime } from "../core/format.ts";
import type { Maze } from "../core/maze.ts";
import type { FloorThemeId } from "../core/theme.ts";
import {
  createActions,
  createButton,
  createConfirmDialog,
  createScrim,
  playEnter,
  playExit,
} from "./kit/index.ts";
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
  private readonly confirmRoot: HTMLElement;
  private readonly confirmTitle: HTMLElement;
  private readonly confirmBody: HTMLElement;
  private readonly confirmOk: HTMLButtonElement;
  private readonly confirm: ReturnType<typeof createConfirmDialog>;
  private readonly tower: TowerMap;
  private open = false;
  private mode: TowerPauseStats["mode"] = "free";

  constructor(root: HTMLElement, callbacks: TowerPauseCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div data-scrim-slot></div>
      <div class="${styles.card}">
        <header class="${styles.head}" data-head>
          <div class="${styles.brand}">
            <h2 class="${styles.title}">Paused</h2>
            <p class="${styles.meta}" data-meta></p>
          </div>
          <div class="${styles.stats}">
            <p class="${styles.stat}"><strong data-floor>1 of 100</strong><span>Floor</span></p>
            <p class="${styles.stat}"><strong data-lives>3</strong><span>Hearts</span></p>
            <p class="${styles.stat}"><strong data-time>0:00.0</strong><span>Time</span></p>
          </div>
        </header>
        <div class="${styles.body}">
          <div class="${styles.mapSlot}" data-map></div>
          <div class="${styles.floorPanel}">
            <p class="${styles.floorLabel}" data-floor-label>Current floor</p>
            <div class="${styles.floorThumb}" data-floor-thumb></div>
          </div>
        </div>
        <div data-actions-slot></div>
      </div>
      <div data-confirm-slot></div>
    `;

    const resume = (): void => {
      if (this.confirmOpen()) {
        this.hideQuitConfirm();
        return;
      }
      this.callbacks.onResume();
    };

    this.require("[data-scrim-slot]").replaceWith(
      this.scrimEl(resume),
    );
    this.require("[data-head]").append(
      createButton({
        variant: "icon",
        icon: "close",
        ariaLabel: "Resume",
        className: styles.close,
        data: { close: "" },
        onClick: resume,
      }),
    );

    this.saveBtn = createButton({
      label: "Save",
      className: styles.primary,
      data: { save: "", campaignOnly: "" },
      onClick: () => this.callbacks.onSave(),
    });
    this.saveLeaveBtn = createButton({
      label: "Save & leave",
      tone: "ghost",
      data: { saveLeave: "", campaignOnly: "" },
      onClick: () => this.callbacks.onSaveLeave(),
    });
    this.clearBtn = createButton({
      label: "Delete this save",
      tone: "ghost",
      data: { clear: "", campaignOnly: "" },
      hidden: true,
      onClick: () => this.callbacks.onClearSave(),
    });
    this.newBtn = createButton({
      label: "New run",
      tone: "ghost",
      data: { new: "", campaignOnly: "" },
      onClick: () => this.callbacks.onNewRun(),
    });
    this.quitBtn = createButton({
      label: "Quit",
      tone: "ghost",
      data: { quit: "" },
      onClick: () => this.openQuitConfirm(),
    });
    this.remixBtn = createButton({
      label: "Remix",
      className: styles.primary,
      data: { remix: "", freeOnly: "" },
      onClick: () => this.callbacks.onRemix(),
    });
    this.saveLevelBtn = createButton({
      label: "Save",
      className: styles.primary,
      data: { saveLevel: "", freeOnly: "" },
      onClick: () => this.callbacks.onSaveLevel(),
    });
    this.require("[data-actions-slot]").replaceWith(
      createActions({
        className: styles.actions,
        children: [
          createButton({
            label: "Resume",
            tone: "accent",
            className: styles.primary,
            data: { resume: "" },
            onClick: resume,
          }),
          this.remixBtn,
          this.saveLevelBtn,
          this.saveBtn,
          this.saveLeaveBtn,
          this.clearBtn,
          this.newBtn,
          this.quitBtn,
        ],
      }),
    );

    this.confirm = createConfirmDialog({
      titleId: "pause-quit-title",
      bodyId: "pause-quit-body",
      title: "Quit?",
      confirmLabel: "Quit",
      onCancel: () => this.hideQuitConfirm(),
      onConfirm: () => this.commitQuitConfirm(),
    });
    this.confirm.title.dataset.confirmTitle = "";
    this.confirm.body.dataset.confirmBody = "";
    this.require("[data-confirm-slot]").replaceWith(this.confirm.root);

    this.metaEl = this.require("[data-meta]");
    this.floorEl = this.require("[data-floor]");
    this.livesEl = this.require("[data-lives]");
    this.timeEl = this.require("[data-time]");
    this.floorLabel = this.require("[data-floor-label]");
    this.floorThumb = this.require("[data-floor-thumb]");
    this.mapSlot = this.require("[data-map]");
    this.confirmRoot = this.confirm.root;
    this.confirmTitle = this.confirm.title;
    this.confirmBody = this.confirm.body;
    this.confirmOk = this.require("[data-confirm-ok]");
    this.tower = new TowerMap(this.mapSlot);
  }

  isOpen(): boolean {
    return this.open;
  }

  confirmOpen(): boolean {
    return !this.confirmRoot.hidden;
  }

  /** Dismiss quit warning if open. Returns true when it handled the input. */
  dismissConfirm(): boolean {
    if (!this.confirmOpen()) return false;
    this.hideQuitConfirm();
    return true;
  }

  show(stats: TowerPauseStats): void {
    this.open = true;
    this.hideQuitConfirm();
    this.apply(stats);
    playEnter(this.root);
    requestAnimationFrame(() => {
      this.tower.setCurrent(stats.floor);
    });
  }

  update(stats: TowerPauseStats): void {
    if (!this.open) return;
    this.apply(stats);
  }

  hide(): void {
    this.open = false;
    this.hideQuitConfirm();
    this.tower.hide();
    this.floorThumb.replaceChildren();
    playExit(this.root);
  }

  private apply(stats: TowerPauseStats): void {
    this.mode = stats.mode;
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

  private openQuitConfirm(): void {
    this.confirmTitle.textContent = "Quit?";
    this.confirmBody.textContent = this.mode === "campaign"
      ? "Leave this run? Unsaved progress will be lost."
      : "Leave this level? You'll return home.";
    this.confirmOk.textContent = "Quit";
    this.confirm.show();
    this.confirmOk.focus();
  }

  private hideQuitConfirm(): void {
    this.confirm.hide();
  }

  private commitQuitConfirm(): void {
    this.hideQuitConfirm();
    this.callbacks.onQuit();
  }

  private scrimEl(onClick: () => void): HTMLElement {
    const scrim = createScrim({ className: styles.scrim, data: "scrim" });
    scrim.addEventListener("click", onClick);
    return scrim;
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
