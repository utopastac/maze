import {
  MAZE_MAX,
  MAZE_MIN,
  SWITCH_COLOR_COUNT,
  WARP_COLOR_COUNT,
  interiorClosed,
  tileAt,
  type Direction,
  type Maze,
  type WallAxis,
  type WallRef,
} from "./maze.ts";
import { DEFAULT_FLOOR_THEME, themeFromIndex, themeIndex } from "./theme.ts";
import { FLOOR_MAX, FLOOR_MIN, cloneTower, repairTower, type Tower } from "./tower.ts";

const VERSION = 2;
const LEGACY_VERSION = 1;
const LEVEL_PREFIX = "#m.";
/** Longest base64url payload we will put in a hash. A full 16×16 tower stays under this. */
const MAX_LEVEL_CODE = 12_000;
const COORD_BITS = 5;
const COUNT_BITS = 9;

const PIT = 1;
const BOOST = 2;
const BOUNCE = 3;
const WARP = 4;
const ICE = 5;
const CRUMBLE = 6;
const SWITCH = 7;

const DIRS: readonly Direction[] = ["n", "e", "s", "w"];

type WarpCode = { color: number; link: number };

type Feature =
  | { c: number; r: number; kind: "pit" }
  | { c: number; r: number; kind: "boost"; dir: Direction }
  | { c: number; r: number; kind: "warp"; color: number; link: number }
  | { c: number; r: number; kind: "ice" }
  | { c: number; r: number; kind: "crumble" }
  | { c: number; r: number; kind: "switch"; tone: number; wall: WallRef | null };

export function encodeLevel(tower: Tower): string | null {
  if (tower.floors.length < FLOOR_MIN || tower.floors.length > FLOOR_MAX) return null;
  const clean = cloneTower(tower);
  repairTower(clean);
  try {
    const writer = new BitWriter();
    writer.write(VERSION, 8);
    writer.write(clean.floors.length, 3);
    for (const floor of clean.floors) writeFloor(writer, floor);
    const checksum = writer.checksum();
    writer.write(checksum, 16);
    const code = bytesToBase64Url(writer.finish());
    if (code.length > MAX_LEVEL_CODE) return null;
    return code;
  } catch {
    return null;
  }
}

export function decodeLevel(code: string): Tower | null {
  if (code.length === 0 || code.length > MAX_LEVEL_CODE) return null;
  const bytes = base64UrlToBytes(code);
  if (!bytes) return null;
  const reader = new BitReader(bytes);
  const version = reader.read(8);
  const floors = reader.read(3);
  if (
    version === null
    || (version !== VERSION && version !== LEGACY_VERSION)
    || floors === null
    || floors < FLOOR_MIN
    || floors > FLOOR_MAX
  ) return null;
  const tower: Tower = { floors: [] };
  for (let i = 0; i < floors; i += 1) {
    const floor = readFloor(reader, version);
    if (!floor) return null;
    tower.floors.push(floor);
  }
  const expect = reader.checksum();
  const checksum = reader.read(16);
  if (checksum === null || checksum !== expect || !reader.done()) return null;
  repairTower(tower);
  return tower;
}

export function hasLevelHash(hash: string): boolean {
  return hash.startsWith(LEVEL_PREFIX);
}

export function levelFromHash(hash: string): Tower | null {
  if (!hasLevelHash(hash)) return null;
  return decodeLevel(hash.slice(LEVEL_PREFIX.length));
}

/** Puts the level in the address bar and returns the absolute URL. */
export function rememberLevel(tower: Tower): string | null {
  const code = encodeLevel(tower);
  if (!code) return null;
  const hash = `${LEVEL_PREFIX}${code}`;
  if (location.hash !== hash) {
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  }
  return `${location.origin}${location.pathname}${location.search}${hash}`;
}

