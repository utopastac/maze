import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  LinearFilter,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { formatTime } from "../core/format.ts";
import { snapPixels } from "../core/playSettings.ts";
import { MAX_HEARTS_CAP } from "../core/tower.ts";
import {
  makeCoinGeo,
  makeCoinMaterial,
  makeHeartGeo,
  makeHeartIcon,
  makeHeartMaterials,
} from "./collectibleMeshes.ts";

const PAD_X = 10;
const PAD_Y = 20;
const ROW = 24;
const TITLE_FLOOR_GAP = 12;
const ICON = 14;
const TIMER_PX = 28;
const TITLE_PX = 26;
const FLOOR_PX = 26;
const START_TITLE_PX = 36;
const START_FLOOR_PX = 22;
const START_BTN_PX = 36;
const START_ICON = 18;
const START_GAP = 18;
const START_BTN_FONT = `700 72px "Arial Black", "Arial Bold", Impact, sans-serif`;
const PULSE_SECS = 0.35;
const SHOUT_LIFE = 1.05;
const SHOUT_POP = 0.18;
const SHATTER_LIFE = 0.7;
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

/**
 * Mario 64–style play stats: 3D heart/coin meshes + Arial Black text plates
 * on their own WebGL canvas (UI pixels only).
 */
export class PlayHud {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly root = new Group();
  private readonly heartsRow = new Group();
  private readonly coinsRow = new Group();
  private readonly timerRow = new Group();
  private readonly titleRow = new Group();
  private readonly floorRow = new Group();
  private readonly startLayer = new Group();
  private readonly startHeartsRow = new Group();
  private readonly startCoinsRow = new Group();
  private readonly startBtnRow = new Group();
  private startScrim: Mesh | null = null;
  private readonly heartGeo: BufferGeometry;
  private readonly coinGeo: BufferGeometry;
  private readonly heartOutlineMat: MeshStandardMaterial;
  private readonly heartBodyMat: MeshStandardMaterial;
  private readonly heartShadeMat: MeshStandardMaterial;
  private readonly coinMat: MeshStandardMaterial;
  private readonly emptyCoinMat: MeshStandardMaterial;
  private readonly heartIcons: Group[] = [];
  private readonly coinMeshes: Mesh[] = [];
  private readonly startHeartIcons: Group[] = [];
  private readonly startCoinMeshes: Mesh[] = [];
  private timerPlate: TextPlate | null = null;
  private titlePlate: TextPlate | null = null;
  private floorPlate: TextPlate | null = null;
  private startTitlePlate: StartLabel | null = null;
  private startFloorPlate: StartLabel | null = null;
  private startBtn: StartButton | null = null;
  private shown = false;
  private startGate = false;
  private startTitle = "";
  private startFloors = 1;
  private startLives: number | null = null;
  private startCoins = 0;
  private startBtnHit: { x: number; y: number; w: number; h: number } | null = null;
  private lives: number | null = null;
  private coinsGot = 0;
  private coinsMax = 0;
  private seconds: number | null = 0;
  private timerText = "";
  private titleText = "";
  private titleDrawn = "";
  private floorText: string | null = null;
  private floorDrawn = "";
  private pulseHeart = 0;
  private pulseCoin = 0;
  private bufferW = 1;
  private bufferH = 1;
  private layoutDirty = true;
  private viewScale = 1;
  private normalLook = false;
  private readonly shouts: ComicShout[] = [];
  private readonly shoutLayer = new Group();
  private readonly shatterLayer = new Group();
  private readonly shards: HeartShard[] = [];
  private readonly shatterScratch = new Vector3();
  private centerBurst: CenterHeartBurst | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      stencil: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);

    this.camera = new PerspectiveCamera(28, 1, 0.1, 500);
    this.camera.position.set(0, 0, 120);

    const heart = tokenColor("--maze-heart", "#e84555");
    const coin = tokenColor("--maze-coin", "#f0c43a");
    const shine = tokenColor("--maze-coin-shine", "#ffe9a0");

    const heartMats = makeHeartMaterials(heart);
    this.heartOutlineMat = heartMats.outline;
    this.heartBodyMat = heartMats.body;
    this.heartShadeMat = heartMats.shade;

    this.coinMat = makeCoinMaterial(coin, shine);
    // Uncollected slots: solid dull grey, no glow.
    this.emptyCoinMat = stdMat("#6a6d74", "#2e3036", 0.02);
    this.emptyCoinMat.metalness = 0.15;
    this.emptyCoinMat.roughness = 0.85;

    this.heartGeo = makeHeartGeo();
    this.coinGeo = makeCoinGeo();

    this.scene.add(new AmbientLight("#ffffff", 0.55));
    const key = new DirectionalLight("#fff6ea", 1.45);
    key.position.set(-4, 6, 10);
    const fill = new DirectionalLight("#9eb7ff", 0.45);
    fill.position.set(5, -2, 6);
    const rim = new DirectionalLight("#ffffff", 0.25);
    rim.position.set(0, 2, -4);
    this.scene.add(key, fill, rim, this.root, this.shoutLayer, this.shatterLayer);
    this.root.add(this.titleRow, this.floorRow, this.heartsRow, this.coinsRow, this.timerRow);
    this.startLayer.visible = false;
    this.scene.add(this.startLayer);
    this.canvas.hidden = true;
  }

  /** Comic collect shout — same Arial Black plates as the timer. */
  shout(text: string, color: string): void {
    if (!this.shown || this.bufferW < 2) return;
    const fill = color.trim() || "#ffffff";
    // Match timer TextPlate sizing (viewScale × px), just larger for comic pops.
    const height = this.viewScale * 42;
    const plate = new TextPlate(text.toUpperCase(), fill, height);
    plate.setSoft(this.normalLook);
    const root = plate.root;
    const viewH = this.viewScale * this.bufferH;
    const viewW = viewH * this.camera.aspect;
    const stack = this.shouts.length;
    // Keep the board clear — pop on a random side gutter.
    const left = Math.random() < 0.5;
    const edge = left
      ? viewW * (0.18 + Math.random() * 0.08)
      : viewW * (0.74 + Math.random() * 0.08);
    const baseY = viewH * (0.42 + Math.random() * 0.22) + stack * this.viewScale * 14;
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

  setVisible(on: boolean): void {
    if (this.shown === on) return;
    this.shown = on;
    this.canvas.hidden = !on;
    this.root.visible = on && !this.startGate;
    this.startLayer.visible = on && this.startGate;
    this.shoutLayer.visible = on && !this.startGate;
    this.shatterLayer.visible = on && !this.startGate;
    if (on) {
      this.layoutDirty = true;
      this.paint(true);
    } else {
      this.clearShouts();
      this.clearShards();
      this.renderer.clear();
    }
  }

  /** Centered level briefing + Start — free-play only. */
  setStartGate(gate: PlayHudStartGate | null): void {
    const open = gate !== null;
    if (!open && !this.startGate) return;
    this.startGate = open;
    if (gate) {
      this.startTitle = gate.title;
      this.startFloors = Math.max(1, Math.round(gate.floors));
      this.startLives = gate.lives;
      this.startCoins = Math.max(0, Math.round(gate.coins));
    } else {
      this.startBtnHit = null;
    }
    this.root.visible = this.shown && !this.startGate;
    this.startLayer.visible = this.shown && this.startGate;
    this.shoutLayer.visible = this.shown && !this.startGate;
    this.shatterLayer.visible = this.shown && !this.startGate;
    this.layoutDirty = true;
    if (this.shown) this.paint(true);
  }

  isStartGateOpen(): boolean {
    return this.startGate;
  }

  /** Hit-test the Start button in CSS client coordinates. */
  hitTestStart(clientX: number, clientY: number): boolean {
    if (!this.startGate || !this.startBtnHit || !this.shown) return false;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = ((clientX - rect.left) / rect.width) * this.bufferW;
    const y = ((clientY - rect.top) / rect.height) * this.bufferH;
    const hit = this.startBtnHit;
    return x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
  }

  setStats(stats: PlayHudStats): void {
    const prevLives = this.lives;
    const livesChanged = prevLives !== stats.lives;
    const coinsChanged = this.coinsGot !== stats.coinsGot || this.coinsMax !== stats.coinsMax;
    const titleChanged = this.titleText !== stats.titleText;
    const floorChanged = this.floorText !== stats.floorText;
    const timeChanged = this.seconds !== stats.seconds;
    const timerVisibilityChanged = (this.seconds === null) !== (stats.seconds === null);
    if (
      this.shown
      && prevLives !== null
      && stats.lives !== null
      && stats.lives < prevLives
    ) {
      const from = Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(prevLives)));
      const to = Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(stats.lives)));
      for (let i = to; i < from; i += 1) this.shatterHeart(i);
      this.burstCenterHeart();
    }
    this.seconds = stats.seconds;
    this.lives = stats.lives;
    this.coinsGot = stats.coinsGot;
    this.coinsMax = stats.coinsMax;
    this.titleText = stats.titleText;
    this.floorText = stats.floorText;
    if (stats.pulseLives) this.pulseHeart = PULSE_SECS;
    if (stats.pulseCoins && stats.coinsMax > 0) this.pulseCoin = PULSE_SECS;
    if (livesChanged || coinsChanged || titleChanged || floorChanged || timerVisibilityChanged) {
      this.layoutDirty = true;
    }
    if (timeChanged) this.syncTimer();
  }

  /**
   * Size the HUD from UI pixels only — never game Pixels.
   * With normal look, keep the same layout grid but supersample to device resolution.
   */
  resize(width: number, height: number, uiPixels: number, normalLook = false): void {
    const scale = snapPixels(uiPixels);
    const bufferW = Math.max(1, Math.floor(width / scale));
    const bufferH = Math.max(1, Math.floor(height / scale));
    const sizeChanged = this.bufferW !== bufferW || this.bufferH !== bufferH;
    const lookChanged = this.normalLook !== normalLook;
    this.bufferW = bufferW;
    this.bufferH = bufferH;
    this.normalLook = normalLook;
    const dpr = normalLook ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    // Logical buffer stays chunk-sized so HUD element sizes match UI pixels;
    // pixel ratio fills the CSS viewport (× dpr) so normal look stays sharp.
    this.renderer.setPixelRatio(normalLook ? scale * dpr : 1);
    this.renderer.setSize(bufferW, bufferH, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.dataset.look = normalLook ? "normal" : "pixel";
    this.camera.aspect = bufferW / bufferH;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
    if (lookChanged) this.applyLookFilters();
    if (sizeChanged || lookChanged) this.layoutDirty = true;
    if (this.shown) this.paint(true);
  }

  private applyLookFilters(): void {
    const soft = this.normalLook;
    this.timerPlate?.setSoft(soft);
    this.titlePlate?.setSoft(soft);
    this.floorPlate?.setSoft(soft);
    for (const shout of this.shouts) {
      const map = shout.faceMat.map;
      if (!map) continue;
      map.magFilter = soft ? LinearFilter : NearestFilter;
      map.minFilter = soft ? LinearFilter : NearestFilter;
      map.needsUpdate = true;
    }
  }

  update(dt: number, reduceMotion: boolean): void {
    if (!this.shown) return;
    this.pulseHeart = Math.max(0, this.pulseHeart - dt);
    this.pulseCoin = Math.max(0, this.pulseCoin - dt);
    if (!reduceMotion) {
      const coins = this.startGate ? this.startCoinMeshes : this.coinMeshes;
      for (const mesh of coins) {
        if (!mesh.visible || mesh.material !== this.coinMat) continue;
        mesh.rotation.y += dt * 3.6;
      }
      const hearts = this.startGate ? this.startHeartIcons : this.heartIcons;
      for (const heart of hearts) {
        if (!heart.visible) continue;
        heart.rotation.y = 0.2 + Math.sin(performance.now() * 0.0024 + heart.id) * 0.35;
      }
      if (this.startGate && this.startBtnRow.visible) {
        const bob = Math.sin(performance.now() * 0.0032) * this.viewScale * 1.2;
        this.startBtnRow.position.y = (this.startBtnRow.userData.baseY as number ?? 0) + bob;
      }
    }
    this.heartsRow.scale.setScalar(pulseScale(this.pulseHeart));
    this.coinsRow.scale.setScalar(pulseScale(this.pulseCoin));
    this.tickShouts(dt, reduceMotion);
    this.tickCenterBurst(dt, reduceMotion);
    this.tickShards(dt, reduceMotion);
    this.paint(false);
  }

  /** Big center-screen heart: drop in from above, hold, then shatter. */
  private burstCenterHeart(): void {
    if (!this.shown || this.bufferW < 2) return;
    this.clearCenterBurst();
    const viewH = this.viewScale * this.bufferH;
    const viewW = viewH * this.camera.aspect;
    const size = this.viewScale * Math.min(this.bufferW, this.bufferH) * 0.28;
    const x = viewW * 0.5;
    const y = viewH * 0.48;
    const z = 14;
    const fromY = y + size * 0.55;
    const root = makeHeartIcon(
      this.heartGeo,
      this.heartOutlineMat,
      this.heartBodyMat,
      this.heartShadeMat,
    );
    root.scale.setScalar(size);
    root.position.set(x, fromY, z);
    root.rotation.x = -0.14;
    root.rotation.y = 0.18;
    this.shatterLayer.add(root);
    this.centerBurst = { root, age: 0, size, x, y, z, fromY, shattered: false };
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

  private shatterHeart(index: number): void {
    const icon = this.heartIcons[index];
    if (!icon || !icon.visible) return;
    icon.updateWorldMatrix(true, false);
    const origin = icon.getWorldPosition(this.shatterScratch);
    this.shatterLayer.worldToLocal(origin);
    const size = Math.max(0.01, icon.scale.x);
    this.spawnHeartShards(origin.x, origin.y, origin.z, size, 11, SHATTER_LIFE, false);
    icon.visible = false;
  }

  private spawnHeartShards(
    x: number,
    y: number,
    z: number,
    size: number,
    count: number,
    life: number,
    dramatic: boolean,
  ): void {
    const bodyHex = this.heartBodyMat.color.getHex();
    const shadeHex = this.heartShadeMat.color.getHex();
    const outlineHex = this.heartOutlineMat.color.getHex();
    const palette = [bodyHex, bodyHex, shadeHex, outlineHex];
    const heartPieces = dramatic ? Math.min(8, Math.floor(count * 0.28)) : 0;
    for (let i = 0; i < count; i += 1) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.45;
      const kick = size * (dramatic ? 2.6 + Math.random() * 4.8 : 1.8 + Math.random() * 3.4);
      const useHeart = i < heartPieces;
      let geo: BufferGeometry;
      let ownsGeo: boolean;
      let meshScale = 1;
      if (useHeart) {
        geo = this.heartGeo;
        ownsGeo = false;
        meshScale = size * (0.18 + Math.random() * 0.28);
      } else {
        const w = size * (dramatic ? 0.12 + Math.random() * 0.38 : 0.14 + Math.random() * 0.28);
        const h = size * (dramatic ? 0.1 + Math.random() * 0.42 : 0.12 + Math.random() * 0.32);
        const d = size * (dramatic ? 0.08 + Math.random() * 0.22 : 0.1 + Math.random() * 0.18);
        geo = new BoxGeometry(w, h, d);
        ownsGeo = true;
      }
      const mat = new MeshStandardMaterial({
        color: palette[i % palette.length],
        emissive: palette[i % palette.length],
        emissiveIntensity: dramatic ? 0.4 : 0.25,
        roughness: 0.45,
        metalness: 0.05,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new Mesh(geo, mat);
      const baseScale = useHeart ? meshScale : 1;
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

  private tickShards(dt: number, reduceMotion: boolean): void {
    const gravity = this.viewScale * 52;
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
        shout.root.position.y = shout.baseY + punch * this.viewScale * 8;
      } else {
        const u = Math.min(1, (shout.age - SHOUT_POP) / (SHOUT_LIFE - SHOUT_POP));
        shout.root.scale.setScalar(base * (1.2 + u * 0.9));
        const fade = 1 - u * u;
        shout.faceMat.opacity = fade;
        shout.shadeMat.opacity = fade * 0.85;
        shout.root.position.y = shout.baseY + this.viewScale * (8 + u * 36);
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

  private fitCamera(): void {
    const vFov = (this.camera.fov * Math.PI) / 180;
    const dist = 120;
    const viewH = 2 * Math.tan(vFov / 2) * dist;
    this.viewScale = viewH / Math.max(1, this.bufferH);
    const viewW = viewH * this.camera.aspect;
    this.camera.position.set(viewW * 0.5, viewH * 0.5, dist);
    this.camera.lookAt(viewW * 0.5, viewH * 0.5, 0);
  }

  private paint(force: boolean): void {
    if (!this.shown) return;
    if (this.layoutDirty || force) {
      if (this.startGate) this.layoutStartGate();
      else {
        this.syncTitle(true);
        this.syncFloor(true);
        this.syncTimer(true);
        this.layoutRows();
      }
      this.layoutDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
  }

  private layoutRows(): void {
    const s = this.viewScale;
    const padX = PAD_X * s;
    const padY = (this.bufferH - PAD_Y) * s;
    const row = ROW * s;
    const icon = ICON * s;
    const viewW = this.bufferW * s;
    let y = padY;

    const showTitle = this.titleText.length > 0;
    const showFloor = this.floorText !== null && this.floorText.length > 0;
    this.titleRow.visible = showTitle;
    this.titleRow.position.set(padX, y, 0);

    let floorX = padX;
    if (showTitle && this.titlePlate) {
      floorX = padX + this.titlePlate.width + TITLE_FLOOR_GAP * s;
    }
    this.floorRow.visible = showFloor;
    this.floorRow.position.set(floorX, y, 0);

    if (showTitle || showFloor) y -= row * 1.05;
    const showTimer = this.seconds !== null;
    this.timerRow.visible = showTimer;
    if (showTimer) this.timerRow.position.set(padX, y, 0);

    this.syncCoins(viewW * 0.5, padY, icon);
    this.syncHearts(viewW - padX, padY, icon);
  }

  private layoutStartGate(): void {
    const s = this.viewScale;
    const viewW = this.bufferW * s;
    const viewH = this.bufferH * s;
    const icon = START_ICON * s;
    const gap = START_GAP * s;
    const cx = viewW * 0.5;
    if (!this.startScrim) {
      const mat = new MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        toneMapped: false,
      });
      this.startScrim = new Mesh(new PlaneGeometry(1, 1), mat);
      this.startLayer.add(this.startScrim);
    }
    // Keep content above the scrim in draw order.
    this.startLayer.add(
      this.startHeartsRow,
      this.startCoinsRow,
      this.startBtnRow,
    );
    this.startScrim.scale.set(viewW * 1.1, viewH * 1.1, 1);
    this.startScrim.position.set(viewW * 0.5, viewH * 0.5, -2);

    const rows: { height: number; place: (y: number) => void }[] = [];

    const title = this.startTitle.trim() || "Untitled";
    const titleH = START_TITLE_PX * s;
    if (!this.startTitlePlate) {
      this.startTitlePlate = new StartLabel(title, "#ffffff", titleH, true);
      this.startLayer.add(this.startTitlePlate.root);
    } else {
      this.startTitlePlate.set(title, "#ffffff", titleH);
    }
    this.startTitlePlate.root.rotation.x = -0.08;
    this.startTitlePlate.root.rotation.y = 0.04;
    rows.push({
      height: titleH,
      place: (y) => {
        if (!this.startTitlePlate) return;
        this.startTitlePlate.root.position.set(cx, y, 2);
      },
    });

    const floorLabel = this.startFloors === 1 ? "1 floor" : `${this.startFloors} floors`;
    const floorH = START_FLOOR_PX * s;
    if (!this.startFloorPlate) {
      this.startFloorPlate = new StartLabel(floorLabel, "#ffffff", floorH, false);
      this.startLayer.add(this.startFloorPlate.root);
    } else {
      this.startFloorPlate.set(floorLabel, "#ffffff", floorH);
    }
    this.startFloorPlate.root.rotation.x = -0.08;
    this.startFloorPlate.root.rotation.y = 0.04;
    rows.push({
      height: floorH,
      place: (y) => {
        if (!this.startFloorPlate) return;
        this.startFloorPlate.root.position.set(cx, y, 2);
      },
    });

    const heartCount = this.startLives === null
      ? 0
      : Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(this.startLives)));
    if (heartCount > 0) {
      rows.push({
        height: icon,
        place: (y) => this.syncStartHearts(cx, y, icon, heartCount),
      });
    } else {
      this.startHeartsRow.visible = false;
    }

    const coinCount = Math.max(0, Math.round(this.startCoins));
    if (coinCount > 0) {
      rows.push({
        height: icon,
        place: (y) => this.syncStartCoins(cx, y, icon, coinCount),
      });
    } else {
      this.startCoinsRow.visible = false;
    }

    const btnH = START_BTN_PX * s;
    const face = tokenColor("--maze-goal", "#ffbc61");
    const ink = tokenColor("--maze-void", "#000000");
    if (!this.startBtn) {
      this.startBtn = new StartButton("Start", face, ink, btnH);
      this.startBtnRow.add(this.startBtn.root);
    } else {
      this.startBtn.set("Start", face, ink, btnH);
    }
    const btnW = this.startBtn.width;
    this.startBtn.root.rotation.x = -0.1;
    this.startBtnRow.rotation.x = -0.08;
    rows.push({
      height: btnH,
      place: (y) => {
        this.startBtnRow.visible = true;
        this.startBtnRow.userData.baseY = y;
        this.startBtnRow.position.set(cx, y, 4);
        // CSS-pixel hit box (y grows down).
        const cssY = this.bufferH - (y + btnH * 0.5) / s;
        this.startBtnHit = {
          x: (cx - btnW * 0.5) / s,
          y: cssY,
          w: btnW / s,
          h: btnH / s,
        };
      },
    });

    const totalH = rows.reduce((sum, row) => sum + row.height, 0) + gap * Math.max(0, rows.length - 1);
    let y = viewH * 0.55 + totalH * 0.5;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;
      y -= row.height * 0.5;
      row.place(y);
      y -= row.height * 0.5 + gap;
    }
  }

  private syncStartHearts(centerX: number, y: number, icon: number, count: number): void {
    this.startHeartsRow.visible = true;
    this.startHeartsRow.position.set(centerX, y, 1);
    const gap = icon * 1.3;
    while (this.startHeartIcons.length < count) {
      const iconGroup = makeHeartIcon(
        this.heartGeo,
        this.heartOutlineMat,
        this.heartBodyMat,
        this.heartShadeMat,
      );
      this.startHeartIcons.push(iconGroup);
      this.startHeartsRow.add(iconGroup);
    }
    for (let i = 0; i < this.startHeartIcons.length; i += 1) {
      const iconGroup = this.startHeartIcons[i];
      if (!iconGroup) continue;
      const on = i < count;
      iconGroup.visible = on;
      if (!on) continue;
      iconGroup.scale.setScalar(icon);
      iconGroup.position.set((i - (count - 1) * 0.5) * gap, 0, 0);
      iconGroup.rotation.x = -0.18;
    }
  }

  private syncStartCoins(centerX: number, y: number, icon: number, total: number): void {
    this.startCoinsRow.visible = true;
    this.startCoinsRow.position.set(centerX, y, 1);
    const gap = icon * 1.25;
    while (this.startCoinMeshes.length < total) {
      const mesh = new Mesh(this.coinGeo, this.coinMat);
      this.startCoinMeshes.push(mesh);
      this.startCoinsRow.add(mesh);
    }
    for (let i = 0; i < this.startCoinMeshes.length; i += 1) {
      const mesh = this.startCoinMeshes[i];
      if (!mesh) continue;
      const on = i < total;
      mesh.visible = on;
      if (!on) continue;
      mesh.geometry = this.coinGeo;
      mesh.material = this.coinMat;
      mesh.scale.setScalar(icon);
      mesh.position.set((i - (total - 1) * 0.5) * gap, 0, 0);
      mesh.rotation.x = -0.2;
    }
  }

  private syncTitle(force = false): void {
    const text = this.titleText;
    if (!force && text === this.titleDrawn) return;
    this.titleDrawn = text;
    if (!text) {
      this.titleRow.visible = false;
      return;
    }
    const height = this.viewScale * TITLE_PX;
    if (!this.titlePlate) {
      this.titlePlate = new TextPlate(text, "#ffffff", height);
      this.titlePlate.setSoft(this.normalLook);
      this.titleRow.add(this.titlePlate.root);
    } else {
      this.titlePlate.set(text, "#ffffff", height);
    }
    this.titlePlate.root.position.set(this.titlePlate.width * 0.5, 0, 0);
    this.titlePlate.root.rotation.x = -0.1;
    this.titlePlate.root.rotation.y = 0.08;
  }

  private syncFloor(force = false): void {
    const text = this.floorText ?? "";
    if (!force && text === this.floorDrawn) return;
    this.floorDrawn = text;
    if (!text) {
      this.floorRow.visible = false;
      return;
    }
    const height = this.viewScale * FLOOR_PX;
    if (!this.floorPlate) {
      this.floorPlate = new TextPlate(text, "#ffffff", height, false);
      this.floorRow.add(this.floorPlate.root);
    } else {
      this.floorPlate.set(text, "#ffffff", height);
    }
    this.floorPlate.setSoft(this.normalLook);
    this.floorRow.visible = true;
    this.floorPlate.root.position.set(this.floorPlate.width * 0.5, 0, 0);
    this.floorPlate.root.rotation.x = -0.1;
    this.floorPlate.root.rotation.y = 0.08;
  }

  private syncHearts(rightX: number, y: number, icon: number): void {
    const count = this.lives === null
      ? 0
      : Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(this.lives)));
    this.heartsRow.visible = count > 0;
    this.heartsRow.position.set(rightX, y, 0);
    const gap = icon * 1.3;
    while (this.heartIcons.length < count) {
      const iconGroup = makeHeartIcon(
        this.heartGeo,
        this.heartOutlineMat,
        this.heartBodyMat,
        this.heartShadeMat,
      );
      this.heartIcons.push(iconGroup);
      this.heartsRow.add(iconGroup);
    }
    for (let i = 0; i < this.heartIcons.length; i += 1) {
      const iconGroup = this.heartIcons[i];
      if (!iconGroup) continue;
      const on = i < count;
      iconGroup.visible = on;
      if (!on) continue;
      iconGroup.scale.setScalar(icon);
      // Right-align: last heart sits on the anchor, earlier ones extend left.
      iconGroup.position.set(-(count - 1 - i) * gap - icon * 0.55, 0, 0);
      iconGroup.rotation.x = -0.18;
    }
  }

  private syncCoins(centerX: number, y: number, icon: number): void {
    const total = Math.max(0, Math.round(this.coinsMax));
    const got = Math.max(0, Math.min(total, Math.round(this.coinsGot)));
    this.coinsRow.visible = total > 0;
    this.coinsRow.position.set(centerX, y, 0);
    const gap = icon * 1.25;
    while (this.coinMeshes.length < total) {
      const mesh = new Mesh(this.coinGeo, this.coinMat);
      this.coinMeshes.push(mesh);
      this.coinsRow.add(mesh);
    }
    for (let i = 0; i < this.coinMeshes.length; i += 1) {
      const mesh = this.coinMeshes[i];
      if (!mesh) continue;
      const on = i < total;
      mesh.visible = on;
      if (!on) continue;
      const filled = i < got;
      mesh.geometry = this.coinGeo;
      mesh.material = filled ? this.coinMat : this.emptyCoinMat;
      mesh.scale.setScalar(icon);
      mesh.position.set((i - (total - 1) * 0.5) * gap, 0, 0);
      mesh.rotation.x = -0.2;
      if (!filled) mesh.rotation.y = 0.35;
    }
  }

  private syncTimer(force = false): void {
    if (this.seconds === null) {
      this.timerText = "";
      this.timerRow.visible = false;
      return;
    }
    const text = formatTime(this.seconds);
    if (!force && text === this.timerText) return;
    this.timerText = text;
    const height = this.viewScale * TIMER_PX;
    if (!this.timerPlate) {
      this.timerPlate = new TextPlate(text, "#ffffff", height);
      this.timerPlate.setSoft(this.normalLook);
      this.timerRow.add(this.timerPlate.root);
    } else {
      this.timerPlate.set(text, "#ffffff", height);
    }
    this.timerPlate.root.position.set(this.timerPlate.width * 0.5, 0, 0);
    this.timerPlate.root.rotation.x = -0.1;
    this.timerPlate.root.rotation.y = 0.08;
  }
}

