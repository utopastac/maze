import {
  BoxGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Vector3,
  type BufferGeometry,
} from "three";
import { makeHeartIcon } from "../collectibleMeshes.ts";
import type { HudContext } from "./context.ts";
import { TextPlate, disposePlate } from "./plates.ts";

const SHOUT_LIFE = 1.05;
const SHOUT_POP = 0.18;
const SHATTER_LIFE = 0.7;
/** Shared by start-gate and home-menu plate shatters. */
export const GATE_SHATTER_LIFE = 0.9;
const CENTER_HEART_DROP = 0.28;
const CENTER_SHATTER_LIFE = 1.05;

type ComicShout = {
  root: Group;
  faceMat: MeshBasicMaterial;
  shadeMat: MeshBasicMaterial;
  age: number;
  baseY: number;
};

type HeartShard = {
  mesh: Mesh;
  mat: MeshStandardMaterial;
  geo: BufferGeometry;
  ownsGeo: boolean;
  baseScale: number;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  age: number;
  life: number;
};

type CenterHeartBurst = {
  root: Group;
  age: number;
  size: number;
  x: number;
  y: number;
  z: number;
  fromY: number;
  shattered: boolean;
};

/** Comic shouts, shatter shards, and the center heart burst. */
export class HudFx {
  readonly shoutLayer = new Group();
  readonly shatterLayer = new Group();
  private readonly ctx: HudContext;
  private readonly shouts: ComicShout[] = [];
  private readonly shards: HeartShard[] = [];
  private readonly shatterScratch = new Vector3();
  private centerBurst: CenterHeartBurst | null = null;

  constructor(ctx: HudContext) {
    this.ctx = ctx;
  }

  /** Comic collect shout — same Arial Black plates as the timer. */
  shout(text: string, color: string): void {
    const ctx = this.ctx;
    if (!ctx.shown || ctx.bufferW < 2) return;
    const fill = color.trim() || "#ffffff";
    // Match timer TextPlate sizing (design CSS px), just larger for comic pops.
    const u = ctx.designScale();
    const height = u * 42;
    const plate = new TextPlate(text.toUpperCase(), fill, height);
    plate.setSoft(ctx.normalLook);
    const root = plate.root;
    const viewH = ctx.viewScale * ctx.bufferH;
    const viewW = viewH * ctx.camera.aspect;
    const stack = this.shouts.length;
    // Keep the board clear — pop on a random side gutter.
    const left = Math.random() < 0.5;
    const edge = left
      ? viewW * (0.18 + Math.random() * 0.08)
      : viewW * (0.74 + Math.random() * 0.08);
    const baseY = viewH * (0.42 + Math.random() * 0.22) + stack * u * 14;
    root.scale.setScalar(0.12);
    root.position.set(edge, baseY, 8 + stack * 0.4);
    root.rotation.x = -0.1;
    root.rotation.y = left ? 0.12 : -0.12;
    root.userData.baseScale = 1;
    this.shoutLayer.add(root);
    this.shouts.push({
      root,
      faceMat: plate.faceMat,
      shadeMat: plate.shadeMat,
      age: 0,
      baseY,
    });
  }

  /** Match shout glyph filtering to the current look. */
  applyLook(soft: boolean): void {
    for (const shout of this.shouts) {
      const map = shout.faceMat.map;
      if (!map) continue;
      map.magFilter = soft ? LinearFilter : NearestFilter;
      map.minFilter = soft ? LinearFilter : NearestFilter;
      map.needsUpdate = true;
    }
  }

  tick(dt: number, reduceMotion: boolean): void {
    this.tickShouts(dt, reduceMotion);
    this.tickCenterBurst(dt, reduceMotion);
    this.tickShards(dt, reduceMotion);
  }

  /** Drop every live shout, shard, and center burst. */
  clear(): void {
    this.clearShouts();
    this.clearShards();
  }

  /** Big center-screen heart: drop in from above, hold, then shatter. */
  burstCenterHeart(): void {
    const ctx = this.ctx;
    if (!ctx.shown || ctx.bufferW < 2) return;
    this.clearCenterBurst();
    const a = ctx.assets;
    const viewH = ctx.viewScale * ctx.bufferH;
    const viewW = viewH * ctx.camera.aspect;
    const size = ctx.viewScale * Math.min(ctx.bufferW, ctx.bufferH) * 0.28;
    const x = viewW * 0.5;
    const y = viewH * 0.48;
    const z = 14;
    const fromY = y + size * 0.55;
    const root = makeHeartIcon(a.heartGeo, a.heartOutlineMat, a.heartBodyMat, a.heartShadeMat);
    root.scale.setScalar(size);
    root.position.set(x, fromY, z);
    root.rotation.x = -0.14;
    root.rotation.y = 0.18;
    this.shatterLayer.add(root);
    this.centerBurst = { root, age: 0, size, x, y, z, fromY, shattered: false };
  }

  /** Shatter one play-HUD heart icon and hide it. */
  shatterHeartIcon(icon: Group | undefined): void {
    if (!icon || !icon.visible) return;
    this.burstHeartIcon(icon, 11, SHATTER_LIFE, false);
    icon.visible = false;
  }