export function forgetLevel(): void {
  if (!hasLevelHash(location.hash)) return;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

export function copyText(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard?.writeText(text).then(() => true, () => false);
  if (copyWithSelection(text)) return Promise.resolve(true);
  return clipboard ?? Promise.resolve(false);
}

export async function readText(): Promise<string | null> {
  try {
    const text = await navigator.clipboard?.readText();
    return text ?? null;
  } catch {
    return null;
  }
}

/** Turns a tower into a one-line paste for authoredFloors.ts. */
export function formatAuthoredFloorLine(tower: Tower): string | null {
  const code = encodeLevel(tower);
  if (!code) return null;
  return `  "${code}",`;
}

/** Accepts a bare code, #m. hash, share URL, or an authoredFloors.ts line. */
export function parseLevelInput(raw: string): Tower | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fromHash = trimmed.match(/#m\.([A-Za-z0-9_-]+)/);
  if (fromHash?.[1]) return decodeLevel(fromHash[1]);
  const fromLine = trimmed.match(/["']([A-Za-z0-9_-]{8,})["']/);
  if (fromLine?.[1]) return decodeLevel(fromLine[1]);
  const bare = trimmed.match(/^[A-Za-z0-9_-]+/);
  if (bare?.[0]) return decodeLevel(bare[0]);
  return null;
}

function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.append(area);
  area.focus();
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

function writeFloor(writer: BitWriter, maze: Maze): void {
  writer.write(themeIndex(maze.theme ?? DEFAULT_FLOOR_THEME), 3);
  writer.write(maze.cols, COORD_BITS);
  writer.write(maze.rows, COORD_BITS);
  writer.write(maze.start.c, COORD_BITS);
  writer.write(maze.start.r, COORD_BITS);
  writer.write(maze.goal.c, COORD_BITS);
  writer.write(maze.goal.r, COORD_BITS);
  if (maze.hatch) {
    writer.write(1, 1);
    writer.write(maze.hatch.c, COORD_BITS);
    writer.write(maze.hatch.r, COORD_BITS);
  } else {
    writer.write(0, 1);
  }
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols - 1; c += 1) {
      writer.write(interiorClosed(maze, "v", c, r) ? 1 : 0, 1);
    }
  }
  for (let r = 0; r < maze.rows - 1; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      writer.write(interiorClosed(maze, "h", c, r) ? 1 : 0, 1);
    }
  }
  const features = featuresOf(maze);
  writer.write(features.length, COUNT_BITS);
  for (const feature of features) writeFeature(writer, feature);
}

function writeFeature(writer: BitWriter, feature: Feature): void {
  writer.write(feature.c, COORD_BITS);
  writer.write(feature.r, COORD_BITS);
  if (feature.kind === "pit") writer.write(PIT, 3);
  else if (feature.kind === "boost") {
    writer.write(BOOST, 3);
    writer.write(DIRS.indexOf(feature.dir), 2);
  } else if (feature.kind === "warp") {
    writer.write(WARP, 3);
    writer.write(feature.color, 3);
    writer.write(feature.link, 8);
  } else if (feature.kind === "ice") writer.write(ICE, 3);
  else if (feature.kind === "crumble") writer.write(CRUMBLE, 3);
  else {
    writer.write(SWITCH, 3);
    writer.write(feature.tone, 3);
    if (!feature.wall) {
      writer.write(0, 1);
      return;
    }
    writer.write(1, 1);
    writer.write(feature.wall.axis === "v" ? 0 : 1, 1);
    writer.write(feature.wall.c, COORD_BITS);
    writer.write(feature.wall.r, COORD_BITS);
  }
}

function featuresOf(maze: Maze): Feature[] {
  const warps = warpCodes(maze);
  const holes = new Set(maze.holes.map((hole) => `${hole.c},${hole.r}`));
  const features: Feature[] = [];
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (holes.has(`${c},${r}`)) {
        features.push({ c, r, kind: "pit" });
        continue;
      }
      const tile = tileAt(maze, c, r);
      if (!tile) continue;
      if (tile.kind === "boost") {
        if (!DIRS.includes(tile.dir)) throw new Error("boost");
        features.push({ c, r, kind: "boost", dir: tile.dir });
      } else if (tile.kind === "warp") {
        const code = warps.get(tile.pair);
        if (!code) throw new Error("warp");
        features.push({ c, r, kind: "warp", color: code.color, link: code.link });
      } else if (tile.kind === "ice") features.push({ c, r, kind: "ice" });
      else if (tile.kind === "crumble") features.push({ c, r, kind: "crumble" });
      else features.push({ c, r, kind: "switch", tone: mod(tile.tone, SWITCH_COLOR_COUNT), wall: linkedWall(maze, tile.wall) });
    }
  }
  if (features.length >= 2 ** COUNT_BITS) throw new Error("features");
  return features;
}

