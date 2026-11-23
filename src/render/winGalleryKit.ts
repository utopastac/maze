import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshToonMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from "three";
import {
} from "./mazeWorldTypes.ts";
import {
  ramp,
  token,
} from "./boardMaterials.ts";

type AnimalKind =
  | "cow"
  | "sheep"
  | "dog"
  | "horse"
  | "crab"
  | "seagull"
  | "turtle"
  | "seal"
  | "penguin"
  | "bear"
  | "fox"
  | "hare"
  | "camel"
  | "giraffe"
  | "elephant"
  | "lizard"
  | "snake"
  | "scorpion"
  | "chicken"
  | "pig"
  | "goat"
  | "rabbit"
  | "deer"
  | "owl"
  | "raccoon"
  | "fish"
  | "octopus"
  | "seahorse"
  | "ray"
  | "shark"
  | "whale"
  | "jelly"
  | "pigeon"
  | "cat"
  | "rat"
  | "parrot"
  | "frog"
  | "toucan"
  | "monkey";

export type WinSceneKind =
  | "pasture"
  | "beach"
  | "snow"
  | "desert"
  | "orchard"
  | "twilight"
  | "underwater"
  | "city"
  | "village"
  | "moon"
  | "venus"
  | "forest"
  | "rainforest"
  | "disco";

export const WIN_SCENES: WinSceneKind[] = [
  "pasture",
  "beach",
  "snow",
  "desert",
  "orchard",
  "twilight",
  "underwater",
  "city",
  "village",
  "moon",
  "venus",
  "forest",
  "rainforest",
  "disco",
];

export const GALLERY_SCENES = [...WIN_SCENES, "fail"] as const;

export type GallerySceneId = (typeof GALLERY_SCENES)[number];

/** Void-sky theme id for each gallery meadow (CSS `--sky-{id}-*`). */
export const GALLERY_SCENE_SKY: Record<GallerySceneId, string> = {
  pasture: "pasture",
  beach: "beach",
  snow: "snow",
  desert: "desert",
  orchard: "orchard",
  twilight: "twilight",
  underwater: "underwater",
  city: "city",
  village: "village",
  moon: "moon",
  venus: "venus",
  forest: "forest",
  rainforest: "rainforest",
  disco: "disco",
  fail: "sad",
};

export function gallerySkyTheme(scene: GallerySceneId | string): string {
  return GALLERY_SCENE_SKY[scene as GallerySceneId] ?? "rainbow";
}

export const WIN_GLYPH_W = [
  "#...#",
  "#...#",
  "#.#.#",
  "##.##",
  "#...#",
];

export const WIN_GLYPH_I = [
  ".#.",
  "...",
  ".#.",
  ".#.",
  ".#.",
];

export const WIN_GLYPH_N = [
  "#...#",
  "##..#",
  "#.#.#",
  "#..##",
  "#...#",
];

export const WIN_GLYPH_BANG = [
  ".#.",
  ".#.",
  ".#.",
  "...",
  ".#.",
];

export const FAIL_GLYPH_F = [
  "#####",
  "#....",
  "####.",
  "#....",
  "#....",
];

export const FAIL_GLYPH_A = [
  ".###.",
  "#...#",
  "#####",
  "#...#",
  "#...#",
];

export const FAIL_GLYPH_I = [
  ".#.",
  "...",
  ".#.",
  ".#.",
  ".#.",
];

export const FAIL_GLYPH_L = [
  "#....",
  "#....",
  "#....",
  "#....",
  "#####",
];

export const FAIL_GLYPH_BANG = [
  ".#.",
  ".#.",
  ".#.",
  "...",
  ".#.",
];

/** Illegible rune clusters for fail-meadow headstones (not Latin / not crosses). */
export const GRAVE_GLYPH_RUNE_A = [
  "#.#...#.#",
  ".#.#.#.#.",
  "#...#...#",
  ".#.#.#.#.",
  "#.#...#.#",
];

export const GRAVE_GLYPH_RUNE_B = [
  "#.#.#",
  ".#.#.",
  "#...#",
  ".###.",
  "#.#.#",
];

export const GRAVE_GLYPH_RUNE_C = [
  ".#.#.",
  "#.#.#",
  ".#...",
  "#.#.#",
  ".#.#.",
];

export const SCENE_ANIMALS: Record<WinSceneKind, AnimalKind[]> = {
  pasture: ["cow", "sheep", "dog", "horse"],
  beach: ["crab", "seagull", "turtle", "seal"],
  snow: ["penguin", "bear", "fox", "hare"],
  desert: ["camel", "giraffe", "elephant", "lizard"],
  orchard: ["chicken", "pig", "goat", "rabbit"],
  twilight: ["deer", "owl", "raccoon", "fox"],
  underwater: ["shark", "whale", "jelly", "fish"],
  city: ["pigeon", "cat", "rat", "dog"],
  village: ["dog", "chicken", "pig", "cat"],
  moon: ["cow", "hare", "fox", "owl"],
  venus: ["camel", "lizard", "snake", "scorpion"],
  forest: ["deer", "rabbit", "fox", "owl"],
  rainforest: ["parrot", "frog", "toucan", "monkey"],
  disco: ["parrot", "cat", "dog", "pigeon"],
};

export interface AnimalBit {
  group: Group;
  kind: AnimalKind;
  facing: number;
  baseY: number;
  scale: number;
}

export function meadowStream(span: number): CatmullRomCurve3 {
  const edge = span * 0.5 + 0.02;
  const sway = span * 0.5;
  const points: Vector3[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const x = -edge + t * edge * 2;
    const z = Math.sin(t * Math.PI * 1.35 + 0.4) * sway * 0.38
      + Math.sin(t * Math.PI * 2.7) * sway * 0.11;
    points.push(new Vector3(x, 0, z));
  }
  return new CatmullRomCurve3(points);
}

export function nearStream(x: number, z: number, stream: CatmullRomCurve3, radius: number): boolean {
  const probe = new Vector3();
  for (let i = 0; i <= 24; i += 1) {
    stream.getPoint(i / 24, probe);
    if (Math.hypot(x - probe.x, z - probe.z) < radius) return true;
  }
  return false;
}

