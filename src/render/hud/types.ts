export type PlayHudStats = {
  seconds: number | null;
  lives: number | null;
  coinsGot: number;
  coinsMax: number;
  titleText: string;
  floorText: string | null;
  pulseLives?: boolean;
  pulseCoins?: boolean;
};

export type PlayHudStartGate = {
  title: string;
  floors: number;
  lives: number | null;
  coins: number;
};

/** Win / loss result on the 3D HUD layer (title + primary / Quit). */
export type PlayHudResult = "win" | "loss";

export type PlayHudResultAction = "primary" | "leave";

export type PlayHudHomeAction =
  | "tower"
  | "play"
  | "create"
  | "saved"
  | "settings"
  | "towerNew"
  | "towerLoad"
  | "towerPractice"
  | "towerBack";

export type PlayHudHomeMenuMode = "main" | "tower";

/** Hit box in HUD buffer pixels (y grows down). */
export type HudHitBox = { x: number; y: number; w: number; h: number };
