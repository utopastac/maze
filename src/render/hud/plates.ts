import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

/** Open counters + tracking so labels stay readable on the low-res HUD buffer. */
const START_BTN_PX_PAINT = 96;
const START_BTN_TRACK = 0.06;
const START_BTN_FONT = `700 ${START_BTN_PX_PAINT}px "Arial Bold", Arial, Helvetica, sans-serif`;

/**
 * Flat-top / arched-bottom wordmark (arch lower): end letters stay tall,
 * center letters compress upward so the baseline bows up while the topline stays flat.
 */
export class ArchLabel {
  readonly root = new Group();
  private readonly faceMat: MeshBasicMaterial;
  private readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scratch = document.createElement("canvas");
  private readonly scratchCtx: CanvasRenderingContext2D;
  private canvasW = 0;
  private canvasH = 0;
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

  private rebindTexture(): void {
    this.texture.dispose();
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
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
    const resized = this.canvasW !== w || this.canvasH !== h;
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.canvasW = w;
    this.canvasH = h;
    if (resized) this.rebindTexture();
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
export class StartLabel {
  readonly root = new Group();
  private readonly faceMat: MeshBasicMaterial;
  private readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly heavy: boolean;
  private canvasW = 0;
  private canvasH = 0;
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

  private rebindTexture(): void {
    this.texture.dispose();
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
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
    const resized = this.canvasW !== w || this.canvasH !== h;
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.canvasW = w;
    this.canvasH = h;
    if (resized) this.rebindTexture();
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

/** Chunky CTA plate — hard bevel + thick outline, shaded for depth. */
export class StartButton {
  readonly root = new Group();
  private readonly faceMat: MeshBasicMaterial;
  private readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private canvasW = 0;
  private canvasH = 0;
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
    // Linear keeps open counters readable after the HUD buffer downsamples.
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
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    this.face = new Mesh(new PlaneGeometry(1, 1), this.faceMat);
    this.shade = new Mesh(new PlaneGeometry(1, 1), this.shadeMat);
    this.root.add(this.shade, this.face);
    this.set(text, faceFill, ink, height);
  }

  private rebindTexture(): void {
    this.texture.dispose();
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.faceMat.map = this.texture;
    this.shadeMat.map = this.texture;
    this.faceMat.needsUpdate = true;
    this.shadeMat.needsUpdate = true;
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

    const px = START_BTN_PX_PAINT;
    const padX = 64;
    const padY = 34;
    const tracking = px * START_BTN_TRACK;
    const letters = [...text];
    this.ctx.font = START_BTN_FONT;
    const widths = letters.map((ch) => Math.max(1, this.ctx.measureText(ch).width));
    const textW = widths.reduce((sum, glyphW, i) => sum + glyphW + (i > 0 ? tracking : 0), 0);
    const w = Math.max(8, Math.ceil(textW + padX * 2));
    const h = Math.max(8, Math.ceil(px + padY * 2));
    const resized = this.canvasW !== w || this.canvasH !== h;
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.canvasW = w;
    this.canvasH = h;
    // Resizing invalidates the GPU texture — rebind or prior labels ghost through.
    if (resized) this.rebindTexture();
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.font = START_BTN_FONT;

    // Blocky plate (matches square HUD chrome), not a soft capsule.
    const radius = Math.max(2, Math.round(h * 0.1));
    const rim = Math.max(6, Math.round(h * 0.07));
    const bevel = Math.max(5, Math.round(h * 0.055));

    roundRect(this.ctx, 0, 0, w, h, radius);
    this.ctx.fillStyle = "#000000";
    this.ctx.fill();

    const innerX = rim;
    const innerY = rim;
    const innerW = w - rim * 2;
    const innerH = h - rim * 2;
    const innerR = Math.max(1, radius - rim * 0.35);
    roundRect(this.ctx, innerX, innerY, innerW, innerH, innerR);
    this.ctx.fillStyle = faceFill;
    this.ctx.fill();

    // Hard arcade bevel — light top/left, heavy bottom/right.
    this.ctx.save();
    roundRect(this.ctx, innerX, innerY, innerW, innerH, innerR);
    this.ctx.clip();
    this.ctx.fillStyle = "rgba(255,255,255,0.55)";
    this.ctx.fillRect(innerX, innerY, innerW, bevel);
    this.ctx.fillRect(innerX, innerY, bevel, innerH);
    this.ctx.fillStyle = "rgba(0,0,0,0.38)";
    this.ctx.fillRect(innerX, innerY + innerH - bevel, innerW, bevel);
    this.ctx.fillRect(innerX + innerW - bevel, innerY, bevel, innerH);
    this.ctx.restore();

    // Flat tracked fill — stroke/emboss closes counters once the HUD buffer downsamples.
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = ink;
    let x = (w - textW) * 0.5;
    const ty = h * 0.52;
    for (let i = 0; i < letters.length; i += 1) {
      const ch = letters[i];
      const glyphW = widths[i] ?? 1;
      if (!ch) continue;
      this.ctx.fillText(ch, x, ty);
      x += glyphW + tracking;
    }
    this.texture.needsUpdate = true;

    this.width = height * (w / h);
    this.face.scale.set(this.width, height, 1);
    this.shade.scale.set(this.width, height, 1);
    this.shade.position.set(height * 0.08, -height * 0.1, -height * 0.14);
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

/** Dark plate with a seam-colored ring — matches kit accent / metal-ring pills. */
export class OutlineButton {
  readonly root = new Group();
  private readonly faceMat: MeshBasicMaterial;
  private readonly shadeMat: MeshBasicMaterial;
  private readonly face: Mesh;
  private readonly shade: Mesh;
  private texture: CanvasTexture;
  private readonly paintCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private canvasW = 0;
  private canvasH = 0;
  width = 1;
  private height = 1;
  private text = "";
  private ring = "";
  private ink = "";
  private faceFill = "";

  constructor(
    text: string,
    ring: string,
    ink: string,
    faceFill: string,
    height: number,
  ) {
    this.paintCanvas = document.createElement("canvas");
    const ctx = this.paintCanvas.getContext("2d");
    if (!ctx) throw new Error("Play HUD outline button canvas unavailable");
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
    this.set(text, ring, ink, faceFill, height);
  }

  private rebindTexture(): void {
    this.texture.dispose();
    this.texture = new CanvasTexture(this.paintCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.faceMat.map = this.texture;
    this.shadeMat.map = this.texture;
    this.faceMat.needsUpdate = true;
    this.shadeMat.needsUpdate = true;
  }

  set(
    text: string,
    ring: string,
    ink: string,
    faceFill: string,
    height: number,
  ): void {
    if (
      text === this.text
      && ring === this.ring
      && ink === this.ink
      && faceFill === this.faceFill
      && Math.abs(height - this.height) < 1e-6
    ) return;
    this.text = text;
    this.ring = ring;
    this.ink = ink;
    this.faceFill = faceFill;
    this.height = height;

    const px = 64;
    const padX = 56;
    const padY = 28;
    const font = `600 ${px}px Arial, Helvetica, sans-serif`;
    this.ctx.font = font;
    const textW = this.ctx.measureText(text).width;
    const w = Math.max(8, Math.ceil(Math.max(textW + padX * 2, px * 4.2)));
    const h = Math.max(8, Math.ceil(px + padY * 2));
    const resized = this.canvasW !== w || this.canvasH !== h;
    this.paintCanvas.width = w;
    this.paintCanvas.height = h;
    this.canvasW = w;
    this.canvasH = h;
    if (resized) this.rebindTexture();
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.font = font;

    const radius = Math.max(1, Math.round(h * 0.04));
    const rim = Math.max(4, Math.round(h * 0.07));
    roundRect(this.ctx, 0, 0, w, h, radius);
    this.ctx.fillStyle = ring;
    this.ctx.fill();
    roundRect(this.ctx, rim, rim, w - rim * 2, h - rim * 2, Math.max(1, radius - 1));
    this.ctx.fillStyle = faceFill;
    this.ctx.fill();

    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = ink;
    this.ctx.fillText(text, w * 0.5, h * 0.52);
    this.texture.needsUpdate = true;

    this.width = height * (w / h);
    this.face.scale.set(this.width, height, 1);
    this.shade.scale.set(this.width, height, 1);
    this.shade.position.set(height * 0.06, -height * 0.08, -height * 0.12);
  }
}

/** Arial Black outlined label as textured planes with a 3D shade offset. */
export class TextPlate {
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

export function disposePlate(root: Group, faceMat: MeshBasicMaterial, shadeMat: MeshBasicMaterial): void {
  for (const child of [...root.children]) {
    root.remove(child);
    if (child instanceof Mesh) child.geometry.dispose();
  }
  faceMat.map?.dispose();
  faceMat.dispose();
  shadeMat.dispose();
}
