import {
  SETTING_SPECS,
  pixelStep,
  type PlaySettings,
  type SettingGroup,
  type SettingKey,
} from "../core/playSettings.ts";
import styles from "./settingsPanel.module.css";

export interface SettingsPanelCallbacks {
  onClose: () => void;
}

const GROUPS: readonly SettingGroup[] = ["Controls", "Physics", "Camera", "Picture"];

export class SettingsPanel {
  private readonly host: HTMLElement;
  private readonly settings: PlaySettings;
  private readonly callbacks: SettingsPanelCallbacks;
  private readonly inputs = new Map<SettingKey, HTMLInputElement>();
  private readonly readouts = new Map<SettingKey, HTMLElement>();
  private invertInput: HTMLInputElement | null = null;

  constructor(host: HTMLElement, settings: PlaySettings, callbacks: SettingsPanelCallbacks) {
    this.host = host;
    this.settings = settings;
    this.callbacks = callbacks;
  }

  mount(): void {
    this.host.className = styles.panel;
    const groups = GROUPS.map((group) => `
      <section>
        <div class="sheet-section-label">${group}</div>
        <div class="${styles.fields}" data-group="${group}"></div>
      </section>
    `).join("");
    this.host.innerHTML = `
      <div class="${styles.bar}">
        <button type="button" class="${styles.done}" data-done>Done</button>
      </div>
      ${groups}
      <button type="button" class="glass-pill ${styles.defaults}" data-defaults>Defaults</button>
    `;

    for (const spec of SETTING_SPECS) {
      const slot = this.host.querySelector<HTMLElement>(`[data-group="${spec.group}"]`);
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
      if (spec.key === "pixels") input.step = String(pixelStep());
      input.addEventListener("input", () => {
        this.settings.set(spec.key, Number(input.value));
        readout.textContent = spec.format(this.settings.values[spec.key]);
      });
      this.inputs.set(spec.key, input);
      this.readouts.set(spec.key, readout);
      slot.appendChild(field);
    }

    const controls = this.host.querySelector<HTMLElement>('[data-group="Controls"]');
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

    this.host.querySelector("[data-done]")?.addEventListener("click", () => this.callbacks.onClose());
    this.host.querySelector("[data-defaults]")?.addEventListener("click", () => {
      this.settings.reset();
      this.refresh();
    });
    this.refresh();
  }

  refresh(): void {
    for (const spec of SETTING_SPECS) {
      const input = this.inputs.get(spec.key);
      const readout = this.readouts.get(spec.key);
      const value = this.settings.values[spec.key];
      if (input) {
        if (spec.key === "pixels") input.step = String(pixelStep());
        input.value = String(value);
      }
      if (readout) readout.textContent = spec.format(value);
    }
    if (this.invertInput) this.invertInput.checked = this.settings.invertY;
  }
}
