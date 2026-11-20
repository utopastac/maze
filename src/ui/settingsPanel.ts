import {
  formatKey,
  isBindableKey,
  KEY_ACTIONS,
  type KeyAction,
} from "../core/keybinds.ts";
import {
  SETTING_SPECS,
  pixelStep,
  type PlaySettings,
  type SettingGroup,
  type SettingKey,
} from "../core/playSettings.ts";
import { iconSvg, type IconName } from "./icons.ts";
import {
  createButton,
  createConfirmDialog,
  createRangeField,
  createScrim,
  createTabList,
  createToggle,
  playEnter,
  playExit,
  type RangeFieldController,
  type TabListController,
  type ToggleController,
} from "./kit/index.ts";
import styles from "./settingsPanel.module.css";

export interface SettingsPanelCallbacks {
  onSave: () => void;
}

const GROUPS: readonly SettingGroup[] = ["Controls", "Physics", "Camera", "Picture"];

const GROUP_ICONS: Record<SettingGroup, IconName> = {
  Controls: "keyboard",
  Physics: "gauge",
  Camera: "camera",
  Picture: "settings",
};

/** Full settings screen — not a floating sheet over play. */
export class SettingsPanel {
  private readonly root: HTMLElement;
  private readonly settings: PlaySettings;
  private readonly callbacks: SettingsPanelCallbacks;
  private readonly ranges = new Map<SettingKey, RangeFieldController>();
  private readonly panels = new Map<SettingGroup, HTMLElement>();
  private tabList: TabListController<SettingGroup> | null = null;
  private invertToggle: ToggleController | null = null;
  private normalToggle: ToggleController | null = null;
  private confirmRoot: HTMLElement | null = null;
  private confirm: ReturnType<typeof createConfirmDialog> | null = null;
  private confirmOk: HTMLButtonElement | null = null;
  private keybindButtons = new Map<KeyAction, HTMLButtonElement>();
  private keybindHint: HTMLElement | null = null;
  private listening: KeyAction | null = null;
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
    const panels = GROUPS.map((group, index) => `
      <section
        class="${styles.panel}"
        role="tabpanel"
        id="settings-tab-panel-${index}"
        data-panel="${group}"
        aria-labelledby="settings-tab-${index}"
        ${group === this.active ? "" : "hidden"}
      >
        <div class="${styles.fields}" data-group="${group}"></div>
      </section>
    `).join("");
    this.root.innerHTML = `
      <span data-slot="scrim"></span>
      <div class="${styles.card}">
        <header class="${styles.head}">
          <h2 class="${styles.title}">Settings</h2>
          <div class="${styles.headActions}">
            <span data-slot="defaults"></span>
            <span data-slot="save"></span>
            <span data-slot="close"></span>
          </div>
        </header>
        <div class="${styles.main}">
          <aside class="${styles.side}">
            <h3 class="${styles.sideTitle}">Sections</h3>
            <span data-slot="tabs"></span>
          </aside>
          <div class="${styles.body}">
            <div class="${styles.controls}">
              ${panels}
            </div>
          </div>
        </div>
      </div>
      <span data-slot="confirm"></span>
    `;

    const tabList = createTabList<SettingGroup>({
      items: GROUPS.map((group) => ({
        id: group,
        label: group,
        title: group,
        iconHtml: iconSvg(GROUP_ICONS[group]),
      })),
      active: this.active,
      label: "Settings sections",
      orientation: "vertical",
      idPrefix: "settings-tab",
      onChange: (group) => this.selectGroup(group),
    });
    this.tabList = tabList;
    this.mountSlot("tabs", tabList.root);
    tabList.root.addEventListener("keydown", tabList.onKeyDown);

    for (const group of GROUPS) {
      const panel = this.root.querySelector<HTMLElement>(`[data-panel="${group}"]`);
      if (panel) this.panels.set(group, panel);
    }

