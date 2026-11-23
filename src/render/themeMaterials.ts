import {
  MeshToonMaterial,
  type DataTexture,
  type Texture,
} from "three";
import {
  FLOOR_THEME_META,
  FLOOR_THEMES,
  type FloorThemeId,
} from "../core/theme.ts";
import {
  themeFloorTexture,
  themeWallTexture,
} from "./tileTextures.ts";

export type ThemeSurfaces = {
  floor: MeshToonMaterial;
  wall: MeshToonMaterial;
  grout: MeshToonMaterial;
  frame: MeshToonMaterial;
  start: MeshToonMaterial;
  glass: MeshToonMaterial;
};

export function makeThemeSurfaces(ramp: DataTexture): Map<FloorThemeId, ThemeSurfaces> {
  const map = new Map<FloorThemeId, ThemeSurfaces>();
  for (const id of FLOOR_THEMES) {
    const meta = FLOOR_THEME_META[id];
    const floorMap = themeFloorTexture(id);
    const wallMap = themeWallTexture(id);
    const floor = toonMap("#ffffff", floorMap, ramp);
    const wall = toonMap("#ffffff", wallMap, ramp);
    const grout = toonSolid(token(meta.grout), ramp);
    const frame = toonSolid(token(meta.frame), ramp);
    const start = toonMap(token("--maze-start"), floorMap, ramp);
    const glass = frame.clone();
    glass.transparent = true;
    glass.opacity = 0.18;
    glass.depthWrite = false;
    map.set(id, { floor, wall, grout, frame, start, glass });
  }
  return map;
}

function toonMap(color: string, map: Texture, ramp: DataTexture): MeshToonMaterial {
  return new MeshToonMaterial({
    color,
    map,
    gradientMap: ramp,
  });
}

function toonSolid(color: string, ramp: DataTexture): MeshToonMaterial {
  return new MeshToonMaterial({
    color,
    gradientMap: ramp,
  });
}

function token(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value.length === 0) throw new Error(`Missing CSS token ${name}`);
  return value;
}
