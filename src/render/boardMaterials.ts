import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  Path,
  ShaderMaterial,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import {
  mergeGeometries,
} from "three/addons/utils/BufferGeometryUtils.js";
import {
  CELL,
  PIT_WELL,
  type Piece,
} from "../core/layout.ts";
import {
} from "../core/math.ts";
import {
  crumbleTexture,
  specialTileTexture,
  type SpecialTileId,
} from "./tileTextures.ts";

export function starGeometry(): BufferGeometry {
  const shape = new Shape();
  const spikes = 5;
  const outer = 0.22;
  const inner = 0.1;
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 2) + (i * Math.PI) / spikes;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.018,
    bevelSegments: 1,
  });
  geo.center();
  return geo;
}

/** One wing half (points +X). Mirrored in the pickup for a left/right pair. */
export function wingGeometry(): BufferGeometry {
  const shape = new Shape();
  // Root near the body, tip high and out — classic angel/bird wing.
  shape.moveTo(0.01, 0.04);
  shape.bezierCurveTo(0.1, 0.18, 0.22, 0.3, 0.36, 0.34);
  shape.bezierCurveTo(0.42, 0.28, 0.44, 0.18, 0.4, 0.1);
  // Scalloped trailing edge (feathers).
  shape.quadraticCurveTo(0.36, 0.02, 0.34, -0.02);
  shape.quadraticCurveTo(0.3, 0.04, 0.26, -0.04);
  shape.quadraticCurveTo(0.22, 0.03, 0.18, -0.06);
  shape.quadraticCurveTo(0.14, 0.02, 0.1, -0.05);
  shape.quadraticCurveTo(0.06, 0.01, 0.03, -0.02);
  shape.lineTo(0.01, -0.02);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -0.0275);
  geo.center();
  // Sit the root closer to x=0 so mirrored halves meet in the middle.
  geo.translate(0.02, 0.02, 0);
  return geo;
}

/** Cartoon ghost: domed head, scalloped hem, two eye cutouts. Faces +Z. */
export function ghostGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-0.18, -0.18);
  shape.lineTo(-0.18, 0.04);
  shape.bezierCurveTo(-0.18, 0.22, -0.1, 0.3, 0, 0.3);
  shape.bezierCurveTo(0.1, 0.3, 0.18, 0.22, 0.18, 0.04);
  shape.lineTo(0.18, -0.18);
  shape.quadraticCurveTo(0.13, -0.09, 0.09, -0.18);
  shape.quadraticCurveTo(0.045, -0.09, 0, -0.18);
  shape.quadraticCurveTo(-0.045, -0.09, -0.09, -0.18);
  shape.quadraticCurveTo(-0.13, -0.09, -0.18, -0.18);
  // Large oval cutouts so the eyes read clearly while the pickup spins.
  for (const x of [-0.07, 0.07]) {
    const eye = new Path();
    eye.absellipse(x, 0.08, 0.042, 0.058, 0, Math.PI * 2, true, 0);
    shape.holes.push(eye);
  }
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 12,
  });
  geo.translate(0, 0, -0.05);
  geo.center();
  return geo;
}

export function arrowGeometry(): BufferGeometry {
  const shaft = new BoxGeometry(0.08, 0.028, 0.14);
  shaft.translate(0, 0, 0.02);
  const head = new BoxGeometry(0.18, 0.028, 0.08);
  head.translate(0, 0, -0.09);
  const merged = mergeGeometries([shaft, head]);
  shaft.dispose();
  head.dispose();
  if (!merged) throw new Error("Arrow geometry failed");
  return merged;
}

const RAMP_WIDTH = 32;
export const ramp = shadeRamp(3);
export let paintedSteps = 3;
export let paintedNormal = false;
export let organicProps = false;

export function setOrganicProps(value: boolean): void {
  organicProps = value;
}

