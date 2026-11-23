import { CELL } from "../core/layout.ts";

export const HOME_TOWER_LAYERS = 100;
export const HOME_LAYER_H = 0.145;
export const HOME_TOWER_H = HOME_TOWER_LAYERS * HOME_LAYER_H;
export const HOME_BACKDROP_SPAN = CELL * 7;

/** Horizon-filling ocean plane around the home island (world units). */
export const HOME_OCEAN_SIZE = 420;
/** Island rock pad diameter vs playable tower span (smaller = more sea). */
export const HOME_ISLAND_SPAN_MULT = 2.15;

/** Title-screen: start far from the storm tower, then fly in to the menu shot. */
export const HOME_ARRIVE_SECS = 3.1;
/** Distance multiplier at arrive t=0 (settled menu shot is 1). */
export const HOME_ARRIVE_FAR = 12;
/** Extra eye height (× HOME_TOWER_H) at arrive t=0 — drops as we settle. */
export const HOME_ARRIVE_LIFT = 1.65;

/** Zoom door → curtains open on a distant board → dolly into play orbit. */
export const ENTER_PLAY_SECS = 3.6;
/** Door fills the screen — mount play, open curtains onto the far board. */
export const ENTER_PLAY_SWAP = 0.42;
/**
 * Free-play hatch dive: longer pre-swap so we can skim low across the water,
 * read the palms, then arc up and dive into the trapdoor before the cut.
 */
export const ENTER_FREE_SECS = 6.6;
/** Fraction of free-play enter spent approaching the hatch (rest is post-cut dolly). */
export const ENTER_FREE_SWAP = 0.7;
/** How far past the play orbit the post-door reveal starts (board reads small). */
export const ENTER_PLAY_FAR = 2.85;
/** Fraction of the post-swap beat spent opening curtains before/during the zoom. */
export const ENTER_PLAY_CURTAIN = 0.28;
/** Sky gradient zoom at the door (subtle push-in). */
export const ENTER_PLAY_SKY_ZOOM_DOOR = 1.08;
/** Sky gradient zoom as we settle on the board (parallax vs the dolly). */
export const ENTER_PLAY_SKY_ZOOM_PLAY = 1.2;
export const ENTER_CURTAIN_W = 2.6;
export const ENTER_CURTAIN_H = 2.6;
export const ENTER_CURTAIN_Z = -0.32;
