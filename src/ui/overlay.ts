import { formatTime } from "../core/format.ts";
import styles from "./overlay.module.css";

export interface OverlayCallbacks {
  onAgain: () => void;
  onLeave: () => void;
}

export class Overlay {
  private readonly root: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly againBtn: HTMLButtonElement;
  private readonly leaveBtn: HTMLButtonElement;

  constructor(root: HTMLElement, callbacks: OverlayCallbacks) {
    this.root = root;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div class="${styles.scrim}"></div>
      <div class="${styles.card}">
        <p class="${styles.kicker}">Through.</p>
        <p class="${styles.time}" data-time>0:00.0</p>
        <p class="${styles.detail}" data-detail>Clean run.</p>
        <div class="${styles.actions}">
          <button type="button" class="glass-pill metal-ring ${styles.again}" data-again>Again</button>
          <button type="button" class="glass-pill ${styles.leave}" data-leave hidden>Free play</button>
        </div>
      </div>
    `;
    this.kicker = this.require(`.${styles.kicker}`);
    this.timeEl = this.require("[data-time]");
    this.detailEl = this.require("[data-detail]");
    this.againBtn = this.require("[data-again]");
    this.leaveBtn = this.require("[data-leave]");
    this.againBtn.addEventListener("click", () => callbacks.onAgain());
    this.leaveBtn.addEventListener("click", () => callbacks.onLeave());
  }

  showWin(seconds: number, drops: number): void {
    this.kicker.textContent = "Free.";
    this.againBtn.textContent = "Again";
    this.leaveBtn.hidden = true;
    this.timeEl.textContent = formatTime(seconds);
    this.detailEl.textContent = drops === 0
      ? "Clean run."
      : `${drops} ${drops === 1 ? "drop" : "drops"}.`;
    this.open("win");
  }

  showCampaignWin(seconds: number, drops: number, lives: number): void {
    const life = lives === 1 ? "1 life left" : `${lives} lives left`;
    this.kicker.textContent = "Free.";
    this.againBtn.textContent = "Again";
    this.leaveBtn.hidden = false;
    this.timeEl.textContent = formatTime(seconds);
    this.detailEl.textContent = drops === 0
      ? `${life}.`
      : `${life} · ${drops} ${drops === 1 ? "drop" : "drops"}.`;
    this.open("win");
  }

  showLoss(floor: number, total: number, seconds: number, campaign = true): void {
    this.kicker.textContent = "Out of hearts.";
    this.againBtn.textContent = "Retry";
    this.leaveBtn.hidden = !campaign;
    this.timeEl.textContent = String(floor);
    this.detailEl.textContent = total > 1
      ? `Floor ${floor} of ${total} · ${formatTime(seconds)}`
      : formatTime(seconds);
    this.open("loss");
  }

  private open(kind: "win" | "loss"): void {
    this.root.dataset.kind = kind;
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    delete this.root.dataset.phase;
    delete this.root.dataset.kind;
    this.root.hidden = true;
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
