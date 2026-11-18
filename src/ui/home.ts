import type { PlayHudHomeAction } from "../render/playHud.ts";
import styles from "./home.module.css";

export interface HomeCallbacks {
  onPick: (action: PlayHudHomeAction) => void;
}

/** Full-screen a11y shell — visuals live on the 3D play HUD. */
export class Home {
  private readonly root: HTMLElement;
  private readonly callbacks: HomeCallbacks;
  private open = false;

  constructor(root: HTMLElement, callbacks: HomeCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <nav class="${styles.nav}" aria-label="Main menu">
        <h1 class="${styles.brand}">Mazespire</h1>
        <button type="button" class="${styles.item}" data-action="tower">Tower</button>
        <button type="button" class="${styles.item}" data-action="play">Free play</button>
        <button type="button" class="${styles.item}" data-action="create">Create level</button>
        <button type="button" class="${styles.item}" data-action="saved">Saved levels</button>
        <button type="button" class="${styles.item}" data-action="settings">Settings</button>
      </nav>
    `;
    this.root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action as PlayHudHomeAction | undefined;
        if (!action) return;
        this.callbacks.onPick(action);
      });
    });
  }

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    this.open = false;
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }
}
