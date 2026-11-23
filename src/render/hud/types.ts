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

/** Out-of-hearts result card on the 3D HUD layer. */
export type PlayHudLoss = {
  floor: number;
  total: number;
  seconds: number;
  /** Campaign runs also offer a Home CTA. */
  showLeave: boolean;
};

export type PlayHudLossAction = "retry" | "leave";

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
