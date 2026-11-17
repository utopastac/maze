import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { formatTime } from "../core/format.ts";
import { snapPixels } from "../core/playSettings.ts";
import { MAX_HEARTS_CAP } from "../core/tower.ts";

const PAD_X = 10;
const PAD_Y = 20;
const ROW = 24;
const TITLE_FLOOR_GAP = 12;
const ICON = 14;
const TIMER_PX = 28;
const TITLE_PX = 26;
const FLOOR_PX = 18;
const PULSE_SECS = 0.35;
const SHOUT_LIFE = 1.05;
const SHOUT_POP = 0.18;
const SHATTER_LIFE = 0.7;
const FONT = `700 64px "Arial Black", "Arial Bold", Impact, sans-serif`;

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
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  age: number;
  life: number;
};

export type PlayHudStats = {
  seconds: number;
  lives: number | null;
  coinsGot: number;
  coinsMax: number;
  titleText: string;
  floorText: string | null;
  pulseLives?: boolean;
  pulseCoins?: boolean;
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
  private readonly heartGeo: BufferGeometry;
  private readonly coinGeo: BufferGeometry;
  private readonly heartOutlineMat: MeshStandardMaterial;
  private readonly heartBodyMat: MeshStandardMaterial;
  private readonly heartShadeMat: MeshStandardMaterial;
  private readonly heartHighlightMat: MeshBasicMaterial;
  private readonly coinMat: MeshStandardMaterial;
  private readonly emptyCoinMat: MeshStandardMaterial;
  private readonly heartIcons: Group[] = [];
  private readonly coinMeshes: Mesh[] = [];
  private timerPlate: TextPlate | null = null;
  private titlePlate: TextPlate | null = null;
  private floorPlate: TextPlate | null = null;
  private shown = false;
  private lives: number | null = null;
  private coinsGot = 0;
  private coinsMax = 0;
  private seconds = 0;
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
  private readonly shouts: ComicShout[] = [];
  private readonly shoutLayer = new Group();
  private readonly shatterLayer = new Group();
  private readonly shards: HeartShard[] = [];
  private readonly shatterScratch = new Vector3();

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

    this.heartOutlineMat = stdMat("#5a1e22", "#2a0c10", 0.05);
    this.heartOutlineMat.roughness = 0.65;
    this.heartBodyMat = stdMat(heart, heart, 0.35);
    this.heartBodyMat.roughness = 0.35;
    this.heartShadeMat = stdMat("#b02030", "#801018", 0.08);
    this.heartShadeMat.transparent = true;
    this.heartShadeMat.opacity = 0.55;
    this.heartShadeMat.depthWrite = false;
    this.heartHighlightMat = new MeshBasicMaterial({
      color: "#ffffff",
      toneMapped: false,
      depthWrite: false,
    });

    this.coinMat = stdMat(coin, shine, 0.4);
    this.coinMat.metalness = 0.7;
    this.coinMat.roughness = 0.25;
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
    this.canvas.hidden = true;
  }

  /** Comic collect shout — same Arial Black plates as the timer. */
  shout(text: string, color: string): void {
    if (!this.shown || this.bufferW < 2) return;
    const fill = color.trim() || "#ffffff";
    // Match timer TextPlate sizing (viewScale × px), just larger for comic pops.
    const height = this.viewScale * 42;
    const plate = new TextPlate(text.toUpperCase(), fill, height);
    const root = plate.root;
    const viewH = this.viewScale * this.bufferH;
    const viewW = viewH * this.camera.aspect;
    const stack = this.shouts.length;
    const baseY = viewH * 0.52 + stack * this.viewScale * 18;
    root.scale.setScalar(0.12);
    root.position.set(
      viewW * 0.5 + ((stack % 3) - 1) * this.viewScale * 28,
      baseY,
      8 + stack * 0.4,
    );
    root.rotation.x = -0.1;
    root.rotation.y = 0.08;
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
    this.root.visible = on;
    this.shoutLayer.visible = on;
    this.shatterLayer.visible = on;
    if (on) {
      this.layoutDirty = true;
      this.paint(true);
    } else {
      this.clearShouts();
      this.clearShards();
      this.renderer.clear();
    }
  }

  setStats(stats: PlayHudStats): void {
    const prevLives = this.lives;
    const livesChanged = prevLives !== stats.lives;
    const coinsChanged = this.coinsGot !== stats.coinsGot || this.coinsMax !== stats.coinsMax;
    const titleChanged = this.titleText !== stats.titleText;
    const floorChanged = this.floorText !== stats.floorText;
    const timeChanged = this.seconds !== stats.seconds;
    if (
      this.shown
      && prevLives !== null
      && stats.lives !== null
      && stats.lives < prevLives
    ) {
      const from = Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(prevLives)));
      const to = Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(stats.lives)));
      for (let i = to; i < from; i += 1) this.shatterHeart(i);
    }
    this.seconds = stats.seconds;
    this.lives = stats.lives;
    this.coinsGot = stats.coinsGot;
    this.coinsMax = stats.coinsMax;
    this.titleText = stats.titleText;
    this.floorText = stats.floorText;
    if (stats.pulseLives) this.pulseHeart = PULSE_SECS;
    if (stats.pulseCoins && stats.coinsMax > 0) this.pulseCoin = PULSE_SECS;
    if (livesChanged || coinsChanged || titleChanged || floorChanged) this.layoutDirty = true;
    if (timeChanged) this.syncTimer();
  }

  /** Size the HUD buffer from UI pixels only — never game Pixels. */
  resize(width: number, height: number, uiPixels: number): void {
    const scale = snapPixels(uiPixels);
    const bufferW = Math.max(1, Math.floor(width / scale));
    const bufferH = Math.max(1, Math.floor(height / scale));
    const sizeChanged = this.bufferW !== bufferW || this.bufferH !== bufferH;
    this.bufferW = bufferW;
    this.bufferH = bufferH;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(bufferW, bufferH, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.aspect = bufferW / bufferH;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
    if (sizeChanged) this.layoutDirty = true;
    if (this.shown) this.paint(true);
  }

  update(dt: number, reduceMotion: boolean): void {
    if (!this.shown) return;
    this.pulseHeart = Math.max(0, this.pulseHeart - dt);
    this.pulseCoin = Math.max(0, this.pulseCoin - dt);
    if (!reduceMotion) {
      for (const mesh of this.coinMeshes) {
        if (!mesh.visible || mesh.material !== this.coinMat) continue;
        mesh.rotation.y += dt * 3.6;
      }
      for (const heart of this.heartIcons) {
        if (!heart.visible) continue;
        heart.rotation.y = 0.2 + Math.sin(performance.now() * 0.0024 + heart.id) * 0.35;
      }
    }
    this.heartsRow.scale.setScalar(pulseScale(this.pulseHeart));
    this.coinsRow.scale.setScalar(pulseScale(this.pulseCoin));
    this.tickShouts(dt, reduceMotion);
    this.tickShards(dt, reduceMotion);
    this.paint(false);
  }

  private shatterHeart(index: number): void {
    const icon = this.heartIcons[index];
    if (!icon || !icon.visible) return;
    icon.updateWorldMatrix(true, false);
    const origin = icon.getWorldPosition(this.shatterScratch);
    this.shatterLayer.worldToLocal(origin);
    const size = Math.max(0.01, icon.scale.x);
    const bodyHex = this.heartBodyMat.color.getHex();
    const shadeHex = this.heartShadeMat.color.getHex();
    const outlineHex = this.heartOutlineMat.color.getHex();
    const palette = [bodyHex, bodyHex, shadeHex, outlineHex];
    const count = 11;
    for (let i = 0; i < count; i += 1) {
      const w = size * (0.14 + Math.random() * 0.28);
      const h = size * (0.12 + Math.random() * 0.32);
      const d = size * (0.1 + Math.random() * 0.18);
      const geo = new BoxGeometry(w, h, d);
      const mat = new MeshStandardMaterial({
        color: palette[i % palette.length],
        emissive: palette[i % palette.length],
        emissiveIntensity: 0.25,
        roughness: 0.45,
        metalness: 0.05,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new Mesh(geo, mat);
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const kick = size * (1.8 + Math.random() * 3.4);
      mesh.position.set(
        origin.x + Math.cos(ang) * size * 0.12,
        origin.y + (Math.random() - 0.2) * size * 0.15,
        origin.z + (Math.random() - 0.5) * size * 0.1,
      );
      mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      this.shatterLayer.add(mesh);
      this.shards.push({
        mesh,
        mat,
        geo,
        vx: Math.cos(ang) * kick,
        vy: size * (2.4 + Math.random() * 3.6),
        vz: Math.sin(ang) * kick * 0.55,
        spinX: (Math.random() - 0.5) * 14,
        spinY: (Math.random() - 0.5) * 16,
        spinZ: (Math.random() - 0.5) * 14,
        age: 0,
        life: SHATTER_LIFE * (0.75 + Math.random() * 0.35),
      });
    }
    icon.visible = false;
  }

  private tickShards(dt: number, reduceMotion: boolean): void {
    const gravity = this.viewScale * 52;
    for (let i = this.shards.length - 1; i >= 0; i -= 1) {
      const shard = this.shards[i];
      if (!shard) continue;
      shard.age += dt;
      const u = Math.min(1, shard.age / shard.life);
      if (reduceMotion) {
        shard.mesh.scale.setScalar(1 - u);
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
        const shrink = 1 - u * 0.45;
        shard.mesh.scale.setScalar(shrink);
      }
      if (shard.age < shard.life) continue;
      this.shatterLayer.remove(shard.mesh);
      shard.geo.dispose();
      shard.mat.dispose();
      this.shards.splice(i, 1);
    }
  }

  private clearShards(): void {
    for (const shard of this.shards) {
      this.shatterLayer.remove(shard.mesh);
      shard.geo.dispose();
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
      this.syncTitle(true);
      this.syncFloor(true);
      this.syncTimer(true);
      this.layoutRows();
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
    this.timerRow.position.set(padX, y, 0);

    this.syncCoins(viewW * 0.5, padY, icon);
    this.syncHearts(viewW - padX, padY, icon);
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
      this.floorPlate = new TextPlate(text, "#ffffff", height);
      this.floorRow.add(this.floorPlate.root);
    } else {
      this.floorPlate.set(text, "#ffffff", height);
    }
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
        this.heartHighlightMat,
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
    const text = formatTime(this.seconds);
    if (!force && text === this.timerText) return;
    this.timerText = text;
    const height = this.viewScale * TIMER_PX;
    if (!this.timerPlate) {
      this.timerPlate = new TextPlate(text, "#ffffff", height);
      this.timerRow.add(this.timerPlate.root);
    } else {
      this.timerPlate.set(text, "#ffffff", height);
    }
    this.timerPlate.root.position.set(this.timerPlate.width * 0.5, 0, 0);
    this.timerPlate.root.rotation.x = -0.1;
    this.timerPlate.root.rotation.y = 0.08;
  }
}

/** Arial Black outlined label as textured planes with a 3D shade offset. */
class TextPlate {
  readonly root = new Group();
  readonly faceMat: MeshBasicMaterial;
  readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private readonly texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  width = 1;
  private height = 1;
  private text = "";
  private fill = "";

  constructor(text: string, fill: string, height: number) {
    this.paintCanvas = document.createElement("canvas");
    const ctx = this.paintCanvas.getContext("2d");
    if (!ctx) throw new Error("Play HUD text canvas unavailable");
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;

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

  set(text: string, fill: string, height: number): void {
    if (text === this.text && fill === this.fill && Math.abs(height - this.height) < 1e-6) return;
    this.text = text;
    this.fill = fill;
    this.height = height;

    const px = 64;
    const pad = 14;
    this.ctx.font = FONT;
    const metrics = this.ctx.measureText(text);
    const w = Math.max(8, Math.ceil(metrics.width + pad * 2));
    const h = Math.max(8, Math.ceil(px * 1.35 + pad));
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.ctx.font = FONT;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.lineJoin = "round";
    this.ctx.lineWidth = Math.max(4, px * 0.22);
    this.ctx.strokeStyle = "#000000";
    this.ctx.fillStyle = fill;
    const x = pad;
    const y = h * 0.52;
    // Extruded black body under the face.
    const depth = Math.max(3, Math.round(px * 0.16));
    this.ctx.fillStyle = "#000000";
    for (let i = depth; i >= 1; i -= 1) this.ctx.fillText(text, x + i, y + i);
    this.ctx.strokeStyle = "#000000";
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

/** Disc with a shallow inset ring carved into both faces. */
function makeCoinGeo(): BufferGeometry {
  // Lathe profile: x = radius, y = half-thickness. Revolved around Y, then tipped to face ±Z.
  const pts: Vector2[] = [];
  const add = (r: number, y: number) => pts.push(new Vector2(r, y));

  // Front face (center → rim)
  add(0, 0.09);
  add(0.17, 0.09);
  add(0.22, 0.09);
  add(0.255, 0.042); // drop into groove
  add(0.37, 0.042);
  add(0.405, 0.09); // climb out
  add(0.455, 0.09);
  add(0.5, 0.055);
  // Rim wall
  add(0.5, -0.055);
  // Back face (rim → center), mirrored inset
  add(0.455, -0.09);
  add(0.405, -0.09);
  add(0.37, -0.042);
  add(0.255, -0.042);
  add(0.22, -0.09);
  add(0.17, -0.09);
  add(0, -0.09);

  const geo = new LatheGeometry(pts, 36);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function makeHeartGeo(): BufferGeometry {
  const shape = new Shape();
  const s = 0.048;
  const x = (value: number) => (value - 12) * s;
  const y = (value: number) => (16 - value) * s;
  // Tall lobes + deep center cleft so the dip reads clearly after bevel.
  shape.moveTo(x(12), y(21.2));
  shape.bezierCurveTo(x(12), y(21.2), x(2.2), y(14.8), x(2.2), y(8));
  shape.bezierCurveTo(x(2.2), y(4.4), x(5), y(1.4), x(8.1), y(1.4));
  shape.bezierCurveTo(x(9.7), y(1.4), x(11.1), y(3.1), x(12), y(6.8));
  shape.bezierCurveTo(x(12.9), y(3.1), x(14.3), y(1.4), x(15.9), y(1.4));
  shape.bezierCurveTo(x(19), y(1.4), x(21.8), y(4.4), x(21.8), y(8));
  shape.bezierCurveTo(x(21.8), y(14.8), x(12), y(21.2), x(12), y(21.2));
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/** Glossy bubble heart: thick dark outline, body, inner shade, dual highlights. */
function makeHeartIcon(
  geo: BufferGeometry,
  outlineMat: MeshStandardMaterial,
  bodyMat: MeshStandardMaterial,
  shadeMat: MeshStandardMaterial,
  highlightMat: MeshBasicMaterial,
): Group {
  const root = new Group();

  const outline = new Mesh(geo, outlineMat);
  outline.scale.setScalar(1.16);
  outline.position.z = -0.05;

  const body = new Mesh(geo, bodyMat);
  body.position.z = 0.02;

  const shade = new Mesh(geo, shadeMat);
  shade.scale.set(0.9, 0.88, 0.55);
  shade.position.set(0.06, -0.07, 0.14);

  const hiBig = new Mesh(new SphereGeometry(0.11, 14, 12), highlightMat);
  hiBig.scale.set(1.55, 0.72, 0.35);
  hiBig.position.set(-0.2, 0.24, 0.26);
  hiBig.rotation.z = -0.35;

  const hiDot = new Mesh(new SphereGeometry(0.045, 12, 10), highlightMat);
  hiDot.position.set(-0.1, 0.1, 0.28);

  root.add(outline, body, shade, hiBig, hiDot);
  return root;
}