export function flatDisc(radius: number, mat: MeshToonMaterial): Mesh {
  const mesh = new Mesh(new CircleGeometry(Math.max(0.05, radius), 16), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeFloorMats(): Record<WinSceneKind, MeshToonMaterial> {
  const kinds = WIN_SCENES;
  const mats = {} as Record<WinSceneKind, MeshToonMaterial>;
  for (const kind of kinds) {
    const map = makeFloorTexture(kind);
    mats[kind] = new MeshToonMaterial({
      color: "#ffffff",
      map,
      gradientMap: ramp,
    });
  }
  return mats;
}

export function makeFailFloorMat(): MeshToonMaterial {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Fail floor texture canvas unavailable");
  const base = token("--maze-fail-ground");
  const shade = token("--maze-fail-ground-dark");
  const crack = token("--maze-fail-crack");
  const hash = (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = hash(x, y);
      if (n > 0.78) {
        ctx.fillStyle = shade;
        ctx.fillRect(x, y, 1, 1);
      }
      if (n > 0.93 || (x + y * 3) % 11 === 0) {
        ctx.fillStyle = crack;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return new MeshToonMaterial({
    color: "#ffffff",
    map: tex,
    gradientMap: ramp,
  });
}

function makeFloorTexture(kind: WinSceneKind): Texture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Floor texture canvas unavailable");
  paintFloor(ctx, size, kind);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function paintFloor(ctx: CanvasRenderingContext2D, size: number, kind: WinSceneKind): void {
  const px = (hex: string, x: number, y: number, w = 1, h = 1): void => {
    ctx.fillStyle = hex;
    ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, w, h);
  };
  const hash = (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const soft = (base: string, tint: string, amount: number): string => mixHex(base, tint, amount);

  if (kind === "pasture" || kind === "orchard") {
    const base = token("--maze-grass");
    const shade = soft(base, token("--maze-grass-dark"), 0.28);
    const lit = soft(base, token("--maze-leaf-lit"), 0.22);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.82) px(shade, x, y);
        else if (n > 0.68) px(lit, x, y);
      }
    }
    return;
  }

  if (kind === "forest") {
    const base = token("--maze-moss");
    const shade = soft(base, token("--maze-grass-dark"), 0.26);
    const lit = soft(base, token("--maze-moss-lit"), 0.28);
    const litter = soft(base, token("--maze-autumn"), 0.18);
    const pine = soft(base, token("--maze-pine"), 0.2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.84) px(shade, x, y);
        else if (n > 0.7) px(lit, x, y);
        if (n > 0.92) px(litter, x, y);
        if (n > 0.96) px(pine, x, y);
      }
    }
    return;
  }

  if (kind === "rainforest") {
    const base = token("--maze-canopy");
    const shade = soft(base, token("--maze-pine"), 0.24);
    const lit = soft(base, token("--maze-canopy-lit"), 0.3);
    const bright = soft(base, token("--maze-canopy-bright"), 0.22);
    const flower = soft(base, token("--maze-bromeliad"), 0.18);
    const orchid = soft(base, token("--maze-orchid"), 0.16);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.82) px(shade, x, y);
        else if (n > 0.66) px(lit, x, y);
        if (n > 0.9) px(bright, x, y);
        if (n > 0.955) px(flower, x, y);
        if (n > 0.98) px(orchid, x, y);
      }
    }
    return;
  }

  if (kind === "disco") {
    const base = token("--maze-disco-floor");
    const shade = soft(base, token("--maze-disco-floor-dark"), 0.4);
    const colors = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => soft(base, token(`--maze-disco-${i}`), 0.35));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (x % 4 === 0 || y % 4 === 0) px(shade, x, y);
        else {
          const c = colors[((x >> 2) + (y >> 2)) % colors.length];
          if (c) px(c, x, y);
        }
      }
    }
    return;
  }

  if (kind === "beach") {
    const base = token("--maze-sand");
    const shade = soft(base, token("--maze-sand-dark"), 0.3);
    const wet = soft(base, token("--maze-ocean-deep"), 0.18);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.78) px(shade, x, y);
        if ((x + y * 2) % 9 === 0 && n > 0.55) px(wet, x, y);
      }
    }
    return;
  }

  if (kind === "snow") {
    const base = token("--maze-snow");
    const shade = soft(base, token("--maze-snow-shade"), 0.32);
    const lit = soft(base, "#ffffff", 0.2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.8) px(shade, x, y);
        else if (n > 0.92) px(lit, x, y);
      }
    }
    return;
  }

  if (kind === "desert") {
    const base = token("--maze-dune");
    const shade = soft(base, token("--maze-dune-dark"), 0.3);
    const lit = soft(base, token("--maze-sand"), 0.28);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const wave = Math.sin((x + y * 0.35) * 0.9);
        if (wave > 0.55) px(lit, x, y);
        if (wave < -0.55) px(shade, x, y);
        if (hash(x, y) > 0.9) px(shade, x, y);
      }
    }
    return;
  }

  if (kind === "twilight") {
    const base = token("--maze-lavender");
    const shade = soft(base, token("--maze-lavender-dark"), 0.3);
    const lit = soft(base, token("--maze-flower-3"), 0.16);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.8) px(shade, x, y);
        if (n > 0.94) px(lit, x, y);
      }
    }
    return;
  }

  if (kind === "underwater") {
    const base = token("--maze-seabed");
    const shade = soft(base, token("--maze-seabed-dark"), 0.28);
    const lit = soft(base, token("--maze-seabed-lit"), 0.3);
    const sand = soft(base, token("--maze-seabed-sand"), 0.22);
    const coral = soft(base, token("--maze-coral"), 0.2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        const ripple = Math.sin(x * 0.8 + y * 0.25);
        if (ripple > 0.55) px(lit, x, y);
        if (ripple < -0.6) px(shade, x, y);
        if (n > 0.88) px(sand, x, y);
        if (n > 0.97) px(coral, x, y);
      }
    }
    return;
  }

  if (kind === "city") {
    const base = token("--maze-grass");
    const shade = soft(base, token("--maze-grass-dark"), 0.28);
    const lit = soft(base, token("--maze-leaf-lit"), 0.24);
    const bloom = soft(base, token("--maze-flower-1"), 0.18);
    const petal = soft(base, token("--maze-flower-2"), 0.14);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.82) px(shade, x, y);
        else if (n > 0.66) px(lit, x, y);
        if (n > 0.94) px(bloom, x, y);
        if (n > 0.975) px(petal, x, y);
      }
    }
    return;
  }

  if (kind === "village") {
    const base = token("--maze-cobble");
    const shade = soft(base, token("--maze-cobble-dark"), 0.3);
    const lit = soft(base, token("--maze-plaster"), 0.18);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const ox = (y / 4) % 2 === 0 ? 0 : 2;
        px(shade, x + ox, y, 3, 3);
        if (hash(x, y) > 0.7) px(lit, x + ox + 1, y + 1);
      }
    }
    return;
  }

  if (kind === "moon") {
    const base = token("--maze-moon-dust");
    const shade = soft(base, token("--maze-moon-dust-dark"), 0.3);
    const rock = soft(base, token("--maze-moon-rock"), 0.26);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.78) px(shade, x, y);
        if (n > 0.92) px(rock, x, y);
      }
    }
    for (const [cx, cy, r] of [[10, 12, 4], [22, 20, 3]] as const) {
      for (let y = -r; y <= r; y += 1) {
        for (let x = -r; x <= r; x += 1) {
          const d = Math.hypot(x, y);
          if (d <= r && d > r - 1.2) px(rock, cx + x, cy + y);
          else if (d <= r - 1.2) px(shade, cx + x, cy + y);
        }
      }
    }
    return;
  }

  if (kind === "venus") {
    const base = token("--maze-venus-ground");
    const shade = soft(base, token("--maze-venus-ground-dark"), 0.28);
    const rock = soft(base, token("--maze-venus-rock"), 0.24);
    const sulfur = soft(base, token("--maze-sulfur"), 0.2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.78) px(shade, x, y);
        if (n > 0.9) px(rock, x, y);
        if (n > 0.96) px(sulfur, x, y);
      }
    }
    return;
  }

  ctx.fillStyle = token("--maze-grass");
  ctx.fillRect(0, 0, size, size);
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = new Color(a);
  const cb = new Color(b);
  return `#${ca.lerp(cb, t).getHexString()}`;
}

export type TreeKind = "oak" | "pine" | "birch" | "willow" | "autumn";

export type TreeMats = {
  trunk: MeshToonMaterial;
  trunkPale: MeshToonMaterial;
  leaf: MeshToonMaterial;
  leafLit: MeshToonMaterial;
  pine: MeshToonMaterial;
  pineLit: MeshToonMaterial;
  autumn: MeshToonMaterial;
  autumnLit: MeshToonMaterial;
};

export function makeTree(kind: TreeKind, x: number, z: number, scale: number, mats: TreeMats): Group {
  const tree = new Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  if (kind === "pine") buildPine(tree, mats);
  else if (kind === "birch") buildBirch(tree, mats);
  else if (kind === "willow") buildWillow(tree, mats);
  else if (kind === "autumn") buildAutumn(tree, mats);
  else buildOak(tree, mats);
  return tree;
}

export function makeDeadTree(
  x: number,
  z: number,
  scale: number,
  lean: number,
  trunk: MeshToonMaterial,
): Group {
  const tree = new Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  tree.rotation.z = lean;
  voxel(tree, trunk, 0.09, 0.72, 0.09, 0, 0.72, 0);
  voxel(tree, trunk, 0.14, 0.05, 0.08, 0.08, 0.06, 0.04);
  voxel(tree, trunk, 0.1, 0.04, 0.12, -0.06, 0.05, -0.05);
  voxel(tree, trunk, 0.32, 0.035, 0.035, 0.28, 1.15, 0.02);
  voxel(tree, trunk, 0.12, 0.03, 0.03, 0.48, 1.22, 0.08);
  voxel(tree, trunk, 0.26, 0.03, 0.03, -0.22, 1.32, -0.04);
  voxel(tree, trunk, 0.03, 0.03, 0.22, 0.04, 1.42, 0.18);
  voxel(tree, trunk, 0.03, 0.18, 0.03, -0.08, 1.55, -0.1);
  voxel(tree, trunk, 0.18, 0.03, 0.03, 0.14, 0.95, -0.12);
  return tree;
}

export function makeGrave(
  x: number,
  z: number,
  scale: number,
  yaw: number,
  glyph: string[],
  stone: MeshToonMaterial,
  stoneDark: MeshToonMaterial,
  crack: MeshToonMaterial,
  accent: MeshToonMaterial,
): Group {
  const grave = new Group();
  grave.position.set(x, 0, z);
  grave.scale.setScalar(scale);
  grave.rotation.y = yaw;

  voxel(grave, stoneDark, 0.42, 0.06, 0.28, 0, 0.06, 0.04);
  voxel(grave, stone, 0.36, 0.05, 0.55, 0, 0.08, -0.08);
  voxel(grave, accent, 0.32, 0.48, 0.08, 0, 0.62, -0.42);
  voxel(grave, stoneDark, 0.36, 0.06, 0.1, 0, 1.12, -0.42);
  voxel(grave, crack, 0.34, 0.02, 0.02, 0, 0.18, 0.22);

  const rows = glyph.length;
  let cols = 0;
  for (const line of glyph) cols = Math.max(cols, line.length);
  const cell = Math.min(0.055, 0.48 / Math.max(cols, 1));
  const letterH = cell * rows;
  const faceZ = -0.34;
  for (let r = 0; r < rows; r += 1) {
    const line = glyph[r] ?? "";
    for (let c = 0; c < line.length; c += 1) {
      if (line[c] !== "#") continue;
      const gx = (c + 0.5 - cols * 0.5) * cell;
      const gy = 0.95 - letterH * 0.5 - (r + 0.5) * cell;
      voxel(grave, crack, cell * 0.42, cell * 0.42, 0.02, gx, gy, faceZ);
    }
  }
  return grave;
}

export function makeComedySkull(
  x: number,
  z: number,
  scale: number,
  yaw: number,
  tip: number,
  bone: MeshToonMaterial,
  boneLit: MeshToonMaterial,
  socket: MeshToonMaterial,
  shade: MeshToonMaterial,
): Group {
  const skull = new Group();
  skull.position.set(x, 0, z);
  skull.scale.setScalar(scale);
  skull.rotation.y = yaw;
  skull.rotation.z = tip;

  // Oversized dome + cheeks sitting on a little dirt mound.
  voxel(skull, shade, 0.38, 0.08, 0.3, 0, 0.08, 0.02);
  voxel(skull, bone, 0.42, 0.36, 0.34, 0, 0.62, 0);
  voxel(skull, boneLit, 0.34, 0.18, 0.3, 0, 1.02, 0.02);
  voxel(skull, bone, 0.46, 0.16, 0.28, 0, 0.48, 0.06);

  // Uneven cartoon eye sockets.
  voxel(skull, socket, 0.14, 0.15, 0.08, -0.16, 0.78, 0.28);
  voxel(skull, socket, 0.11, 0.12, 0.08, 0.18, 0.74, 0.28);
  voxel(skull, boneLit, 0.04, 0.04, 0.03, -0.14, 0.72, 0.34);
  voxel(skull, boneLit, 0.035, 0.035, 0.03, 0.2, 0.7, 0.34);

  // Tiny nose holes + goofy open jaw.
  voxel(skull, socket, 0.035, 0.05, 0.04, -0.05, 0.52, 0.32);
  voxel(skull, socket, 0.035, 0.05, 0.04, 0.05, 0.52, 0.32);
  voxel(skull, bone, 0.28, 0.08, 0.16, 0, 0.28, 0.12);
  voxel(skull, socket, 0.2, 0.06, 0.1, 0, 0.3, 0.22);

  // Chunky teeth with one missing for the gag.
  const teeth = [-0.16, -0.08, 0, 0.08, 0.16] as const;
  for (const [index, tx] of teeth.entries()) {
    if (index === 2) continue;
    voxel(skull, boneLit, 0.03, 0.05, 0.03, tx, 0.22, 0.26);
  }
  voxel(skull, bone, 0.04, 0.03, 0.12, -0.26, 0.34, 0.02);
  voxel(skull, bone, 0.04, 0.03, 0.12, 0.26, 0.34, 0.02);
  return skull;
}