/** Soft, legible start-gate label (LinearFilter — not the pixel comic HUD plates). */
class StartLabel {
  readonly root = new Group();
  private readonly faceMat: MeshBasicMaterial;
  private readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private readonly texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly heavy: boolean;
  width = 1;
  private height = 1;
  private text = "";
  private fill = "";

  constructor(text: string, fill: string, height: number, heavy: boolean) {
    this.heavy = heavy;
    this.paintCanvas = document.createElement("canvas");
    const ctx = this.paintCanvas.getContext("2d");
    if (!ctx) throw new Error("Play HUD start label canvas unavailable");
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;

    this.faceMat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.shadeMat = new MeshBasicMaterial({
      map: this.texture,
      color: "#000000",
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    });
    this.face = new Mesh(new PlaneGeometry(1, 1), this.faceMat);
    this.shade = new Mesh(new PlaneGeometry(1, 1), this.shadeMat);
    this.root.add(this.shade, this.face);
    this.set(text, fill, height);
  }

  set(text: string, fill: string, height: number): void {
    if (text === this.text && fill === this.fill && Math.abs(height - this.height) < 1e-6) return;
    this.text = text;
    this.fill = fill;
    this.height = height;

    const px = this.heavy ? 72 : 52;
    const font = this.heavy
      ? `700 ${px}px "Arial Black", "Arial Bold", Impact, sans-serif`
      : `600 ${px}px Arial, Helvetica, sans-serif`;
    const padX = this.heavy ? 18 : 12;
    const padY = this.heavy ? 20 : 14;
    this.ctx.font = font;
    const textW = this.ctx.measureText(text).width;
    const w = Math.max(8, Math.ceil(textW + padX * 2));
    const h = Math.max(8, Math.ceil(px * 1.25 + padY));
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.font = font;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.lineJoin = "round";
    const x = w * 0.5;
    const y = h * 0.52;
    this.ctx.lineWidth = Math.max(4, Math.round(px * (this.heavy ? 0.18 : 0.14)));
    this.ctx.strokeStyle = "#000000";
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = fill;
    this.ctx.fillText(text, x, y);
    this.texture.needsUpdate = true;

    this.width = height * (w / h);
    this.face.scale.set(this.width, height, 1);
    this.shade.scale.set(this.width, height, 1);
    this.shade.position.set(height * 0.05, -height * 0.06, -height * 0.1);
  }
}

