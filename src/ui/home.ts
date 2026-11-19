import type { PlayHudHomeAction, PlayHudHomeMenuMode } from "../render/playHud.ts";
import styles from "./home.module.css";

export interface HomeCallbacks {
  onPick: (action: PlayHudHomeAction) => void;
}

const MAIN_ITEMS: { action: PlayHudHomeAction; label: string }[] = [
  { action: "tower", label: "Tower" },
  { action: "play", label: "Free play" },
  { action: "create", label: "Create level" },
  { action: "saved", label: "Saved levels" },
  { action: "settings", label: "Settings" },
];

const TOWER_ITEMS: { action: PlayHudHomeAction; label: string }[] = [
  { action: "towerNew", label: "New game" },
  { action: "towerLoad", label: "Load" },
  { action: "towerBack", label: "Back" },
];

/** Full-screen a11y shell — visuals live on the 3D play HUD. */
export class Home {
  private readonly root: HTMLElement;
  private readonly callbacks: HomeCallbacks;
  private readonly brand: HTMLElement;
  private readonly nav: HTMLElement;
  private open = false;
  private mode: PlayHudHomeMenuMode = "main";

  constructor(root: HTMLElement, callbacks: HomeCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <nav class="${styles.nav}" aria-label="Main menu" data-nav>
        <h1 class="${styles.brand}" data-brand>Mazespire</h1>
      </nav>
    `;
    this.nav = this.root.querySelector("[data-nav]")!;
    this.brand = this.root.querySelector("[data-brand]")!;
    this.renderItems();
  }

  isOpen(): boolean {
    return this.open;
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
    this.brand.textContent = mode === "tower" ? "Tower" : "Mazespire";
    this.nav.setAttribute("aria-label", mode === "tower" ? "Tower menu" : "Main menu");
    this.renderItems();
  }

  private renderItems(): void {
    this.nav.querySelectorAll("[data-action]").forEach((el) => el.remove());
    const items = this.mode === "tower" ? TOWER_ITEMS : MAIN_ITEMS;
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.item;
      button.dataset.action = item.action;
      button.textContent = item.label;
      button.addEventListener("click", () => this.callbacks.onPick(item.action));
      this.nav.append(button);
    }
  }
}
