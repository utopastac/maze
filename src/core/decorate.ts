import {
  SWITCH_COLOR_COUNT,
  Wall,
  defaultOneWayDir,
  ensureMaze,
  interiorClosed,
  mulberry32,
  setBlock,
  setBoost,
  setCoin,
  setCrumble,
  setGhost,
  setHeart,
  setIce,
  setStar,
  setWings,
  type Direction,
  type GridPoint,
  type Maze,
  type WallRef,
} from "./maze.ts";

const STEPS = [
  { dc: 0, dr: -1, bit: Wall.north, dir: "n" as const },
  { dc: 1, dr: 0, bit: Wall.east, dir: "e" as const },
  { dc: 0, dr: 1, bit: Wall.south, dir: "s" as const },
  { dc: -1, dr: 0, bit: Wall.west, dir: "w" as const },
] as const;

const BOOSTS: Direction[] = ["n", "e", "s", "w"];

export interface DecorateOptions {
  /** 0–1 richness / campaign progress. */
  richness?: number;
  /** Campaign floor index — paces hearts and guaranteed power-ups. */
  index?: number;
}

/** Sprinkle tiles, gates, and pickups onto a carved floor. */
export function decorateMaze(maze: Maze, seed: number, options: DecorateOptions | number = 0.55): void {
  ensureMaze(maze);
  const opts = typeof options === "number" ? { richness: options } : options;
  const t = clamp01(opts.richness ?? 0.55);
  const index = opts.index ?? Math.round(t * 60);
  furnish(maze, seed >>> 0, t, index);
}

export function campaignHeartCount(index: number): number {
  if (index === 0) return 1;
  if (index % 7 !== 6) return 0;
  return index >= 80 ? 2 : 1;
}

function furnish(maze: Maze, seed: number, t: number, index: number): void {
  const rand = mulberry32(seed >>> 0);
  const exit = maze.hatch ?? maze.goal;
  const onPath = pathBetween(maze, maze.start, exit);
  const route = [...onPath]
    .map(parseKey)
    .filter((cell) => manhattan(cell, maze.start) >= 2 && manhattan(cell, exit) >= 2);
  const spaced = (chosen: GridPoint[], cell: GridPoint) =>
    chosen.every((other) => manhattan(other, cell) > 2);
  const areaScale = Math.max(0.4, Math.min(1.35, (maze.cols * maze.rows) / 49));

  const ice = take(
    shuffle(route, rand),
    scaledCount(t, 0.05, 9, 7, areaScale),
    spaced,
  );
  for (const cell of ice) setIce(maze, cell);

  const afterIce = route.filter((cell) => !ice.some((used) => same(used, cell)));
  const crumble = take(
    shuffle(afterIce, rand),
    scaledCount(t, 0.14, 7, 6, areaScale),
    spaced,
  );
  for (const cell of crumble) setCrumble(maze, cell);

  const used = new Set([...ice, ...crumble].map(key));
  const beside = shuffle(sideCells(maze, onPath, exit, used), rand);

  const boosts = take(beside, scaledCount(t, 0.08, 6, 5, areaScale), spaced);
  for (const cell of boosts) {
    setBoost(maze, cell, boostDirAt(maze, cell, exit, rand));
    used.add(key(cell));
  }

  const afterBoost = beside.filter((cell) => !used.has(key(cell)));
  const blocks = take(afterBoost, scaledCount(t, 0.18, 5, 4, areaScale), spaced);
  for (const cell of blocks) {
    setBlock(maze, cell);
    used.add(key(cell));
  }

  placeOneWays(maze, onPath, exit, rand, scaledCount(t, 0.16, 5, 4, areaScale));
  placeSwitches(maze, onPath, used, rand, scaledCount(t, 0.2, 4, 3, areaScale));
  placeWarps(maze, onPath, exit, used, rand, warpPairs(t));

  const free = [
    ...beside.filter((cell) => !used.has(key(cell)) && pickupOk(maze, cell)),
    ...shuffle(route.filter((cell) => !used.has(key(cell)) && pickupOk(maze, cell)), rand),
  ];

  const hearts = take(free, campaignHeartCount(index), spaced);
  for (const cell of hearts) {
    setHeart(maze, cell);
    used.add(key(cell));
  }

  const coinPool = free.filter((cell) => !used.has(key(cell)));
  const coins = take(coinPool, scaledCount(t, 0, 8, 8, areaScale) + (t < 0.12 ? 1 : 0), spaced);
  for (const cell of coins) {
    setCoin(maze, cell);
    used.add(key(cell));
  }

  placePower(maze, free, used, rand, spaced, "star", t, 0.28, index, 9);
  placePower(maze, free, used, rand, spaced, "wings", t, 0.4, index, 11);
  placePower(maze, free, used, rand, spaced, "ghost", t, 0.5, index, 13);
}

function scaledCount(t: number, unlock: number, span: number, max: number, areaScale: number): number {
  if (t < unlock) return 0;
  return Math.min(max, Math.max(0, Math.round((t - unlock) * span * areaScale)));
}

