import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Group,
  type Quaternion,
  type Scene,
  type WebGLRenderer,
} from "three";
import type { Piece, PieceKind, TowerLayout } from "../core/layout.ts";
import { facet, token } from "./boardMaterials.ts";
import {
  MEADOW_SPAN_MULT,
  type Debris,
  type FireworkBit,
  type PickupBit,
  type RainBit,
  type Spark,
} from "./mazeWorldTypes.ts";

/** What the effects need from the world — keeps this module off MazeWorld internals. */
export interface BoardEffectsHost {
  readonly scene: Scene;
  readonly ball: Mesh;
  readonly materials: Record<PieceKind, MeshToonMaterial>;
  /** Active tower (sizes the win/fail meadow volume). */
  tower(): TowerLayout | null;
  /** Current win / fail / home meadow root, if any. */
  meadow(): Group | null;
}

/**
 * Debris, shards, sparks, fireworks, and rain: self-contained spawn / tick / clear
 * helpers so board and gallery code do not share a file.
 */
export class BoardEffects {
  readonly sparkGeometry: BufferGeometry = facet(new BoxGeometry(0.05, 0.14, 0.05));
  readonly rainGeometry: BufferGeometry = facet(new BoxGeometry(0.028, 0.42, 0.028));
  readonly coinSparkColors = [token("--maze-coin"), token("--maze-coin-shine"), "#ffffff"];
  readonly heartSparkColors = [token("--maze-heart"), "#ff8a9a", "#ffffff"];
  readonly starSparkColors = [
    token("--maze-power"),
    token("--sky-rainbow-0"),
    token("--sky-rainbow-2"),
    token("--sky-rainbow-4"),
    token("--sky-rainbow-6"),
    "#ffffff",
  ];
  readonly wingSparkColors = [token("--maze-hover"), token("--sky-ocean-1"), "#ffffff"];
  readonly ghostSparkColors = [token("--maze-ghost"), "#e4d9ff", "#ffffff"];
  private readonly fireworkColors = [
    token("--maze-win-neon"),
    token("--maze-heart"),
    token("--maze-coin"),
    token("--maze-coin-shine"),
    token("--maze-warp-0"),
    token("--maze-warp-1"),
    token("--maze-warp-2"),
    token("--maze-goal"),
    "#ffffff",
  ];
  private readonly rainColors = [
    token("--maze-fail-neon"),
    token("--sky-ocean-3"),
    token("--sky-ocean-5"),
    "#9eb0c4",
    "#c8d6e4",
  ];
  private readonly debris: Debris[] = [];
  private readonly sparks: Spark[] = [];
  private readonly fireworks: FireworkBit[] = [];
  private readonly raindrops: RainBit[] = [];
  fireworkCooldown = 0;
  rainCooldown = 0;
  private warmed = false;
  private readonly scene: Scene;
  private readonly ball: Mesh;
  private readonly materials: Record<PieceKind, MeshToonMaterial>;

  private readonly host: BoardEffectsHost;

  constructor(host: BoardEffectsHost) {
    this.host = host;
    this.scene = host.scene;
    this.ball = host.ball;
    this.materials = host.materials;
  }

