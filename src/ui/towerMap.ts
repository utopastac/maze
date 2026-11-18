import { DEFAULT_FLOOR_THEME, type FloorThemeId } from "../core/theme.ts";
import styles from "./towerMap.module.css";

const SECTION_WINDOW_FALLBACK = 15;
const FLOOR_MAX_FALLBACK = 24;

export type TowerMapMode = "hud" | "full";

export class TowerMap {
  private readonly root: HTMLElement;
  private readonly bars: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly steps: HTMLElement[] = [];
  private readonly resizeObserver: ResizeObserver;
  private sizes: number[] = [];
  private themes: FloorThemeId[] = [];
  private current = 0;
  private wantSection = false;
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
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.root);
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
    this.wantSection = section;
    this.syncSectioned();
    this.root.hidden = false;
    this.syncInteractive();
    this.setCurrent(current);
  }

  setCurrent(current: number): void {
    this.current = Math.min(this.sizes.length, Math.max(1, current));
    this.syncSectioned();
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
    this.wantSection = false;
    this.sectioned = false;
    this.syncInteractive();
  }

  setSuppressed(on: boolean): void {
    this.root.style.visibility = on ? "hidden" : "";
  }

  private onResize(): void {
    if (this.root.hidden || this.current === 0 || this.sizes.length === 0) return;
    const prevWindow = this.visibleCount();
    const prevStart = this.windowStart;
    this.syncSectioned();
    this.windowStart = this.computeWindowStart();
    if (this.visibleCount() !== prevWindow || this.windowStart !== prevStart) {
      this.rebuild();
    }
    this.placeMark();
  }

  /** How many floor bars fit at max height in the current column. */
  private fitCapacity(): number {
    const height = this.bars.clientHeight;
    if (height <= 0) return SECTION_WINDOW_FALLBACK;
    const full = this.mode === "full";
    const gap = full ? 3 : window.matchMedia("(max-height: 760px)").matches ? 1 : 2;
    const pad = full ? 20 : 16;
    const floorMax = this.floorMaxPx();
    const inner = Math.max(0, height - pad);
    return Math.max(1, Math.floor((inner + gap) / (floorMax + gap)));
  }

  private floorMaxPx(): number {
    const raw = getComputedStyle(this.root).getPropertyValue("--tower-floor-max").trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : FLOOR_MAX_FALLBACK;
  }

  private sectionWindow(): number {
    const fit = this.fitCapacity();
    if (this.sizes.length === 0) return fit;
    return Math.max(1, Math.min(this.sizes.length, fit));
  }

  private syncSectioned(): void {
    this.sectioned = this.wantSection && this.sizes.length > this.sectionWindow();
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
    if (this.mode === "full") return;
    const local = this.current - 1 - this.windowStart;
    const step = this.steps[local];
    if (!step || this.root.hidden) return;
    const top = this.bars.offsetTop + step.offsetTop + step.offsetHeight / 2;
    this.mark.style.top = `${top}px`;
  }
}
