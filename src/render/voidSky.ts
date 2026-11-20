import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  NearestFilter,
  SRGBColorSpace,
} from "three";
import {
  token,
} from "./boardMaterials.ts";

type VoidBlob = {
  x: number;
  y: number;
  r: number;
  rgb: [number, number, number];
  weight: number;
  phase: number;
  speed: number;
  amp: number;
};

export class VoidSky {
  // 2× base so skyPixels 0.5 can paint at true half-block fineness.
  private static readonly WIDTH = 320;
  private static readonly HEIGHT = 180;

  readonly texture: CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private deep: [number, number, number] = [0, 0, 0];
  private readonly blobs: VoidBlob[];
  private chunk = 4;
  private steps = 6;
  private themeId = "";
  private zoom = 1;
  private lastTime = Number.NaN;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = VoidSky.WIDTH;
    this.canvas.height = VoidSky.HEIGHT;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Void sky canvas unavailable");
    this.ctx = ctx;
    this.image = ctx.createImageData(VoidSky.WIDTH, VoidSky.HEIGHT);
    this.blobs = [
      { x: 0.12, y: 0.18, r: 0.58, rgb: [0, 0, 0], weight: 1.15, phase: 0.2, speed: 0.28, amp: 0.11 },
      { x: 0.78, y: 0.12, r: 0.52, rgb: [0, 0, 0], weight: 1.05, phase: 1.1, speed: 0.22, amp: 0.1 },
      { x: 0.58, y: 0.48, r: 0.62, rgb: [0, 0, 0], weight: 0.95, phase: 2.4, speed: 0.31, amp: 0.12 },
      { x: 0.18, y: 0.78, r: 0.55, rgb: [0, 0, 0], weight: 1, phase: 3.7, speed: 0.25, amp: 0.11 },
      { x: 0.88, y: 0.72, r: 0.48, rgb: [0, 0, 0], weight: 1.1, phase: 5.1, speed: 0.27, amp: 0.1 },
      { x: 0.42, y: 0.28, r: 0.42, rgb: [0, 0, 0], weight: 0.7, phase: 0.8, speed: 0.35, amp: 0.09 },
      { x: 0.5, y: 0.88, r: 0.5, rgb: [0, 0, 0], weight: 1.2, phase: 4.2, speed: 0.19, amp: 0.08 },
    ];
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.configure(4, 6, "neon");
    this.paint(0, true);
  }

  configure(chunk: number, steps: number, themeId: string): boolean {
    const nextChunk = Math.max(0.5, Math.round(chunk * 2) / 2);
    const nextSteps = Math.max(6, Math.round(steps));
    let changed = false;
    if (themeId !== this.themeId) {
      this.applyTheme(themeId);
      changed = true;
    }
    if (nextChunk !== this.chunk || nextSteps !== this.steps) {
      this.chunk = nextChunk;
      this.steps = nextSteps;
      changed = true;
    }
    return changed;
  }

  /** Zoom into the gradient (1 = normal). Used for enter-play parallax. */
  setZoom(zoom: number): void {
    const next = Math.max(1, Math.min(2.2, zoom));
    if (Math.abs(next - this.zoom) < 0.002) return;
    this.zoom = next;
    this.paint(Number.isFinite(this.lastTime) ? this.lastTime : 0, true);
  }

  private applyTheme(id: string): void {
    this.themeId = id;
    const prefix = `--sky-${id}`;
    this.deep = srgbBytes(token(`${prefix}-deep`));
    for (const [i, blob] of this.blobs.entries()) {
      blob.rgb = srgbBytes(token(`${prefix}-${i}`));
    }
    document.documentElement.style.setProperty("--maze-void-deep", token(`${prefix}-deep`));
  }

  paint(time: number, force = false): void {
    if (!force && Number.isFinite(this.lastTime) && Math.abs(time - this.lastTime) < 1 / 30) return;
    this.lastTime = time;
    const width = VoidSky.WIDTH;
    const height = VoidSky.HEIGHT;
    const block = Math.max(1, Math.round(this.chunk * 2));
    const cols = Math.ceil(width / block);
    const rows = Math.ceil(height / block);
    const data = this.image.data;
    const deep = this.deep;
    const steps = this.steps;
    const invZoom = 1 / this.zoom;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const u = 0.5 + ((col + 0.5) / cols - 0.5) * invZoom;
        const v = 0.5 + ((row + 0.5) / rows - 0.5) * invZoom;
        let r = deep[0] * 0.35;
        let g = deep[1] * 0.35;
        let b = deep[2] * 0.35;
        let mass = 0.35;
        for (const blob of this.blobs) {
          const bx = blob.x + Math.sin(time * blob.speed + blob.phase) * blob.amp;
          const by = blob.y + Math.cos(time * blob.speed * 0.85 + blob.phase * 1.3) * blob.amp;
          const radius = blob.r * (0.92 + Math.sin(time * blob.speed * 1.4 + blob.phase) * 0.08);
          const dx = (u - bx) / radius;
          const dy = (v - by) / radius;
          const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
          const w = falloff * falloff * blob.weight;
          if (w <= 0) continue;
          r += blob.rgb[0] * w;
          g += blob.rgb[1] * w;
          b += blob.rgb[2] * w;
          mass += w;
        }
        const inv = 1 / mass;
        const pr = quantizeByte(r * inv, steps);
        const pg = quantizeByte(g * inv, steps);
        const pb = quantizeByte(b * inv, steps);
        const x0 = col * block;
        const y0 = row * block;
        const x1 = Math.min(width, x0 + block);
        const y1 = Math.min(height, y0 + block);
        for (let y = y0; y < y1; y += 1) {
          let i = (y * width + x0) * 4;
          for (let x = x0; x < x1; x += 1) {
            data[i] = pr;
            data[i + 1] = pg;
            data[i + 2] = pb;
            data[i + 3] = 255;
            i += 4;
          }
        }
      }
    }
    this.ctx.putImageData(this.image, 0, 0);
    this.texture.needsUpdate = true;
  }
}

function quantizeByte(value: number, steps: number): number {
  return Math.round((Math.round((value / 255) * steps) / steps) * 255);
}

function srgbBytes(hex: string): [number, number, number] {
  const value = new Color(hex).getHex();
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
