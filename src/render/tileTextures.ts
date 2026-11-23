/** Play-board tile maps loaded from `texture-imports/` (PNG). */

import {
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import {
  FLOOR_THEMES,
  type FloorThemeId,
} from "../core/theme.ts";
import crumbleUrl from "../../texture-imports/crumble.png";
import boostUrl from "../../texture-imports/tiles/boost.png";
import goalUrl from "../../texture-imports/tiles/goal.png";
import iceUrl from "../../texture-imports/tiles/ice.png";
import switchUrl from "../../texture-imports/tiles/switch.png";
import warpUrl from "../../texture-imports/tiles/warp.png";
import castleFloorUrl from "../../texture-imports/themes/castle-floor.png";
import castleWallUrl from "../../texture-imports/themes/castle-wall.png";
import desertFloorUrl from "../../texture-imports/themes/desert-floor.png";
import desertWallUrl from "../../texture-imports/themes/desert-wall.png";
import futuristicFloorUrl from "../../texture-imports/themes/futuristic-floor.png";
import futuristicWallUrl from "../../texture-imports/themes/futuristic-wall.png";
import officeFloorUrl from "../../texture-imports/themes/office-floor.png";
import officeWallUrl from "../../texture-imports/themes/office-wall.png";
import suburbiaFloorUrl from "../../texture-imports/themes/suburbia-floor.png";
import suburbiaWallUrl from "../../texture-imports/themes/suburbia-wall.png";
import tombFloorUrl from "../../texture-imports/themes/tomb-floor.png";
import tombWallUrl from "../../texture-imports/themes/tomb-wall.png";

export const SPECIAL_TILES = ["boost", "warp", "ice", "switch", "goal"] as const;
export type SpecialTileId = (typeof SPECIAL_TILES)[number];

const THEME_FLOOR_URL: Record<FloorThemeId, string> = {
  futuristic: futuristicFloorUrl,
  desert: desertFloorUrl,
  castle: castleFloorUrl,
  tomb: tombFloorUrl,
  office: officeFloorUrl,
  suburbia: suburbiaFloorUrl,
};

const THEME_WALL_URL: Record<FloorThemeId, string> = {
  futuristic: futuristicWallUrl,
  desert: desertWallUrl,
  castle: castleWallUrl,
  tomb: tombWallUrl,
  office: officeWallUrl,
  suburbia: suburbiaWallUrl,
};

const SPECIAL_URL: Record<SpecialTileId, string> = {
  boost: boostUrl,
  warp: warpUrl,
  ice: iceUrl,
  switch: switchUrl,
  goal: goalUrl,
};

let crumble: Texture | null = null;
const floors = new Map<FloorThemeId, Texture>();
const walls = new Map<FloorThemeId, Texture>();
const specials = new Map<SpecialTileId, Texture>();
let loaded = false;

/** Vite URL for 2D editor / thumbnail CSS (`--maze-crumble-tex`). */
export function crumbleTextureUrl(): string {
  return crumbleUrl;
}

export async function loadTileTextures(): Promise<void> {
  if (loaded) return;
  const loader = new TextureLoader();
  crumble = configureCrumble(await loader.loadAsync(crumbleUrl));
  for (const id of FLOOR_THEMES) {
    floors.set(id, configureTheme(await loader.loadAsync(THEME_FLOOR_URL[id])));
    walls.set(id, configureTheme(await loader.loadAsync(THEME_WALL_URL[id])));
  }
  for (const id of SPECIAL_TILES) {
    specials.set(id, configureSpecial(await loader.loadAsync(SPECIAL_URL[id])));
  }
  loaded = true;
}

export function crumbleTexture(): Texture {
  return requireLoaded(crumble, "crumble");
}

export function themeFloorTexture(id: FloorThemeId): Texture {
  return requireLoaded(floors.get(id) ?? null, `${id} floor`);
}

export function themeWallTexture(id: FloorThemeId): Texture {
  return requireLoaded(walls.get(id) ?? null, `${id} wall`);
}

export function specialTileTexture(id: SpecialTileId): Texture {
  return requireLoaded(specials.get(id) ?? null, id);
}

function requireLoaded(tex: Texture | null, label: string): Texture {
  if (!tex) throw new Error(`Tile texture not loaded: ${label}`);
  return tex;
}

function configureCrumble(tex: Texture): Texture {
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function configureSpecial(tex: Texture): Texture {
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function configureTheme(tex: Texture): Texture {
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
