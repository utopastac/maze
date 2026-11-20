import { formatTime } from "../core/format.ts";
import {
  actionHeld,
  formatKey,
  hudKeyForAction,
  KEY_DEFAULTS,
  type KeyAction,
  type Keybinds,
} from "../core/keybinds.ts";
import { iconSvg } from "./icons.ts";
import { createButton } from "./kit/index.ts";
import styles from "./hud.module.css";

const HUD_KEY_ACTIONS = [
  "tiltUp",
  "tiltLeft",
  "tiltDown",
  "tiltRight",
  "angleDown",
  "angleUp",
  "orbitLeft",
  "orbitRight",
  "zoomOut",
  "zoomIn",
] as const satisfies readonly KeyAction[];

export interface HudCallbacks {
  onHome: () => void;
  onSettings: () => void;
  onEdit: () => void;
  onAuthor: () => void;
  onWins: () => void;
  onWinScene: (index: number) => void;
  onPause: () => void;
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
  private readonly settingsBtn: HTMLButtonElement;
  private readonly editBtn: HTMLButtonElement;
  private readonly authorBtn: HTMLButtonElement;
  private readonly winsBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly livesEl: HTMLElement;
  private readonly lifeCount: HTMLElement;
  private readonly heartsEl: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly coinCount: HTMLElement;
  private readonly winGallery: HTMLElement;
  private readonly winList: HTMLElement;
  private readonly keycaps: HTMLElement[];
  private keybinds: Keybinds = { ...KEY_DEFAULTS };
  private heldKeys: ReadonlySet<string> = new Set();

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    const fine = window.matchMedia("(pointer: fine)").matches;
    this.root.className = styles.root;
    const hint = fine ? "Drag to tilt the maze, or use the keyboard." : "Drag to tilt the maze.";
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
      <aside class="${styles.winGallery}" data-win-gallery hidden>
        <div class="${styles.winHead}">
          <div>
            <p class="${styles.winTitle}">Victory screens</p>
            <p class="${styles.winMeta}" data-win-meta>1 / 15 · [ ]</p>
          </div>
          <span data-slot="winClose"></span>
        </div>
        <div class="${styles.winList}" data-win-list role="listbox" aria-label="Victory screens"></div>
      </aside>
      <div class="${styles.debug}" data-admin aria-label="Debug menu">
        <span data-slot="home"></span>
        <span data-slot="edit"></span>
        <span data-slot="author"></span>
        <span data-slot="wins"></span>
        <span data-slot="settings"></span>
      </div>
      <div class="${styles.cornerActions}">
        <span data-slot="pause"></span>
        <div class="${styles.controlsDock}">
          <span data-slot="controls"></span>
          <div
            class="${styles.controls}"
            id="hud-keyboard-controls"
            data-controls-panel
            aria-label="Keyboard controls"
          >
            <div class="${styles.cluster}">
              <p class="${styles.controlLabel}">move</p>
              <div class="${styles.pad}">
                <kbd class="${styles.key}" data-action="tiltUp"></kbd>
                <kbd class="${styles.key}" data-action="tiltLeft"></kbd>
                <kbd class="${styles.key}" data-action="tiltDown"></kbd>
                <kbd class="${styles.key}" data-action="tiltRight"></kbd>
              </div>
            </div>
            <div class="${styles.cluster}">
              <p class="${styles.controlLabel}">rotate</p>
              <div class="${styles.orbitRow}">
                <kbd class="${styles.key} ${styles.orbit}" data-action="angleDown">${iconSvg("angleDown", 10)}<span data-label></span></kbd>
                <kbd class="${styles.key} ${styles.orbit}" data-action="angleUp">${iconSvg("angleUp", 10)}<span data-label></span></kbd>
              </div>
            </div>
            <div class="${styles.cluster}">
              <p class="${styles.controlLabel}">orbit</p>
              <div class="${styles.orbitRow}">
                <kbd class="${styles.key} ${styles.orbit}" data-action="orbitLeft">${iconSvg("orbitLeft", 10)}<span data-label></span></kbd>
                <kbd class="${styles.key} ${styles.orbit}" data-action="orbitRight">${iconSvg("orbitRight", 10)}<span data-label></span></kbd>
              </div>
            </div>
            <div class="${styles.cluster}">
              <p class="${styles.controlLabel}">zoom</p>
              <div class="${styles.orbitRow}">
                <kbd class="${styles.key} ${styles.orbit}" data-action="zoomOut">${iconSvg("minus", 10)}<span data-label></span></kbd>
                <kbd class="${styles.key} ${styles.orbit}" data-action="zoomIn">${iconSvg("plus", 10)}<span data-label></span></kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    this.mountSlot("winClose", createButton({
      icon: "close",
      ariaLabel: "Close victory screens",
      title: "Close",
      className: styles.winClose,
      data: { winClose: "" },
      onClick: () => this.callbacks.onWins(),
    }));
    this.mountSlot("home", createButton({
      icon: "home",
      ariaLabel: "Home",
      title: "Home",
      data: { home: "" },
      onClick: () => this.callbacks.onHome(),
    }));
    this.mountSlot("edit", createButton({
      icon: "edit",
      ariaLabel: "Edit level",
      title: "Edit & share",
      data: { edit: "" },
      onClick: () => this.callbacks.onEdit(),
    }));
    this.mountSlot("author", createButton({
      icon: "author",
      ariaLabel: "Author campaign",
      title: "Author campaign",
      data: { author: "" },
      onClick: () => this.callbacks.onAuthor(),
    }));
    this.mountSlot("wins", createButton({
      icon: "wins",
      ariaLabel: "Victory screens",
      title: "Victory screens",
      pressed: false,
      data: { wins: "" },
      onClick: () => this.callbacks.onWins(),
    }));
    this.mountSlot("settings", createButton({
      icon: "settings",
      ariaLabel: "Settings",
      title: "Settings",
      data: { settings: "" },
      onClick: () => this.callbacks.onSettings(),
    }));
    this.mountSlot("pause", createButton({
      icon: "pause",
      ariaLabel: "Pause",
      title: "Pause",
      className: styles.pauseBtn,
      hidden: true,
      data: { pause: "" },
      onClick: () => this.callbacks.onPause(),
    }));
    const controlsTrigger = createButton({
      icon: "keyboard",
      ariaLabel: "Keyboard controls",
      title: "Keyboard controls",
      className: styles.controlsBtn,
      data: { controlsTrigger: "" },
    });
    controlsTrigger.setAttribute("aria-expanded", "false");
    controlsTrigger.setAttribute("aria-controls", "hud-keyboard-controls");
    this.mountSlot("controls", controlsTrigger);