function warpPairs(t: number): number {
  if (t < 0.26) return 0;
  if (t < 0.52) return 1;
  return 2;
}

function placePower(
  maze: Maze,
  free: GridPoint[],
  used: Set<string>,
  rand: () => number,
  spaced: (chosen: GridPoint[], cell: GridPoint) => boolean,
  kind: "star" | "wings" | "ghost",
  t: number,
  unlock: number,
  index: number,
  period: number,
): void {
  if (t < unlock) return;
  const guaranteed = index > 0 && index % period === period - 1;
  const chance = guaranteed || rand() < 0.22 + (t - unlock) * 0.45;
  if (!chance) return;
  const pool = free.filter((cell) => !used.has(key(cell)) && pickupOk(maze, cell));
  const picks = take(shuffle(pool, rand), 1, spaced);
  for (const cell of picks) {
    if (kind === "star") setStar(maze, cell);
    else if (kind === "wings") setWings(maze, cell);
    else setGhost(maze, cell);
    used.add(key(cell));
  }
}

function pickupOk(maze: Maze, cell: GridPoint): boolean {
  if (maze.holes.some((hole) => same(hole, cell))) return false;
  if (maze.tiles.some((tile) => same(tile, cell))) return false;
  return true;
}

function boostDirAt(maze: Maze, cell: GridPoint, exit: GridPoint, rand: () => number): Direction {
  const bits = maze.walls[cell.r]?.[cell.c] ?? 0;
  const open: Direction[] = [];
  const toward: Direction[] = [];
  for (const step of STEPS) {
    if ((bits & step.bit) !== 0) continue;
    const next = { c: cell.c + step.dc, r: cell.r + step.dr };
    if (next.c < 0 || next.r < 0 || next.c >= maze.cols || next.r >= maze.rows) continue;
    const dir = step.dir;
    open.push(dir);
    if (manhattan(next, exit) < manhattan(cell, exit)) toward.push(dir);
  }
  const pool = toward.length > 0 ? toward : open.length > 0 ? open : BOOSTS;
  return pool[Math.floor(rand() * pool.length)] ?? "e";
}

function placeOneWays(
  maze: Maze,
  onPath: Set<string>,
  exit: GridPoint,
  rand: () => number,
  count: number,
): void {
  if (count <= 0) return;
  const candidates = shuffle(pathSideWalls(maze, onPath), rand);
  let placed = 0;
  for (const wall of candidates) {
    if (placed >= count) break;
    if (maze.oneWays.some((gate) => gate.axis === wall.axis && gate.c === wall.c && gate.r === wall.r)) {
      continue;
    }
    if (maze.tiles.some((tile) => tile.kind === "switch" && tile.wall
      && tile.wall.axis === wall.axis && tile.wall.c === wall.c && tile.wall.r === wall.r)) {
      continue;
    }
    maze.oneWays.push({
      axis: wall.axis,
      c: wall.c,
      r: wall.r,
      dir: oneWayToward(wall, exit) ?? defaultOneWayDir(wall.axis),
    });
    placed += 1;
  }
}

function placeSwitches(
  maze: Maze,
  onPath: Set<string>,
  used: Set<string>,
  rand: () => number,
  count: number,
): void {
  if (count <= 0) return;
  const candidates = shuffle(switchSpots(maze, onPath, used), rand);
  let tone = 0;
  let placed = 0;
  for (const spot of candidates) {
    if (placed >= count) break;
    if (used.has(key(spot.plate))) continue;
    if (maze.oneWays.some((gate) =>
      gate.axis === spot.wall.axis && gate.c === spot.wall.c && gate.r === spot.wall.r
    )) {
      continue;
    }
    if (maze.tiles.some((tile) => tile.kind === "switch" && tile.wall
      && tile.wall.axis === spot.wall.axis
      && tile.wall.c === spot.wall.c
      && tile.wall.r === spot.wall.r)) {
      continue;
    }
    maze.tiles.push({
      kind: "switch",
      c: spot.plate.c,
      r: spot.plate.r,
      tone: tone % SWITCH_COLOR_COUNT,
      wall: { ...spot.wall },
    });
    tone += 1;
    used.add(key(spot.plate));
    placed += 1;
  }
}

function placeWarps(
  maze: Maze,
  onPath: Set<string>,
  exit: GridPoint,
  used: Set<string>,
  rand: () => number,
  pairs: number,
): void {
  if (pairs <= 0) return;
  const pool = shuffle(
    sideCells(maze, onPath, exit, used).filter((cell) => pickupOk(maze, cell)),
    rand,
  );
  let pair = 0;
  for (let i = 0; i < pairs; i += 1) {
    const a = pool.find((cell) => !used.has(key(cell)));
    if (!a) break;
    used.add(key(a));
    const b = pool.find((cell) => !used.has(key(cell)) && manhattan(cell, a) >= 3);
    if (!b) {
      used.delete(key(a));
      break;
    }
    used.add(key(b));
    maze.tiles.push({ kind: "warp", c: a.c, r: a.r, pair });
    maze.tiles.push({ kind: "warp", c: b.c, r: b.r, pair });
    pair += 1;
  }
}

