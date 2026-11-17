import {
  AmbientLight,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { formatTime } from "../core/format.ts";
import { snapPixels } from "../core/playSettings.ts";
import { MAX_HEARTS_CAP } from "../core/tower.ts";

const PAD_X = 18;
const PAD_Y = 64;
const ROW = 22;
const ICON = 14;
const PULSE_SECS = 0.35;
const SHOUT_LIFE = 1.05;
const SHOUT_POP = 0.18;
const FONT = `700 64px "Arial Black", "Arial Bold", Impact, sans-serif`;

type ComicShout = {
  root: Group;
  faceMat: MeshBasicMaterial;
  shadeMat: MeshBasicMaterial;
  age: number;
  baseY: number;
};

export type PlayHudStats = {
  seconds: number;
  lives: number | null;
  coinsGot: number;
  coinsMax: number;
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
  private readonly heartGeo: BufferGeometry;
  private readonly coinGeo: BufferGeometry;
  private readonly emptyCoinGeo: BufferGeometry;
  private readonly heartMat: MeshStandardMaterial;
  private readonly coinMat: MeshStandardMaterial;
  private readonly emptyCoinMat: MeshStandardMaterial;
  private readonly heartMeshes: Mesh[] = [];
  private readonly coinMeshes: Mesh[] = [];
  private timerPlate: TextPlate | null = null;
  private shown = false;
  private lives: number | null = null;
  private coinsGot = 0;
  private coinsMax = 0;
  private seconds = 0;
  private timerText = "";
  private pulseHeart = 0;
  private pulseCoin = 0;
  private bufferW = 1;
  private bufferH = 1;
  private layoutDirty = true;
  private viewScale = 1;
  private readonly shouts: ComicShout[] = [];
  private readonly shoutLayer = new Group();

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

    const heart = tokenColor("--maze-heart", "#e2586c");
    const coin = tokenColor("--maze-coin", "#f0c43a");
    const shine = tokenColor("--maze-coin-shine", "#ffe9a0");

    this.heartMat = stdMat(heart, heart, 0.55);
    this.coinMat = stdMat(coin, shine, 0.4);
    this.coinMat.metalness = 0.7;
    this.coinMat.roughness = 0.25;
    this.emptyCoinMat = stdMat("#3a3220", coin, 0.08);
    this.emptyCoinMat.transparent = true;
    this.emptyCoinMat.opacity = 0.55;
    this.emptyCoinMat.metalness = 0.2;
    this.emptyCoinMat.roughness = 0.7;

    this.heartGeo = makeHeartGeo();
    this.coinGeo = new CylinderGeometry(0.5, 0.5, 0.2, 22);
    this.coinGeo.rotateX(Math.PI / 2);
    this.emptyCoinGeo = new TorusGeometry(0.38, 0.11, 10, 20);
    this.emptyCoinGeo.rotateX(Math.PI / 2);

    this.scene.add(new AmbientLight("#ffffff", 0.55));
    const key = new DirectionalLight("#fff6ea", 1.45);
    key.position.set(-4, 6, 10);
    const fill = new DirectionalLight("#9eb7ff", 0.45);
    fill.position.set(5, -2, 6);
    const rim = new DirectionalLight("#ffffff", 0.25);
    rim.position.set(0, 2, -4);
    this.scene.add(key, fill, rim, this.root, this.shoutLayer);
    this.root.add(this.heartsRow, this.coinsRow, this.timerRow);
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
    if (on) {
      this.layoutDirty = true;
      this.paint(true);
    } else {
      this.clearShouts();
      this.renderer.clear();
    }
  }

  setStats(stats: PlayHudStats): void {
    const livesChanged = this.lives !== stats.lives;
    const coinsChanged = this.coinsGot !== stats.coinsGot || this.coinsMax !== stats.coinsMax;
    const timeChanged = this.seconds !== stats.seconds;
    this.seconds = stats.seconds;
    this.lives = stats.lives;
    this.coinsGot = stats.coinsGot;
    this.coinsMax = stats.coinsMax;
    if (stats.pulseLives) this.pulseHeart = PULSE_SECS;
    if (stats.pulseCoins && stats.coinsMax > 0) this.pulseCoin = PULSE_SECS;
    if (livesChanged || coinsChanged) this.layoutDirty = true;
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
      for (let i = 0; i < this.coinsGot && i < this.coinMeshes.length; i += 1) {
        const mesh = this.coinMeshes[i];
        if (mesh) mesh.rotation.y += dt * 3.6;
      }
      for (const heart of this.heartMeshes) {
        if (!heart.visible) continue;
        heart.rotation.y = 0.25 + Math.sin(performance.now() * 0.0024 + heart.id) * 0.4;
      }
    }
    this.heartsRow.scale.setScalar(pulseScale(this.pulseHeart));
    this.coinsRow.scale.setScalar(pulseScale(this.pulseCoin));
    this.tickShouts(dt, reduceMotion);
    this.paint(false);
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
      this.layoutRows();
      this.syncTimer(true);
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
    let y = padY;

    this.syncHearts(padX, y, icon);
    if (this.lives !== null) y -= row;
    this.syncCoins(padX, y, icon);
    if (this.coinsMax > 0) y -= row;
    this.timerRow.position.set(padX, y, 0);
  }

  private syncHearts(x: number, y: number, icon: number): void {
    const count = this.lives === null
      ? 0
      : Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(this.lives)));
    this.heartsRow.visible = count > 0;
    this.heartsRow.position.set(x, y, 0);
    const gap = icon * 1.25;
    while (this.heartMeshes.length < count) {
      const mesh = new Mesh(this.heartGeo, this.heartMat);
      this.heartMeshes.push(mesh);
      this.heartsRow.add(mesh);
    }
    for (let i = 0; i < this.heartMeshes.length; i += 1) {
      const mesh = this.heartMeshes[i];
      if (!mesh) continue;
      const on = i < count;
      mesh.visible = on;
      if (!on) continue;
      mesh.scale.setScalar(icon);
      mesh.position.set(icon * 0.55 + i * gap, 0, 0);
      mesh.rotation.x = -0.15;
    }
  }

  private syncCoins(x: number, y: number, icon: number): void {
    const total = Math.max(0, Math.round(this.coinsMax));
    const got = Math.max(0, Math.min(total, Math.round(this.coinsGot)));
    this.coinsRow.visible = total > 0;
    this.coinsRow.position.set(x, y, 0);
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
      mesh.geometry = filled ? this.coinGeo : this.emptyCoinGeo;
      mesh.material = filled ? this.coinMat : this.emptyCoinMat;
      mesh.scale.setScalar(icon);
      mesh.position.set(icon * 0.55 + i * gap, 0, 0);
      mesh.rotation.x = -0.2;
      if (!filled) mesh.rotation.y = 0.35;
    }
  }

  private syncTimer(force = false): void {
    const text = formatTime(this.seconds);
    if (!force && text === this.timerText) return;
    this.timerText = text;
    const height = this.viewScale * 16;
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

function makeHeartGeo(): BufferGeometry {
  const shape = new Shape();
  const s = 0.045;
  const x = (value: number) => (value - 12) * s;
  const y = (value: number) => (16 - value) * s;
  shape.moveTo(x(12), y(21));
  shape.bezierCurveTo(x(12), y(21), x(4), y(14), x(4), y(9));
  shape.bezierCurveTo(x(4), y(5.5), x(6.5), y(3), x(9.5), y(3));
  shape.bezierCurveTo(x(11), y(3), x(12), y(4), x(12), y(4));
  shape.bezierCurveTo(x(12), y(4), x(13), y(3), x(14.5), y(3));
  shape.bezierCurveTo(x(17.5), y(3), x(20), y(5.5), x(20), y(9));
  shape.bezierCurveTo(x(20), y(14), x(12), y(21), x(12), y(21));
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.32,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.045,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}
