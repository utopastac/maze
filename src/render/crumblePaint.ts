/** Shared pixel crumble slab used by the 3D material and 2D editor previews. */

const SIZE = 32;

function cssToken(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value.length === 0) throw new Error(`Missing CSS token ${name}`);
  return value;
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const raw = hex.replace("#", "").trim();
    const full = raw.length === 3
      ? raw.split("").map((ch) => ch + ch).join("")
      : raw;
    const n = Number.parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

export function paintCrumble(ctx: CanvasRenderingContext2D, size = SIZE): void {
  const base = cssToken("--maze-crumble");
  const shade = mixHex(base, "#000000", 0.22);
  const deep = mixHex(base, "#000000", 0.55);
  const seam = cssToken("--maze-crumble-crack");
  const lit = mixHex(base, "#ffffff", 0.18);
  const grit = mixHex(base, cssToken("--maze-crumble-mark"), 0.14);
  const edge = mixHex(base, "#000000", 0.35);
  const hash = (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const px = (hex: string, x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, 1, 1);
  };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = hash(x, y);
      if (n > 0.82) px(shade, x, y);
      else if (n > 0.68) px(lit, x, y);
      else if (n > 0.58) px(grit, x, y);
    }
  }
  const stroke = (x0: number, y0: number, x1: number, y1: number, color: string, width = 1): void => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      for (let oy = -width; oy <= width; oy += 1) {
        for (let ox = -width; ox <= width; ox += 1) {
          if (Math.abs(ox) + Math.abs(oy) > width) continue;
          px(color, x + ox, y + oy);
        }
      }
    }
  };
  // Irregular piece seams so the intact slab already reads as fractured stone.
  stroke(10, 0, 12, 14, seam, 1);
  stroke(11, 14, 9, 31, seam, 1);
  stroke(21, 0, 19, 16, seam, 1);
  stroke(20, 16, 22, 31, seam, 1);
  stroke(0, 10, 14, 12, seam, 1);
  stroke(14, 11, 31, 9, seam, 1);
  stroke(0, 21, 16, 19, seam, 1);
  stroke(16, 20, 31, 22, seam, 1);
  // Branching cracks through the tiles.
  stroke(3, 2, 10, 7, deep, 1);
  stroke(10, 7, 6, 12, deep, 0);
  stroke(12, 14, 17, 10, deep, 1);
  stroke(17, 10, 15, 5, deep, 0);
  stroke(20, 4, 28, 8, deep, 1);
  stroke(22, 16, 28, 13, deep, 0);
  stroke(21, 18, 26, 25, deep, 1);
  stroke(4, 18, 9, 24, deep, 1);
  stroke(9, 24, 14, 22, deep, 0);
  stroke(16, 22, 20, 28, deep, 1);
  stroke(1, 27, 7, 29, shade, 0);
  stroke(24, 1, 29, 5, shade, 0);
  stroke(27, 27, 30, 30, shade, 0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const chip = hash(x + 3, y + 9);
      if (chip > 0.955) px(deep, x, y);
      if (chip > 0.985) px(seam, x, y);
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) px(edge, x, y);
    }
  }
}

export function makeCrumbleCanvas(size = SIZE): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Crumble texture canvas unavailable");
  paintCrumble(ctx, size);
  return canvas;
}

/** Installs the game crumble pixels as `--maze-crumble-tex` for 2D previews. */
export function installCrumblePreviewCss(): void {
  const root = document.documentElement;
  if (root.style.getPropertyValue("--maze-crumble-tex")) return;
  const url = makeCrumbleCanvas().toDataURL("image/png");
  root.style.setProperty("--maze-crumble-tex", `url("${url}")`);
}