export function makeBone(
  x: number,
  z: number,
  scale: number,
  yaw: number,
  tip: number,
  bone: MeshToonMaterial,
  boneLit: MeshToonMaterial,
): Group {
  const group = new Group();
  group.position.set(x, 0.06, z);
  group.scale.setScalar(scale);
  group.rotation.y = yaw;
  group.rotation.z = tip;
  voxel(group, bone, 0.28, 0.035, 0.035, 0, 0.04, 0);
  voxel(group, boneLit, 0.07, 0.06, 0.06, -0.3, 0.05, 0);
  voxel(group, boneLit, 0.07, 0.06, 0.06, 0.3, 0.05, 0);
  voxel(group, bone, 0.04, 0.045, 0.03, -0.34, 0.08, 0.02);
  voxel(group, bone, 0.04, 0.045, 0.03, -0.34, 0.08, -0.02);
  voxel(group, bone, 0.04, 0.045, 0.03, 0.34, 0.08, 0.02);
  voxel(group, bone, 0.04, 0.045, 0.03, 0.34, 0.08, -0.02);
  return group;
}

export function makeCrow(
  x: number,
  y: number,
  z: number,
  yaw: number,
  tip: number,
  body: MeshToonMaterial,
  beak: MeshToonMaterial,
  eye: MeshToonMaterial,
): Group {
  const crow = new Group();
  crow.position.set(x, y, z);
  crow.rotation.y = yaw;
  crow.rotation.z = tip;
  voxel(crow, body, 0.08, 0.05, 0.05, 0, 0.08, 0);
  voxel(crow, body, 0.05, 0.045, 0.045, 0.08, 0.1, 0);
  voxel(crow, beak, 0.04, 0.015, 0.015, 0.14, 0.09, 0);
  voxel(crow, eye, 0.012, 0.012, 0.012, 0.1, 0.12, 0.035);
  voxel(crow, body, 0.07, 0.015, 0.04, -0.02, 0.1, 0.07);
  voxel(crow, body, 0.07, 0.015, 0.04, -0.02, 0.1, -0.07);
  voxel(crow, body, 0.05, 0.015, 0.02, -0.12, 0.08, 0);
  voxel(crow, body, 0.012, 0.03, 0.012, 0.02, 0.02, 0.03);
  voxel(crow, body, 0.012, 0.03, 0.012, 0.02, 0.02, -0.03);
  return crow;
}

export function makeSadShack(
  x: number,
  z: number,
  scale: number,
  yaw: number,
  lean: number,
  kind: "hut" | "lean" | "ruin",
  mats: {
    wood: MeshToonMaterial;
    woodDark: MeshToonMaterial;
    stone: MeshToonMaterial;
    shade: MeshToonMaterial;
  },
): Group {
  const shack = new Group();
  shack.position.set(x, 0, z);
  shack.scale.setScalar(scale);
  shack.rotation.y = yaw;
  shack.rotation.z = lean;

  if (kind === "lean") {
    // Open lean-to: three posts and a slumped tarp of planks.
    voxel(shack, mats.woodDark, 0.04, 0.28, 0.04, -0.28, 0.28, -0.18);
    voxel(shack, mats.woodDark, 0.04, 0.22, 0.04, 0.28, 0.22, -0.18);
    voxel(shack, mats.woodDark, 0.04, 0.18, 0.04, -0.05, 0.18, 0.22);
    voxel(shack, mats.wood, 0.34, 0.03, 0.28, 0, 0.42, 0);
    voxel(shack, mats.woodDark, 0.3, 0.025, 0.22, 0.04, 0.48, -0.04);
    voxel(shack, mats.shade, 0.12, 0.08, 0.1, 0.22, 0.08, 0.18);
    voxel(shack, mats.stone, 0.1, 0.05, 0.14, -0.2, 0.05, 0.2);
    return shack;
  }

  if (kind === "ruin") {
    // Half-collapsed stone shell, no roof left.
    voxel(shack, mats.stone, 0.32, 0.18, 0.04, 0, 0.18, -0.28);
    voxel(shack, mats.stone, 0.04, 0.22, 0.26, -0.3, 0.22, 0);
    voxel(shack, mats.shade, 0.04, 0.14, 0.2, 0.3, 0.14, 0.04);
    voxel(shack, mats.woodDark, 0.22, 0.03, 0.18, 0.08, 0.36, -0.05);
    voxel(shack, mats.wood, 0.08, 0.03, 0.2, -0.18, 0.08, 0.22);
    voxel(shack, mats.shade, 0.1, 0.06, 0.08, 0.18, 0.06, 0.2);
    return shack;
  }

  // Closed hut — sagging roof, dark doorway, one cracked window.
  voxel(shack, mats.wood, 0.36, 0.22, 0.28, 0, 0.22, 0);
  voxel(shack, mats.woodDark, 0.38, 0.04, 0.3, 0, 0.44, 0);
  // Pitched roof planks, slightly askew.
  voxel(shack, mats.woodDark, 0.42, 0.03, 0.18, 0, 0.56, -0.08);
  voxel(shack, mats.wood, 0.4, 0.03, 0.16, 0.02, 0.62, 0.06);
  voxel(shack, mats.shade, 0.12, 0.02, 0.14, -0.12, 0.68, 0);
  // Door void + boards.
  voxel(shack, mats.shade, 0.08, 0.14, 0.02, 0, 0.16, 0.29);
  voxel(shack, mats.woodDark, 0.1, 0.02, 0.015, 0, 0.22, 0.3);
  voxel(shack, mats.woodDark, 0.1, 0.02, 0.015, 0, 0.12, 0.3);
  // Window hole.
  voxel(shack, mats.shade, 0.07, 0.06, 0.015, -0.18, 0.28, 0.29);
  // Chimney stump.
  voxel(shack, mats.stone, 0.07, 0.14, 0.07, 0.18, 0.72, -0.08);
  voxel(shack, mats.shade, 0.05, 0.04, 0.05, 0.18, 0.84, -0.08);
  // Debris at the stoop.
  voxel(shack, mats.wood, 0.1, 0.03, 0.06, 0.22, 0.04, 0.34);
  voxel(shack, mats.stone, 0.08, 0.04, 0.08, -0.24, 0.04, 0.3);
  return shack;
}

export function makeBrokenGate(
  x: number,
  z: number,
  scale: number,
  yaw: number,
  iron: MeshToonMaterial,
  post: MeshToonMaterial,
  rust: MeshToonMaterial,
): Group {
  const gate = new Group();
  gate.position.set(x, 0, z);
  gate.scale.setScalar(scale);
  gate.rotation.y = yaw;

  voxel(gate, post, 0.06, 0.55, 0.06, -0.42, 0.55, 0);
  voxel(gate, post, 0.06, 0.48, 0.06, 0.42, 0.48, 0);
  voxel(gate, iron, 0.36, 0.04, 0.04, 0, 1.05, 0);
  voxel(gate, rust, 0.04, 0.04, 0.04, -0.42, 1.12, 0);
  voxel(gate, rust, 0.04, 0.04, 0.04, 0.42, 1.0, 0);

  // Left door hangs open; right door is cracked and slumped.
  const left = new Group();
  left.position.set(-0.2, 0.55, 0.02);
  left.rotation.y = -0.85;
  voxel(left, iron, 0.18, 0.42, 0.03, 0, 0, 0);
  for (const y of [-0.28, -0.08, 0.12, 0.3] as const) {
    voxel(left, rust, 0.16, 0.015, 0.015, 0, y, 0.03);
  }
  for (const xBar of [-0.1, 0, 0.1] as const) {
    voxel(left, iron, 0.015, 0.4, 0.015, xBar, 0, 0.03);
  }
  gate.add(left);

  const right = new Group();
  right.position.set(0.22, 0.42, 0);
  right.rotation.z = 0.55;
  right.rotation.y = 0.25;
  voxel(right, iron, 0.16, 0.34, 0.03, 0, 0, 0);
  voxel(right, rust, 0.14, 0.015, 0.015, 0, -0.12, 0.03);
  voxel(right, rust, 0.14, 0.015, 0.015, 0, 0.1, 0.03);
  voxel(right, iron, 0.015, 0.3, 0.015, -0.06, 0, 0.03);
  voxel(right, iron, 0.015, 0.28, 0.015, 0.06, -0.02, 0.03);
  gate.add(right);

  // Fallen spear tip in the dirt.
  voxel(gate, iron, 0.03, 0.03, 0.22, 0.55, 0.04, 0.18);
  voxel(gate, rust, 0.04, 0.04, 0.04, 0.55, 0.05, 0.34);
  return gate;
}

