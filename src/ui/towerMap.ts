import styles from "./towerMap.module.css";

export class TowerMap {
  private readonly root: HTMLElement;
  private readonly bars: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly steps: HTMLElement[] = [];
  private current = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = styles.tower;
    this.root.hidden = true;
    this.bars = document.createElement("div");
    this.bars.className = styles.bars;
    this.mark = document.createElement("span");
    this.mark.className = styles.mark;
    this.bars.append(this.mark);
    this.root.append(this.bars);
    parent.append(this.root);
    window.addEventListener("resize", () => {
      if (this.root.hidden || this.current === 0) return;
      this.placeMark();
    });
  }

  setRun(sizes: number[], current: number): void {
    this.ensure(sizes.length);
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    this.steps.forEach((step, index) => {
      const cols = sizes[index] ?? min;
      const span = max === min ? 100 : 42 + ((cols - min) / (max - min)) * 58;
      step.style.width = `${span}%`;
    });
    this.root.hidden = false;
    this.setCurrent(current);
  }

  setCurrent(current: number): void {
    this.current = current;
    this.steps.forEach((step, index) => {
      const floor = index + 1;
      const state = floor < current ? "done" : floor === current ? "now" : "next";
      if (step.dataset.state !== state) step.dataset.state = state;
    });
    this.mark.textContent = String(current);
    this.root.setAttribute("aria-label", `Floor ${current} of ${this.steps.length}`);
    this.placeMark();
  }

  hide(): void {
    this.root.hidden = true;
    this.current = 0;
  }

  setSuppressed(on: boolean): void {
    this.root.style.visibility = on ? "hidden" : "";
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
    this.bars.prepend(frag);
  }

  private placeMark(): void {
    const step = this.steps[this.current - 1];
    if (!step || this.root.hidden) return;
    this.mark.style.top = `${step.offsetTop + step.offsetHeight / 2}px`;
  }
}
