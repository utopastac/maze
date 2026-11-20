import { formatTime } from "../core/format.ts";
import {
  createActions,
  createButton,
  createCard,
  createKicker,
  createScrim,
  playEnter,
  playExit,
} from "./kit/index.ts";
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
    this.kicker = createKicker("Through.");
    this.timeEl = document.createElement("p");
    this.timeEl.className = styles.time;
    this.timeEl.dataset.time = "";
    this.timeEl.textContent = "0:00.0";
    this.detailEl = document.createElement("p");
    this.detailEl.className = styles.detail;
    this.detailEl.dataset.detail = "";
    this.detailEl.textContent = "Clean run.";
    this.againBtn = createButton({
      label: "Again",
      tone: "accent",
      className: styles.again,
      data: { again: "" },
      onClick: () => callbacks.onAgain(),
    });
    this.leaveBtn = createButton({
      label: "Home",
      tone: "ghost",
      data: { leave: "" },
      hidden: true,
      onClick: () => callbacks.onLeave(),
    });
    this.root.replaceChildren(
      createScrim({ className: styles.scrim }),
      createCard({
        center: true,
        className: styles.card,
        children: [
          this.kicker,
          this.timeEl,
          this.detailEl,
          createActions({
            center: true,
            className: styles.actions,
            children: [this.againBtn, this.leaveBtn],
          }),
        ],
      }),
    );
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
    playEnter(this.root);
  }

  hide(): void {
    delete this.root.dataset.kind;
    playExit(this.root);
  }
}