export function makeOpenCoffin(
  x: number,
  z: number,
  scale: number,
  yaw: number,
  tip: number,
  wood: MeshToonMaterial,
  woodDark: MeshToonMaterial,
  lining: MeshToonMaterial,
  dirt: MeshToonMaterial,
): Group {
  const coffin = new Group();
  coffin.position.set(x, 0, z);
  coffin.scale.setScalar(scale);
  coffin.rotation.y = yaw;
  coffin.rotation.z = tip;

  voxel(coffin, dirt, 0.42, 0.08, 0.28, 0, 0.06, 0.04);
  voxel(coffin, woodDark, 0.34, 0.08, 0.18, 0, 0.12, 0);
  voxel(coffin, wood, 0.32, 0.03, 0.03, 0, 0.2, 0.16);
  voxel(coffin, wood, 0.32, 0.03, 0.03, 0, 0.2, -0.16);
  voxel(coffin, wood, 0.03, 0.03, 0.16, -0.32, 0.2, 0);
  voxel(coffin, wood, 0.03, 0.03, 0.16, 0.32, 0.2, 0);
  voxel(coffin, lining, 0.26, 0.02, 0.12, 0, 0.16, 0);

  const lid = new Group();
  lid.position.set(0.18, 0.28, 0.22);
  lid.rotation.x = -1.05;
  lid.rotation.y = 0.35;
  voxel(lid, wood, 0.3, 0.03, 0.16, 0, 0, 0);
  voxel(lid, woodDark, 0.08, 0.02, 0.04, 0, 0.04, 0);
  coffin.add(lid);
  return coffin;
}

export function makeGraveLantern(
  x: number,
  z: number,
  scale: number,
  yaw: number,
  post: MeshToonMaterial,
  cage: MeshToonMaterial,
  flame: MeshToonMaterial,
  core: MeshToonMaterial,
): Group {
  const lantern = new Group();
  lantern.position.set(x, 0, z);
  lantern.scale.setScalar(scale);
  lantern.rotation.y = yaw;

  voxel(lantern, post, 0.035, 0.28, 0.035, 0, 0.28, 0);
  voxel(lantern, cage, 0.1, 0.02, 0.1, 0, 0.58, 0);
  voxel(lantern, cage, 0.08, 0.02, 0.08, 0, 0.78, 0);
  voxel(lantern, post, 0.015, 0.1, 0.015, -0.07, 0.68, -0.07);
  voxel(lantern, post, 0.015, 0.1, 0.015, 0.07, 0.68, -0.07);
  voxel(lantern, post, 0.015, 0.1, 0.015, -0.07, 0.68, 0.07);
  voxel(lantern, post, 0.015, 0.1, 0.015, 0.07, 0.68, 0.07);

  const wick = new Mesh(new BoxGeometry(0.05, 0.1, 0.05), core);
  wick.position.set(0, 0.66, 0);
  wick.userData.lanternFlame = true;
  const glowMesh = new Mesh(new BoxGeometry(0.07, 0.12, 0.07), flame);
  glowMesh.position.set(0.01, 0.7, 0);
  glowMesh.userData.lanternFlame = true;
  lantern.add(wick, glowMesh);
  return lantern;
}

export function makeGhost(
  x: number,
  z: number,
  scale: number,
  yaw: number,
  body: MeshToonMaterial,
  trim: MeshToonMaterial,
  pupils: MeshToonMaterial,
  whites: MeshToonMaterial,
): Group {
  const ghost = new Group();
  ghost.position.set(x, 0.72, z);
  ghost.scale.setScalar(scale);
  ghost.rotation.y = yaw;

  // Sheet silhouette: tall body, soft head, little arms, wavy hem.
  voxel(ghost, body, 0.3, 0.38, 0.22, 0, 0.34, 0);
  voxel(ghost, body, 0.26, 0.18, 0.2, 0, 0.78, 0.02);
  voxel(ghost, body, 0.18, 0.1, 0.15, 0, 1.0, 0.02);
  voxel(ghost, trim, 0.12, 0.05, 0.1, 0, 1.1, 0.01);

  voxel(ghost, body, 0.12, 0.08, 0.1, -0.36, 0.48, 0.04);
  voxel(ghost, body, 0.12, 0.08, 0.1, 0.36, 0.48, 0.04);
  voxel(ghost, trim, 0.07, 0.07, 0.07, -0.46, 0.42, 0.08);
  voxel(ghost, trim, 0.07, 0.07, 0.07, 0.46, 0.42, 0.08);

  voxel(ghost, trim, 0.09, 0.16, 0.08, -0.22, -0.1, 0.06);
  voxel(ghost, body, 0.09, 0.2, 0.08, -0.06, -0.14, -0.02);
  voxel(ghost, trim, 0.09, 0.14, 0.08, 0.1, -0.08, 0.05);
  voxel(ghost, body, 0.09, 0.18, 0.08, 0.24, -0.12, -0.04);
  voxel(ghost, trim, 0.08, 0.12, 0.08, 0, -0.16, 0.1);

  // Big cartoon eyes: whites + offset pupils + tiny O mouth.
  voxel(ghost, whites, 0.09, 0.11, 0.035, -0.11, 0.82, 0.2);
  voxel(ghost, whites, 0.09, 0.11, 0.035, 0.11, 0.82, 0.2);
  voxel(ghost, pupils, 0.045, 0.055, 0.03, -0.1, 0.8, 0.24);
  voxel(ghost, pupils, 0.045, 0.055, 0.03, 0.13, 0.8, 0.24);
  voxel(ghost, pupils, 0.05, 0.04, 0.025, 0, 0.64, 0.22);
  return ghost;
}

export function makePalm(
  x: number,
  z: number,
  scale: number,
  trunk: MeshToonMaterial,
  leaf: MeshToonMaterial,
  lit: MeshToonMaterial,
): Group {
  const tree = new Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  voxel(tree, trunk, 0.07, 0.55, 0.07, 0, 0.55, 0);
  voxel(tree, leaf, 0.34, 0.08, 0.12, 0.2, 1.15, 0);
  voxel(tree, leaf, 0.34, 0.08, 0.12, -0.2, 1.15, 0);
  voxel(tree, lit, 0.12, 0.08, 0.34, 0, 1.15, 0.2);
  voxel(tree, lit, 0.12, 0.08, 0.34, 0, 1.15, -0.2);
  voxel(tree, lit, 0.14, 0.1, 0.14, 0, 1.28, 0);
  return tree;
}

export function makeCactus(
  x: number,
  z: number,
  scale: number,
  body: MeshToonMaterial,
  lit: MeshToonMaterial,
): Group {
  const plant = new Group();
  plant.position.set(x, 0, z);
  plant.scale.setScalar(scale);
  voxel(plant, body, 0.1, 0.4, 0.1, 0, 0.4, 0);
  voxel(plant, lit, 0.08, 0.08, 0.22, 0.18, 0.5, 0);
  voxel(plant, lit, 0.08, 0.16, 0.08, 0.28, 0.62, 0);
  voxel(plant, body, 0.08, 0.08, 0.18, -0.16, 0.42, 0);
  voxel(plant, body, 0.08, 0.14, 0.08, -0.26, 0.52, 0);
  return plant;
}

export function makeCottage(
  x: number,
  z: number,
  scale: number,
  mats: {
    plaster: MeshToonMaterial;
    roof: MeshToonMaterial;
    trunk: MeshToonMaterial;
    window: MeshToonMaterial;
  },
): Group {
  const house = new Group();
  house.position.set(x, 0, z);
  house.scale.setScalar(scale);
  voxel(house, mats.plaster, 0.28, 0.22, 0.22, 0, 0.28, 0);
  voxel(house, mats.roof, 0.34, 0.12, 0.26, 0, 0.58, 0);
  voxel(house, mats.trunk, 0.06, 0.12, 0.04, 0.18, 0.16, 0.22);
  voxel(house, mats.window, 0.06, 0.06, 0.02, -0.12, 0.3, 0.23);
  voxel(house, mats.window, 0.06, 0.06, 0.02, 0.06, 0.3, 0.23);
  return house;
}

export function makeStreetLamp(
  x: number,
  z: number,
  pole: MeshToonMaterial,
  lamp: MeshToonMaterial,
): Group {
  const post = new Group();
  post.position.set(x, 0, z);
  voxel(post, pole, 0.035, 0.45, 0.035, 0, 0.45, 0);
  voxel(post, pole, 0.12, 0.03, 0.03, 0.08, 0.9, 0);
  voxel(post, lamp, 0.06, 0.06, 0.06, 0.16, 0.86, 0);
  return post;
}

export function makeBench(
  x: number,
  z: number,
  facing: number,
  wood: MeshToonMaterial,
  seat: MeshToonMaterial,
): Group {
  const bench = new Group();
  bench.position.set(x, 0, z);
  bench.rotation.y = facing;
  voxel(bench, wood, 0.04, 0.18, 0.04, -0.22, 0.18, 0.08);
  voxel(bench, wood, 0.04, 0.18, 0.04, 0.22, 0.18, 0.08);
  voxel(bench, wood, 0.04, 0.18, 0.04, -0.22, 0.18, -0.08);
  voxel(bench, wood, 0.04, 0.18, 0.04, 0.22, 0.18, -0.08);
  voxel(bench, seat, 0.52, 0.04, 0.22, 0, 0.28, 0);
  voxel(bench, seat, 0.52, 0.16, 0.04, 0, 0.4, -0.1);
  return bench;
}

