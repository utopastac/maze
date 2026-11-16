import { AUTHORED_FLOORS } from "../core/authoredFloors.ts";
import type { Campaign } from "../core/campaign.ts";
import { FLOOR_THEME_META, parseFloorTheme } from "../core/theme.ts";
import { iconSvg } from "./icons.ts";
import { renderMazeThumbnail } from "./mazeThumbnail.ts";
import styles from "./levelSelect.module.css";

export interface LevelSelectCallbacks {
  onPick: (index: number) => void;
  onClose: () => void;
}

export class LevelSelect {
  private readonly root: HTMLElement;
  private readonly callbacks: LevelSelectCallbacks;
  private readonly titleEl: HTMLElement;
  private readonly metaEl: HTMLElement;
  private readonly grid: HTMLElement;
  private open = false;

  constructor(root: HTMLElement, callbacks: LevelSelectCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div class="${styles.scrim}" data-scrim></div>
      <div class="${styles.card}">
        <header class="${styles.head}">
          <div>
            <h2 class="${styles.title}">Level select</h2>
            <p class="${styles.meta}" data-meta>Pick a floor to play alone.</p>
          </div>
          <button type="button" class="glass-btn ${styles.close}" data-close aria-label="Close level select">${iconSvg("close")}</button>
        </header>
        <div class="${styles.grid}" data-grid></div>
      </div>
    `;
    this.titleEl = this.require(`.${styles.title}`);
    this.metaEl = this.require("[data-meta]");
    this.grid = this.require("[data-grid]");
    this.require("[data-close]").addEventListener("click", () => this.callbacks.onClose());
    this.require("[data-scrim]").addEventListener("click", () => this.callbacks.onClose());
  }

  isOpen(): boolean {
    return this.open;
  }

  show(campaign: Campaign): void {
    this.open = true;
    this.titleEl.textContent = "Level select";
    this.metaEl.textContent = `${campaign.floors.length} floors · play any one in isolation`;
    this.grid.replaceChildren();
    for (let index = 0; index < campaign.floors.length; index += 1) {
      const floor = campaign.floors[index];
      if (!floor) continue;
      const maze = floor.maze;
      const theme = parseFloorTheme(maze.theme);
      const authored = !!AUTHORED_FLOORS[index];
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.option;
      button.setAttribute(
        "aria-label",
        `Floor ${index + 1}, ${maze.cols} by ${maze.rows}, ${FLOOR_THEME_META[theme].label}`,
      );
      const thumb = document.createElement("div");
      thumb.className = styles.thumb;
      thumb.append(renderMazeThumbnail(maze));
      const label = document.createElement("div");
      label.className = styles.label;
      label.innerHTML = `
        <div class="${styles.row}">
          <span class="${styles.floor}">Floor ${index + 1}</span>
          ${authored ? `<span class="${styles.badge}">Authored</span>` : ""}
        </div>
        <span class="${styles.detail}">${maze.cols}×${maze.rows} · ${FLOOR_THEME_META[theme].label}</span>
      `;
      button.append(thumb, label);
      button.addEventListener("click", () => this.callbacks.onPick(index));
      this.grid.append(button);
    }
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    this.open = false;
    this.grid.replaceChildren();
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
