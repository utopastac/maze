import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  MeshToonMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type DataTexture,
  type Texture,
} from "three";
import {
  FLOOR_THEME_META,
  FLOOR_THEMES,
  type FloorThemeId,
} from "../core/theme.ts";

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
    const floorMap = paintThemeTexture(id, "floor");
    const wallMap = paintThemeTexture(id, "wall");
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

function paintThemeTexture(id: FloorThemeId, kind: "floor" | "wall"): Texture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Theme texture canvas unavailable");
  if (kind === "floor") paintFloorTheme(ctx, size, id);
  else paintWallTheme(ctx, size, id);
  const tex = new CanvasTexture(canvas);
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

function paintFloorTheme(ctx: CanvasRenderingContext2D, size: number, id: FloorThemeId): void {
  const vars = themeVars(id);
  ctx.fillStyle = vars.floor;
  ctx.fillRect(0, 0, size, size);

  if (id === "futuristic") {
    // Soft panel: thick seams, chunky corner dots — no 1px grids.
    fillBorder(ctx, size, vars.floorShade, 2);
    ctx.fillStyle = vars.floorLit;
    ctx.fillRect(6, 6, size - 12, size - 12);
    ctx.fillStyle = vars.floorLine;
    ctx.fillRect(4, 4, 3, 3);
    ctx.fillRect(size - 7, 4, 3, 3);
    ctx.fillRect(4, size - 7, 3, 3);
    ctx.fillRect(size - 7, size - 7, 3, 3);
    return;
  }

  if (id === "desert") {
    // Broad sand bands with sparse speckles.
    ctx.fillStyle = vars.floorLit;
    ctx.fillRect(0, 0, size, 10);
    ctx.fillStyle = vars.floor;
    ctx.fillRect(0, 10, size, 12);
    ctx.fillStyle = vars.floorShade;
    ctx.fillRect(0, 22, size, 10);
    softSpeckles(ctx, size, vars.floorShade, 0.08, 2);
    softSpeckles(ctx, size, vars.floorLit, 0.06, 2);
    return;
  }

  if (id === "castle") {
    // Two large flagstones — thick mortar, low frequency.
    ctx.fillStyle = vars.floorLit;
    ctx.fillRect(0, 0, 15, 15);
    ctx.fillStyle = vars.floorShade;
    ctx.fillRect(17, 0, 15, 15);
    ctx.fillStyle = vars.floorShade;
    ctx.fillRect(0, 17, 15, 15);
    ctx.fillStyle = vars.floorLit;
    ctx.fillRect(17, 17, 15, 15);
    ctx.fillStyle = vars.floorLine;
    ctx.fillRect(14, 0, 4, size);
    ctx.fillRect(0, 14, size, 4);
    return;
  }

  if (id === "tomb") {
    // one carved slab with a mossy edge and a simple relief
    ctx.fillStyle = vars.floorLit;
    ctx.fillRect(3, 3, size - 6, size - 6);
    ctx.fillStyle = vars.floorShade;
    ctx.fillRect(8, 8, 6, 6);
    ctx.fillRect(18, 16, 4, 4);
    fillBorder(ctx, size, vars.floorLine, 3);
    ctx.fillStyle = vars.floorShade;
    ctx.fillRect(0, 0, size, 3);
    ctx.fillRect(0, size - 3, size, 3);
    return;
  }

  if (id === "office") {
    // carpet tile: two soft fields with a thick seam
    ctx.fillStyle = vars.floorLit;
    ctx.fillRect(0, 0, 15, size);
    ctx.fillStyle = vars.floorShade;
    ctx.fillRect(17, 0, 15, size);
    ctx.fillStyle = vars.floorLine;
    ctx.fillRect(14, 0, 4, size);
    softSpeckles(ctx, size, vars.floor, 0.05, 2);
    return;
  }

  // suburbia — lawn with a chunky driveway strip
  ctx.fillStyle = vars.floorLit;
  ctx.fillRect(0, 0, size, 12);
  ctx.fillStyle = vars.floor;
  ctx.fillRect(0, 12, size, 10);
  ctx.fillStyle = vars.floorShade;
  ctx.fillRect(0, 22, size, 10);
  softSpeckles(ctx, size, vars.floorLine, 0.04, 2);
}