export function makeMushroomPatch(
  x: number,
  z: number,
  scale: number,
  mats: { stem: MeshToonMaterial; cap: MeshToonMaterial; spot: MeshToonMaterial },
): Group {
  const patch = new Group();
  patch.position.set(x, 0, z);
  patch.scale.setScalar(scale);
  const shrooms = [
    { x: 0, z: 0, s: 1, h: 0.16 },
    { x: 0.14, z: 0.08, s: 0.7, h: 0.12 },
    { x: -0.12, z: 0.1, s: 0.55, h: 0.1 },
    { x: 0.06, z: -0.12, s: 0.6, h: 0.11 },
  ];
  for (const shroom of shrooms) {
    voxel(patch, mats.stem, 0.03 * shroom.s, shroom.h, 0.03 * shroom.s, shroom.x, shroom.h, shroom.z);
    voxel(patch, mats.cap, 0.08 * shroom.s, 0.04 * shroom.s, 0.08 * shroom.s, shroom.x, shroom.h * 2 + 0.02, shroom.z);
    voxel(patch, mats.spot, 0.02 * shroom.s, 0.015 * shroom.s, 0.02 * shroom.s, shroom.x + 0.03 * shroom.s, shroom.h * 2 + 0.05, shroom.z);
  }
  return patch;
}

export function swimHeight(kind: AnimalKind): number {
  if (kind === "whale") return 1.15;
  if (kind === "jelly") return 1.45;
  if (kind === "shark") return 0.85;
  if (kind === "fish" || kind === "ray" || kind === "seahorse" || kind === "octopus") return 0.45;
  return 0;
}

export function animalScale(kind: AnimalKind): number {
  if (kind === "whale") return 2.15;
  if (kind === "jelly") return 1.7;
  if (kind === "shark") return 1.55;
  if (kind === "elephant") return 2.9;
  if (kind === "giraffe") return 2.7;
  return 1;
}

function buildOak(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunk, 0.1, 0.55, 0.1, 0, 0.55, 0);
  voxel(tree, mats.leaf, 0.42, 0.32, 0.42, 0, 1.25, 0);
  voxel(tree, mats.leafLit, 0.28, 0.22, 0.28, 0, 1.55, 0);
  voxel(tree, mats.leafLit, 0.2, 0.18, 0.2, 0.28, 1.2, 0.16);
  voxel(tree, mats.leaf, 0.18, 0.16, 0.18, -0.26, 1.15, -0.14);
}

function buildPine(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunk, 0.07, 0.45, 0.07, 0, 0.45, 0);
  voxel(tree, mats.pine, 0.38, 0.16, 0.38, 0, 1.0, 0);
  voxel(tree, mats.pine, 0.28, 0.16, 0.28, 0, 1.28, 0);
  voxel(tree, mats.pineLit, 0.18, 0.16, 0.18, 0, 1.54, 0);
  voxel(tree, mats.pineLit, 0.1, 0.14, 0.1, 0, 1.78, 0);
}

function buildBirch(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunkPale, 0.06, 0.7, 0.06, 0, 0.7, 0);
  voxel(tree, mats.leafLit, 0.22, 0.18, 0.22, 0, 1.45, 0);
  voxel(tree, mats.leaf, 0.16, 0.14, 0.16, 0.14, 1.55, 0.08);
  voxel(tree, mats.leaf, 0.14, 0.12, 0.14, -0.12, 1.5, -0.1);
  voxel(tree, mats.leafLit, 0.12, 0.12, 0.12, 0.02, 1.7, -0.04);
}

function buildWillow(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunk, 0.09, 0.5, 0.09, 0, 0.5, 0);
  voxel(tree, mats.leaf, 0.48, 0.2, 0.48, 0, 1.15, 0);
  voxel(tree, mats.leafLit, 0.55, 0.12, 0.55, 0, 0.95, 0);
  voxel(tree, mats.leaf, 0.2, 0.28, 0.12, 0.38, 0.85, 0);
  voxel(tree, mats.leaf, 0.2, 0.28, 0.12, -0.38, 0.85, 0);
  voxel(tree, mats.leafLit, 0.12, 0.28, 0.2, 0, 0.85, 0.38);
  voxel(tree, mats.leafLit, 0.12, 0.28, 0.2, 0, 0.85, -0.38);
}

function buildAutumn(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunk, 0.09, 0.6, 0.09, 0, 0.6, 0);
  voxel(tree, mats.autumn, 0.36, 0.28, 0.36, 0, 1.3, 0);
  voxel(tree, mats.autumnLit, 0.24, 0.2, 0.24, 0, 1.55, 0);
  voxel(tree, mats.autumnLit, 0.16, 0.14, 0.16, 0.24, 1.25, 0.14);
  voxel(tree, mats.autumn, 0.14, 0.14, 0.14, -0.22, 1.22, -0.12);
}

export type AnimalMats = {
  cow: MeshToonMaterial;
  cowSpot: MeshToonMaterial;
  sheep: MeshToonMaterial;
  sheepFace: MeshToonMaterial;
  dog: MeshToonMaterial;
  dogEar: MeshToonMaterial;
  horse: MeshToonMaterial;
  horseMane: MeshToonMaterial;
  crab: MeshToonMaterial;
  seagull: MeshToonMaterial;
  seagullWing: MeshToonMaterial;
  turtle: MeshToonMaterial;
  turtleShell: MeshToonMaterial;
  seal: MeshToonMaterial;
  penguin: MeshToonMaterial;
  penguinBelly: MeshToonMaterial;
  bear: MeshToonMaterial;
  fox: MeshToonMaterial;
  foxTip: MeshToonMaterial;
  hare: MeshToonMaterial;
  camel: MeshToonMaterial;
  giraffe: MeshToonMaterial;
  giraffeSpot: MeshToonMaterial;
  elephant: MeshToonMaterial;
  elephantEar: MeshToonMaterial;
  elephantTusk: MeshToonMaterial;
  lizard: MeshToonMaterial;
  snake: MeshToonMaterial;
  scorpion: MeshToonMaterial;
  chicken: MeshToonMaterial;
  chickenComb: MeshToonMaterial;
  pig: MeshToonMaterial;
  goat: MeshToonMaterial;
  rabbit: MeshToonMaterial;
  deer: MeshToonMaterial;
  owl: MeshToonMaterial;
  raccoon: MeshToonMaterial;
  fish: MeshToonMaterial;
  fishFin: MeshToonMaterial;
  octopus: MeshToonMaterial;
  seahorse: MeshToonMaterial;
  ray: MeshToonMaterial;
  shark: MeshToonMaterial;
  sharkBelly: MeshToonMaterial;
  whale: MeshToonMaterial;
  whaleBelly: MeshToonMaterial;
  jelly: MeshToonMaterial;
  jellyGlow: MeshToonMaterial;
  pigeon: MeshToonMaterial;
  cat: MeshToonMaterial;
  rat: MeshToonMaterial;
  parrot: MeshToonMaterial;
  parrotWing: MeshToonMaterial;
  parrotTail: MeshToonMaterial;
  frog: MeshToonMaterial;
  frogBelly: MeshToonMaterial;
  toucan: MeshToonMaterial;
  toucanBeak: MeshToonMaterial;
  toucanChest: MeshToonMaterial;
  monkey: MeshToonMaterial;
  monkeyFace: MeshToonMaterial;
};

export function makeAnimal(kind: AnimalKind, mats: AnimalMats): AnimalBit {
  const group = new Group();
  const build = ANIMAL_BUILDERS[kind];
  build(group, mats);
  return { group, kind, facing: 0, baseY: 0, scale: 1 };
}

const ANIMAL_BUILDERS: Record<AnimalKind, (group: Group, mats: AnimalMats) => void> = {
  cow: buildCow,
  sheep: buildSheep,
  dog: buildDog,
  horse: buildHorse,
  crab: buildCrab,
  seagull: buildSeagull,
  turtle: buildTurtle,
  seal: buildSeal,
  penguin: buildPenguin,
  bear: buildBear,
  fox: buildFox,
  hare: buildHare,
  camel: buildCamel,
  giraffe: buildGiraffe,
  elephant: buildElephant,
  lizard: buildLizard,
  snake: buildSnake,
  scorpion: buildScorpion,
  chicken: buildChicken,
  pig: buildPig,
  goat: buildGoat,
  rabbit: buildRabbit,
  deer: buildDeer,
  owl: buildOwl,
  raccoon: buildRaccoon,
  fish: buildFish,
  octopus: buildOctopus,
  seahorse: buildSeahorse,
  ray: buildRay,
  shark: buildShark,
  whale: buildWhale,
  jelly: buildJelly,
  pigeon: buildPigeon,
  cat: buildCat,
  rat: buildRat,
  parrot: buildParrot,
  frog: buildFrog,
  toucan: buildToucan,
  monkey: buildMonkey,
};

