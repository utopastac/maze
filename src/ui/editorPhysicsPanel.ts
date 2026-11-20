import {
  PHYSICS_KEYS,
  SETTING_DEFAULTS,
  SETTING_SPECS,
  clampSetting,
  defaultFloorPhysics,
  type FloorPhysics,
  type PhysicsSettingKey,
} from "../core/playSettings.ts";
import { createRangeField, type RangeFieldController } from "./kit/index.ts";
import styles from "./editor.module.css";

export type EditorPhysicsHooks = {
  /** Called when a slider moves; host should `beginEdit` + write physics. */
  onValue: (key: PhysicsSettingKey, value: number) => void;
};

/** Floor physics sliders for the editor settings panel — uses kit range fields. */
export class EditorPhysicsPanel {
  private readonly fieldsRoot: HTMLElement;
  private readonly enable: HTMLInputElement;
  private readonly hooks: EditorPhysicsHooks;
  private readonly fields = new Map<PhysicsSettingKey, RangeFieldController>();

  constructor(
    roots: { fields: HTMLElement; enable: HTMLInputElement },
    hooks: EditorPhysicsHooks,
  ) {
    this.fieldsRoot = roots.fields;
    this.enable = roots.enable;
    this.hooks = hooks;
  }

  mount(): void {
    this.fieldsRoot.replaceChildren();
    this.fields.clear();
    for (const key of PHYSICS_KEYS) {
      const spec = SETTING_SPECS.find((item) => item.key === key);
      if (!spec) continue;
      const field = createRangeField({
        label: spec.label,
        min: spec.min,
        max: spec.max,
        step: spec.step,
        value: SETTING_DEFAULTS[key],
        format: spec.format,
        className: styles.physicsField,
        onInput: (value) => this.hooks.onValue(key, clampSetting(key, value)),
      });
      this.fields.set(key, field);
      this.fieldsRoot.append(field.root);
    }
  }

  /** Ensure draft physics exists (or clear it) and refresh controls. */
  applyEnabled(
    physics: FloorPhysics | undefined,
    enabled: boolean,
  ): FloorPhysics | undefined {
    if (enabled) return physics ?? defaultFloorPhysics();
    return undefined;
  }

  sync(physics: FloorPhysics | undefined): void {
    const enabled = Boolean(physics);
    this.enable.checked = enabled;
    this.fieldsRoot.classList.toggle(styles.physicsFieldsDimmed, !enabled);
    for (const key of PHYSICS_KEYS) {
      const spec = SETTING_SPECS.find((item) => item.key === key);
      if (!spec) continue;
      const value = physics?.[key] ?? SETTING_DEFAULTS[key];
      const field = this.fields.get(key);
      if (!field) continue;
      field.setValue(value);
      field.setDisabled(!enabled);
    }
  }

  /** Write one key; returns the physics object to assign onto the draft. */
  writeValue(
    physics: FloorPhysics | undefined,
    key: PhysicsSettingKey,
    value: number,
  ): FloorPhysics {
    const next = clampSetting(key, value);
    const draft = physics ?? defaultFloorPhysics();
    draft[key] = next;
    if (!this.enable.checked) this.enable.checked = true;
    return draft;
  }
}