/** Rounded CTA pill — painted once, shaded for depth. */
class StartButton {
  readonly root = new Group();
  private readonly faceMat: MeshBasicMaterial;
  private readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private readonly texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  width = 1;
  private height = 1;
  private text = "";
  private faceFill = "";
  private ink = "";

  constructor(text: string, faceFill: string, ink: string, height: number) {
    this.paintCanvas = document.createElement("canvas");
    const ctx = this.paintCanvas.getContext("2d");
    if (!ctx) throw new Error("Play HUD start button canvas unavailable");
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;

    this.faceMat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.shadeMat = new MeshBasicMaterial({
      map: this.texture,
      color: "#000000",
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      toneMapped: false,
    });
    this.face = new Mesh(new PlaneGeometry(1, 1), this.faceMat);
    this.shade = new Mesh(new PlaneGeometry(1, 1), this.shadeMat);
    this.root.add(this.shade, this.face);
    this.set(text, faceFill, ink, height);
  }

  set(text: string, faceFill: string, ink: string, height: number): void {
    if (
      text === this.text
      && faceFill === this.faceFill
      && ink === this.ink
      && Math.abs(height - this.height) < 1e-6
    ) return;
    this.text = text;
    this.faceFill = faceFill;
    this.ink = ink;
    this.height = height;

    const px = 72;
    const padX = 48;
    const padY = 26;
    this.ctx.font = START_BTN_FONT;
    const textW = this.ctx.measureText(text).width;
    const w = Math.max(8, Math.ceil(textW + padX * 2));
    const h = Math.max(8, Math.ceil(px + padY * 2));
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.ctx.clearRect(0, 0, w, h);

    const radius = h * 0.5;
    roundRect(this.ctx, 0, 0, w, h, radius);
    this.ctx.fillStyle = faceFill;
    this.ctx.fill();

    // Soft top sheen so the pill reads as raised, not flat.
    const sheen = this.ctx.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, "rgba(255,255,255,0.4)");
    sheen.addColorStop(0.42, "rgba(255,255,255,0.1)");
    sheen.addColorStop(1, "rgba(0,0,0,0.14)");
    roundRect(this.ctx, 0, 0, w, h, radius);
    this.ctx.fillStyle = sheen;
    this.ctx.fill();