export function voxel(
  parent: Group,
  mat: MeshToonMaterial,
  hx: number,
  hy: number,
  hz: number,
  x: number,
  y: number,
  z: number,
): void {
  const mesh = new Mesh(new BoxGeometry(hx * 2, hy * 2, hz * 2), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

function buildCow(group: Group, mats: AnimalMats): void {
  voxel(group, mats.cow, 0.28, 0.16, 0.16, 0, 0.34, 0);
  voxel(group, mats.cowSpot, 0.1, 0.1, 0.17, -0.06, 0.38, 0);
  voxel(group, mats.cow, 0.12, 0.1, 0.1, 0.34, 0.4, 0);
  voxel(group, mats.cowSpot, 0.04, 0.05, 0.11, 0.42, 0.42, 0);
  for (const [x, z] of [[-0.16, 0.1], [-0.16, -0.1], [0.14, 0.1], [0.14, -0.1]] as const) {
    voxel(group, mats.cowSpot, 0.04, 0.14, 0.04, x, 0.14, z);
  }
}

function buildSheep(group: Group, mats: AnimalMats): void {
  voxel(group, mats.sheep, 0.2, 0.16, 0.16, 0, 0.3, 0);
  voxel(group, mats.sheep, 0.14, 0.12, 0.14, 0, 0.42, 0);
  voxel(group, mats.sheepFace, 0.08, 0.07, 0.07, 0.24, 0.3, 0);
  for (const [x, z] of [[-0.1, 0.08], [-0.1, -0.08], [0.08, 0.08], [0.08, -0.08]] as const) {
    voxel(group, mats.sheepFace, 0.03, 0.1, 0.03, x, 0.1, z);
  }
}

function buildDog(group: Group, mats: AnimalMats): void {
  voxel(group, mats.dog, 0.16, 0.1, 0.1, 0, 0.22, 0);
  voxel(group, mats.dog, 0.08, 0.07, 0.07, 0.2, 0.28, 0);
  voxel(group, mats.dogEar, 0.03, 0.06, 0.02, 0.18, 0.36, 0.07);
  voxel(group, mats.dogEar, 0.03, 0.06, 0.02, 0.18, 0.36, -0.07);
  voxel(group, mats.dog, 0.03, 0.03, 0.1, -0.18, 0.24, 0);
  for (const [x, z] of [[-0.08, 0.06], [-0.08, -0.06], [0.08, 0.06], [0.08, -0.06]] as const) {
    voxel(group, mats.dogEar, 0.025, 0.09, 0.025, x, 0.09, z);
  }
}

function buildHorse(group: Group, mats: AnimalMats): void {
  voxel(group, mats.horse, 0.3, 0.14, 0.12, 0, 0.36, 0);
  voxel(group, mats.horse, 0.08, 0.18, 0.08, 0.28, 0.5, 0);
  voxel(group, mats.horse, 0.1, 0.07, 0.07, 0.4, 0.58, 0);
  voxel(group, mats.horseMane, 0.04, 0.14, 0.03, 0.24, 0.58, 0);
  voxel(group, mats.horseMane, 0.03, 0.03, 0.12, -0.3, 0.4, 0);
  for (const [x, z] of [[-0.18, 0.07], [-0.18, -0.07], [0.14, 0.07], [0.14, -0.07]] as const) {
    voxel(group, mats.horseMane, 0.035, 0.16, 0.035, x, 0.16, z);
  }
}

function buildCrab(group: Group, mats: AnimalMats): void {
  voxel(group, mats.crab, 0.16, 0.06, 0.12, 0, 0.12, 0);
  voxel(group, mats.crab, 0.04, 0.04, 0.14, 0.18, 0.12, 0.1);
  voxel(group, mats.crab, 0.04, 0.04, 0.14, 0.18, 0.12, -0.1);
  for (const z of [-0.1, -0.04, 0.04, 0.1] as const) {
    voxel(group, mats.crab, 0.1, 0.02, 0.02, -0.16, 0.08, z);
  }
}

function buildSeagull(group: Group, mats: AnimalMats): void {
  voxel(group, mats.seagull, 0.12, 0.06, 0.08, 0, 0.22, 0);
  voxel(group, mats.seagull, 0.06, 0.05, 0.05, 0.14, 0.26, 0);
  voxel(group, mats.seagullWing, 0.04, 0.02, 0.18, 0, 0.24, 0.16);
  voxel(group, mats.seagullWing, 0.04, 0.02, 0.18, 0, 0.24, -0.16);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.2, 0.24, 0);
  for (const z of [-0.04, 0.04] as const) {
    voxel(group, mats.seagullWing, 0.02, 0.08, 0.02, -0.04, 0.08, z);
  }
}

function buildTurtle(group: Group, mats: AnimalMats): void {
  voxel(group, mats.turtleShell, 0.18, 0.08, 0.14, 0, 0.16, 0);
  voxel(group, mats.turtle, 0.08, 0.05, 0.06, 0.2, 0.12, 0);
  for (const [x, z] of [[-0.1, 0.1], [-0.1, -0.1], [0.08, 0.1], [0.08, -0.1]] as const) {
    voxel(group, mats.turtle, 0.04, 0.03, 0.04, x, 0.06, z);
  }
}

function buildSeal(group: Group, mats: AnimalMats): void {
  voxel(group, mats.seal, 0.26, 0.1, 0.12, 0, 0.16, 0);
  voxel(group, mats.seal, 0.1, 0.08, 0.08, 0.28, 0.2, 0);
  voxel(group, mats.seal, 0.08, 0.03, 0.1, -0.28, 0.12, 0);
  voxel(group, mats.seal, 0.04, 0.06, 0.02, 0.3, 0.28, 0.06);
  voxel(group, mats.seal, 0.04, 0.06, 0.02, 0.3, 0.28, -0.06);
}

function buildPenguin(group: Group, mats: AnimalMats): void {
  voxel(group, mats.penguin, 0.1, 0.18, 0.1, 0, 0.28, 0);
  voxel(group, mats.penguinBelly, 0.07, 0.12, 0.04, 0.06, 0.26, 0);
  voxel(group, mats.penguin, 0.08, 0.07, 0.08, 0, 0.48, 0);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.08, 0.48, 0);
  for (const z of [-0.06, 0.06] as const) {
    voxel(group, mats.penguin, 0.03, 0.04, 0.05, 0, 0.06, z);
  }
}

function buildBear(group: Group, mats: AnimalMats): void {
  voxel(group, mats.bear, 0.22, 0.14, 0.14, 0, 0.28, 0);
  voxel(group, mats.bear, 0.1, 0.1, 0.1, 0.26, 0.34, 0);
  voxel(group, mats.bear, 0.04, 0.04, 0.03, 0.28, 0.44, 0.06);
  voxel(group, mats.bear, 0.04, 0.04, 0.03, 0.28, 0.44, -0.06);
  for (const [x, z] of [[-0.12, 0.08], [-0.12, -0.08], [0.1, 0.08], [0.1, -0.08]] as const) {
    voxel(group, mats.hare, 0.04, 0.1, 0.04, x, 0.1, z);
  }
}

function buildFox(group: Group, mats: AnimalMats): void {
  voxel(group, mats.fox, 0.18, 0.09, 0.09, 0, 0.2, 0);
  voxel(group, mats.fox, 0.08, 0.07, 0.07, 0.2, 0.26, 0);
  voxel(group, mats.fox, 0.03, 0.06, 0.02, 0.18, 0.34, 0.06);
  voxel(group, mats.fox, 0.03, 0.06, 0.02, 0.18, 0.34, -0.06);
  voxel(group, mats.fox, 0.04, 0.04, 0.14, -0.2, 0.22, 0);
  voxel(group, mats.foxTip, 0.03, 0.03, 0.04, -0.3, 0.22, 0);
  for (const [x, z] of [[-0.08, 0.05], [-0.08, -0.05], [0.08, 0.05], [0.08, -0.05]] as const) {
    voxel(group, mats.fox, 0.025, 0.08, 0.025, x, 0.08, z);
  }
}

function buildHare(group: Group, mats: AnimalMats): void {
  voxel(group, mats.hare, 0.12, 0.08, 0.08, 0, 0.18, 0);
  voxel(group, mats.hare, 0.06, 0.06, 0.06, 0.14, 0.22, 0);
  voxel(group, mats.hare, 0.02, 0.1, 0.02, 0.14, 0.34, 0.04);
  voxel(group, mats.hare, 0.02, 0.1, 0.02, 0.14, 0.34, -0.04);
  for (const [x, z] of [[-0.06, 0.04], [-0.06, -0.04], [0.06, 0.04], [0.06, -0.04]] as const) {
    voxel(group, mats.sheepFace, 0.02, 0.07, 0.02, x, 0.07, z);
  }
}

function buildCamel(group: Group, mats: AnimalMats): void {
  voxel(group, mats.camel, 0.28, 0.12, 0.12, 0, 0.36, 0);
  voxel(group, mats.camel, 0.1, 0.12, 0.1, -0.05, 0.52, 0);
  voxel(group, mats.camel, 0.08, 0.16, 0.08, 0.28, 0.48, 0);
  voxel(group, mats.camel, 0.1, 0.07, 0.07, 0.4, 0.58, 0);
  for (const [x, z] of [[-0.16, 0.07], [-0.16, -0.07], [0.14, 0.07], [0.14, -0.07]] as const) {
    voxel(group, mats.horseMane, 0.035, 0.16, 0.035, x, 0.16, z);
  }
}

function buildGiraffe(group: Group, mats: AnimalMats): void {
  voxel(group, mats.giraffe, 0.22, 0.12, 0.1, 0, 0.42, 0);
  voxel(group, mats.giraffeSpot, 0.08, 0.08, 0.11, -0.04, 0.46, 0);
  voxel(group, mats.giraffeSpot, 0.06, 0.05, 0.11, 0.1, 0.4, 0);
  voxel(group, mats.giraffe, 0.05, 0.28, 0.05, 0.22, 0.7, 0);
  voxel(group, mats.giraffeSpot, 0.04, 0.08, 0.055, 0.22, 0.78, 0);
  voxel(group, mats.giraffe, 0.08, 0.06, 0.06, 0.3, 0.98, 0);
  voxel(group, mats.giraffeSpot, 0.02, 0.04, 0.015, 0.28, 1.08, 0.03);
  voxel(group, mats.giraffeSpot, 0.02, 0.04, 0.015, 0.28, 1.08, -0.03);
  voxel(group, mats.giraffe, 0.03, 0.03, 0.1, -0.22, 0.46, 0);
  for (const [x, z] of [[-0.12, 0.06], [-0.12, -0.06], [0.1, 0.06], [0.1, -0.06]] as const) {
    voxel(group, mats.giraffeSpot, 0.03, 0.2, 0.03, x, 0.2, z);
  }
}