function paintWallTheme(ctx: CanvasRenderingContext2D, size: number, id: FloorThemeId): void {
  const vars = themeVars(id);
  ctx.fillStyle = vars.wall;
  ctx.fillRect(0, 0, size, size);

  if (id === "futuristic") {
    ctx.fillStyle = vars.wallShade;
    ctx.fillRect(0, 0, size, 4);
    ctx.fillRect(0, size - 4, size, 4);
    ctx.fillStyle = vars.wallLit;
    ctx.fillRect(6, 8, size - 12, size - 16);
    ctx.fillStyle = vars.wallLine;
    ctx.fillRect(6, 10, size - 12, 2);
    return;
  }

  if (id === "desert") {
    paintChunkyBricks(ctx, size, 16, 10, vars.wallLit, vars.wallShade, vars.wallLine);
    return;
  }

  if (id === "castle") {
    // Vertical wood panelling — plank seams and soft grain.
    const plank = 8;
    for (let x = 0; x < size; x += plank) {
      ctx.fillStyle = hash(x, 5) > 0.5 ? vars.wallLit : vars.wall;
      ctx.fillRect(x, 0, plank, size);
      ctx.fillStyle = vars.wallShade;
      ctx.fillRect(x + 1, 2, 2, size - 4);
      ctx.fillStyle = vars.wallLine;
      ctx.fillRect(x + plank - 2, 0, 2, size);
    }
    softSpeckles(ctx, size, vars.wallShade, 0.06, 2);
    return;
  }

  if (id === "tomb") {
    paintChunkyBricks(ctx, size, 16, 12, vars.wallLit, vars.wallShade, vars.wallLine);
    ctx.fillStyle = vars.wallLine;
    ctx.fillRect(12, 10, 8, 3);
    return;
  }

  if (id === "office") {
    // drywall panels with a frosted strip
    ctx.fillStyle = vars.wallLit;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = vars.wallShade;
    ctx.fillRect(0, 0, size, 5);
    ctx.fillRect(0, size - 5, size, 5);
    ctx.fillStyle = vars.wall;
    ctx.fillRect(6, 8, size - 12, size - 16);
    ctx.fillStyle = vars.wallLine;
    ctx.fillRect(6, 14, size - 12, 3);
    return;
  }

  // suburbia — clapboard siding bands
  ctx.fillStyle = vars.wallLit;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? vars.wall : vars.wallShade;
    ctx.fillRect(0, y, size, 6);
    ctx.fillStyle = vars.wallLine;
    ctx.fillRect(0, y + 6, size, 2);
  }
}

function paintChunkyBricks(
  ctx: CanvasRenderingContext2D,
  size: number,
  bw: number,
  bh: number,
  lit: string,
  shade: string,
  line: string,
): void {
  const mortar = 2;
  for (let y = 0, row = 0; y < size; y += bh, row += 1) {
    const offset = row % 2 === 0 ? 0 : Math.floor(bw / 2);
    for (let x = -offset; x < size; x += bw) {
      ctx.fillStyle = hash(x + 11, y + 3) > 0.45 ? lit : shade;
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = line;
      ctx.fillRect(x, y, bw, mortar);
      ctx.fillRect(x, y, mortar, bh);
    }
  }
}

function fillBorder(ctx: CanvasRenderingContext2D, size: number, color: string, width: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, width);
  ctx.fillRect(0, size - width, size, width);
  ctx.fillRect(0, 0, width, size);
  ctx.fillRect(size - width, 0, width, size);
}

function softSpeckles(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  chance: number,
  stamp: number,
): void {
  ctx.fillStyle = color;
  for (let y = 0; y < size; y += stamp) {
    for (let x = 0; x < size; x += stamp) {
      if (hash(x, y) > 1 - chance) ctx.fillRect(x, y, stamp, stamp);
    }
  }
}

function themeVars(id: FloorThemeId): {
  floor: string;
  floorLit: string;
  floorShade: string;
  floorLine: string;
  wall: string;
  wallLit: string;
  wallShade: string;
  wallLine: string;
} {
  const prefix = `--theme-${id}`;
  return {
    floor: token(`${prefix}-floor`),
    floorLit: token(`${prefix}-floor-lit`),
    floorShade: token(`${prefix}-floor-shade`),
    floorLine: token(`${prefix}-floor-line`),
    wall: token(`${prefix}-wall`),
    wallLit: token(`${prefix}-wall-lit`),
    wallShade: token(`${prefix}-wall-shade`),
    wallLine: token(`${prefix}-wall-line`),
  };
}

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function token(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value.length === 0) throw new Error(`Missing CSS token ${name}`);
  return value;
}