  /** Spawn heart shards at an icon's world position (icon stays as-is). */
  burstHeartIcon(icon: Group, count: number, life: number, dramatic: boolean): void {
    const origin = this.originOf(icon);
    const size = Math.max(0.01, icon.scale.x);
    this.spawnHeartShards(origin.x, origin.y, origin.z, size, count, life, dramatic);
  }

  /** Shatter-layer-local position of an object. Reuses one scratch vector. */
  originOf(obj: Group | Mesh): Vector3 {
    obj.updateWorldMatrix(true, false);
    const origin = obj.getWorldPosition(this.shatterScratch);
    this.shatterLayer.worldToLocal(origin);
    return origin;
  }

  shatterPlate(
    root: Group,
    width: number,
    height: number,
    palette: number[],
    life: number,
  ): void {
    if (width < 1e-4 || height < 1e-4) return;
    const origin = this.originOf(root);
    const cols = Math.max(4, Math.min(12, Math.round((width / height) * 1.8)));
    const rows = 2;
    const cell = Math.max(height * 0.32, width / cols);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const ox = (c / Math.max(1, cols - 1) - 0.5) * width * 0.92;
        const oy = (r / Math.max(1, rows - 1) - 0.5) * height * 0.65;
        this.spawnShards(origin.x + ox, origin.y + oy, origin.z, cell, 1, life, true, palette);
      }
    }
  }

  spawnHeartShards(
    x: number,
    y: number,
    z: number,
    size: number,
    count: number,
    life: number,
    dramatic: boolean,
  ): void {
    const a = this.ctx.assets;
    const bodyHex = a.heartBodyMat.color.getHex();
    const shadeHex = a.heartShadeMat.color.getHex();
    const outlineHex = a.heartOutlineMat.color.getHex();
    this.spawnShards(
      x,
      y,
      z,
      size,
      count,
      life,
      dramatic,
      [bodyHex, bodyHex, shadeHex, outlineHex],
      { heartPieces: dramatic ? Math.min(8, Math.floor(count * 0.28)) : 0 },
    );
  }

  spawnShards(
    x: number,
    y: number,
    z: number,
    size: number,
    count: number,
    life: number,
    dramatic: boolean,
    palette: number[],
    opts: { heartPieces?: number; coinPieces?: number } = {},
  ): void {
    const a = this.ctx.assets;
    const heartPieces = opts.heartPieces ?? 0;
    const coinPieces = opts.coinPieces ?? 0;
    const colors = palette.length > 0 ? palette : [0xffffff];
    for (let i = 0; i < count; i += 1) {
      const ang = ((i + Math.random()) / Math.max(1, count)) * Math.PI * 2;
      const kick = size * (dramatic ? 2.6 + Math.random() * 4.8 : 1.8 + Math.random() * 3.4);
      const useHeart = i < heartPieces;
      const useCoin = !useHeart && i < heartPieces + coinPieces;
      let geo: BufferGeometry;
      let ownsGeo: boolean;
      let meshScale = 1;
      if (useHeart) {
        geo = a.heartGeo;
        ownsGeo = false;
        meshScale = size * (0.18 + Math.random() * 0.28);
      } else if (useCoin) {
        geo = a.coinGeo;
        ownsGeo = false;
        meshScale = size * (0.2 + Math.random() * 0.32);
      } else {
        const w = size * (dramatic ? 0.12 + Math.random() * 0.38 : 0.14 + Math.random() * 0.28);
        const h = size * (dramatic ? 0.1 + Math.random() * 0.42 : 0.12 + Math.random() * 0.32);
        const d = size * (dramatic ? 0.08 + Math.random() * 0.22 : 0.1 + Math.random() * 0.18);
        geo = new BoxGeometry(w, h, d);
        ownsGeo = true;
      }
      const tint = colors[i % colors.length] ?? 0xffffff;
      const mat = new MeshStandardMaterial({
        color: tint,
        emissive: tint,
        emissiveIntensity: dramatic ? 0.4 : 0.25,
        roughness: 0.45,
        metalness: useCoin ? 0.35 : 0.05,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new Mesh(geo, mat);
      const baseScale = useHeart || useCoin ? meshScale : 1;
      mesh.scale.setScalar(baseScale);
      mesh.position.set(
        x + Math.cos(ang) * size * (dramatic ? 0.18 : 0.12),
        y + (Math.random() - 0.2) * size * (dramatic ? 0.22 : 0.15),
        z + (Math.random() - 0.5) * size * (dramatic ? 0.16 : 0.1),
      );
      mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      this.shatterLayer.add(mesh);
      this.shards.push({
        mesh,
        mat,
        geo,
        ownsGeo,
        baseScale,
        vx: Math.cos(ang) * kick,
        vy: size * (dramatic ? 3.2 + Math.random() * 5.2 : 2.4 + Math.random() * 3.6),
        vz: Math.sin(ang) * kick * (dramatic ? 0.7 : 0.55),
        spinX: (Math.random() - 0.5) * (dramatic ? 18 : 14),
        spinY: (Math.random() - 0.5) * (dramatic ? 22 : 16),
        spinZ: (Math.random() - 0.5) * (dramatic ? 18 : 14),
        age: 0,
        life: life * (0.75 + Math.random() * 0.35),
      });
    }
  }

  private tickCenterBurst(dt: number, reduceMotion: boolean): void {
    const burst = this.centerBurst;
    if (!burst || burst.shattered) return;
    burst.age += dt;
    const dropFor = reduceMotion ? 0.08 : CENTER_HEART_DROP;
    if (burst.age < dropFor) {
      const u = burst.age / dropFor;
      const ease = 1 - (1 - u) ** 3;
      burst.root.position.y = burst.fromY + (burst.y - burst.fromY) * ease;
      return;
    }
    burst.root.position.y = burst.y;
    this.shatterCenterHeart(burst);
  }

  private shatterCenterHeart(burst: CenterHeartBurst): void {
    if (burst.shattered) return;
    burst.shattered = true;
    this.spawnHeartShards(burst.x, burst.y, burst.z, burst.size, 34, CENTER_SHATTER_LIFE, true);
    this.shatterLayer.remove(burst.root);
    burst.root.clear();
    this.centerBurst = null;
  }

  private clearCenterBurst(): void {
    if (!this.centerBurst) return;
    this.shatterLayer.remove(this.centerBurst.root);
    this.centerBurst.root.clear();
    this.centerBurst = null;
  }

  private tickShards(dt: number, reduceMotion: boolean): void {
    const gravity = this.ctx.designScale() * 52;
    for (let i = this.shards.length - 1; i >= 0; i -= 1) {
      const shard = this.shards[i];
      if (!shard) continue;
      shard.age += dt;
      const u = Math.min(1, shard.age / shard.life);
      if (reduceMotion) {
        shard.mesh.scale.setScalar(shard.baseScale * (1 - u));
        shard.mat.opacity = 1 - u;
      } else {
        shard.vy -= gravity * dt;
        shard.mesh.position.x += shard.vx * dt;
        shard.mesh.position.y += shard.vy * dt;
        shard.mesh.position.z += shard.vz * dt;
        shard.mesh.rotation.x += shard.spinX * dt;
        shard.mesh.rotation.y += shard.spinY * dt;
        shard.mesh.rotation.z += shard.spinZ * dt;
        shard.mat.opacity = 1 - u * u;
        shard.mesh.scale.setScalar(shard.baseScale * (1 - u * 0.45));
      }
      if (shard.age < shard.life) continue;
      this.shatterLayer.remove(shard.mesh);
      if (shard.ownsGeo) shard.geo.dispose();
      shard.mat.dispose();
      this.shards.splice(i, 1);
    }
  }

  private clearShards(): void {
    this.clearCenterBurst();
    for (const shard of this.shards) {
      this.shatterLayer.remove(shard.mesh);
      if (shard.ownsGeo) shard.geo.dispose();
      shard.mat.dispose();
    }
    this.shards.length = 0;
  }

  private tickShouts(dt: number, reduceMotion: boolean): void {
    for (let i = this.shouts.length - 1; i >= 0; i -= 1) {
      const shout = this.shouts[i];
      if (!shout) continue;
      shout.age += dt;
      const base = typeof shout.root.userData.baseScale === "number"
        ? shout.root.userData.baseScale
        : 1;
      if (reduceMotion) {
        const t = Math.min(1, shout.age / SHOUT_LIFE);
        shout.root.scale.setScalar(base * (0.9 + t * 0.35));
        const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        shout.faceMat.opacity = fade;
        shout.shadeMat.opacity = fade * 0.9;
        shout.root.position.y = shout.baseY;
      } else if (shout.age <= SHOUT_POP) {
        const u = shout.age / SHOUT_POP;
        const punch = 1 - (1 - u) ** 3;
        shout.root.scale.setScalar(base * (0.12 + punch * 1.08));
        shout.faceMat.opacity = 1;
        shout.shadeMat.opacity = 1;
        shout.root.position.y = shout.baseY + punch * this.ctx.designScale() * 8;
      } else {
        const u = Math.min(1, (shout.age - SHOUT_POP) / (SHOUT_LIFE - SHOUT_POP));
        shout.root.scale.setScalar(base * (1.2 + u * 0.9));
        const fade = 1 - u * u;
        shout.faceMat.opacity = fade;
        shout.shadeMat.opacity = fade * 0.85;
        shout.root.position.y = shout.baseY + this.ctx.designScale() * (8 + u * 36);
        shout.root.rotation.z = (u - 0.5) * 0.1;
      }
      if (shout.age < SHOUT_LIFE) continue;
      this.shoutLayer.remove(shout.root);
      disposePlate(shout.root, shout.faceMat, shout.shadeMat);
      this.shouts.splice(i, 1);
    }
  }

  private clearShouts(): void {
    for (const shout of this.shouts) {
      this.shoutLayer.remove(shout.root);
      disposePlate(shout.root, shout.faceMat, shout.shadeMat);
    }
    this.shouts.length = 0;
  }
}
