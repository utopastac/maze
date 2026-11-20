import type { BufferGeometry, MeshStandardMaterial, PerspectiveCamera } from "three";
import { SETTING_DEFAULTS } from "../../core/playSettings.ts";
import {
  makeCoinGeo,
  makeCoinMaterial,
  makeHeartGeo,
  makeHeartMaterials,
} from "../collectibleMeshes.ts";
import { stdMat, tokenColor } from "./util.ts";

/** Shared geometry + materials for hearts and coins across HUD sections. */
export type HudAssets = {
  heartGeo: BufferGeometry;
  coinGeo: BufferGeometry;
  heartOutlineMat: MeshStandardMaterial;
  heartBodyMat: MeshStandardMaterial;
  heartShadeMat: MeshStandardMaterial;
  coinMat: MeshStandardMaterial;
  emptyCoinMat: MeshStandardMaterial;
};

export function createHudAssets(): HudAssets {
  const heart = tokenColor("--maze-heart", "#e84555");
  const coin = tokenColor("--maze-coin", "#f0c43a");
  const shine = tokenColor("--maze-coin-shine", "#ffe9a0");

  const heartMats = makeHeartMaterials(heart);
  const coinMat = makeCoinMaterial(coin, shine);
  // Uncollected slots: solid dull grey, no glow.
  const emptyCoinMat = stdMat("#6a6d74", "#2e3036", 0.02);
  emptyCoinMat.metalness = 0.15;
  emptyCoinMat.roughness = 0.85;

  return {
    heartGeo: makeHeartGeo(),
    coinGeo: makeCoinGeo(),
    heartOutlineMat: heartMats.outline,
    heartBodyMat: heartMats.body,
    heartShadeMat: heartMats.shade,
    coinMat,
    emptyCoinMat,
  };
}

/**
 * Mutable view state shared by every HUD section (home menu, start gate, play
 * stats, fx). The facade owns writes to the view fields; sections read them.
 */
export class HudContext {
  readonly canvas: HTMLCanvasElement;
  readonly camera: PerspectiveCamera;
  readonly assets: HudAssets;
  shown = false;
  bufferW = 1;
  bufferH = 1;
  /** World units per buffer pixel (frustum height / bufferH). */
  viewScale = 1;
  /** CSS pixels per buffer pixel from the UI pixels setting. */
  uiScale = 1;
  normalLook = false;
  layoutDirty = true;

  constructor(canvas: HTMLCanvasElement, camera: PerspectiveCamera, assets: HudAssets) {
    this.canvas = canvas;
    this.camera = camera;
    this.assets = assets;
  }

  /**
   * World units per design pixel. Anchored to the default UI pixels value so the
   * stock layout size is unchanged; other settings only change chunkiness.
   */
  designScale(): number {
    const baseline = Math.max(SETTING_DEFAULTS.uiPixels, 1e-6);
    return this.viewScale * (baseline / Math.max(this.uiScale, 1e-6));
  }

  /** CSS client coords → HUD buffer pixels, or null when the canvas has no size. */
  clientToBuffer(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * this.bufferW,
      y: ((clientY - rect.top) / rect.height) * this.bufferH,
    };
  }
}
