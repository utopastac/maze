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
import { SETTING_DEFAULTS, snapPixels } from "../core/playSettings.ts";
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
const START_GAP = 10;
const START_TITLE_FLOOR_GAP = 2;
const START_COLLECT_GAP = 0.55;
const HOME_TITLE_PX = 52;
const HOME_BTN_PX = 34;
const HOME_TITLE_BTN_GAP = 22;
const HOME_BTN_GAP = 8;
const HOME_DECOR_ICON = 16;
/** Show individual coin meshes up to this many; beyond that, one coin + count. */
const MAX_COIN_ICONS = 5;
const START_BTN_FONT = `700 72px "Arial Black", "Arial Bold", Impact, sans-serif`;
const PULSE_SECS = 0.35;
const SHOUT_LIFE = 1.05;
const SHOUT_POP = 0.18;
const SHATTER_LIFE = 0.7;
const START_SHATTER_LIFE = 0.9;
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

export type PlayHudHomeAction =
  | "tower"
  | "play"
  | "create"
  | "saved"
  | "settings"
  | "towerNew"
  | "towerLoad"
  | "towerBack";

export type PlayHudHomeMenuMode = "main" | "tower";

type HomeHit = {
  action: PlayHudHomeAction;
  x: number;
  y: number;
  w: number;
  h: number;
};

const HOME_ACTIONS: readonly PlayHudHomeAction[] = [
  "tower",
  "play",
  "create",
  "saved",
  "settings",
];

const TOWER_HOME_ACTIONS: readonly PlayHudHomeAction[] = [
  "towerNew",
  "towerLoad",
  "towerBack",
];