function warpCodes(maze: Maze): Map<number, WarpCode> {
  const codes = new Map<number, WarpCode>();
  const nextLink = Array.from({ length: WARP_COLOR_COUNT }, () => 0);
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      const tile = tileAt(maze, c, r);
      if (tile?.kind !== "warp" || codes.has(tile.pair)) continue;
      const color = mod(tile.pair, WARP_COLOR_COUNT);
      const link = nextLink[color] ?? 0;
      if (link > 255) throw new Error("warp");
      nextLink[color] = link + 1;
      codes.set(tile.pair, { color, link });
    }
  }
  return codes;
}

function linkedWall(maze: Maze, wall: WallRef | null): WallRef | null {
  if (!wall) return null;
  const inside = wall.axis === "v"
    ? wall.c >= 0 && wall.r >= 0 && wall.c < maze.cols - 1 && wall.r < maze.rows
    : wall.c >= 0 && wall.r >= 0 && wall.c < maze.cols && wall.r < maze.rows - 1;
  if (!inside) return null;
  return { axis: wall.axis, c: wall.c, r: wall.r };
}

function readFloor(reader: BitReader, version: number): Maze | null {
  let theme = DEFAULT_FLOOR_THEME;
  if (version >= VERSION) {
    const themeBits = reader.read(3);
    if (themeBits === null) return null;
    theme = themeFromIndex(themeBits);
  }
  const cols = reader.read(COORD_BITS);
  const rows = reader.read(COORD_BITS);
  const startC = reader.read(COORD_BITS);
  const startR = reader.read(COORD_BITS);
  const goalC = reader.read(COORD_BITS);
  const goalR = reader.read(COORD_BITS);
  const hasHatch = reader.read(1);
  if (
    cols === null || rows === null || startC === null || startR === null
    || goalC === null || goalR === null || hasHatch === null
    || cols < MAZE_MIN || cols > MAZE_MAX || rows < MAZE_MIN || rows > MAZE_MAX
  ) return null;
  let hatch: { c: number; r: number } | null = null;
  if (hasHatch === 1) {
    const hatchC = reader.read(COORD_BITS);
    const hatchR = reader.read(COORD_BITS);
    if (hatchC === null || hatchR === null || !inside(cols, rows, hatchC, hatchR)) return null;
    hatch = { c: hatchC, r: hatchR };
  }
  if (!inside(cols, rows, startC, startR) || !inside(cols, rows, goalC, goalR)) return null;

  const walls = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  const maze: Maze = {
    cols,
    rows,
    walls,
    holes: [],
    tiles: [],
    start: { c: startC, r: startR },
    goal: { c: goalC, r: goalR },
    hatch,
    theme,
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const closed = reader.read(1);
      if (closed === null) return null;
      if (closed === 1) setClosed(maze, "v", c, r);
    }
  }
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const closed = reader.read(1);
      if (closed === null) return null;
      if (closed === 1) setClosed(maze, "h", c, r);
    }
  }
  seal(maze);
  const count = reader.read(COUNT_BITS);
  if (count === null || count > cols * rows) return null;
  const seen = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const feature = readFeature(reader, maze, seen);
    if (!feature) return null;
  }
  return maze;
}

function readFeature(reader: BitReader, maze: Maze, seen: Set<string>): boolean {
  const c = reader.read(COORD_BITS);
  const r = reader.read(COORD_BITS);
  const kind = reader.read(3);
  if (c === null || r === null || kind === null || !inside(maze.cols, maze.rows, c, r)) return false;
  const id = `${c},${r}`;
  if (seen.has(id)) return false;
  seen.add(id);
  if (kind === PIT) {
    maze.holes.push({ c, r });
    return true;
  }
  if (kind === BOOST) {
    const dir = reader.read(2);
    const direction = dir === null ? undefined : DIRS[dir];
    if (!direction) return false;
    maze.tiles.push({ kind: "boost", c, r, dir: direction });
    return true;
  }
  if (kind === BOUNCE) return true;
  if (kind === WARP) {
    const color = reader.read(3);
    const link = reader.read(8);
    if (color === null || link === null || color >= WARP_COLOR_COUNT) return false;
    maze.tiles.push({ kind: "warp", c, r, pair: link * WARP_COLOR_COUNT + color });
    return true;
  }
  if (kind === ICE) {
    maze.tiles.push({ kind: "ice", c, r });
    return true;
  }
  if (kind === CRUMBLE) {
    maze.tiles.push({ kind: "crumble", c, r });
    return true;
  }
  if (kind === SWITCH) {
    const tone = reader.read(3);
    const linked = reader.read(1);
    if (tone === null || linked === null || tone >= SWITCH_COLOR_COUNT) return false;
    let wall: WallRef | null = null;
    if (linked === 1) {
      const axisBit = reader.read(1);
      const wallC = reader.read(COORD_BITS);
      const wallR = reader.read(COORD_BITS);
      if (axisBit === null || wallC === null || wallR === null) return false;
      const axis: WallAxis = axisBit === 0 ? "v" : "h";
      const onBoard = axis === "v"
        ? wallC < maze.cols - 1 && wallR < maze.rows
        : wallC < maze.cols && wallR < maze.rows - 1;
      if (!onBoard) return false;
      wall = { axis, c: wallC, r: wallR };
    }
    maze.tiles.push({ kind: "switch", c, r, tone, wall });
    return true;
  }
  return false;
}

