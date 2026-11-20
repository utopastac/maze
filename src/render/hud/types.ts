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