const HOME_LABELS: Record<PlayHudHomeAction, string> = {
  tower: "Tower",
  play: "Free play",
  create: "Create level",
  saved: "Saved levels",
  settings: "Settings",
  towerNew: "New game",
  towerLoad: "Load",
  towerBack: "Back",
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
  private readonly homeLayer = new Group();
  private readonly homeBtnRows: Group[] = HOME_ACTIONS.map(() => new Group());
  private readonly homeDecorHearts: Group[] = [];
  private readonly homeDecorCoins: Mesh[] = [];
  private startScrim: Mesh | null = null;
  private homeScrim: Mesh | null = null;
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
  private coinCountPlate: TextPlate | null = null;
  private startCoinCountPlate: StartLabel | null = null;
  private timerPlate: TextPlate | null = null;
  private titlePlate: TextPlate | null = null;
  private floorPlate: TextPlate | null = null;
  private startTitlePlate: StartLabel | null = null;
  private startFloorPlate: StartLabel | null = null;
  private startBtn: StartButton | null = null;
  private homeTitlePlate: ArchLabel | null = null;
  private readonly homeBtns: (StartButton | null)[] = HOME_ACTIONS.map(() => null);
  private shown = false;
  private startGate = false;
  private homeMenu = false;
  private homeMenuMode: PlayHudHomeMenuMode = "main";
  private startTitle = "";
  private startFloors = 1;
  private startLives: number | null = null;
  private startCoins = 0;
  private startBtnHit: { x: number; y: number; w: number; h: number } | null = null;
  private homeHits: HomeHit[] = [];
  private homeHover: PlayHudHomeAction | null = null;
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
  /** World units per buffer pixel (frustum height / bufferH). */
  private viewScale = 1;
  /** CSS pixels per buffer pixel from the UI pixels setting. */
  private uiScale = 1;
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
    this.homeLayer.visible = false;
    this.scene.add(this.startLayer, this.homeLayer);
    for (const row of this.homeBtnRows) this.homeLayer.add(row);
    this.canvas.hidden = true;
  }

  private overlayOpen(): boolean {
    return this.startGate || this.homeMenu;
  }

  private syncOverlayVisibility(): void {
    const on = this.shown;
    const overlay = this.overlayOpen();
    this.root.visible = on && !overlay;
    this.startLayer.visible = on && this.startGate;
    this.homeLayer.visible = on && this.homeMenu;
    this.shoutLayer.visible = on && !overlay;
    this.shatterLayer.visible = on;
  }

  /** Comic collect shout — same Arial Black plates as the timer. */
  shout(text: string, color: string): void {
    if (!this.shown || this.bufferW < 2) return;
    const fill = color.trim() || "#ffffff";
    // Match timer TextPlate sizing (design CSS px), just larger for comic pops.
    const u = this.designScale();
    const height = u * 42;
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

  setVisible(on: boolean): void {
    if (this.shown === on) return;
    this.shown = on;
    this.canvas.hidden = !on;
    this.syncOverlayVisibility();
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
    if (open && this.homeMenu) this.setHomeMenu(false);
    this.startGate = open;
    if (gate) {
      this.startTitle = gate.title;
      this.startFloors = Math.max(1, Math.round(gate.floors));
      this.startLives = gate.lives;
      this.startCoins = Math.max(0, Math.round(gate.coins));
    } else {
      this.startBtnHit = null;
    }
    this.syncOverlayVisibility();
    this.layoutDirty = true;
    if (this.shown) this.paint(true);
  }

  /** Full-screen title menu on the 3D HUD layer. */
  setHomeMenu(open: boolean): void {
    if (open === this.homeMenu) {
      if (open) {
        this.layoutDirty = true;
        if (this.shown) this.paint(true);
      }
      return;
    }
    if (open && this.startGate) this.setStartGate(null);
    this.homeMenu = open;
    if (!open) {
      this.homeHits = [];
      this.homeHover = null;
      this.homeMenuMode = "main";
    }
    this.syncOverlayVisibility();
    this.layoutDirty = true;
    if (this.shown) this.paint(true);
  }

  /** Main title list vs. in-world Tower New/Load submenu. */
  setHomeMenuMode(mode: PlayHudHomeMenuMode): void {
    if (this.homeMenuMode === mode) return;
    this.homeMenuMode = mode;
    this.homeHover = null;
    this.layoutDirty = true;
    if (this.shown) this.paint(true);
  }

  homeMenuModeOf(): PlayHudHomeMenuMode {
    return this.homeMenuMode;
  }

  /** Blow apart the start briefing, then hand off to the play HUD. */
  shatterStartGate(): void {
    if (!this.startGate) return;
    if (this.shown && this.bufferW >= 2) this.spawnStartGateShards();
    this.setStartGate(null);
  }

  /** Blow apart the home menu before leaving for a destination. */
  shatterHomeMenu(): void {
    if (!this.homeMenu) return;
    if (this.shown && this.bufferW >= 2) this.spawnHomeMenuShards();
    this.setHomeMenu(false);
  }

  isStartGateOpen(): boolean {
    return this.startGate;
  }

  isHomeMenuOpen(): boolean {
    return this.homeMenu;
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

  /** Hit-test a home menu CTA in CSS client coordinates. */
  hitTestHome(clientX: number, clientY: number): PlayHudHomeAction | null {
    if (!this.homeMenu || !this.shown || this.homeHits.length === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((clientX - rect.left) / rect.width) * this.bufferW;
    const y = ((clientY - rect.top) / rect.height) * this.bufferH;
    for (const hit of this.homeHits) {
      if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
        return hit.action;
      }
    }
    return null;
  }

  /** Soft hover scale on the pointed home CTA. */
  setHomeHover(action: PlayHudHomeAction | null): void {
    if (this.homeHover === action) return;
    this.homeHover = action;
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
   * Raising UI pixels lowers buffer resolution (chunkier glyphs) while
   * designScale() keeps on-screen element size stable.
   * With normal look, keep the same layout grid but supersample to device resolution.
   */
  resize(width: number, height: number, uiPixels: number, normalLook = false): void {
    const scale = snapPixels(uiPixels);
    const bufferW = Math.max(1, Math.floor(width / scale));
    const bufferH = Math.max(1, Math.floor(height / scale));
    const sizeChanged = this.bufferW !== bufferW || this.bufferH !== bufferH;
    const scaleChanged = this.uiScale !== scale;
    const lookChanged = this.normalLook !== normalLook;
    this.bufferW = bufferW;
    this.bufferH = bufferH;
    this.uiScale = scale;
    this.normalLook = normalLook;
    const dpr = normalLook ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    // Chunk-sized drawing buffer; pixel ratio only supersamples in normal look.
    this.renderer.setPixelRatio(normalLook ? scale * dpr : 1);
    this.renderer.setSize(bufferW, bufferH, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.dataset.look = normalLook ? "normal" : "pixel";
    this.camera.aspect = bufferW / bufferH;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
    if (lookChanged) this.applyLookFilters();
    if (sizeChanged || scaleChanged || lookChanged) this.layoutDirty = true;
    if (this.shown) this.paint(true);
  }

  /**
   * World units per design pixel. Anchored to the default UI pixels value so the
   * stock layout size is unchanged; other settings only change chunkiness.
   */
  private designScale(): number {
    const baseline = Math.max(SETTING_DEFAULTS.uiPixels, 1e-6);
    return this.viewScale * (baseline / Math.max(this.uiScale, 1e-6));
  }

  private applyLookFilters(): void {
    const soft = this.normalLook;
    this.timerPlate?.setSoft(soft);
    this.titlePlate?.setSoft(soft);
    this.floorPlate?.setSoft(soft);
    this.coinCountPlate?.setSoft(soft);
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
      const coins = this.startGate || this.homeMenu
        ? (this.homeMenu ? this.homeDecorCoins : this.startCoinMeshes)
        : this.coinMeshes;
      for (const mesh of coins) {
        if (!mesh.visible || mesh.material !== this.coinMat) continue;
        mesh.rotation.y += dt * 3.6;
      }
      const hearts = this.startGate || this.homeMenu
        ? (this.homeMenu ? this.homeDecorHearts : this.startHeartIcons)
        : this.heartIcons;
      for (const heart of hearts) {
        if (!heart.visible) continue;
        heart.rotation.y = 0.2 + Math.sin(performance.now() * 0.0024 + heart.id) * 0.35;
      }
      if (this.startGate && this.startBtnRow.visible) {
        const bob = Math.sin(performance.now() * 0.0032) * this.designScale() * 1.2;
        this.startBtnRow.position.y = (this.startBtnRow.userData.baseY as number ?? 0) + bob;
      }
      if (this.homeMenu) {
        const u = this.designScale();
        const now = performance.now();
        if (this.homeTitlePlate) {
          this.homeTitlePlate.root.rotation.y = 0.04 + Math.sin(now * 0.0011) * 0.03;
          this.homeTitlePlate.root.rotation.x = -0.08 + Math.sin(now * 0.0009) * 0.02;
        }
        const homeActions = this.homeMenuMode === "tower" ? TOWER_HOME_ACTIONS : HOME_ACTIONS;
        for (let i = 0; i < this.homeBtnRows.length; i += 1) {
          const row = this.homeBtnRows[i];
          const action = homeActions[i];
          if (!row) continue;
          if (!action || !row.visible) continue;
          const baseY = (row.userData.baseY as number) ?? 0;
          const primary = action === "tower" || action === "towerNew";
          const hover = this.homeHover === action;
          const bob = primary
            ? Math.sin(now * 0.0032) * u * 1.4
            : Math.sin(now * 0.0024 + i) * u * 0.45;
          row.position.y = baseY + bob;
          const target = hover ? 1.08 : 1;
          const cur = (row.userData.scale as number) ?? 1;
          const next = cur + (target - cur) * Math.min(1, dt * 14);
          row.userData.scale = next;
          row.scale.setScalar(next);
        }
        for (let i = 0; i < this.homeDecorHearts.length; i += 1) {
          const heart = this.homeDecorHearts[i];
          if (!heart?.visible) continue;
          const base = heart.userData.base as { x: number; y: number; z: number };
          if (!base) continue;
          heart.position.x = base.x + Math.sin(now * 0.0014 + i * 1.7) * u * 3;
          heart.position.y = base.y + Math.cos(now * 0.0018 + i * 1.3) * u * 4;
        }
        for (let i = 0; i < this.homeDecorCoins.length; i += 1) {
          const coin = this.homeDecorCoins[i];
          if (!coin?.visible) continue;
          const base = coin.userData.base as { x: number; y: number; z: number };
          if (!base) continue;
          coin.position.x = base.x + Math.cos(now * 0.0016 + i * 1.9) * u * 3;
          coin.position.y = base.y + Math.sin(now * 0.0021 + i * 1.1) * u * 4;
        }
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

  private spawnStartGateShards(): void {
    const life = START_SHATTER_LIFE;
    for (const icon of this.startHeartIcons) {
      if (!icon.visible) continue;
      icon.updateWorldMatrix(true, false);
      const origin = icon.getWorldPosition(this.shatterScratch);
      this.shatterLayer.worldToLocal(origin);
      const size = Math.max(0.01, icon.scale.x);
      this.spawnHeartShards(origin.x, origin.y, origin.z, size, 14, life, true);
    }

    const coinHex = this.coinMat.color.getHex();
    const coinShine = tokenHex("--maze-coin-shine", "#ffe9a0");
    const coinPalette = [coinHex, coinHex, coinShine, 0xffffff];
    for (const mesh of this.startCoinMeshes) {
      if (!mesh.visible) continue;
      mesh.updateWorldMatrix(true, false);
      const origin = mesh.getWorldPosition(this.shatterScratch);
      this.shatterLayer.worldToLocal(origin);
      const size = Math.max(0.01, mesh.scale.x);
      this.spawnShards(origin.x, origin.y, origin.z, size, 12, life, true, coinPalette, {
        coinPieces: 3,
      });
    }

    const titleH = START_TITLE_PX * this.designScale();
    if (this.startTitlePlate) {
      this.shatterPlate(
        this.startTitlePlate.root,
        this.startTitlePlate.width,
        titleH,
        [0xffffff, 0xffffff, 0xf0f0f0, 0x222222],
        life,
      );
    }
    const floorH = START_FLOOR_PX * this.designScale();
    if (this.startFloorPlate) {
      this.shatterPlate(
        this.startFloorPlate.root,
        this.startFloorPlate.width,
        floorH,
        [0xffffff, 0xe8e8e8, 0x1a1a1a],
        life,
      );
    }
    if (this.startCoinCountPlate?.root.visible) {
      const countH = START_ICON * this.designScale() * 1.15;
      this.shatterPlate(
        this.startCoinCountPlate.root,
        this.startCoinCountPlate.width,
        countH,
        coinPalette,
        life,
      );
    }
    if (this.startBtn) {
      const btnH = START_BTN_PX * this.designScale();
      const face = tokenHex("--maze-goal", "#ffbc61");
      const ink = tokenHex("--maze-void", "#000000");
      this.shatterPlate(
        this.startBtn.root,
        this.startBtn.width,
        btnH,
        [face, face, 0xffffff, ink],
        life,
      );
    }
  }

  private shatterPlate(
    root: Group,
    width: number,
    height: number,
    palette: number[],
    life: number,
  ): void {
    if (width < 1e-4 || height < 1e-4) return;
    root.updateWorldMatrix(true, false);
    const origin = root.getWorldPosition(this.shatterScratch);
    this.shatterLayer.worldToLocal(origin);
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

  private spawnShards(
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
        geo = this.heartGeo;
        ownsGeo = false;
        meshScale = size * (0.18 + Math.random() * 0.28);
      } else if (useCoin) {
        geo = this.coinGeo;
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

  private tickShards(dt: number, reduceMotion: boolean): void {
    const gravity = this.designScale() * 52;
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
        shout.root.position.y = shout.baseY + punch * this.designScale() * 8;
      } else {
        const u = Math.min(1, (shout.age - SHOUT_POP) / (SHOUT_LIFE - SHOUT_POP));
        shout.root.scale.setScalar(base * (1.2 + u * 0.9));
        const fade = 1 - u * u;
        shout.faceMat.opacity = fade;
        shout.shadeMat.opacity = fade * 0.85;
        shout.root.position.y = shout.baseY + this.designScale() * (8 + u * 36);
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
      if (this.homeMenu) this.layoutHomeMenu();
      else if (this.startGate) this.layoutStartGate();
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
    const u = this.designScale();
    const viewW = this.bufferW * this.viewScale;
    const viewH = this.bufferH * this.viewScale;
    const padX = PAD_X * u;
    const padY = viewH - PAD_Y * u;
    const row = ROW * u;
    const icon = ICON * u;
    let y = padY;

    const showTitle = this.titleText.length > 0;
    const showFloor = this.floorText !== null && this.floorText.length > 0;
    this.titleRow.visible = showTitle;
    this.titleRow.position.set(padX, y, 0);

    let floorX = padX;
    if (showTitle && this.titlePlate) {
      floorX = padX + this.titlePlate.width + TITLE_FLOOR_GAP * u;
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
    const u = this.designScale();
    const viewW = this.bufferW * s;
    const viewH = this.bufferH * s;
    const icon = START_ICON * u;
    const gap = START_GAP * u;
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

    const rows: { height: number; after: number; place: (y: number) => void }[] = [];

    const title = this.startTitle.trim() || "Untitled";
    const titleH = START_TITLE_PX * u;
    if (!this.startTitlePlate) {
      this.startTitlePlate = new StartLabel(title, "#ffffff", titleH, true);
      this.startLayer.add(this.startTitlePlate.root);
    } else {
      this.startTitlePlate.set(title, "#ffffff", titleH);
    }
    this.startTitlePlate.root.rotation.x = -0.08;
    this.startTitlePlate.root.rotation.y = 0.04;
    const floorLabel = this.startFloors === 1 ? "1 floor" : `${this.startFloors} floors`;
    const floorH = START_FLOOR_PX * u;
    // StartLabel canvases include transparent pad; pull the pair together optically.
    const titleFloorAfter = START_TITLE_FLOOR_GAP * u - titleH * 0.2 - floorH * 0.12;
    rows.push({
      height: titleH,
      after: titleFloorAfter,
      place: (y) => {
        if (!this.startTitlePlate) return;
        this.startTitlePlate.root.position.set(cx, y, 2);
      },
    });
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
      after: gap,
      place: (y) => {
        if (!this.startFloorPlate) return;
        this.startFloorPlate.root.position.set(cx, y, 2);
      },
    });

    const heartCount = this.startLives === null
      ? 0
      : Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(this.startLives)));
    const coinCount = Math.max(0, Math.round(this.startCoins));
    if (heartCount > 0 || coinCount > 0) {
      rows.push({
        height: icon,
        after: gap,
        place: (y) => this.syncStartCollectibles(cx, y, icon, heartCount, coinCount),
      });
    } else {
      this.startHeartsRow.visible = false;
      this.startCoinsRow.visible = false;
    }

    const btnH = START_BTN_PX * u;
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
      after: 0,
      place: (y) => {
        this.startBtnRow.visible = true;
        this.startBtnRow.userData.baseY = y;
        this.startBtnRow.position.set(cx, y, 4);
        // Buffer-pixel hit box (y grows down); client coords map into buffer space.
        const bufY = this.bufferH - (y + btnH * 0.5) / s;
        this.startBtnHit = {
          x: (cx - btnW * 0.5) / s,
          y: bufY,
          w: btnW / s,
          h: btnH / s,
        };
      },
    });

    const totalH = rows.reduce((sum, row, i) => {
      const after = i < rows.length - 1 ? row.after : 0;
      return sum + row.height + after;
    }, 0);
    let y = viewH * 0.55 + totalH * 0.5;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;
      y -= row.height * 0.5;
      row.place(y);
      y -= row.height * 0.5 + (i < rows.length - 1 ? row.after : 0);
    }
  }

  private layoutHomeMenu(): void {
    const s = this.viewScale;
    const u = this.designScale();
    const viewW = this.bufferW * s;
    const viewH = this.bufferH * s;
    const cx = viewW * 0.5;
    const btnGap = HOME_BTN_GAP * u;

    if (!this.homeScrim) {
      const mat = new MeshBasicMaterial({
        color: tokenColor("--sky-sad-deep", "#080a10"),
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        toneMapped: false,
      });
      this.homeScrim = new Mesh(new PlaneGeometry(1, 1), mat);
      this.homeLayer.add(this.homeScrim);
    } else if (this.homeScrim.material instanceof MeshBasicMaterial) {
      this.homeScrim.material.opacity = 0.08;
      this.homeScrim.material.transparent = true;
      this.homeScrim.material.color.set(tokenColor("--sky-sad-deep", "#080a10"));
    }
    this.homeScrim.scale.set(viewW * 1.2, viewH * 1.2, 1);
    this.homeScrim.position.set(cx, viewH * 0.5, -2);

    const actions = this.homeMenuMode === "tower" ? TOWER_HOME_ACTIONS : HOME_ACTIONS;
    const titleText = this.homeMenuMode === "tower" ? "TOWER" : "MAZESPIRE";
    const rows: { height: number; after: number; place: (y: number) => void }[] = [];
    const titleH = HOME_TITLE_PX * u;
    if (!this.homeTitlePlate) {
      this.homeTitlePlate = new ArchLabel(titleText, "#ffffff", titleH);
      this.homeLayer.add(this.homeTitlePlate.root);
    } else {
      this.homeTitlePlate.set(titleText, "#ffffff", titleH);
    }
    rows.push({
      height: titleH,
      after: HOME_TITLE_BTN_GAP * u,
      place: (y) => {
        if (!this.homeTitlePlate) return;
        this.homeTitlePlate.root.position.set(cx, y, 3);
        this.homeTitlePlate.root.rotation.x = -0.08;
        this.homeTitlePlate.root.rotation.y = 0.04;
      },
    });

    const btnH = HOME_BTN_PX * u;
    const goal = tokenColor("--maze-goal", "#ffbc61");
    const voidInk = tokenColor("--maze-void", "#000000");
    const face = tokenColor("--ink", "#ffffff");
    const hits: HomeHit[] = [];
    let menuWidth = 0;
    for (let i = 0; i < this.homeBtnRows.length; i += 1) {
      const row = this.homeBtnRows[i];
      if (!row) continue;
      const action = actions[i];
      if (!action) {
        row.visible = false;
        continue;
      }
      const label = HOME_LABELS[action];
      const primary = action === "tower" || action === "towerNew";
      const fill = primary ? goal : face;
      let btn = this.homeBtns[i];
      if (!btn) {
        btn = new StartButton(label, fill, voidInk, btnH);
        this.homeBtns[i] = btn;
        row.add(btn.root);
      } else {
        btn.set(label, fill, voidInk, btnH);
      }
      menuWidth = Math.max(menuWidth, btn.width);
      const index = i;
      const act = action;
      rows.push({
        height: btnH,
        after: index < actions.length - 1 ? btnGap : 0,
        place: (y) => {
          const current = this.homeBtns[index];
          const slot = this.homeBtnRows[index];
          if (!current || !slot) return;
          slot.visible = true;
          slot.userData.baseY = y;
          slot.position.set(cx, y, 4 + index * 0.05);
          slot.rotation.x = -0.08;
          current.root.rotation.x = -0.1;
          const bufY = this.bufferH - (y + btnH * 0.5) / s;
          hits.push({
            action: act,
            x: (cx - current.width * 0.5) / s,
            y: bufY,
            w: current.width / s,
            h: btnH / s,
          });
        },
      });
    }
    this.homeHits = hits;

    const totalH = rows.reduce((sum, row, i) => {
      const after = i < rows.length - 1 ? row.after : 0;
      return sum + row.height + after;
    }, 0);
    let y = viewH * 0.58 + totalH * 0.5;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;
      y -= row.height * 0.5;
      row.place(y);
      y -= row.height * 0.5 + (i < rows.length - 1 ? row.after : 0);
    }

    this.layoutHomeDecor(viewW, viewH, u, menuWidth);
  }

  private layoutHomeDecor(viewW: number, viewH: number, u: number, menuWidth: number): void {
    const icon = HOME_DECOR_ICON * u;
    const gutter = Math.max(icon * 1.4, (viewW - menuWidth) * 0.22);
    const spots = [
      { x: gutter, y: viewH * 0.72, heart: true },
      { x: viewW - gutter, y: viewH * 0.68, heart: false },
      { x: gutter * 0.85, y: viewH * 0.38, heart: false },
      { x: viewW - gutter * 0.9, y: viewH * 0.42, heart: true },
      { x: gutter * 1.15, y: viewH * 0.22, heart: true },
      { x: viewW - gutter * 1.1, y: viewH * 0.2, heart: false },
    ];
    let heartAt = 0;
    let coinAt = 0;
    for (let i = 0; i < spots.length; i += 1) {
      const spot = spots[i];
      if (!spot) continue;
      if (spot.heart) {
        while (this.homeDecorHearts.length <= heartAt) {
          const iconGroup = makeHeartIcon(
            this.heartGeo,
            this.heartOutlineMat,
            this.heartBodyMat,
            this.heartShadeMat,
          );
          this.homeDecorHearts.push(iconGroup);
          this.homeLayer.add(iconGroup);
        }
        const heart = this.homeDecorHearts[heartAt];
        if (!heart) continue;
        heart.visible = true;
        heart.scale.setScalar(icon);
        heart.position.set(spot.x, spot.y, 1);
        heart.rotation.x = -0.18;
        heart.userData.base = { x: spot.x, y: spot.y, z: 1 };
        heartAt += 1;
      } else {
        while (this.homeDecorCoins.length <= coinAt) {
          const mesh = new Mesh(this.coinGeo, this.coinMat);
          this.homeDecorCoins.push(mesh);
          this.homeLayer.add(mesh);
        }
        const coin = this.homeDecorCoins[coinAt];
        if (!coin) continue;
        coin.visible = true;
        coin.scale.setScalar(icon);
        coin.position.set(spot.x, spot.y, 1);
        coin.rotation.x = -0.2;
        coin.userData.base = { x: spot.x, y: spot.y, z: 1 };
        coinAt += 1;
      }
    }
    for (let i = heartAt; i < this.homeDecorHearts.length; i += 1) {
      const heart = this.homeDecorHearts[i];
      if (heart) heart.visible = false;
    }
    for (let i = coinAt; i < this.homeDecorCoins.length; i += 1) {
      const coin = this.homeDecorCoins[i];
      if (coin) coin.visible = false;
    }
  }

  private spawnHomeMenuShards(): void {
    const life = START_SHATTER_LIFE;
    const bodyHex = this.heartBodyMat.color.getHex();
    const shadeHex = this.heartShadeMat.color.getHex();
    const outlineHex = this.heartOutlineMat.color.getHex();
    const coinHex = this.coinMat.color.getHex();
    const coinShine = tokenHex("--maze-coin-shine", "#ffe9a0");
    for (const heart of this.homeDecorHearts) {
      if (!heart.visible) continue;
      heart.updateWorldMatrix(true, false);
      const origin = heart.getWorldPosition(this.shatterScratch);
      this.shatterLayer.worldToLocal(origin);
      const size = Math.max(0.01, heart.scale.x);
      this.spawnShards(
        origin.x,
        origin.y,
        origin.z,
        size,
        10,
        life,
        true,
        [bodyHex, bodyHex, shadeHex, outlineHex],
      );
    }
    for (const mesh of this.homeDecorCoins) {
      if (!mesh.visible) continue;
      mesh.updateWorldMatrix(true, false);
      const origin = mesh.getWorldPosition(this.shatterScratch);
      this.shatterLayer.worldToLocal(origin);
      const size = Math.max(0.01, mesh.scale.x);
      this.spawnShards(origin.x, origin.y, origin.z, size, 10, life, true, [
        coinHex,
        coinHex,
        coinShine,
        0xffffff,
      ], { coinPieces: 3 });
    }
    const titleH = HOME_TITLE_PX * this.designScale();
    if (this.homeTitlePlate) {
      this.shatterPlate(
        this.homeTitlePlate.root,
        this.homeTitlePlate.width,
        titleH,
        [0xffffff, 0xffffff, 0xf0f0f0, 0x222222],
        life,
      );
    }
    const btnH = HOME_BTN_PX * this.designScale();
    const goal = tokenHex("--maze-goal", "#ffbc61");
    const ink = tokenHex("--maze-void", "#000000");
    const face = tokenHex("--ink", "#ffffff");
    const actions = this.homeMenuMode === "tower" ? TOWER_HOME_ACTIONS : HOME_ACTIONS;
    for (let i = 0; i < this.homeBtns.length; i += 1) {
      const btn = this.homeBtns[i];
      const row = this.homeBtnRows[i];
      const action = actions[i];
      if (!btn || !action || !row?.visible) continue;
      const primary = action === "tower" || action === "towerNew";
      this.shatterPlate(
        btn.root,
        btn.width,
        btnH,
        primary ? [goal, goal, 0xffffff, ink] : [face, face, 0xffffff, ink],
        life,
      );
    }
  }

  private syncStartCollectibles(
    centerX: number,
    y: number,
    icon: number,
    heartCount: number,
    coinCount: number,
  ): void {
    const heartW = heartCount > 0 ? this.layoutStartHearts(icon, heartCount) : 0;
    const coinW = coinCount > 0 ? this.layoutStartCoins(icon, coinCount) : 0;
    const groupGap = heartCount > 0 && coinCount > 0 ? icon * START_COLLECT_GAP : 0;
    const span = heartW + groupGap + coinW;
    let x = centerX - span * 0.5;
    if (heartCount > 0) {
      this.startHeartsRow.visible = true;
      this.startHeartsRow.position.set(x + heartW * 0.5, y, 1);
      x += heartW + groupGap;
    } else {
      this.startHeartsRow.visible = false;
    }
    if (coinCount > 0) {
      this.startCoinsRow.visible = true;
      this.startCoinsRow.position.set(x + coinW * 0.5, y, 1);
    } else {
      this.startCoinsRow.visible = false;
    }
  }

  /** Layout hearts around local origin; returns the row width. */
  private layoutStartHearts(icon: number, count: number): number {
    const gap = icon * 1.08;
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
    return count <= 1 ? icon : (count - 1) * gap + icon;
  }

  /** Layout coins around local origin; returns the row width. */
  private layoutStartCoins(icon: number, total: number): number {
    const compact = total > MAX_COIN_ICONS;
    const shown = compact ? 1 : total;
    const gap = icon * 1.1;
    while (this.startCoinMeshes.length < shown) {
      const mesh = new Mesh(this.coinGeo, this.coinMat);
      this.startCoinMeshes.push(mesh);
      this.startCoinsRow.add(mesh);
    }
    for (let i = 0; i < this.startCoinMeshes.length; i += 1) {
      const mesh = this.startCoinMeshes[i];
      if (!mesh) continue;
      const on = i < shown;
      mesh.visible = on;
      if (!on) continue;
      mesh.geometry = this.coinGeo;
      mesh.material = this.coinMat;
      mesh.scale.setScalar(icon);
      mesh.rotation.x = -0.2;
      if (!compact) {
        mesh.position.set((i - (shown - 1) * 0.5) * gap, 0, 0);
      }
    }
    if (compact) {
      const fill = tokenColor("--maze-coin", "#f0c43a");
      const countH = icon * 1.15;
      const label = String(total);
      if (!this.startCoinCountPlate) {
        this.startCoinCountPlate = new StartLabel(label, fill, countH, true);
        this.startCoinsRow.add(this.startCoinCountPlate.root);
      } else {
        this.startCoinCountPlate.set(label, fill, countH);
      }
      const countW = this.startCoinCountPlate.width;
      const pairGap = icon * 0.28;
      const span = icon + pairGap + countW;
      const coin = this.startCoinMeshes[0];
      if (coin) coin.position.set(-span * 0.5 + icon * 0.5, 0, 0);
      this.startCoinCountPlate.root.visible = true;
      this.startCoinCountPlate.root.position.set(-span * 0.5 + icon + pairGap + countW * 0.5, 0, 0);
      this.startCoinCountPlate.root.rotation.x = -0.1;
      this.startCoinCountPlate.root.rotation.y = 0.04;
      return span;
    }
    if (this.startCoinCountPlate) this.startCoinCountPlate.root.visible = false;
    return shown <= 1 ? icon : (shown - 1) * gap + icon;
  }

  private syncTitle(force = false): void {
    const text = this.titleText;
    if (!force && text === this.titleDrawn) return;
    this.titleDrawn = text;
    if (!text) {
      this.titleRow.visible = false;
      return;
    }
    const height = this.designScale() * TITLE_PX;
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
    const height = this.designScale() * FLOOR_PX;
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
    if (total <= 0) {
      if (this.coinCountPlate) this.coinCountPlate.root.visible = false;
      return;
    }
    const compact = total > MAX_COIN_ICONS;
    const shown = compact ? 1 : total;
    const gap = icon * 1.25;
    while (this.coinMeshes.length < shown) {
      const mesh = new Mesh(this.coinGeo, this.coinMat);
      this.coinMeshes.push(mesh);
      this.coinsRow.add(mesh);
    }
    for (let i = 0; i < this.coinMeshes.length; i += 1) {
      const mesh = this.coinMeshes[i];
      if (!mesh) continue;
      const on = i < shown;
      mesh.visible = on;
      if (!on) continue;
      const filled = compact || i < got;
      mesh.geometry = this.coinGeo;
      mesh.material = filled ? this.coinMat : this.emptyCoinMat;
      mesh.scale.setScalar(icon);
      mesh.rotation.x = -0.2;
      if (!filled) mesh.rotation.y = 0.35;
      if (!compact) {
        mesh.position.set((i - (shown - 1) * 0.5) * gap, 0, 0);
      }
    }
    if (compact) {
      const fill = tokenColor("--maze-coin", "#f0c43a");
      const countH = icon * 1.35;
      const label = `${got}/${total}`;
      if (!this.coinCountPlate) {
        this.coinCountPlate = new TextPlate(label, fill, countH);
        this.coinCountPlate.setSoft(this.normalLook);
        this.coinsRow.add(this.coinCountPlate.root);
      } else {
        this.coinCountPlate.set(label, fill, countH);
      }
      this.coinCountPlate.setSoft(this.normalLook);
      const countW = this.coinCountPlate.width;
      const pairGap = icon * 0.4;
      const span = icon + pairGap + countW;
      const coin = this.coinMeshes[0];
      if (coin) coin.position.set(-span * 0.5 + icon * 0.5, 0, 0);
      this.coinCountPlate.root.visible = true;
      this.coinCountPlate.root.position.set(-span * 0.5 + icon + pairGap + countW * 0.5, 0, 0);
      this.coinCountPlate.root.rotation.x = -0.1;
      this.coinCountPlate.root.rotation.y = 0.08;
    } else if (this.coinCountPlate) {
      this.coinCountPlate.root.visible = false;
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
    const height = this.designScale() * TIMER_PX;
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

/**
 * Flat-top / arched-bottom wordmark (arch lower): end letters stay tall,
 * center letters compress upward so the baseline bows up while the topline stays flat.
 */
class ArchLabel {
  readonly root = new Group();
  private readonly faceMat: MeshBasicMaterial;
  private readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private readonly texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scratch = document.createElement("canvas");
  private readonly scratchCtx: CanvasRenderingContext2D;
  width = 1;
  private height = 1;
  private text = "";
  private fill = "";
  private arch = 0.48;

  constructor(text: string, fill: string, height: number, arch = 0.48) {
    this.paintCanvas = document.createElement("canvas");
    const ctx = this.paintCanvas.getContext("2d");
    if (!ctx) throw new Error("Play HUD arch label canvas unavailable");
    this.ctx = ctx;
    const scratchCtx = this.scratch.getContext("2d");
    if (!scratchCtx) throw new Error("Play HUD arch scratch canvas unavailable");
    this.scratchCtx = scratchCtx;
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
    this.arch = arch;
    this.set(text, fill, height);
  }

  set(text: string, fill: string, height: number): void {
    if (text === this.text && fill === this.fill && Math.abs(height - this.height) < 1e-6) return;
    this.text = text;
    this.fill = fill;
    this.height = height;

    const px = 96;
    const font = `700 ${px}px "Arial Black", "Arial Bold", Impact, sans-serif`;
    const padX = 20;
    const padY = 18;
    const tracking = px * 0.02;
    const letters = [...text];
    this.scratchCtx.font = font;
    const widths = letters.map((ch) => Math.max(1, this.scratchCtx.measureText(ch).width));
    const contentW = widths.reduce((sum, w, i) => sum + w + (i > 0 ? tracking : 0), 0);
    const w = Math.max(8, Math.ceil(contentW + padX * 2));
    const h = Math.max(8, Math.ceil(px * 1.3 + padY));
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.ctx.clearRect(0, 0, w, h);

    // Draw each glyph into scratch at full size, then blit with vertical scale from the top.
    let x = padX;
    for (let i = 0; i < letters.length; i += 1) {
      const ch = letters[i];
      const glyphW = widths[i] ?? 1;
      if (!ch) continue;
      const mid = contentW <= 0 ? 0.5 : (x - padX + glyphW * 0.5) / contentW;
      const scaleY = 1 - this.arch * Math.sin(Math.PI * Math.min(1, Math.max(0, mid)));
      const glyphH = Math.max(2, Math.ceil(h * scaleY));
      const scratchW = Math.max(2, Math.ceil(glyphW + padX));
      this.scratch.width = scratchW;
      this.scratch.height = h;
      this.scratchCtx.clearRect(0, 0, scratchW, h);
      this.scratchCtx.font = font;
      this.scratchCtx.textAlign = "left";
      this.scratchCtx.textBaseline = "top";
      this.scratchCtx.lineJoin = "round";
      const gx = padX * 0.35;
      const gy = padY * 0.35;
      this.scratchCtx.lineWidth = Math.max(5, Math.round(px * 0.18));
      this.scratchCtx.strokeStyle = "#000000";
      this.scratchCtx.strokeText(ch, gx, gy);
      this.scratchCtx.fillStyle = fill;
      this.scratchCtx.fillText(ch, gx, gy);
      // Top-anchored vertical squash → flat topline, arched baseline.
      this.ctx.drawImage(
        this.scratch,
        0,
        0,
        scratchW,
        h,
        x - gx,
        0,
        scratchW,
        glyphH,
      );
      x += glyphW + tracking;
    }
    this.texture.needsUpdate = true;

    this.width = height * (w / h);
    this.face.scale.set(this.width, height, 1);
    this.shade.scale.set(this.width, height, 1);
    this.shade.position.set(height * 0.05, -height * 0.06, -height * 0.1);
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

function tokenHex(name: string, fallback: string): number {
  const raw = tokenColor(name, fallback).replace("#", "").trim();
  const hex = raw.length === 3
    ? raw.split("").map((ch) => ch + ch).join("")
    : raw.padStart(6, "0").slice(0, 6);
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : 0xffffff;
}
