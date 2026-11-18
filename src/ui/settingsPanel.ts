import {
  SETTING_SPECS,
  pixelStep,
  type PlaySettings,
  type SettingGroup,
  type SettingKey,
} from "../core/playSettings.ts";
import styles from "./settingsPanel.module.css";

export interface SettingsPanelCallbacks {
  onSave: () => void;
}

const GROUPS: readonly SettingGroup[] = ["Controls", "Physics", "Camera", "Picture"];

/** Full settings screen — not a floating sheet over play. */
export class SettingsPanel {
  private readonly root: HTMLElement;
  private readonly settings: PlaySettings;
  private readonly callbacks: SettingsPanelCallbacks;
  private readonly inputs = new Map<SettingKey, HTMLInputElement>();
  private readonly readouts = new Map<SettingKey, HTMLElement>();
  private readonly fields = new Map<SettingKey, HTMLElement>();
  private readonly panels = new Map<SettingGroup, HTMLElement>();
  private readonly tabs = new Map<SettingGroup, HTMLButtonElement>();
  private invertInput: HTMLInputElement | null = null;
  private normalInput: HTMLInputElement | null = null;
  private active: SettingGroup = "Controls";
  private open = false;
  private mounted = false;

  constructor(root: HTMLElement, settings: PlaySettings, callbacks: SettingsPanelCallbacks) {
    this.root = root;
    this.settings = settings;
    this.callbacks = callbacks;
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.root.className = styles.root;
    const tabs = GROUPS.map((group, index) => `
      <button
        type="button"
        class="${styles.tab}"
        role="tab"
        id="settings-tab-${index}"
        data-tab="${group}"
        aria-controls="settings-panel-${index}"
        aria-selected="${group === this.active ? "true" : "false"}"
      >${group}</button>
    `).join("");
    const panels = GROUPS.map((group, index) => `
      <section
        class="${styles.panel}"
        role="tabpanel"
        id="settings-panel-${index}"
        data-panel="${group}"
        aria-labelledby="settings-tab-${index}"
        ${group === this.active ? "" : "hidden"}
      >
        <div class="${styles.fields}" data-group="${group}"></div>
      </section>
    `).join("");
    this.root.innerHTML = `
      <div class="${styles.page}">
        <header class="${styles.head}">
          <h1 class="${styles.title}">Settings</h1>
        </header>
        <div
          class="${styles.segments}"
          role="tablist"
          aria-label="Settings sections"
          data-tabs
        >${tabs}</div>
        <div class="${styles.body}">
          ${panels}
        </div>
        <div class="${styles.footer}">
          <button type="button" class="glass-pill ${styles.defaults}" data-defaults>Defaults</button>
          <button type="button" class="glass-pill metal-ring ${styles.save}" data-save>Done</button>
        </div>
      </div>
    `;

    for (const group of GROUPS) {
      const tab = this.root.querySelector<HTMLButtonElement>(`[data-tab="${group}"]`);
      const panel = this.root.querySelector<HTMLElement>(`[data-panel="${group}"]`);
      if (tab) {
        this.tabs.set(group, tab);
        tab.addEventListener("click", () => this.selectGroup(group));
      }
      if (panel) this.panels.set(group, panel);
    }

    for (const spec of SETTING_SPECS) {
      const slot = this.root.querySelector<HTMLElement>(`[data-group="${spec.group}"]`);
      if (!slot) continue;
      const field = document.createElement("div");
      field.className = "field";
      field.innerHTML = `
        <label><span>${spec.label}</span><span data-readout></span></label>
        <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" aria-label="${spec.label}" />
      `;
      const input = field.querySelector("input");
      const readout = field.querySelector<HTMLElement>("[data-readout]");
      if (!input || !readout) continue;
      if (spec.key === "pixels" || spec.key === "uiPixels") input.step = String(pixelStep());
      input.addEventListener("input", () => {
        this.settings.set(spec.key, Number(input.value));
        readout.textContent = spec.format(this.settings.values[spec.key]);
      });
      this.inputs.set(spec.key, input);
      this.readouts.set(spec.key, readout);
      this.fields.set(spec.key, field);
      slot.appendChild(field);
    }

    const controls = this.root.querySelector<HTMLElement>('[data-group="Controls"]');
    if (controls) {
      const field = document.createElement("label");
      field.className = styles.toggle;
      field.innerHTML = `
        <span>Reverse Y</span>
        <input type="checkbox" aria-label="Reverse Y" />
        <span class="${styles.switch}" aria-hidden="true"></span>
      `;
      const input = field.querySelector("input");
      if (input) {
        input.addEventListener("change", () => {
          this.settings.setInvertY(input.checked);
        });
        this.invertInput = input;
        controls.appendChild(field);
      }
    }

    const picture = this.root.querySelector<HTMLElement>('[data-group="Picture"]');
    if (picture) {
      const field = document.createElement("label");
      field.className = styles.toggle;
      field.innerHTML = `
        <span>Normal look</span>
        <input type="checkbox" aria-label="Normal look" />
        <span class="${styles.switch}" aria-hidden="true"></span>
      `;
      const input = field.querySelector("input");
      if (input) {
        input.addEventListener("change", () => {
          this.settings.setNormalLook(input.checked);
        });
        this.normalInput = input;
        picture.prepend(field);
      }
    }

    this.root.querySelector("[data-save]")?.addEventListener("click", () => this.callbacks.onSave());
    this.root.querySelector("[data-defaults]")?.addEventListener("click", () => {
      this.settings.reset();
      this.refresh();
    });
    this.root.querySelector("[data-tabs]")?.addEventListener("keydown", (event) => {
      this.onTabKey(event as KeyboardEvent);
    });
    this.selectGroup(this.active);
    this.refresh();
  }

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.selectGroup(this.active);
    this.refresh();
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    this.open = false;
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  refresh(): void {
    const normal = this.settings.normalLook;
    for (const spec of SETTING_SPECS) {
      const input = this.inputs.get(spec.key);
      const readout = this.readouts.get(spec.key);
      const field = this.fields.get(spec.key);
      const value = this.settings.values[spec.key];
      const pictureSlider =
        spec.key === "pixels" || spec.key === "uiPixels" || spec.key === "shade";
      if (input) {
        if (spec.key === "pixels" || spec.key === "uiPixels") input.step = String(pixelStep());
        input.value = String(value);
        input.disabled = pictureSlider && normal;
      }
      if (field) field.classList.toggle(styles.dimmed, Boolean(pictureSlider && normal));
      if (readout) readout.textContent = spec.format(value);
    }
    if (this.invertInput) this.invertInput.checked = this.settings.invertY;
    if (this.normalInput) this.normalInput.checked = normal;
  }

  private selectGroup(group: SettingGroup): void {
    this.active = group;
    for (const name of GROUPS) {
      const tab = this.tabs.get(name);
      const panel = this.panels.get(name);
      const on = name === group;
      if (tab) {
        tab.classList.toggle(styles.tabActive, on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
      }
      if (panel) panel.hidden = !on;
    }
  }

  private onTabKey = (event: KeyboardEvent): void => {
    const index = GROUPS.indexOf(this.active);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % GROUPS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + GROUPS.length) % GROUPS.length;
    } else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = GROUPS.length - 1;
    else return;
    event.preventDefault();
    const group = GROUPS[next];
    if (!group) return;
    this.selectGroup(group);
    this.tabs.get(group)?.focus();
  };
}