  /**
   * Compile transparent debris / glass material variants once so the first
   * hatch burst and floor crumble do not hitch on shader creation.
   */
  warm(renderer: WebGLRenderer, camera: Camera): void {
    if (this.warmed) return;
    this.warmed = true;
    const probes: Mesh[] = [];
    for (const source of Object.values(this.materials)) {
      if (!(source instanceof MeshToonMaterial)) continue;
      const mat = source.clone();
      mat.transparent = true;
      mat.opacity = 0.65;
      mat.depthWrite = false;
      const mesh = new Mesh(this.sparkGeometry, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      probes.push(mesh);
    }
    const sparkMat = new MeshBasicMaterial({
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false,
    });
    const spark = new Mesh(this.sparkGeometry, sparkMat);
    spark.frustumCulled = false;
    this.scene.add(spark);
    probes.push(spark);
    renderer.compile(this.scene, camera);
    for (const mesh of probes) {
      this.scene.remove(mesh);
      const mat = mesh.material;
      if (!Array.isArray(mat)) mat.dispose();
    }
  }

  private get tower(): TowerLayout | null {
    return this.host.tower();
  }

  private get meadow(): Group | null {
    return this.host.meadow();
  }

  /** Shared spark / rain geometries must survive generated-mesh disposal. */
  ownsGeometry(geometry: BufferGeometry): boolean {
    return geometry === this.sparkGeometry || geometry === this.rainGeometry;
  }

  /** Keep in-flight debris attached to the board when floors rebase. */
  shiftDebris(offset: Vector3): void {
    for (const bit of this.debris) bit.mesh.position.add(offset);
  }

  spawnShards(
    from: Mesh,
    boardQuat: Quaternion,
    blast: Vector3,
    count: number,
    size: number,
    source: MeshToonMaterial,
    opacity: number,
  ): void {
    const origin = from.getWorldPosition(new Vector3());
    for (let i = 0; i < count; i += 1) {
      const geo = new BoxGeometry(
        size * (0.5 + Math.random()),
        size * (0.7 + Math.random() * 1.4),
        size * (0.35 + Math.random() * 0.5),
      );
      const mat = source.clone();
      mat.transparent = true;
      mat.opacity = opacity;
      mat.depthWrite = false;
      const mesh = new Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 0.08 + Math.random() * 0.2;
      mesh.position.set(
        origin.x + Math.cos(angle) * radius,
        origin.y + (Math.random() - 0.3) * 0.35,
        origin.z + Math.sin(angle) * radius,
      );
      mesh.quaternion.copy(boardQuat);
      const away = mesh.position.clone().sub(blast);
      if (away.lengthSq() < 0.0001) away.set(Math.cos(angle), 0.5, Math.sin(angle));
      away.normalize();
      const speed = 1.6 + Math.random() * 2.4;
      const vel = away.multiplyScalar(speed);
      vel.y += 1.2 + Math.random() * 1.6;
      const spin = new Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
      );
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        vel,
        spin,
        delay: Math.random() * 0.04,
        age: 0,
        life: 0.85 + Math.random() * 0.35,
      });
    }
  }

  spawnGlassBurst(piece: Piece, floorY: number, boardQuat: Quaternion): void {
    const source = this.materials.goal;
    const cols = 4;
    const rows = 2;
    const depth = 4;
    const sx = (piece.hx * 2) / cols;
    const sy = (piece.hy * 2) / rows;
    const sz = (piece.hz * 2) / depth;
    const blast = this.ball.position.clone();
    for (let ix = 0; ix < cols; ix += 1) {
      for (let iy = 0; iy < rows; iy += 1) {
        for (let iz = 0; iz < depth; iz += 1) {
          const ox = (ix + 0.5) / cols - 0.5;
          const oy = (iy + 0.5) / rows - 0.5;
          const oz = (iz + 0.5) / depth - 0.5;
          const geo = new BoxGeometry(sx * 0.85, sy * 0.85, sz * 0.85);
          const mat = source.clone();
          mat.transparent = true;
          mat.opacity = 0.65;
          mat.depthWrite = false;
          const mesh = new Mesh(geo, mat);
          const local = new Vector3(
            piece.x + ox * piece.hx * 2,
            piece.y + floorY + oy * piece.hy * 2,
            piece.z + oz * piece.hz * 2,
          );
          mesh.position.copy(local.applyQuaternion(boardQuat));
          mesh.quaternion.copy(boardQuat);
          const away = mesh.position.clone().sub(blast);
          if (away.lengthSq() < 0.0001) away.set(ox + 0.001, 0.5, oz + 0.001);
          away.normalize();
          const speed = 1.8 + Math.random() * 2.6;
          const vel = away.multiplyScalar(speed);
          vel.y += 1.1 + Math.random() * 1.7;
          const spin = new Vector3(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
          );
          this.scene.add(mesh);
          this.debris.push({
            mesh,
            vel,
            spin,
            delay: Math.random() * 0.03,
            age: 0,
            life: 0.9 + Math.random() * 0.4,
          });
        }
      }
    }
  }

  spawnPickupSparks(bit: PickupBit, colors: string[]): void {
    const origin = bit.root.position;
    const count = 12;
    for (let i = 0; i < count; i += 1) {
      const color = colors[i % colors.length] ?? colors[0]!;
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new Mesh(this.sparkGeometry, mat);
      mesh.position.set(origin.x, origin.y, origin.z);
      mesh.renderOrder = 3;
      const yaw = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const pitch = 0.35 + Math.random() * 1.1;
      const speed = 1.6 + Math.random() * 2.4;
      const vel = new Vector3(
        Math.cos(yaw) * Math.cos(pitch) * speed,
        Math.sin(pitch) * speed * 0.85 + 0.55,
        Math.sin(yaw) * Math.cos(pitch) * speed,
      );
      mesh.scale.setScalar(0.55 + Math.random() * 0.7);
      const dir = vel.clone().normalize();
      if (dir.lengthSq() > 0.001) {
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      }
      bit.group.add(mesh);
      this.sparks.push({
        mesh,
        parent: bit.group,
        vel,
        spin: new Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
        ),
        age: 0,
        life: 0.32 + Math.random() * 0.22,
      });
    }
  }

  tickSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i];
      if (!spark) continue;
      spark.age += dt;
      const t = spark.age / spark.life;
      if (!spark.mesh.parent || t >= 1) {
        this.dropSpark(spark);
        this.sparks.splice(i, 1);
        continue;
      }
      spark.vel.y -= 7.5 * dt;
      spark.mesh.position.addScaledVector(spark.vel, dt);
      spark.mesh.rotateX(spark.spin.x * dt);
      spark.mesh.rotateY(spark.spin.y * dt);
      spark.mesh.rotateZ(spark.spin.z * dt);
      const fade = 1 - t * t;
      spark.mesh.scale.setScalar(Math.max(0.05, (0.55 + fade * 0.7) * (1 - t * 0.55)));
      if (spark.mesh.material instanceof MeshBasicMaterial) spark.mesh.material.opacity = fade;
    }
  }

  dropSpark(spark: Spark): void {
    spark.parent.remove(spark.mesh);
    if (spark.mesh.material instanceof MeshBasicMaterial) spark.mesh.material.dispose();
  }

  clearSparks(): void {
    for (const spark of this.sparks) this.dropSpark(spark);
    this.sparks.length = 0;
  }

  tickFireworks(dt: number): void {
    const meadow = this.meadow;
    if (!meadow) {
      this.clearFireworks();
      return;
    }
    this.fireworkCooldown -= dt;
    if (this.fireworkCooldown <= 0) {
      const salvos = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < salvos; i += 1) this.launchFirework(meadow);
      this.fireworkCooldown = 0.12 + Math.random() * 0.28;
      if (Math.random() < 0.45) this.fireworkCooldown *= 0.35;
    }
    for (let i = this.fireworks.length - 1; i >= 0; i -= 1) {
      const bit = this.fireworks[i];
      if (!bit) continue;
      bit.age += dt;
      const t = bit.age / bit.life;
      if (!bit.mesh.parent || t >= 1) {
        this.dropFirework(bit);
        this.fireworks.splice(i, 1);
        continue;
      }
      bit.vel.y -= bit.gravity * dt;
      bit.vel.multiplyScalar(Math.max(0, 1 - bit.drag * dt));
      bit.mesh.position.addScaledVector(bit.vel, dt);
      bit.mesh.rotateX(bit.spin.x * dt);
      bit.mesh.rotateY(bit.spin.y * dt);
      bit.mesh.rotateZ(bit.spin.z * dt);
      const fade = 1 - t * t;
      bit.mesh.scale.setScalar(Math.max(0.04, bit.baseScale * (0.65 + fade * 0.55)));
      if (bit.mesh.material instanceof MeshBasicMaterial) bit.mesh.material.opacity = fade;
    }
  }

  launchFirework(meadow: Group): void {
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const x = (Math.random() - 0.5) * span * 1.55;
    const y = span * (0.14 + Math.random() * 0.34);
    const z = -span * (0.12 + Math.random() * 0.55);
    const palette = this.fireworkColors;
    const main = palette[Math.floor(Math.random() * Math.max(1, palette.length - 1))] ?? palette[0]!;
    const colors = Math.random() < 0.55
      ? [main, palette[Math.floor(Math.random() * palette.length)] ?? main, "#ffffff"]
      : [main, main, "#ffffff"];
    const count = 48 + Math.floor(Math.random() * 36);
    const burst = 2.8 + Math.random() * 3.4;
    for (let i = 0; i < count; i += 1) {
      const color = colors[i % colors.length] ?? main;
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new Mesh(this.sparkGeometry, mat);
      mesh.position.set(x, y, z);
      mesh.renderOrder = 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = burst * (0.55 + Math.random() * 0.7);
      const vel = new Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      const baseScale = 0.7 + Math.random() * 0.9;
      mesh.scale.setScalar(baseScale);
      const dir = vel.clone().normalize();
      if (dir.lengthSq() > 0.001) {
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      }
      meadow.add(mesh);
      this.fireworks.push({
        mesh,
        parent: meadow,
        vel,
        spin: new Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ),
        age: 0,
        life: 0.85 + Math.random() * 0.7,
        gravity: 1.6 + Math.random() * 1.4,
        drag: 0.55 + Math.random() * 0.7,
        baseScale,
      });
    }
  }

  dropFirework(bit: FireworkBit): void {
    bit.parent.remove(bit.mesh);
    if (bit.mesh.material instanceof MeshBasicMaterial) bit.mesh.material.dispose();
  }

  clearFireworks(): void {
    for (const bit of this.fireworks) this.dropFirework(bit);
    this.fireworks.length = 0;
    this.fireworkCooldown = 0;
  }

  tickRain(dt: number): void {
    const meadow = this.meadow;
    if (!meadow) {
      this.clearRain();
      return;
    }
    this.rainCooldown -= dt;
    if (this.rainCooldown <= 0) {
      const drops = 10 + Math.floor(Math.random() * 14);
      for (let i = 0; i < drops; i += 1) this.spawnRaindrop(meadow);
      this.rainCooldown = 0.04 + Math.random() * 0.06;
    }
    for (let i = this.raindrops.length - 1; i >= 0; i -= 1) {
      const bit = this.raindrops[i];
      if (!bit) continue;
      bit.age += dt;
      const t = bit.age / bit.life;
      if (!bit.mesh.parent || t >= 1 || bit.mesh.position.y < -0.2) {
        this.dropRaindrop(bit);
        this.raindrops.splice(i, 1);
        continue;
      }
      bit.mesh.position.addScaledVector(bit.vel, dt);
      const fade = t < 0.75 ? 0.55 + (1 - t) * 0.35 : (1 - t) * 2.2;
      bit.mesh.scale.setScalar(Math.max(0.08, bit.baseScale * (0.85 + fade * 0.2)));
      if (bit.mesh.material instanceof MeshBasicMaterial) {
        bit.mesh.material.opacity = Math.max(0, Math.min(0.85, fade));
      }
    }
  }

  spawnRaindrop(meadow: Group): void {
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * MEADOW_SPAN_MULT;
    const x = (Math.random() - 0.5) * span * 1.35;
    const y = span * (0.55 + Math.random() * 0.55);
    const z = (Math.random() - 0.5) * span * 1.15 - span * 0.08;
    const palette = this.rainColors;
    const color = palette[Math.floor(Math.random() * palette.length)] ?? "#9eb0c4";
    const mat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(this.rainGeometry, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 4;
    const wind = 0.35 + Math.random() * 0.55;
    const fall = 7.5 + Math.random() * 5.5;
    const vel = new Vector3(
      -wind * (0.7 + Math.random() * 0.6),
      -fall,
      wind * 0.15 * (Math.random() - 0.5),
    );
    const baseScale = 0.75 + Math.random() * 1.1;
    mesh.scale.set(0.55 + Math.random() * 0.5, baseScale, 0.55 + Math.random() * 0.5);
    const dir = vel.clone().normalize();
    if (dir.lengthSq() > 0.001) {
      mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    }
    meadow.add(mesh);
    this.raindrops.push({
      mesh,
      parent: meadow,
      vel,
      age: 0,
      life: 1.1 + Math.random() * 0.7,
      baseScale,
    });
  }

  dropRaindrop(bit: RainBit): void {
    bit.parent.remove(bit.mesh);
    if (bit.mesh.material instanceof MeshBasicMaterial) bit.mesh.material.dispose();
  }

  clearRain(): void {
    for (const bit of this.raindrops) this.dropRaindrop(bit);
    this.raindrops.length = 0;
    this.rainCooldown = 0;
  }

  spawnWallBurst(
    piece: Piece,
    floorY: number,
    boardQuat: Quaternion,
    from?: Mesh,
  ): void {
    const shared = from?.material;
    const source = shared instanceof MeshToonMaterial
      ? shared
      : this.materials[piece.kind];
    if (!(source instanceof MeshToonMaterial)) return;
    const long = Math.max(piece.hx, piece.hz);
    const cols = long > 0.2 ? 4 : 2;
    const rows = 3;
    const depth = long > 0.2 ? 2 : 2;
    const sx = (piece.hx * 2) / cols;
    const sy = (piece.hy * 2) / rows;
    const sz = (piece.hz * 2) / depth;
    const blast = this.ball.position.clone();
    for (let ix = 0; ix < cols; ix += 1) {
      for (let iy = 0; iy < rows; iy += 1) {
        for (let iz = 0; iz < depth; iz += 1) {
          const ox = (ix + 0.5) / cols - 0.5;
          const oy = (iy + 0.5) / rows - 0.5;
          const oz = (iz + 0.5) / depth - 0.5;
          const geo = new BoxGeometry(sx * 0.9, sy * 0.9, sz * 0.9);
          const mat = source.clone();
          mat.transparent = true;
          mat.opacity = 1;
          const mesh = new Mesh(geo, mat);
          const local = new Vector3(
            piece.x + ox * piece.hx * 2,
            piece.y + floorY + oy * piece.hy * 2,
            piece.z + oz * piece.hz * 2,
          );
          mesh.position.copy(local.applyQuaternion(boardQuat));
          mesh.quaternion.copy(boardQuat);
          const away = mesh.position.clone().sub(blast);
          if (away.lengthSq() < 0.0001) {
            away.set(ox + 0.001, 0.4, oz + 0.001);
          }
          away.normalize();
          const speed = 2.2 + Math.random() * 2.8;
          const vel = away.multiplyScalar(speed);
          vel.y += 1.4 + Math.random() * 1.8;
          const spin = new Vector3(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
          );
          this.scene.add(mesh);
          this.debris.push({
            mesh,
            vel,
            spin,
            delay: Math.random() * 0.03,
            age: 0,
            life: 0.9 + Math.random() * 0.4,
          });
        }
      }
    }
  }

  spawnDebris(piece: Piece, floorY: number, boardQuat: Quaternion, hatch: { x: number; z: number } | null): void {
    const source = this.materials[piece.kind];
    if (!(source instanceof MeshToonMaterial)) return;
    const geo = new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
    const mat = source.clone();
    mat.transparent = true;
    mat.opacity = 1;
    const mesh = new Mesh(geo, mat);
    const local = new Vector3(piece.x, piece.y + floorY, piece.z);
    mesh.position.copy(local.applyQuaternion(boardQuat));
    mesh.quaternion.copy(boardQuat);
    const hx = hatch?.x ?? 0;
    const hz = hatch?.z ?? 0;
    let dx = piece.x - hx;
    let dz = piece.z - hz;
    const dist = Math.hypot(dx, dz);
    const len = dist || 1;
    dx /= len;
    dz /= len;
    const speed = 1.15 + Math.random() * 1.45;
    const vel = new Vector3(dx * speed, 0.4 + Math.random() * 1.05, dz * speed).applyQuaternion(boardQuat);
    const spin = new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    this.scene.add(mesh);
    this.debris.push({ mesh, vel, spin, delay: Math.min(0.48, dist * 0.06), age: 0, life: 1.15 });
  }

  tickDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const bit = this.debris[i];
      if (!bit) continue;
      bit.age += dt;
      const elapsed = bit.age - bit.delay;
      if (elapsed < 0) continue;
      bit.vel.y -= 18 * dt;
      bit.mesh.position.addScaledVector(bit.vel, dt);
      bit.mesh.rotateX(bit.spin.x * dt);
      bit.mesh.rotateY(bit.spin.y * dt);
      bit.mesh.rotateZ(bit.spin.z * dt);
      const fade = elapsed < 0.28 ? 1 : Math.max(0, 1 - (elapsed - 0.28) / 0.7);
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.opacity = fade;
      if (elapsed <= bit.life) continue;
      this.scene.remove(bit.mesh);
      bit.mesh.geometry.dispose();
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.dispose();
      this.debris.splice(i, 1);
    }
  }

  clearDebris(): void {
    for (const bit of this.debris) {
      this.scene.remove(bit.mesh);
      bit.mesh.geometry.dispose();
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.dispose();
    }
    this.debris.length = 0;
  }
}
