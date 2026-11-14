import { formatTime } from "../core/format.ts";
import { iconSvg } from "./icons.ts";
import styles from "./hud.module.css";

export interface HudCallbacks {
  onLevel: () => void;
  onReset: () => void;
  onNew: () => void;
  onMotion: () => void;
  onSettings: () => void;
  onEdit: () => void;
  onShare: () => void;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly callbacks: HudCallbacks;
  private readonly timeEl: HTMLElement;
  private readonly floorEl: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly motionBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly editBtn: HTMLButtonElement;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    const fine = window.matchMedia("(pointer: fine)").matches;
    this.root.className = styles.root;
    const hint = fine ? "Drag to tilt the maze, or use the arrow keys." : "Drag to tilt the maze.";
    this.root.innerHTML = `
      <div class="${styles.vignette}"></div>
      <header class="${styles.top}">
        <div class="${styles.brand}">
          <h1 class="${styles.title}">Maze</h1>
          <p class="${styles.status}">
            <span class="${styles.story}" data-floor hidden></span>
            <span data-time>0:00.0</span>
            <span class="${styles.note}" data-note hidden></span>
          </p>
        </div>
        <div class="${styles.actions}">
          <button type="button" class="glass-btn" data-motion hidden aria-label="Use device tilt">${iconSvg("motion")}</button>
          <button type="button" class="glass-btn" data-level aria-label="Level the maze" title="Level">${iconSvg("level")}</button>
          <button type="button" class="glass-btn" data-reset aria-label="Reset the ball" title="Reset">${iconSvg("reset")}</button>
          <button type="button" class="glass-btn" data-edit aria-label="Edit level" title="Edit level">${iconSvg("edit")}</button>
          <button type="button" class="glass-btn" data-share aria-label="Copy level link" title="Copy link">${iconSvg("share")}</button>
          <button type="button" class="glass-btn" data-new aria-label="New maze" title="New maze">${iconSvg("new")}</button>
          <button type="button" class="glass-btn" data-settings aria-label="Settings" title="Settings">${iconSvg("settings")}</button>
        </div>
      </header>
      <div class="${styles.bottom}">
        <p class="${styles.hint}" data-hint>${hint}</p>
        <div class="${styles.level}" aria-hidden="true"><span data-bubble></span></div>
      </div>
    `;
    this.timeEl = this.require("[data-time]");
    this.floorEl = this.require("[data-floor]");
    this.noteEl = this.require("[data-note]");
    this.hint = this.require("[data-hint]");
    this.bubble = this.require("[data-bubble]");
    this.motionBtn = this.require("[data-motion]");
    this.settingsBtn = this.require("[data-settings]");
    this.editBtn = this.require("[data-edit]");
    this.require<HTMLButtonElement>("[data-level]").addEventListener("click", () => this.callbacks.onLevel());
    this.require<HTMLButtonElement>("[data-reset]").addEventListener("click", () => this.callbacks.onReset());
    this.require<HTMLButtonElement>("[data-new]").addEventListener("click", () => this.callbacks.onNew());
    this.motionBtn.addEventListener("click", () => this.callbacks.onMotion());
    this.settingsBtn.addEventListener("click", () => this.callbacks.onSettings());
    this.editBtn.addEventListener("click", () => this.callbacks.onEdit());
    this.require<HTMLButtonElement>("[data-share]").addEventListener("click", () => this.callbacks.onShare());
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.setMotionVisible(coarse);
  }

  setStats(seconds: number, drops: number): void {
    const time = formatTime(seconds);
    this.timeEl.textContent = drops > 0
      ? `${time} · ${drops} ${drops === 1 ? "drop" : "drops"}`
      : time;
  }

  setFloor(current: number, total: number): void {
    if (total <= 1) {
      this.floorEl.hidden = true;
      return;
    }
    this.floorEl.hidden = false;
    this.floorEl.textContent = `Floor ${current} / ${total}`;
  }

  setNote(note: string): void {
    this.noteEl.textContent = note;
    this.noteEl.hidden = note.length === 0;
  }

  setTilt(roll: number, pitch: number): void {
    this.bubble.style.setProperty("--nx", roll.toFixed(3));
    this.bubble.style.setProperty("--ny", pitch.toFixed(3));
  }

  showHint(): void {
    this.hint.classList.remove(styles.gone);
  }

  hideHint(): void {
    this.hint.classList.add(styles.gone);
  }

  setMotionVisible(visible: boolean): void {
    this.motionBtn.hidden = !visible;
  }

  setMotionSelected(selected: boolean): void {
    this.motionBtn.classList.toggle("selected", selected);
    this.motionBtn.setAttribute("aria-label", selected ? "Stop device tilt" : "Use device tilt");
  }

  setSettingsSelected(selected: boolean): void {
    this.settingsBtn.classList.toggle("selected", selected);
    this.settingsBtn.setAttribute("aria-label", selected ? "Close settings" : "Settings");
  }

  setEditSelected(selected: boolean): void {
    this.editBtn.classList.toggle("selected", selected);
    this.editBtn.setAttribute("aria-label", selected ? "Close editor" : "Edit level");
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
