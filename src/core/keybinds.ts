export const KEY_ACTIONS = [
  { id: "tiltUp", label: "Tilt up", cluster: "Move" },
  { id: "tiltDown", label: "Tilt down", cluster: "Move" },
  { id: "tiltLeft", label: "Tilt left", cluster: "Move" },
  { id: "tiltRight", label: "Tilt right", cluster: "Move" },
  { id: "angleDown", label: "Angle down", cluster: "Camera" },
  { id: "angleUp", label: "Angle up", cluster: "Camera" },
  { id: "orbitLeft", label: "Orbit left", cluster: "Camera" },
  { id: "orbitRight", label: "Orbit right", cluster: "Camera" },
  { id: "zoomOut", label: "Zoom out", cluster: "Camera" },
  { id: "zoomIn", label: "Zoom in", cluster: "Camera" },
] as const;

export type KeyAction = (typeof KEY_ACTIONS)[number]["id"];

export type Keybinds = Record<KeyAction, string>;

/** Primary bind per action. WASD stay as soft aliases while move uses arrow defaults. */
export const KEY_DEFAULTS: Keybinds = {
  tiltUp: "arrowup",
  tiltDown: "arrowdown",
  tiltLeft: "arrowleft",
  tiltRight: "arrowright",
  angleDown: "q",
  angleUp: "e",
  orbitLeft: "z",
  orbitRight: "c",
  zoomOut: "-",
  zoomIn: "=",
};

/** Extra keys that mirror move while the primary is still the default arrow. */
const MOVE_ALIASES: Partial<Record<KeyAction, string>> = {
  tiltUp: "w",
  tiltDown: "s",
  tiltLeft: "a",
  tiltRight: "d",
};

const SHIFT_TWINS: Record<string, string> = {
  "-": "_",
  _: "-",
  "=": "+",
  "+": "=",
};

const BLOCKED_KEYS = new Set([
  "escape",
  "tab",
  "meta",
  "control",
  "alt",
  "shift",
  "dead",
  "compose",
  "process",
  "unidentified",
]);

export function cloneKeybinds(binds: Keybinds = KEY_DEFAULTS): Keybinds {
  return { ...binds };
}

export function normalizeKey(raw: string): string {
  const key = raw.toLowerCase();
  if (key === "+") return "=";
  if (key === "_") return "-";
  return key;
}

export function isBindableKey(raw: string): boolean {
  const key = normalizeKey(raw);
  if (!key || BLOCKED_KEYS.has(key)) return false;
  if (key.startsWith("f") && /^f\d{1,2}$/.test(key)) return false;
  return true;
}

export function formatKey(raw: string): string {
  const key = normalizeKey(raw);
  switch (key) {
    case "arrowup":
      return "↑";
    case "arrowdown":
      return "↓";
    case "arrowleft":
      return "←";
    case "arrowright":
      return "→";
    case " ":
      return "Space";
    case "-":
      return "-";
    case "=":
      return "+";
    default:
      if (key.length === 1) return key.toUpperCase();
      return key.replace(/(^| )\w/g, (chunk) => chunk.toUpperCase());
  }
}

export function parseKeybinds(raw: unknown): Keybinds {
  const next = cloneKeybinds();
  if (!raw || typeof raw !== "object") return next;
  const record = raw as Partial<Record<KeyAction, unknown>>;
  for (const action of KEY_ACTIONS) {
    const value = record[action.id];
    if (typeof value !== "string" || !isBindableKey(value)) continue;
    next[action.id] = normalizeKey(value);
  }
  return dedupeKeybinds(next);
}

/** Keep one owner per key; earlier actions in KEY_ACTIONS win, rest fall back to defaults. */
export function dedupeKeybinds(binds: Keybinds): Keybinds {
  const next = cloneKeybinds(binds);
  const used = new Set<string>();
  for (const action of KEY_ACTIONS) {
    let key = normalizeKey(next[action.id]);
    if (!isBindableKey(key) || used.has(key)) {
      key = KEY_DEFAULTS[action.id];
      if (used.has(key)) {
        // Find any free default-like fallback; skip if somehow exhausted.
        const fallback = KEY_ACTIONS.map((item) => KEY_DEFAULTS[item.id]).find((item) => !used.has(item));
        key = fallback ?? key;
      }
    }
    next[action.id] = key;
    used.add(key);
  }
  return next;
}

export function setKeybind(binds: Keybinds, action: KeyAction, raw: string): Keybinds {
  const key = normalizeKey(raw);
  if (!isBindableKey(key)) return cloneKeybinds(binds);
  const next = cloneKeybinds(binds);
  for (const item of KEY_ACTIONS) {
    if (item.id !== action && next[item.id] === key) next[item.id] = binds[action];
  }
  next[action] = key;
  return next;
}

export function keysForAction(binds: Keybinds, action: KeyAction): string[] {
  const primary = normalizeKey(binds[action]);
  const keys = [primary];
  const twin = SHIFT_TWINS[primary];
  if (twin) keys.push(twin);
  const alias = MOVE_ALIASES[action];
  if (alias && primary === KEY_DEFAULTS[action]) keys.push(alias);
  return keys;
}

export function actionHeld(binds: Keybinds, action: KeyAction, held: ReadonlySet<string>): boolean {
  return keysForAction(binds, action).some((key) => held.has(key));
}

export function anyTiltHeld(binds: Keybinds, held: ReadonlySet<string>): boolean {
  return (
    actionHeld(binds, "tiltUp", held)
    || actionHeld(binds, "tiltDown", held)
    || actionHeld(binds, "tiltLeft", held)
    || actionHeld(binds, "tiltRight", held)
  );
}

export function isCameraKey(binds: Keybinds, key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    keysForAction(binds, "angleDown").includes(normalized)
    || keysForAction(binds, "angleUp").includes(normalized)
    || keysForAction(binds, "orbitLeft").includes(normalized)
    || keysForAction(binds, "orbitRight").includes(normalized)
    || keysForAction(binds, "zoomOut").includes(normalized)
    || keysForAction(binds, "zoomIn").includes(normalized)
  );
}

export function hudKeyForAction(binds: Keybinds, action: KeyAction): string {
  return normalizeKey(binds[action]);
}