function buildElephant(group: Group, mats: AnimalMats): void {
  voxel(group, mats.elephant, 0.32, 0.18, 0.18, 0, 0.4, 0);
  voxel(group, mats.elephant, 0.14, 0.12, 0.12, 0.34, 0.48, 0);
  voxel(group, mats.elephant, 0.04, 0.16, 0.04, 0.44, 0.36, 0);
  voxel(group, mats.elephant, 0.05, 0.04, 0.04, 0.46, 0.2, 0);
  voxel(group, mats.elephantEar, 0.02, 0.12, 0.14, 0.28, 0.52, 0.16);
  voxel(group, mats.elephantEar, 0.02, 0.12, 0.14, 0.28, 0.52, -0.16);
  voxel(group, mats.elephantTusk, 0.02, 0.02, 0.08, 0.4, 0.36, 0.08);
  voxel(group, mats.elephantTusk, 0.02, 0.02, 0.08, 0.4, 0.36, -0.08);
  voxel(group, mats.elephant, 0.04, 0.04, 0.12, -0.32, 0.42, 0);
  for (const [x, z] of [[-0.16, 0.1], [-0.16, -0.1], [0.14, 0.1], [0.14, -0.1]] as const) {
    voxel(group, mats.elephantEar, 0.05, 0.16, 0.05, x, 0.16, z);
  }
}

function buildLizard(group: Group, mats: AnimalMats): void {
  voxel(group, mats.lizard, 0.22, 0.05, 0.08, 0, 0.1, 0);
  voxel(group, mats.lizard, 0.06, 0.04, 0.05, 0.22, 0.12, 0);
  voxel(group, mats.lizard, 0.03, 0.02, 0.12, -0.22, 0.1, 0);
  for (const [x, z] of [[-0.06, 0.1], [-0.06, -0.1], [0.08, 0.1], [0.08, -0.1]] as const) {
    voxel(group, mats.lizard, 0.03, 0.02, 0.06, x, 0.06, z);
  }
}

function buildSnake(group: Group, mats: AnimalMats): void {
  voxel(group, mats.snake, 0.08, 0.05, 0.05, 0.16, 0.08, 0);
  voxel(group, mats.snake, 0.1, 0.05, 0.05, 0.02, 0.08, 0.04);
  voxel(group, mats.snake, 0.1, 0.05, 0.05, -0.12, 0.08, -0.04);
  voxel(group, mats.snake, 0.08, 0.05, 0.05, -0.24, 0.08, 0.04);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.24, 0.1, 0);
}

function buildScorpion(group: Group, mats: AnimalMats): void {
  voxel(group, mats.scorpion, 0.14, 0.05, 0.1, 0, 0.1, 0);
  voxel(group, mats.scorpion, 0.04, 0.1, 0.04, -0.14, 0.18, 0);
  voxel(group, mats.scorpion, 0.03, 0.03, 0.08, -0.14, 0.28, 0);
  voxel(group, mats.crab, 0.08, 0.03, 0.03, 0.16, 0.1, 0.1);
  voxel(group, mats.crab, 0.08, 0.03, 0.03, 0.16, 0.1, -0.1);
  for (const z of [-0.1, -0.04, 0.04, 0.1] as const) {
    voxel(group, mats.scorpion, 0.08, 0.015, 0.015, -0.02, 0.06, z);
  }
}

function buildChicken(group: Group, mats: AnimalMats): void {
  voxel(group, mats.chicken, 0.1, 0.08, 0.08, 0, 0.2, 0);
  voxel(group, mats.chicken, 0.06, 0.05, 0.05, 0.12, 0.26, 0);
  voxel(group, mats.chickenComb, 0.02, 0.04, 0.03, 0.12, 0.34, 0);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.18, 0.24, 0);
  for (const z of [-0.04, 0.04] as const) {
    voxel(group, mats.sheepFace, 0.02, 0.07, 0.02, 0, 0.07, z);
  }
}

function buildPig(group: Group, mats: AnimalMats): void {
  voxel(group, mats.pig, 0.2, 0.12, 0.12, 0, 0.24, 0);
  voxel(group, mats.pig, 0.08, 0.07, 0.08, 0.22, 0.26, 0);
  voxel(group, mats.pig, 0.04, 0.03, 0.04, 0.3, 0.24, 0);
  voxel(group, mats.pig, 0.03, 0.04, 0.02, 0.2, 0.34, 0.06);
  voxel(group, mats.pig, 0.03, 0.04, 0.02, 0.2, 0.34, -0.06);
  for (const [x, z] of [[-0.1, 0.06], [-0.1, -0.06], [0.08, 0.06], [0.08, -0.06]] as const) {
    voxel(group, mats.pig, 0.03, 0.08, 0.03, x, 0.08, z);
  }
}

function buildGoat(group: Group, mats: AnimalMats): void {
  voxel(group, mats.goat, 0.18, 0.1, 0.1, 0, 0.26, 0);
  voxel(group, mats.goat, 0.07, 0.08, 0.07, 0.2, 0.34, 0);
  voxel(group, mats.goat, 0.015, 0.08, 0.015, 0.2, 0.46, 0.04);
  voxel(group, mats.goat, 0.015, 0.08, 0.015, 0.2, 0.46, -0.04);
  for (const [x, z] of [[-0.1, 0.05], [-0.1, -0.05], [0.08, 0.05], [0.08, -0.05]] as const) {
    voxel(group, mats.sheepFace, 0.025, 0.1, 0.025, x, 0.1, z);
  }
}

function buildRabbit(group: Group, mats: AnimalMats): void {
  voxel(group, mats.rabbit, 0.1, 0.08, 0.08, 0, 0.16, 0);
  voxel(group, mats.rabbit, 0.05, 0.05, 0.05, 0.12, 0.2, 0);
  voxel(group, mats.rabbit, 0.015, 0.1, 0.015, 0.12, 0.32, 0.03);
  voxel(group, mats.rabbit, 0.015, 0.1, 0.015, 0.12, 0.32, -0.03);
  for (const [x, z] of [[-0.04, 0.04], [-0.04, -0.04], [0.04, 0.04], [0.04, -0.04]] as const) {
    voxel(group, mats.hare, 0.02, 0.06, 0.02, x, 0.06, z);
  }
}

function buildDeer(group: Group, mats: AnimalMats): void {
  voxel(group, mats.deer, 0.22, 0.12, 0.1, 0, 0.34, 0);
  voxel(group, mats.deer, 0.07, 0.16, 0.07, 0.24, 0.48, 0);
  voxel(group, mats.deer, 0.08, 0.06, 0.06, 0.34, 0.58, 0);
  voxel(group, mats.horseMane, 0.02, 0.1, 0.02, 0.34, 0.7, 0.05);
  voxel(group, mats.horseMane, 0.02, 0.1, 0.02, 0.34, 0.7, -0.05);
  for (const [x, z] of [[-0.12, 0.06], [-0.12, -0.06], [0.1, 0.06], [0.1, -0.06]] as const) {
    voxel(group, mats.deer, 0.03, 0.14, 0.03, x, 0.14, z);
  }
}

function buildOwl(group: Group, mats: AnimalMats): void {
  voxel(group, mats.owl, 0.12, 0.14, 0.1, 0, 0.28, 0);
  voxel(group, mats.owl, 0.1, 0.08, 0.1, 0, 0.44, 0);
  voxel(group, mats.foxTip, 0.03, 0.03, 0.02, 0.08, 0.46, 0.04);
  voxel(group, mats.foxTip, 0.03, 0.03, 0.02, 0.08, 0.46, -0.04);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.12, 0.42, 0);
  for (const z of [-0.05, 0.05] as const) {
    voxel(group, mats.owl, 0.03, 0.06, 0.02, 0, 0.08, z);
  }
}

function buildRaccoon(group: Group, mats: AnimalMats): void {
  voxel(group, mats.raccoon, 0.16, 0.09, 0.1, 0, 0.2, 0);
  voxel(group, mats.raccoon, 0.07, 0.06, 0.07, 0.18, 0.24, 0);
  voxel(group, mats.sheep, 0.08, 0.04, 0.04, 0.18, 0.26, 0);
  voxel(group, mats.raccoon, 0.04, 0.04, 0.12, -0.18, 0.2, 0);
  voxel(group, mats.sheep, 0.03, 0.03, 0.04, -0.26, 0.2, 0);
  for (const [x, z] of [[-0.08, 0.05], [-0.08, -0.05], [0.08, 0.05], [0.08, -0.05]] as const) {
    voxel(group, mats.raccoon, 0.025, 0.08, 0.025, x, 0.08, z);
  }
}

function buildFish(group: Group, mats: AnimalMats): void {
  voxel(group, mats.fish, 0.16, 0.07, 0.06, 0, 0.24, 0);
  voxel(group, mats.fishFin, 0.04, 0.05, 0.02, -0.16, 0.26, 0);
  voxel(group, mats.fishFin, 0.03, 0.02, 0.08, 0, 0.28, 0.08);
  voxel(group, mats.sheep, 0.02, 0.02, 0.02, 0.14, 0.26, 0.03);
}

function buildOctopus(group: Group, mats: AnimalMats): void {
  voxel(group, mats.octopus, 0.14, 0.1, 0.14, 0, 0.24, 0);
  for (const [x, z] of [[0.14, 0.1], [0.14, -0.1], [-0.14, 0.1], [-0.14, -0.1], [0.1, 0.16], [-0.1, -0.16]] as const) {
    voxel(group, mats.octopus, 0.03, 0.12, 0.03, x, 0.12, z);
  }
}