function setClosed(maze: Maze, axis: WallAxis, c: number, r: number): void {
  if (axis === "v") {
    writeBit(maze, c, r, 2);
    writeBit(maze, c + 1, r, 8);
    return;
  }
  writeBit(maze, c, r, 4);
  writeBit(maze, c, r + 1, 1);
}

function writeBit(maze: Maze, c: number, r: number, bit: number): void {
  const row = maze.walls[r];
  if (!row || row[c] === undefined) return;
  row[c] |= bit;
}

function seal(maze: Maze): void {
  for (let c = 0; c < maze.cols; c += 1) {
    writeBit(maze, c, 0, 1);
    writeBit(maze, c, maze.rows - 1, 4);
  }
  for (let r = 0; r < maze.rows; r += 1) {
    writeBit(maze, 0, r, 8);
    writeBit(maze, maze.cols - 1, r, 2);
  }
}

function inside(cols: number, rows: number, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}

function mod(value: number, base: number): number {
  return ((value % base) + base) % base;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(code: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const padded = code + "=".repeat((4 - (code.length % 4)) % 4);
    const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

class BitWriter {
  private readonly bytes: number[] = [];
  private buffer = 0;
  private count = 0;
  private sum = 2166136261;

  write(value: number, width: number): void {
    if (!Number.isInteger(value) || !Number.isInteger(width) || width < 1 || width > 24) {
      throw new Error("width");
    }
    if (value < 0 || value >= 2 ** width) throw new Error("value");
    this.roll(value, width);
    for (let shift = width - 1; shift >= 0; shift -= 1) {
      this.buffer = (this.buffer << 1) | ((value >>> shift) & 1);
      this.count += 1;
      if (this.count === 8) this.flush();
    }
  }

  checksum(): number {
    return this.sum & 0xffff;
  }

  finish(): Uint8Array {
    if (this.count > 0) {
      this.buffer <<= 8 - this.count;
      this.bytes.push(this.buffer);
      this.buffer = 0;
      this.count = 0;
    }
    return Uint8Array.from(this.bytes);
  }

  private roll(value: number, width: number): void {
    this.sum = Math.imul(this.sum ^ value ^ (width * 0x9e3779b1), 0x01000193) >>> 0;
  }

  private flush(): void {
    this.bytes.push(this.buffer);
    this.buffer = 0;
    this.count = 0;
  }
}

class BitReader {
  private index = 0;
  private sum = 2166136261;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  read(width: number): number | null {
    if (width < 1 || width > 24) return null;
    let value = 0;
    for (let i = 0; i < width; i += 1) {
      const byte = this.bytes[this.index >> 3];
      if (byte === undefined) return null;
      const shift = 7 - (this.index & 7);
      value = (value << 1) | ((byte >>> shift) & 1);
      this.index += 1;
    }
    this.sum = Math.imul(this.sum ^ value ^ (width * 0x9e3779b1), 0x01000193) >>> 0;
    return value;
  }

  checksum(): number {
    return this.sum & 0xffff;
  }

  done(): boolean {
    const extra = this.bytes.length * 8 - this.index;
    if (extra < 0 || extra >= 8) return false;
    if (extra === 0) return true;
    const last = this.bytes[this.bytes.length - 1] ?? 0;
    return (last & ((1 << extra) - 1)) === 0;
  }
}