/** Cast/receive on every mesh under a meadow (win, fail) — same as the play board. */
export function enableMeadowShadows(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Mesh;
    // Prefer isMesh over instanceof — Vite can load duplicate three copies.
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function shadeRamp(bands: number): DataTexture {
  const tex = new DataTexture(rampBytes(bands, false), RAMP_WIDTH, 1);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function paintRamp(tex: DataTexture, bands: number, normal = false): void {
  tex.image.data = rampBytes(bands, normal);
  tex.image.width = RAMP_WIDTH;
  tex.image.height = 1;
  tex.needsUpdate = true;
  paintedSteps = bands;
  paintedNormal = normal;
}

function rampBytes(bands: number, normal: boolean): Uint8Array {
  const data = new Uint8Array(RAMP_WIDTH * 4);
  for (let i = 0; i < RAMP_WIDTH; i += 1) {
    const t = i / (RAMP_WIDTH - 1);
    const tone = 72 + Math.round((255 - 72) * (normal ? t : quantize(t, bands)));
    const offset = i * 4;
    data[offset] = tone;
    data[offset + 1] = tone;
    data[offset + 2] = tone;
    data[offset + 3] = 255;
  }
  return data;
}

function quantize(t: number, bands: number): number {
  const lo = Math.max(2, Math.floor(bands));
  const blend = bands - lo;
  return bandValue(t, lo) + (bandValue(t, lo + 1) - bandValue(t, lo)) * blend;
}

function bandValue(t: number, bands: number): number {
  const span = bands - 1;
  return Math.round(t * span) / span;
}

export function makeCrumbleMat(): MeshToonMaterial {
  return new MeshToonMaterial({
    color: "#ffffff",
    map: crumbleTexture(),
    emissive: token("--maze-crumble-mark"),
    emissiveIntensity: 0.03,
    gradientMap: ramp,
  });
}

/** Special floor tiles (boost / warp / ice / switch / goal) from `texture-imports/tiles/`. */
export function makeSpecialTileMat(
  id: SpecialTileId,
  emissiveToken: string,
  emissiveIntensity: number,
): MeshToonMaterial {
  return new MeshToonMaterial({
    color: "#ffffff",
    map: specialTileTexture(id),
    emissive: token(emissiveToken),
    emissiveIntensity,
    gradientMap: ramp,
  });
}

export function makeCrumbleWell(
  piece: Piece,
  pitMat: MeshToonMaterial,
  lipMat: MeshToonMaterial,
  voidMat: ShaderMaterial,
): Group {
  const well = new Group();
  const thickness = 0.05;
  const top = -0.008;
  const floor = -PIT_WELL;
  const mid = (top + floor) / 2;
  const hy = (top - floor) / 2;
  const half = CELL / 2;
  // Overlap past half so walls seal at corners (matches pitCell in layout.ts).
  const wallAlong = half + 0.01;
  const wallInset = half - thickness / 2;
  const voidHalf = half + 0.02;
  const originY = piece.y;
  const sides: Array<[number, number, number, number, number, number]> = [
    [0, mid - originY, -wallInset, wallAlong, hy, thickness / 2],
    [0, mid - originY, wallInset, wallAlong, hy, thickness / 2],
    [-wallInset, mid - originY, 0, thickness / 2, hy, wallAlong],
    [wallInset, mid - originY, 0, thickness / 2, hy, wallAlong],
  ];
  for (const [x, y, z, hx, halfY, hz] of sides) {
    const wall = new Mesh(new BoxGeometry(hx * 2, halfY * 2, hz * 2), pitMat);
    wall.position.set(x, y, z);
    well.add(wall);
  }
  const voidFloor = new Mesh(new BoxGeometry(voidHalf * 2, 0.06, voidHalf * 2), voidMat);
  voidFloor.position.set(0, floor - 0.03 - originY, 0);
  voidFloor.renderOrder = -1;
  well.add(voidFloor);
  const lipT = 0.03;
  const lipY = 0.014 - originY;
  const lipAlong = half + 0.01;
  const lipInset = half - lipT / 2;
  const lips: Array<[number, number, number, number, number, number]> = [
    [0, lipY, -lipInset, lipAlong, 0.012, lipT / 2],
    [0, lipY, lipInset, lipAlong, 0.012, lipT / 2],
    [-lipInset, lipY, 0, lipT / 2, 0.012, lipAlong],
    [lipInset, lipY, 0, lipT / 2, 0.012, lipAlong],
  ];
  for (const [x, y, z, hx, halfY, hz] of lips) {
    const lip = new Mesh(new BoxGeometry(hx * 2, halfY * 2, hz * 2), lipMat);
    lip.position.set(x, y, z);
    well.add(lip);
  }
  return well;
}

export function makeVoidStarMat(resolution: Vector2, camDir: Vector3): ShaderMaterial {
  const deep = token("--maze-pit");
  const star = token("--maze-void-star");
  const dim = token("--maze-void-star-dim");
  const glow = token("--maze-void-glow");
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: resolution },
      uCamDir: { value: camDir },
      uDeep: { value: hexToVec3(deep) },
      uStar: { value: hexToVec3(star) },
      uDim: { value: hexToVec3(dim) },
      uGlow: { value: hexToVec3(glow) },
    },
    vertexShader: `
      varying vec4 vClip;
      void main() {
        vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vClip;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uCamDir;
      uniform vec3 uDeep;
      uniform vec3 uStar;
      uniform vec3 uDim;
      uniform vec3 uGlow;
      varying vec4 vClip;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // Soft point inside a cell; always visible, pulses brighter for drama.
      float softStar(vec2 uv, float seed, float radius, float density) {
        vec2 cell = floor(uv);
        float n = hash21(cell + seed);
        if (n < density) return 0.0;
        vec2 local = fract(uv) - 0.5;
        vec2 offset = vec2(hash21(cell + seed + 1.7), hash21(cell + seed + 3.1)) - 0.5;
        local -= offset * 0.55;
        float d = length(local);
        float core = smoothstep(radius, 0.0, d);
        float phase = uTime * (1.8 + n * 3.4) + n * 12.0;
        // Floor stays lit; crest punches hard so the twinkle reads dramatic.
        float pulse = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(phase), 2.0);
        float flash = 0.2 * pow(max(0.0, sin(phase * 0.65 + n * 4.0)), 6.0);
        return core * min(1.0, pulse + flash);
      }

      void main() {
        vec2 screen = (vClip.xy / max(vClip.w, 0.0001)) * 0.5 + 0.5;
        float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
        // Chunk to screen pixels so the field feels like the rest of the game.
        float px = 140.0;
        screen = floor(screen * vec2(px * aspect, px)) / vec2(px * aspect, px);
        // Screen-space field so stars drift differently from pit geometry when the board tilts.
        vec2 base = screen;
        base.x *= aspect;
        base += uCamDir.xz * vec2(0.22, 0.16);
        base -= uCamDir.y * 0.08;

        vec3 color = uDeep;
        float dust = hash21(floor(base * 26.0 + uCamDir.zx * 3.0));
        color += uGlow * step(0.88, dust) * 0.05;

        float far = softStar(base * 48.0 + vec2(uTime * 0.02, -uTime * 0.014), 0.0, 0.13, 0.78);
        float mid = softStar(base * 72.0 + uCamDir.xz * 3.0 + vec2(-uTime * 0.03, uTime * 0.022), 11.0, 0.095, 0.82);
        float near = softStar(base * 104.0 + vec2(uTime * 0.016, uTime * 0.024), 29.0, 0.065, 0.86);
        float spark = softStar(base * 130.0 + uCamDir.xz * 1.5 + vec2(-uTime * 0.022, -uTime * 0.018), 47.0, 0.05, 0.88);

        color = mix(color, uDim, clamp(far, 0.0, 1.0));
        color = mix(color, mix(uDim, uStar, 0.55), clamp(mid, 0.0, 1.0));
        color = mix(color, uStar, clamp(near, 0.0, 1.0));
        color = mix(color, uStar, clamp(spark, 0.0, 1.0));

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthWrite: true,
    depthTest: true,
  });
}

function hexToVec3(hex: string): Vector3 {
  const raw = hex.trim().replace("#", "");
  const full = raw.length === 3
    ? raw.split("").map((ch) => ch + ch).join("")
    : raw.padStart(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return new Vector3(0, 0, 0);
  return new Vector3(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
}

export function crumbleChunks(parent: Mesh, piece: Piece, material: MeshToonMaterial): Mesh[] {
  const cols = 3;
  const rows = 3;
  const gap = 0.028;
  const sizeX = (piece.hx * 2 - gap * (cols - 1)) / cols;
  const sizeZ = (piece.hz * 2 - gap * (rows - 1)) / rows;
  const sizeY = piece.hy * 2;
  const chunks: Mesh[] = [];
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const geo = new BoxGeometry(sizeX, sizeY, sizeZ);
      setCrumbleChunkUVs(geo, ix, iz, cols, rows);
      const chunk = new Mesh(geo, material);
      const restX = (ix - (cols - 1) / 2) * (sizeX + gap);
      const restZ = (iz - (rows - 1) / 2) * (sizeZ + gap);
      chunk.position.set(restX, 0, restZ);
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      chunk.userData.restX = restX;
      chunk.userData.restZ = restZ;
      chunk.userData.dirX = ix - (cols - 1) / 2;
      chunk.userData.dirZ = iz - (rows - 1) / 2;
      chunk.userData.tilt = ((ix * 5 + iz * 3) % 5) - 2;
      parent.add(chunk);
      chunks.push(chunk);
    }
  }
  return chunks;
}

function setCrumbleChunkUVs(geo: BoxGeometry, ix: number, iz: number, cols: number, rows: number): void {
  const uv = geo.getAttribute("uv");
  if (!uv) return;
  const u0 = ix / cols;
  const u1 = (ix + 1) / cols;
  const v0 = 1 - (iz + 1) / rows;
  const v1 = 1 - iz / rows;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. Remap every face so pieces share one tile atlas.
  for (let face = 0; face < 6; face += 1) {
    const i = face * 4;
    uv.setXY(i, u0, v1);
    uv.setXY(i + 1, u1, v1);
    uv.setXY(i + 2, u0, v0);
    uv.setXY(i + 3, u1, v0);
  }
  uv.needsUpdate = true;
}

export function toon(color: string, emissive = "#000000", emissiveIntensity = 0): MeshToonMaterial {
  return new MeshToonMaterial({
    color,
    emissive,
    emissiveIntensity,
    gradientMap: ramp,
  });
}

export function glow(color: string): MeshToonMaterial {
  const mat = toon(color, color, 0.7);
  mat.side = DoubleSide;
  mat.toneMapped = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -4;
  mat.polygonOffsetUnits = -4;
  return mat;
}

export function facet(geo: BufferGeometry): BufferGeometry {
  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();
  return flat;
}

/** Top-face paint for one-way gates — matches editor half green / half red. */
export function makeGateTopTexture(dir: NonNullable<Piece["oneWay"]>): CanvasTexture {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gate top canvas unavailable");
  const ok = token("--maze-gate-ok");
  const no = token("--maze-gate-no");
  const mid = size / 2;
  // Box +y UVs: u west→east; with flipY, image top maps to +z (south).
  if (dir === "e") {
    ctx.fillStyle = ok;
    ctx.fillRect(0, 0, mid, size);
    ctx.fillStyle = no;
    ctx.fillRect(mid, 0, mid, size);
  } else if (dir === "w") {
    ctx.fillStyle = no;
    ctx.fillRect(0, 0, mid, size);
    ctx.fillStyle = ok;
    ctx.fillRect(mid, 0, mid, size);
  } else if (dir === "s") {
    ctx.fillStyle = no;
    ctx.fillRect(0, 0, size, mid);
    ctx.fillStyle = ok;
    ctx.fillRect(0, mid, size, mid);
  } else {
    ctx.fillStyle = ok;
    ctx.fillRect(0, 0, size, mid);
    ctx.fillStyle = no;
    ctx.fillRect(0, mid, size, mid);
  }
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function gateSignMaterial(color: string, kind: "ok" | "no"): MeshBasicMaterial {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gate sign canvas unavailable");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  if (kind === "ok") {
    ctx.beginPath();
    ctx.moveTo(6, 17);
    ctx.lineTo(13, 24);
    ctx.lineTo(26, 8);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    ctx.fillRect(13, 5, 6, 16);
    ctx.beginPath();
    ctx.arc(16, 26, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const mat = new MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
  });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  return mat;
}

export function token(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value.length === 0) throw new Error(`Missing CSS token ${name}`);
  return value;
}
