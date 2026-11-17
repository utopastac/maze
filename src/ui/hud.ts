import { formatTime } from "../core/format.ts";
import { iconSvg } from "./icons.ts";
import styles from "./hud.module.css";
import { TowerMap } from "./towerMap.ts";

export interface HudCallbacks {
  onLevel: () => void;
  onReset: () => void;
  onNew: () => void;
  onCampaign: () => void;
  onLevels: () => void;
  onMotion: () => void;
  onSettings: () => void;
  onEdit: () => void;
  onAuthor: () => void;
  onShare: () => void;
  onWins: () => void;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly callbacks: HudCallbacks;
  private readonly timeEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly floorEl: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly motionBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly editBtn: HTMLButtonElement;
  private readonly authorBtn: HTMLButtonElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly winsBtn: HTMLButtonElement;
  private readonly campaignBtn: HTMLButtonElement;
  private readonly levelsBtn: HTMLButtonElement;
  private readonly livesEl: HTMLElement;
  private readonly lifeCount: HTMLElement;
  private readonly heartsEl: HTMLElement;
  private readonly heartCount: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly coinCount: HTMLElement;
  private readonly tower: TowerMap;
  private readonly keycaps: HTMLElement[];

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
          <h1 class="${styles.sr}" data-title>Untitled</h1>
          <p class="${styles.status}">
            <span class="${styles.sr}" data-floor hidden></span>
            <span class="${styles.sr}" data-time aria-live="polite">0:00.0</span>
            <span class="${styles.sr}" data-lives hidden title="Hearts">${iconSvg("heart", 14)}<span data-life-count>3</span></span>
            <span class="${styles.sr}" data-hearts hidden title="Hearts">${iconSvg("heart", 14)}<span data-heart-count>0</span></span>
            <span class="${styles.sr}" data-coins hidden title="Coins">${iconSvg("coin", 14)}<span data-coin-count>0</span></span>
            <span class="${styles.note}" data-note hidden></span>
          </p>
        </div>
      </header>
      <div class="${styles.bottom}">
        <p class="${styles.hint}" data-hint>${hint}</p>
        <div class="${styles.level}" aria-hidden="true"><span data-bubble></span></div>
      </div>
      <div class="${styles.debug}" aria-label="Debug menu">
        <button type="button" class="glass-btn" data-motion hidden aria-label="Use device tilt">${iconSvg("motion")}</button>
        <button type="button" class="glass-btn" data-level aria-label="Level the maze" title="Level">${iconSvg("level")}</button>
        <button type="button" class="glass-btn" data-reset aria-label="Reset the ball" title="Reset">${iconSvg("reset")}</button>
        <button type="button" class="glass-btn" data-edit aria-label="Edit level" title="Edit & share">${iconSvg("edit")}</button>
        <button type="button" class="glass-btn" data-author aria-label="Author campaign" title="Author campaign">${iconSvg("author")}</button>
        <button type="button" class="glass-btn" data-share aria-label="Copy level link" title="Copy link">${iconSvg("share")}</button>
        <button type="button" class="glass-btn" data-wins aria-label="Victory screens" title="Victory screens" aria-pressed="false">${iconSvg("wins")}</button>
        <button type="button" class="glass-btn" data-new aria-label="New maze" title="New maze">${iconSvg("new")}</button>
        <button type="button" class="glass-btn" data-campaign aria-label="Campaign" title="Campaign" aria-pressed="false">${iconSvg("campaign")}</button>
        <button type="button" class="glass-btn" data-levels aria-label="Level select" title="Level select" aria-pressed="false">${iconSvg("levels")}</button>
        <button type="button" class="glass-btn" data-settings aria-label="Settings" title="Settings">${iconSvg("settings")}</button>
      </div>
      <div class="${styles.controls}" aria-label="Keyboard controls">
        <div class="${styles.cluster}">
          <p class="${styles.controlLabel}">move</p>
          <div class="${styles.pad}">
            <kbd class="${styles.key}" data-key="arrowup">↑</kbd>
            <kbd class="${styles.key}" data-key="arrowleft">←</kbd>
            <kbd class="${styles.key}" data-key="arrowdown">↓</kbd>
            <kbd class="${styles.key}" data-key="arrowright">→</kbd>
          </div>
        </div>
        <div class="${styles.cluster}">
          <p class="${styles.controlLabel}">rotate</p>
          <div class="${styles.orbitRow}">
            <kbd class="${styles.key} ${styles.orbit}" data-key="q">${iconSvg("angleDown", 10)}<span>Q</span></kbd>
            <kbd class="${styles.key} ${styles.orbit}" data-key="e">${iconSvg("angleUp", 10)}<span>E</span></kbd>
          </div>
        </div>
        <div class="${styles.cluster}">
          <p class="${styles.controlLabel}">orbit</p>
          <div class="${styles.orbitRow}">
            <kbd class="${styles.key} ${styles.orbit}" data-key="z">${iconSvg("orbitLeft", 10)}<span>Z</span></kbd>
            <kbd class="${styles.key} ${styles.orbit}" data-key="c">${iconSvg("orbitRight", 10)}<span>C</span></kbd>
          </div>
        </div>
        <div class="${styles.cluster}">
          <p class="${styles.controlLabel}">zoom</p>
          <div class="${styles.orbitRow}">
            <kbd class="${styles.key} ${styles.orbit}" data-key="-">${iconSvg("minus", 10)}<span>-</span></kbd>
            <kbd class="${styles.key} ${styles.orbit}" data-key="=">${iconSvg("plus", 10)}<span>+</span></kbd>
          </div>
        </div>
      </div>
    `;
    this.timeEl = this.require("[data-time]");
    this.titleEl = this.require("[data-title]");
    this.floorEl = this.require("[data-floor]");
    this.noteEl = this.require("[data-note]");
    this.hint = this.require("[data-hint]");
    this.bubble = this.require("[data-bubble]");
    this.motionBtn = this.require("[data-motion]");
    this.settingsBtn = this.require("[data-settings]");
    this.editBtn = this.require("[data-edit]");
    this.authorBtn = this.require("[data-author]");
    this.shareBtn = this.require("[data-share]");
    this.winsBtn = this.require("[data-wins]");
    this.campaignBtn = this.require("[data-campaign]");
    this.levelsBtn = this.require("[data-levels]");
    this.livesEl = this.require("[data-lives]");
    this.lifeCount = this.require("[data-life-count]");
    this.heartsEl = this.require("[data-hearts]");
    this.heartCount = this.require("[data-heart-count]");
    this.coinsEl = this.require("[data-coins]");
    this.coinCount = this.require("[data-coin-count]");
    this.tower = new TowerMap(this.root);
    this.require<HTMLButtonElement>("[data-level]").addEventListener("click", () => this.callbacks.onLevel());
    this.require<HTMLButtonElement>("[data-reset]").addEventListener("click", () => this.callbacks.onReset());
    this.require<HTMLButtonElement>("[data-new]").addEventListener("click", () => this.callbacks.onNew());
    this.motionBtn.addEventListener("click", () => this.callbacks.onMotion());
    this.settingsBtn.addEventListener("click", () => this.callbacks.onSettings());
    this.editBtn.addEventListener("click", () => this.callbacks.onEdit());
    this.authorBtn.addEventListener("click", () => this.callbacks.onAuthor());
    this.shareBtn.addEventListener("click", () => this.callbacks.onShare());
    this.winsBtn.addEventListener("click", () => this.callbacks.onWins());
    this.campaignBtn.addEventListener("click", () => this.callbacks.onCampaign());
    this.levelsBtn.addEventListener("click", () => this.callbacks.onLevels());
    this.keycaps = [...this.root.querySelectorAll<HTMLElement>(`.${styles.controls} [data-key]`)];
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.setMotionVisible(coarse);
  }

  setStats(seconds: number, drops: number): void {
    const time = formatTime(seconds);
    this.timeEl.textContent = drops > 0
      ? `${time} · ${drops} ${drops === 1 ? "drop" : "drops"}`
      : time;
  }

  setCampaign(active: boolean): void {
    this.campaignBtn.classList.toggle("selected", active);
    this.campaignBtn.setAttribute("aria-pressed", active ? "true" : "false");
    this.editBtn.hidden = active;
    this.authorBtn.hidden = active;
    this.shareBtn.hidden = active;
    this.winsBtn.hidden = active;
    if (active) return;
    this.tower.hide();
  }

  setLives(count: number, pulse = false): void {
    this.livesEl.hidden = false;
    this.heartsEl.hidden = true;
    this.lifeCount.textContent = String(count);
    this.livesEl.setAttribute("aria-label", `${count} ${count === 1 ? "heart" : "hearts"}`);
    this.pulse(this.livesEl, pulse);
  }

  clearLives(): void {
    this.livesEl.hidden = true;
  }

  setHearts(_got: number, _need: number, _pulse = false): void {
    this.heartsEl.hidden = true;
  }

  setCoins(got: number, total: number, pulse = false): void {
    if (total <= 0) {
      this.coinsEl.hidden = true;
      return;
    }
    this.coinsEl.hidden = false;
    this.coinCount.textContent = `${got}/${total}`;
    this.coinsEl.setAttribute("aria-label", `${got} of ${total} coins`);
    this.pulse(this.coinsEl, pulse);
  }

  private pulse(el: HTMLElement, on: boolean): void {
    if (!on) return;
    el.removeAttribute("data-pulse");
    void el.offsetWidth;
    el.dataset.pulse = "in";
  }

  setTower(sizes: number[], current: number): void {
    this.tower.setRun(sizes, current);
  }

  setTowerFloor(current: number): void {
    this.tower.setCurrent(current);
  }

  setTitle(label: string): void {
    this.titleEl.textContent = label;
  }

  setFloor(current: number, total: number): void {
    if (total <= 1) {
      this.floorEl.hidden = true;
      return;
    }
    this.floorEl.hidden = false;
    this.floorEl.textContent = `Floor ${current} / ${total}`;
  }

  setFloorName(label: string): void {
    this.floorEl.hidden = false;
    this.floorEl.textContent = label;
  }

  setNote(note: string): void {
    this.noteEl.textContent = note;
    this.noteEl.hidden = note.length === 0;
  }

  setHeld(keys: ReadonlySet<string>): void {
    const held = new Set<string>();
    if (keys.has("arrowup") || keys.has("w")) held.add("arrowup");
    if (keys.has("arrowdown") || keys.has("s")) held.add("arrowdown");
    if (keys.has("arrowleft") || keys.has("a")) held.add("arrowleft");
    if (keys.has("arrowright") || keys.has("d")) held.add("arrowright");
    if (keys.has("q")) held.add("q");
    if (keys.has("e")) held.add("e");
    if (keys.has("z")) held.add("z");
    if (keys.has("c")) held.add("c");
    if (keys.has("-") || keys.has("_")) held.add("-");
    if (keys.has("=") || keys.has("+")) held.add("=");
    for (const key of this.keycaps) {
      key.classList.toggle(styles.down, held.has(key.dataset.key ?? ""));
    }
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

  setCelebrate(on: boolean): void {
    if (on) this.root.dataset.celebrate = "";
    else delete this.root.dataset.celebrate;
    this.tower.setSuppressed(on);
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
    this.editBtn.setAttribute("aria-label", selected ? "Close editor" : "Edit & share");
  }

  setAuthorSelected(selected: boolean): void {
    this.authorBtn.classList.toggle("selected", selected);
    this.authorBtn.setAttribute("aria-label", selected ? "Close campaign author" : "Author campaign");
  }

  setWinsSelected(selected: boolean): void {
    this.winsBtn.classList.toggle("selected", selected);
    this.winsBtn.setAttribute("aria-pressed", selected ? "true" : "false");
    this.winsBtn.setAttribute("aria-label", selected ? "Close victory screens" : "Victory screens");
  }

  setLevelsSelected(selected: boolean): void {
    this.levelsBtn.classList.toggle("selected", selected);
    this.levelsBtn.setAttribute("aria-pressed", selected ? "true" : "false");
    this.levelsBtn.setAttribute("aria-label", selected ? "Close level select" : "Level select");
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
