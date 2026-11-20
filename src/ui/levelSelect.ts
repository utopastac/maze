import { AUTHORED_FLOORS } from "../core/authoredFloors.ts";
import type { Campaign } from "../core/campaign.ts";
import { FLOOR_THEME_META, parseFloorTheme } from "../core/theme.ts";
import { createButton, playEnter, playExit } from "./kit/index.ts";
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
          <span data-close-slot></span>
        </header>
        <div class="${styles.grid}" data-grid></div>
      </div>
    `;
    this.titleEl = this.require(`.${styles.title}`);
    this.metaEl = this.require("[data-meta]");
    this.grid = this.require("[data-grid]");
    this.require("[data-close-slot]").replaceWith(
      createButton({
        icon: "close",
        ariaLabel: "Close level select",
        className: styles.close,
        data: { close: "" },
        onClick: () => this.callbacks.onClose(),
      }),
    );
    this.require("[data-scrim]").addEventListener("click", () => this.callbacks.onClose());
  }

  isOpen(): boolean {
    return this.open;
  }

  show(campaign: Campaign, opts: { practice?: boolean } = {}): void {
    this.open = true;
    const practice = opts.practice === true;
    this.titleEl.textContent = practice ? "Practice the tower" : "Level select";
    this.metaEl.textContent = practice
      ? ""
      : `${campaign.floors.length} floors · play any one in isolation`;
    this.metaEl.hidden = practice;
    const close = this.root.querySelector<HTMLButtonElement>("[data-close]");
    if (close) {
      close.setAttribute("aria-label", practice ? "Close practice" : "Close level select");
    }
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
    playEnter(this.root);
  }

  hide(): void {
    this.open = false;
    this.grid.replaceChildren();
    playExit(this.root);
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