    for (const spec of SETTING_SPECS) {
      const slot = this.root.querySelector<HTMLElement>(`[data-group="${spec.group}"]`);
      if (!slot) continue;
      const field = createRangeField({
        label: spec.label,
        min: spec.min,
        max: spec.max,
        step: isPixelKey(spec.key) ? pixelStep() : spec.step,
        value: this.settings.values[spec.key],
        format: spec.format,
        onInput: (value) => this.settings.set(spec.key, value),
      });
      this.ranges.set(spec.key, field);
      slot.appendChild(field.root);
    }

    const controls = this.root.querySelector<HTMLElement>('[data-group="Controls"]');
    if (controls) {
      const toggle = createToggle({
        label: "Reverse Y",
        onChange: (checked) => this.settings.setInvertY(checked),
      });
      this.invertToggle = toggle;
      controls.appendChild(toggle.root);
      this.mountKeybinds(controls);
    }

    const picture = this.root.querySelector<HTMLElement>('[data-group="Picture"]');
    if (picture) {
      const toggle = createToggle({
        label: "Normal look",
        onChange: (checked) => this.settings.setNormalLook(checked),
      });
      this.normalToggle = toggle;
      picture.prepend(toggle.root);
    }

    const leave = (): void => {
      if (this.confirmOpen()) {
        this.hideResetConfirm();
        return;
      }
      this.callbacks.onSave();
    };
    this.mountSlot("defaults", createButton({
      label: "Reset to defaults",
      className: styles.defaults,
      data: { defaults: "" },
      onClick: () => this.openResetConfirm(),
    }));
    this.mountSlot("save", createButton({
      label: "Done",
      tone: "accent",
      className: styles.save,
      data: { save: "" },
      onClick: leave,
    }));
    this.mountSlot("close", createButton({
      icon: "close",
      ariaLabel: "Close settings",
      className: styles.close,
      data: { close: "" },
      onClick: leave,
    }));
    const confirm = createConfirmDialog({
      titleId: "settings-confirm-title",
      bodyId: "settings-confirm-body",
      title: "Reset to defaults?",
      body: "This will replace your current settings with the factory defaults.",
      confirmLabel: "Reset",
      onCancel: () => this.hideResetConfirm(),
      onConfirm: () => this.commitResetConfirm(),
    });
    this.confirm = confirm;
    this.mountSlot("confirm", confirm.root);
    this.confirmRoot = confirm.root;
    this.confirmOk = confirm.root.querySelector<HTMLButtonElement>("[data-confirm-ok]");
    const scrim = createScrim({ className: styles.scrim, data: "scrim" });
    scrim.addEventListener("click", leave);
    this.mountSlot("scrim", scrim);
    window.addEventListener("keydown", this.onListenKey, true);
    this.selectGroup(this.active);
    this.refresh();
  }

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.hideResetConfirm();
    this.selectGroup(this.active);
    this.refresh();
    playEnter(this.root);
  }

  hide(): void {
    this.open = false;
    this.stopListening();
    this.hideResetConfirm();
    playExit(this.root);
  }

  private mountSlot(name: string, el: HTMLElement): void {
    this.root.querySelector(`[data-slot="${name}"]`)?.replaceWith(el);
  }

  private confirmOpen(): boolean {
    return !!this.confirmRoot && !this.confirmRoot.hidden;
  }

  private openResetConfirm(): void {
    if (!this.confirmRoot) return;
    this.confirm?.show();
    this.confirmOk?.focus();
  }

  private hideResetConfirm(): void {
    this.confirm?.hide();
  }

  private commitResetConfirm(): void {
    this.hideResetConfirm();
    this.settings.reset();
    this.refresh();
  }

  refresh(): void {
    const normal = this.settings.normalLook;
    for (const spec of SETTING_SPECS) {
      const field = this.ranges.get(spec.key);
      if (!field) continue;
      const dim = (isPixelKey(spec.key) || spec.key === "shade") && normal;
      if (isPixelKey(spec.key)) field.setStep(pixelStep());
      field.setValue(this.settings.values[spec.key]);
      field.setDisabled(dim);
      field.setDimmed(dim);
    }
    this.invertToggle?.setChecked(this.settings.invertY);
    this.normalToggle?.setChecked(normal);
    this.refreshKeybinds();
  }

  private mountKeybinds(controls: HTMLElement): void {
    const section = document.createElement("div");
    section.className = styles.keys;
    section.innerHTML = `
      <div class="${styles.keysHead}">
        <div>
          <p class="${styles.keysTitle}">Keyboard</p>
          <p class="${styles.keysHint}" data-keybind-hint>Click a key, then press a new one.</p>
        </div>
        <span data-slot="resetKeys"></span>
      </div>
      <div class="${styles.keysList}" data-keybind-list></div>
    `;
    const list = section.querySelector<HTMLElement>("[data-keybind-list]");
    this.keybindHint = section.querySelector("[data-keybind-hint]");
    section.querySelector('[data-slot="resetKeys"]')?.replaceWith(createButton({
      label: "Reset keys",
      className: styles.keysReset,
      data: { resetKeys: "" },
      onClick: () => {
        this.stopListening();
        this.settings.resetKeybinds();
        this.refreshKeybinds();
      },
    }));
    if (list) {
      let cluster = "";
      for (const action of KEY_ACTIONS) {
        if (action.cluster !== cluster) {
          cluster = action.cluster;
          const heading = document.createElement("p");
          heading.className = styles.keysCluster;
          heading.textContent = cluster;
          list.appendChild(heading);
        }
        const row = document.createElement("div");
        row.className = styles.keyRow;
        row.innerHTML = `
          <span class="${styles.keyLabel}">${action.label}</span>
          <button type="button" class="${styles.keyBind}" data-keybind="${action.id}" aria-label="Remap ${action.label}"></button>
        `;
        const button = row.querySelector<HTMLButtonElement>("[data-keybind]");
        if (button) {
          button.addEventListener("click", () => this.startListening(action.id));
          this.keybindButtons.set(action.id, button);
        }
        list.appendChild(row);
      }
    }
    controls.appendChild(section);
  }

  private refreshKeybinds(): void {
    for (const action of KEY_ACTIONS) {
      const button = this.keybindButtons.get(action.id);
      if (!button) continue;
      const listening = this.listening === action.id;
      button.classList.toggle(styles.keyListening, listening);
      button.textContent = listening ? "Press key…" : formatKey(this.settings.keybinds[action.id]);
      button.setAttribute("aria-pressed", listening ? "true" : "false");
    }
    if (this.keybindHint) {
      this.keybindHint.textContent = this.listening
        ? "Press a key, or Esc to cancel."
        : "Click a key, then press a new one.";
    }
  }

  private startListening(action: KeyAction): void {
    this.listening = this.listening === action ? null : action;
    this.refreshKeybinds();
    if (this.listening) this.keybindButtons.get(action)?.focus();
  }

  private stopListening(): void {
    if (!this.listening) return;
    this.listening = null;
    this.refreshKeybinds();
  }

  private onListenKey = (event: KeyboardEvent): void => {
    if (!this.open || !this.listening) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      this.stopListening();
      return;
    }
    if (event.repeat || !isBindableKey(event.key)) return;
    const action = this.listening;
    this.listening = null;
    this.settings.setKeybind(action, event.key);
    this.refreshKeybinds();
  };

  private selectGroup(group: SettingGroup): void {
    this.active = group;
    this.tabList?.setActive(group);
    for (const name of GROUPS) {
      const panel = this.panels.get(name);
      if (panel) panel.hidden = name !== group;
    }
  }
}

function isPixelKey(key: SettingKey): boolean {
  return key === "pixels" || key === "uiPixels";
}
