import { playEnter, playExit } from "./kit/index.ts";
import styles from "./toast.module.css";

/** Top-center transient notice for save feedback and similar. */
export class Toast {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private timer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = `kit-toast ${styles.root}`;
    this.root.innerHTML = `<p class="kit-toast-body ${styles.body}" data-toast-body aria-live="polite"></p>`;
    this.root.hidden = true;
    this.body = this.require("[data-toast-body]");
  }

  show(message: string, duration = 1800): void {
    const text = message.trim();
    if (!text) {
      this.hide();
      return;
    }
    this.body.textContent = text;
    playEnter(this.root);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.hide();
    }, duration);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
    playExit(this.root);
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