    this.timeEl = this.require("[data-time]");
    this.titleEl = this.require("[data-title]");
    this.floorEl = this.require("[data-floor]");
    this.noteEl = this.require("[data-note]");
    this.hint = this.require("[data-hint]");
    this.bubble = this.require("[data-bubble]");
    this.settingsBtn = this.require("[data-settings]");
    this.editBtn = this.require("[data-edit]");
    this.authorBtn = this.require("[data-author]");
    this.winsBtn = this.require("[data-wins]");
    this.pauseBtn = this.require("[data-pause]");
    this.livesEl = this.require("[data-lives]");
    this.lifeCount = this.require("[data-life-count]");
    this.heartsEl = this.require("[data-hearts]");
    this.coinsEl = this.require("[data-coins]");
    this.coinCount = this.require("[data-coin-count]");
    this.winGallery = this.require("[data-win-gallery]");
    this.winList = this.require("[data-win-list]");
    this.winList.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-win-index]");
      if (!button) return;
      const index = Number(button.dataset.winIndex);
      if (!Number.isFinite(index)) return;
      this.callbacks.onWinScene(index);
    });
    this.keycaps = [...this.root.querySelectorAll<HTMLElement>(`.${styles.controls} [data-action]`)];
    const controlsDock = this.require<HTMLElement>(`.${styles.controlsDock}`);
    const syncControlsOpen = (open: boolean): void => {
      controlsTrigger.setAttribute("aria-expanded", String(open));
      controlsDock.dataset.open = open ? "true" : "";
    };
    controlsDock.addEventListener("pointerenter", () => syncControlsOpen(true));
    controlsDock.addEventListener("pointerleave", () => syncControlsOpen(false));
    controlsDock.addEventListener("focusin", () => syncControlsOpen(true));
    controlsDock.addEventListener("focusout", (event) => {
      const next = event.relatedTarget as Node | null;
      if (next && controlsDock.contains(next)) return;
      syncControlsOpen(false);
    });
    this.setKeybinds(this.keybinds);
  }

  setKeybinds(binds: Keybinds): void {
    this.keybinds = { ...binds };
    for (const cap of this.keycaps) {
      const action = cap.dataset.action as KeyAction | undefined;
      if (!action || !(HUD_KEY_ACTIONS as readonly string[]).includes(action)) continue;
      const key = hudKeyForAction(this.keybinds, action);
      const label = formatKey(key);
      const labelEl = cap.querySelector<HTMLElement>("[data-label]");
      if (labelEl) labelEl.textContent = label;
      else cap.textContent = label;
    }
    this.setHeld(this.heldKeys);
  }

  setStats(seconds: number, drops: number): void {
    const time = formatTime(seconds);
    this.timeEl.textContent = drops > 0
      ? `${time} · ${drops} ${drops === 1 ? "drop" : "drops"}`
      : time;
  }

  setCampaign(active: boolean): void {
    this.editBtn.hidden = active;
    this.authorBtn.hidden = active;
    this.winsBtn.hidden = active;
  }

  /** Free-play pause control — opens the homemade level pause screen. */
  setPauseAvailable(on: boolean): void {
    this.pauseBtn.hidden = !on;
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

  setTitle(label: string): void {
    this.titleEl.textContent = label;
  }

  setFloor(current: number, total: number): void {
    if (total <= 1) {
      this.floorEl.hidden = true;
      return;
    }
    this.floorEl.hidden = false;
    this.floorEl.textContent = `Floor ${current} of ${total}`;
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
    this.heldKeys = keys;
    for (const cap of this.keycaps) {
      const action = cap.dataset.action as KeyAction | undefined;
      const on = !!action && actionHeld(this.keybinds, action, keys);
      cap.classList.toggle(styles.down, on);
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

  setWinGallery(open: boolean, scenes: readonly string[] = [], index = 0): void {
    this.winGallery.hidden = !open;
    if (!open) {
      this.winList.replaceChildren();
      return;
    }
    const meta = this.winGallery.querySelector<HTMLElement>("[data-win-meta]");
    if (meta) {
      meta.textContent = `${index + 1} / ${scenes.length} · [ ]`;
    }
    const existing = this.winList.childElementCount;
    if (existing !== scenes.length) {
      this.winList.replaceChildren(
        ...scenes.map((name, sceneIndex) => {
          const button = createButton({
            className: styles.winItem,
            data: { winIndex: String(sceneIndex) },
          });
          button.setAttribute("role", "option");
          button.textContent = name.charAt(0).toUpperCase() + name.slice(1);
          return button;
        }),
      );
    }
    for (const button of this.winList.querySelectorAll<HTMLButtonElement>("[data-win-index]")) {
      const selected = Number(button.dataset.winIndex) === index;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    }
  }

  private mountSlot(name: string, el: HTMLElement): void {
    this.require(`[data-slot="${name}"]`).replaceWith(el);
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}