/** Closed walls that chord a route loop (both sides on-path via detour). */
function pathSideWalls(maze: Maze, onPath: Set<string>): WallRef[] {
  const found: WallRef[] = [];
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols - 1; c += 1) {
      if (!interiorClosed(maze, "v", c, r)) continue;
      const west = onPath.has(key({ c, r }));
      const east = onPath.has(key({ c: c + 1, r }));
      if (west && east) found.push({ axis: "v", c, r });
    }
  }
  for (let r = 0; r < maze.rows - 1; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (!interiorClosed(maze, "h", c, r)) continue;
      const north = onPath.has(key({ c, r }));
      const south = onPath.has(key({ c, r: r + 1 }));
      if (north && south) found.push({ axis: "h", c, r });
    }
  }
  return found;
}

function switchSpots(
  maze: Maze,
  onPath: Set<string>,
  used: Set<string>,
): { wall: WallRef; plate: GridPoint }[] {
  const found: { wall: WallRef; plate: GridPoint }[] = [];
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols - 1; c += 1) {
      if (!interiorClosed(maze, "v", c, r)) continue;
      const west = { c, r };
      const east = { c: c + 1, r };
      const wall = { axis: "v" as const, c, r };
      if (onPath.has(key(west)) && !used.has(key(west))) found.push({ wall, plate: west });
      if (onPath.has(key(east)) && !used.has(key(east))) found.push({ wall, plate: east });
    }
  }
  for (let r = 0; r < maze.rows - 1; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (!interiorClosed(maze, "h", c, r)) continue;
      const north = { c, r };
      const south = { c, r: r + 1 };
      const wall = { axis: "h" as const, c, r };
      if (onPath.has(key(north)) && !used.has(key(north))) found.push({ wall, plate: north });
      if (onPath.has(key(south)) && !used.has(key(south))) found.push({ wall, plate: south });
    }
  }
  return found;
}

function oneWayToward(wall: WallRef, exit: GridPoint): Direction {
  if (wall.axis === "v") {
    const west = { c: wall.c, r: wall.r };
    const east = { c: wall.c + 1, r: wall.r };
    return manhattan(east, exit) <= manhattan(west, exit) ? "e" : "w";
  }
  const north = { c: wall.c, r: wall.r };
  const south = { c: wall.c, r: wall.r + 1 };
  return manhattan(south, exit) <= manhattan(north, exit) ? "s" : "n";
}

function sideCells(maze: Maze, onPath: Set<string>, exit: GridPoint, used: Set<string>): GridPoint[] {
  const found: GridPoint[] = [];
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      const cell = { c, r };
      const id = key(cell);
      if (onPath.has(id) || used.has(id) || same(cell, maze.start) || same(cell, exit)) continue;
      if (maze.holes.some((hole) => same(hole, cell))) continue;
      if (maze.hatch && same(cell, maze.hatch)) continue;
      const near = neighbors(maze, cell).some((next) => onPath.has(key(next)));
      if (near) found.push(cell);
    }
  }
  return found;
}

function pathBetween(maze: Maze, start: GridPoint, goal: GridPoint): Set<string> {
  const prev = new Map<string, string | null>();
  const queue: GridPoint[] = [start];
  prev.set(key(start), null);
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (!current) break;
    if (same(current, goal)) break;
    for (const next of neighbors(maze, current)) {
      const id = key(next);
      if (prev.has(id)) continue;
      prev.set(id, key(current));
      queue.push(next);
    }
  }
  const onPath = new Set<string>();
  let cursor: string | null = key(goal);
  if (!prev.has(cursor)) return onPath;
  while (cursor) {
    onPath.add(cursor);
    const prior: string | null | undefined = prev.get(cursor);
    cursor = prior ?? null;
  }
  return onPath;
}

function neighbors(maze: Maze, cell: GridPoint): GridPoint[] {
  const bits = maze.walls[cell.r]?.[cell.c] ?? 0;
  const found: GridPoint[] = [];
  for (const step of STEPS) {
    if ((bits & step.bit) !== 0) continue;
    const c = cell.c + step.dc;
    const r = cell.r + step.dr;
    if (c < 0 || r < 0 || c >= maze.cols || r >= maze.rows) continue;
    found.push({ c, r });
  }
  return found;
}

function take(
  cells: GridPoint[],
  count: number,
  spaced: (chosen: GridPoint[], cell: GridPoint) => boolean,
): GridPoint[] {
  const chosen: GridPoint[] = [];
  if (count <= 0) return chosen;
  for (const cell of cells) {
    if (!spaced(chosen, cell)) continue;
    chosen.push(cell);
    if (chosen.length === count) break;
  }
  return chosen;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) continue;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

function parseKey(id: string): GridPoint {
  const [c, r] = id.split(",");
  return { c: Number(c), r: Number(r) };
}

function manhattan(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}

function key(cell: GridPoint): string {
  return `${cell.c},${cell.r}`;
}

function same(a: GridPoint, b: GridPoint): boolean {
  return a.c === b.c && a.r === b.r;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
