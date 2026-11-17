import { DEFAULT_FLOOR_THEME, type FloorThemeId } from "../core/theme.ts";
import styles from "./towerMap.module.css";

const SECTION_WINDOW = 15;

export type TowerMapMode = "hud" | "full";

export class TowerMap {
  private readonly root: HTMLElement;
  private readonly bars: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly steps: HTMLElement[] = [];
  private sizes: number[] = [];
  private themes: FloorThemeId[] = [];
  private current = 0;
  private sectioned = false;
  private windowStart = 0;
  private onTap: (() => void) | null = null;
  private readonly mode: TowerMapMode;

  constructor(parent: HTMLElement, mode: TowerMapMode = "hud") {
    this.mode = mode;
    this.root = document.createElement("div");
    this.root.className = mode === "full" ? `${styles.tower} ${styles.full}` : styles.tower;
    this.root.hidden = true;
    this.bars = document.createElement("div");
    this.bars.className = styles.bars;
    this.mark = document.createElement("span");
    this.mark.className = styles.mark;
    // Keep the mark outside `.bars` so section fade masks do not clip it.
    this.root.append(this.bars, this.mark);
    parent.append(this.root);
    this.root.addEventListener("click", () => {
      if (!this.onTap || this.root.hidden) return;
      this.onTap();
    });
    this.root.addEventListener("keydown", (event) => {
      if (!this.onTap || this.root.hidden) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.onTap();
    });
    window.addEventListener("resize", () => {
      if (this.root.hidden || this.current === 0) return;
      this.placeMark();
    });
  }

  setTapHandler(handler: (() => void) | null): void {
    this.onTap = handler;
    this.syncInteractive();
  }

  setRun(
    sizes: number[],
    current: number,
    section = false,
    themes: readonly FloorThemeId[] = [],
  ): void {
    this.sizes = sizes.slice();
    this.themes = themes.slice();
    this.sectioned = section && sizes.length > this.sectionWindow();
    this.root.hidden = false;
    this.syncInteractive();
    this.setCurrent(current);
  }

  setCurrent(current: number): void {
    this.current = Math.min(this.sizes.length, Math.max(1, current));
    this.windowStart = this.computeWindowStart();
    this.rebuild();
    this.root.setAttribute(
      "aria-label",
      this.sectioned
        ? `Floor ${this.current} of ${this.sizes.length}. Tap for full tower.`
        : `Floor ${this.current} of ${this.sizes.length}`,
    );
    this.placeMark();
  }

  hide(): void {
    this.root.hidden = true;
    this.current = 0;
    this.sizes = [];
    this.themes = [];
    this.sectioned = false;
    this.syncInteractive();
  }

  setSuppressed(on: boolean): void {
    this.root.style.visibility = on ? "hidden" : "";
  }

  private sectionWindow(): number {
    return SECTION_WINDOW;
  }

  private syncInteractive(): void {
    const interactive = this.mode === "hud" && this.sectioned && this.onTap !== null && !this.root.hidden;
    this.root.classList.toggle(styles.interactive, interactive);
    this.root.tabIndex = interactive ? 0 : -1;
    if (interactive) this.root.setAttribute("role", "button");
    else this.root.removeAttribute("role");
  }

  private computeWindowStart(): number {
    if (!this.sectioned) return 0;
    const window = this.sectionWindow();
    const half = Math.floor(window / 2);
    let start = this.current - 1 - half;
    const maxStart = Math.max(0, this.sizes.length - window);
    if (start < 0) start = 0;
    if (start > maxStart) start = maxStart;
    return start;
  }

  private visibleCount(): number {
    if (!this.sectioned) return this.sizes.length;
    return Math.min(this.sectionWindow(), this.sizes.length);
  }

  private themeAt(index: number): FloorThemeId {
    return this.themes[index] ?? DEFAULT_FLOOR_THEME;
  }

  private rebuild(): void {
    const count = this.visibleCount();
    this.ensure(count);
    const min = Math.min(...this.sizes);
    const max = Math.max(...this.sizes);
    const moreAbove = this.sectioned && this.windowStart > 0;
    const moreBelow = this.sectioned && this.windowStart + count < this.sizes.length;
    this.bars.dataset.fade = moreAbove && moreBelow
      ? "both"
      : moreAbove
        ? "above"
        : moreBelow
          ? "below"
          : "";
    this.steps.forEach((step, index) => {
      const floorIndex = this.windowStart + index;
      const cols = this.sizes[floorIndex] ?? min;
      const span = max === min ? 100 : 42 + ((cols - min) / (max - min)) * 58;
      step.style.width = `${span}%`;
      const theme = this.themeAt(floorIndex);
      if (step.dataset.theme !== theme) step.dataset.theme = theme;
      const floor = floorIndex + 1;
      const state = floor < this.current ? "done" : floor === this.current ? "now" : "next";
      if (step.dataset.state !== state) step.dataset.state = state;
    });
    this.mark.textContent = String(this.current);
    this.mark.dataset.theme = this.themeAt(this.current - 1);
  }

  private ensure(count: number): void {
    if (this.steps.length === count) return;
    for (const step of this.steps) step.remove();
    this.steps.length = 0;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const step = document.createElement("span");
      step.className = styles.step;
      frag.append(step);
      this.steps.push(step);
    }
    this.bars.append(frag);
  }

  private placeMark(): void {
    const local = this.current - 1 - this.windowStart;
    const step = this.steps[local];
    if (!step || this.root.hidden) return;
    const top = this.bars.offsetTop + step.offsetTop + step.offsetHeight / 2;
    this.mark.style.top = `${top}px`;
  }
}