function buildSeahorse(group: Group, mats: AnimalMats): void {
  voxel(group, mats.seahorse, 0.06, 0.16, 0.06, 0, 0.28, 0);
  voxel(group, mats.seahorse, 0.05, 0.05, 0.05, 0.06, 0.42, 0);
  voxel(group, mats.fishFin, 0.02, 0.06, 0.04, -0.06, 0.3, 0);
  voxel(group, mats.seahorse, 0.04, 0.03, 0.03, 0, 0.12, 0.04);
}

function buildRay(group: Group, mats: AnimalMats): void {
  voxel(group, mats.ray, 0.28, 0.04, 0.2, 0, 0.16, 0);
  voxel(group, mats.ray, 0.08, 0.04, 0.06, 0.24, 0.16, 0);
  voxel(group, mats.sheepFace, 0.03, 0.02, 0.08, -0.24, 0.16, 0);
}

function buildShark(group: Group, mats: AnimalMats): void {
  voxel(group, mats.shark, 0.36, 0.12, 0.14, 0, 0.28, 0);
  voxel(group, mats.sharkBelly, 0.3, 0.06, 0.12, 0.02, 0.2, 0);
  voxel(group, mats.shark, 0.12, 0.1, 0.1, 0.4, 0.3, 0);
  voxel(group, mats.shark, 0.04, 0.14, 0.04, -0.05, 0.48, 0);
  voxel(group, mats.shark, 0.1, 0.04, 0.18, -0.05, 0.28, 0.2);
  voxel(group, mats.shark, 0.1, 0.04, 0.18, -0.05, 0.28, -0.2);
  voxel(group, mats.shark, 0.08, 0.1, 0.03, -0.4, 0.3, 0);
  voxel(group, mats.shark, 0.06, 0.04, 0.08, -0.48, 0.24, 0);
  voxel(group, mats.sheep, 0.02, 0.02, 0.02, 0.48, 0.34, 0.05);
}

function buildWhale(group: Group, mats: AnimalMats): void {
  voxel(group, mats.whale, 0.55, 0.22, 0.24, 0, 0.36, 0);
  voxel(group, mats.whaleBelly, 0.48, 0.1, 0.2, 0.04, 0.22, 0);
  voxel(group, mats.whale, 0.18, 0.16, 0.16, 0.58, 0.38, 0);
  voxel(group, mats.whale, 0.08, 0.06, 0.06, 0.72, 0.28, 0);
  voxel(group, mats.whale, 0.12, 0.04, 0.28, -0.1, 0.34, 0.3);
  voxel(group, mats.whale, 0.12, 0.04, 0.28, -0.1, 0.34, -0.3);
  voxel(group, mats.whale, 0.06, 0.16, 0.04, -0.1, 0.58, 0);
  voxel(group, mats.whale, 0.16, 0.14, 0.04, -0.62, 0.4, 0);
  voxel(group, mats.whale, 0.08, 0.06, 0.18, -0.78, 0.36, 0);
  voxel(group, mats.sheep, 0.03, 0.03, 0.03, 0.7, 0.42, 0.08);
  voxel(group, mats.sheep, 0.03, 0.03, 0.03, 0.7, 0.42, -0.08);
}

function buildJelly(group: Group, mats: AnimalMats): void {
  voxel(group, mats.jellyGlow, 0.28, 0.14, 0.28, 0, 0.55, 0);
  voxel(group, mats.jelly, 0.22, 0.1, 0.22, 0, 0.42, 0);
  voxel(group, mats.jellyGlow, 0.16, 0.06, 0.16, 0, 0.64, 0);
  for (const [x, z] of [
    [0.14, 0.1],
    [0.14, -0.1],
    [-0.14, 0.1],
    [-0.14, -0.1],
    [0.05, 0.18],
    [-0.05, -0.18],
    [0.18, 0],
    [-0.18, 0],
  ] as const) {
    voxel(group, mats.jelly, 0.025, 0.28, 0.025, x, 0.18, z);
    voxel(group, mats.jellyGlow, 0.02, 0.08, 0.02, x, -0.02, z);
  }
}

function buildPigeon(group: Group, mats: AnimalMats): void {
  voxel(group, mats.pigeon, 0.1, 0.06, 0.08, 0, 0.2, 0);
  voxel(group, mats.pigeon, 0.05, 0.05, 0.05, 0.12, 0.24, 0);
  voxel(group, mats.seagullWing, 0.03, 0.02, 0.12, 0, 0.22, 0.12);
  voxel(group, mats.seagullWing, 0.03, 0.02, 0.12, 0, 0.22, -0.12);
  for (const z of [-0.03, 0.03] as const) {
    voxel(group, mats.pigeon, 0.015, 0.06, 0.015, 0, 0.06, z);
  }
}

function buildCat(group: Group, mats: AnimalMats): void {
  voxel(group, mats.cat, 0.14, 0.08, 0.09, 0, 0.18, 0);
  voxel(group, mats.cat, 0.07, 0.06, 0.07, 0.16, 0.24, 0);
  voxel(group, mats.cat, 0.025, 0.05, 0.02, 0.14, 0.32, 0.04);
  voxel(group, mats.cat, 0.025, 0.05, 0.02, 0.14, 0.32, -0.04);
  voxel(group, mats.cat, 0.03, 0.03, 0.12, -0.16, 0.2, 0);
  for (const [x, z] of [[-0.06, 0.05], [-0.06, -0.05], [0.06, 0.05], [0.06, -0.05]] as const) {
    voxel(group, mats.cat, 0.02, 0.07, 0.02, x, 0.07, z);
  }
}

function buildRat(group: Group, mats: AnimalMats): void {
  voxel(group, mats.rat, 0.12, 0.06, 0.07, 0, 0.14, 0);
  voxel(group, mats.rat, 0.05, 0.04, 0.05, 0.12, 0.16, 0);
  voxel(group, mats.rat, 0.02, 0.02, 0.14, -0.16, 0.14, 0);
  voxel(group, mats.rat, 0.015, 0.04, 0.015, 0.12, 0.22, 0.03);
  voxel(group, mats.rat, 0.015, 0.04, 0.015, 0.12, 0.22, -0.03);
  for (const [x, z] of [[-0.04, 0.04], [-0.04, -0.04], [0.04, 0.04], [0.04, -0.04]] as const) {
    voxel(group, mats.rat, 0.015, 0.05, 0.015, x, 0.05, z);
  }
}

function buildParrot(group: Group, mats: AnimalMats): void {
  voxel(group, mats.parrot, 0.1, 0.08, 0.08, 0, 0.24, 0);
  voxel(group, mats.parrot, 0.06, 0.06, 0.06, 0.12, 0.3, 0);
  voxel(group, mats.parrotWing, 0.04, 0.03, 0.14, 0, 0.26, 0.12);
  voxel(group, mats.parrotTail, 0.04, 0.03, 0.14, 0, 0.26, -0.12);
  voxel(group, mats.parrotTail, 0.1, 0.03, 0.04, -0.16, 0.22, 0);
  voxel(group, mats.parrotWing, 0.03, 0.02, 0.02, 0.16, 0.28, 0.03);
  for (const z of [-0.03, 0.03] as const) {
    voxel(group, mats.parrot, 0.015, 0.07, 0.015, 0, 0.08, z);
  }
}

function buildFrog(group: Group, mats: AnimalMats): void {
  voxel(group, mats.frog, 0.14, 0.07, 0.1, 0, 0.16, 0);
  voxel(group, mats.frogBelly, 0.1, 0.04, 0.08, 0.02, 0.12, 0);
  voxel(group, mats.frog, 0.06, 0.05, 0.06, 0.14, 0.2, 0);
  voxel(group, mats.frog, 0.03, 0.03, 0.02, 0.12, 0.26, 0.04);
  voxel(group, mats.frog, 0.03, 0.03, 0.02, 0.12, 0.26, -0.04);
  for (const [x, z] of [[-0.08, 0.08], [-0.08, -0.08], [0.08, 0.08], [0.08, -0.08]] as const) {
    voxel(group, mats.frog, 0.03, 0.05, 0.03, x, 0.06, z);
  }
}

function buildToucan(group: Group, mats: AnimalMats): void {
  voxel(group, mats.toucan, 0.12, 0.08, 0.08, 0, 0.24, 0);
  voxel(group, mats.toucanChest, 0.06, 0.05, 0.07, 0.08, 0.2, 0);
  voxel(group, mats.toucan, 0.06, 0.06, 0.06, 0.14, 0.3, 0);
  voxel(group, mats.toucanBeak, 0.12, 0.035, 0.035, 0.28, 0.28, 0);
  voxel(group, mats.seagullWing, 0.03, 0.02, 0.12, 0, 0.26, 0.12);
  voxel(group, mats.seagullWing, 0.03, 0.02, 0.12, 0, 0.26, -0.12);
  for (const z of [-0.03, 0.03] as const) {
    voxel(group, mats.toucan, 0.015, 0.07, 0.015, 0, 0.08, z);
  }
}

function buildMonkey(group: Group, mats: AnimalMats): void {
  voxel(group, mats.monkey, 0.12, 0.1, 0.1, 0, 0.28, 0);
  voxel(group, mats.monkeyFace, 0.07, 0.07, 0.07, 0.14, 0.34, 0);
  voxel(group, mats.monkey, 0.04, 0.05, 0.02, 0.12, 0.42, 0.05);
  voxel(group, mats.monkey, 0.04, 0.05, 0.02, 0.12, 0.42, -0.05);
  voxel(group, mats.monkey, 0.03, 0.03, 0.14, -0.14, 0.26, 0);
  for (const [x, z] of [[-0.06, 0.06], [-0.06, -0.06], [0.06, 0.06], [0.06, -0.06]] as const) {
    voxel(group, mats.monkey, 0.025, 0.1, 0.025, x, 0.1, z);
  }
}
