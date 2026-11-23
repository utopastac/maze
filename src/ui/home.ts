import type { PlayHudHomeAction, PlayHudHomeMenuMode } from "../render/playHud.ts";
import { iconSvg, type IconName } from "./icons.ts";
import styles from "./home.module.css";

export interface HomeCallbacks {
  onPick: (action: PlayHudHomeAction) => void;
}

type HomeItem = {
  action: PlayHudHomeAction;
  label: string;
  desc: string;
  icon: IconName;
};

const MAIN_ITEMS: HomeItem[] = [
  { action: "tower", label: "Tower", desc: "Climb the campaign", icon: "campaign" },
  { action: "play", label: "Free play", desc: "One random maze", icon: "new" },
  { action: "create", label: "Create", desc: "Build & share", icon: "edit" },
  { action: "saved", label: "Saved", desc: "Your level library", icon: "saved" },
  { action: "settings", label: "Settings", desc: "Controls & look", icon: "settings" },
];

const TOWER_ITEMS: HomeItem[] = [
  { action: "towerNew", label: "New", desc: "Fresh tower run", icon: "new" },
  { action: "towerLoad", label: "Load", desc: "Continue a save", icon: "load" },
  { action: "towerPractice", label: "Practice", desc: "Single floors", icon: "levels" },
  { action: "towerBack", label: "Back", desc: "Main menu", icon: "home" },
];

/** Right-docked home panel — square tiles with short descriptions. */
export class Home {
  private readonly root: HTMLElement;
  private readonly callbacks: HomeCallbacks;
  private readonly titleEl: HTMLElement;
  private readonly metaEl: HTMLElement;
  private readonly grid: HTMLElement;
  private open = false;
  private mode: PlayHudHomeMenuMode = "main";

  constructor(root: HTMLElement, callbacks: HomeCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <aside class="${styles.panel}" data-panel>
        <header class="${styles.head}">
          <div>
            <p class="${styles.title}" data-title>Mazespire</p>
            <p class="${styles.meta}" data-meta>Play &amp; build</p>
          </div>
        </header>
        <div class="${styles.grid}" data-grid role="menu" aria-label="Main menu"></div>
      </aside>
    `;
    this.titleEl = this.root.querySelector("[data-title]")!;
    this.metaEl = this.root.querySelector("[data-meta]")!;
    this.grid = this.root.querySelector("[data-grid]")!;
    this.renderItems();
  }

  isOpen(): boolean {
    return this.open;
  }

  menuMode(): PlayHudHomeMenuMode {
    return this.mode;
  }

  show(): void {
    this.open = true;
    this.setMode("main");
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    this.open = false;
    this.mode = "main";
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  setMode(mode: PlayHudHomeMenuMode): void {
    this.mode = mode;
    const tower = mode === "tower";
    this.titleEl.textContent = tower ? "Tower" : "Mazespire";
    this.metaEl.textContent = tower ? "New, load, or practice" : "Play & build";
    this.grid.setAttribute("aria-label", tower ? "Tower menu" : "Main menu");
    this.renderItems();
  }

  private renderItems(): void {
    this.grid.replaceChildren();
    const items = this.mode === "tower" ? TOWER_ITEMS : MAIN_ITEMS;
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.tile;
      button.dataset.action = item.action;
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-label", `${item.label}. ${item.desc}`);

      const glyph = document.createElement("span");
      glyph.className = styles.glyph;
      glyph.setAttribute("aria-hidden", "true");
      glyph.innerHTML = iconSvg(item.icon, 28);

      const copy = document.createElement("span");
      copy.className = styles.copy;
      const label = document.createElement("span");
      label.className = styles.label;
      label.textContent = item.label;
      const desc = document.createElement("span");
      desc.className = styles.desc;
      desc.textContent = item.desc;
      copy.append(label, desc);

      button.append(glyph, copy);
      button.addEventListener("click", () => this.callbacks.onPick(item.action));
      this.grid.append(button);
    }
  }
}
