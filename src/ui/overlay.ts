import { formatTime } from "../core/format.ts";
import styles from "./overlay.module.css";

export interface OverlayCallbacks {
  onAgain: () => void;
}

export class Overlay {
  private readonly root: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly detailEl: HTMLElement;

  constructor(root: HTMLElement, callbacks: OverlayCallbacks) {
    this.root = root;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div class="${styles.scrim}"></div>
      <div class="${styles.card}">
        <p class="${styles.kicker}">Through.</p>
        <p class="${styles.time}" data-time>0:00.0</p>
        <p class="${styles.detail}" data-detail>Clean run.</p>
        <button type="button" class="glass-pill metal-ring ${styles.again}" data-again>Again</button>
      </div>
    `;
    this.timeEl = this.require("[data-time]");
    this.detailEl = this.require("[data-detail]");
    this.require<HTMLButtonElement>("[data-again]").addEventListener("click", () => callbacks.onAgain());
  }

  showWin(seconds: number, drops: number): void {
    this.timeEl.textContent = formatTime(seconds);
    this.detailEl.textContent = drops === 0
      ? "Clean run."
      : `${drops} ${drops === 1 ? "drop" : "drops"}.`;
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