    // Inner rim for a cleaner edge against the maze.
    this.ctx.lineWidth = Math.max(3, Math.round(h * 0.045));
    this.ctx.strokeStyle = "rgba(0,0,0,0.28)";
    roundRect(
      this.ctx,
      this.ctx.lineWidth * 0.5,
      this.ctx.lineWidth * 0.5,
      w - this.ctx.lineWidth,
      h - this.ctx.lineWidth,
      Math.max(1, radius - this.ctx.lineWidth * 0.5),
    );
    this.ctx.stroke();

    this.ctx.font = START_BTN_FONT;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = ink;
    this.ctx.fillText(text, w * 0.5, h * 0.52);
    this.texture.needsUpdate = true;

    this.width = height * (w / h);
    this.face.scale.set(this.width, height, 1);
    this.shade.scale.set(this.width, height, 1);
    this.shade.position.set(height * 0.05, -height * 0.07, -height * 0.1);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Arial Black outlined label as textured planes with a 3D shade offset. */
class TextPlate {
  readonly root = new Group();
  readonly faceMat: MeshBasicMaterial;
  readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly crisp: boolean;
  private canvasW = 0;
  private canvasH = 0;
  width = 1;
  private height = 1;
  private text = "";
  private fill = "";

  constructor(text: string, fill: string, height: number, crisp = true) {
    this.crisp = crisp;
    this.paintCanvas = document.createElement("canvas");
    const ctx = this.paintCanvas.getContext("2d");
    if (!ctx) throw new Error("Play HUD text canvas unavailable");
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.applyFilter();

    this.faceMat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.shadeMat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      color: "#000000",
    });
    this.face = new Mesh(new PlaneGeometry(1, 1), this.faceMat);
    this.shade = new Mesh(new PlaneGeometry(1, 1), this.shadeMat);
    this.shade.position.set(0.08, -0.08, -0.35);
    this.root.add(this.shade, this.face);
    this.set(text, fill, height);
  }

  /** Soften glyph filtering for normal look; crisp plates stay nearest in pixel mode. */
  setSoft(soft: boolean): void {
    const filter = soft || !this.crisp ? LinearFilter : NearestFilter;
    if (this.texture.magFilter === filter && this.texture.minFilter === filter) return;
    this.texture.magFilter = filter;
    this.texture.minFilter = filter;
    this.texture.needsUpdate = true;
  }

  private applyFilter(): void {
    const filter = this.crisp ? NearestFilter : LinearFilter;
    this.texture.magFilter = filter;
    this.texture.minFilter = filter;
  }

  private rebindTexture(): void {
    this.texture.dispose();
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.applyFilter();
    this.faceMat.map = this.texture;
    this.shadeMat.map = this.texture;
    this.faceMat.needsUpdate = true;
    this.shadeMat.needsUpdate = true;
  }

  set(text: string, fill: string, height: number): void {
    if (text === this.text && fill === this.fill && Math.abs(height - this.height) < 1e-6) return;
    this.text = text;
    this.fill = fill;
    this.height = height;

    // High internal resolution keeps "FLOOR 1/100" legible on the low-res HUD buffer.
    const px = 128;
    const pad = 28;
    const font = `700 ${px}px "Arial Black", "Arial Bold", Impact, sans-serif`;
    this.ctx.font = font;
    const metrics = this.ctx.measureText(text);
    const w = Math.max(8, Math.ceil(metrics.width + pad * 2));
    const h = Math.max(8, Math.ceil(px * 1.35 + pad));
    const resized = this.canvasW !== w || this.canvasH !== h;
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.canvasW = w;
    this.canvasH = h;
    // Resizing the canvas invalidates the GPU texture size — rebind or the old
    // shorter label (e.g. "FLOOR 1/3") stays stretched on screen.
    if (resized) this.rebindTexture();
    this.ctx.font = font;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.lineJoin = "round";
    this.ctx.lineWidth = Math.max(6, px * 0.14);
    this.ctx.strokeStyle = "#000000";
    const x = pad;
    const y = h * 0.52;
    const depth = Math.max(4, Math.round(px * 0.1));
    this.ctx.fillStyle = "#000000";
    for (let i = depth; i >= 1; i -= 1) this.ctx.fillText(text, x + i, y + i);
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = fill;
    this.ctx.fillText(text, x, y);
    this.texture.needsUpdate = true;

    this.width = height * (w / h);
    this.face.scale.set(this.width, height, 1);
    this.shade.scale.set(this.width, height, 1);
    this.shade.position.set(height * 0.06, -height * 0.06, -height * 0.12);
  }
}

function disposePlate(root: Group, faceMat: MeshBasicMaterial, shadeMat: MeshBasicMaterial): void {
  for (const child of [...root.children]) {
    root.remove(child);
    if (child instanceof Mesh) child.geometry.dispose();
  }
  faceMat.map?.dispose();
  faceMat.dispose();
  shadeMat.dispose();
}

function pulseScale(remain: number): number {
  if (remain <= 0) return 1;
  const t = 1 - remain / PULSE_SECS;
  return 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.22;
}

function stdMat(color: string, emissive: string, emissiveIntensity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.4,
    metalness: 0.1,
  });
}

function tokenColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
