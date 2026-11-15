import {
  Wall,
  carveFloor,
  mulberry32,
  setBoost,
  setCrumble,
  setIce,
  type Direction,
  type GridPoint,
  type Maze,
} from "./maze.ts";

export const CAMPAIGN_FLOORS = 100;
export const CAMPAIGN_LIVES = 3;

const SIZE_MIN = 5;
const SIZE_SPAN = 11;

export interface CampaignFloor {
  maze: Maze;
  hearts: GridPoint[];
}

export interface Campaign {
  seed: number;
  floors: CampaignFloor[];
}

const STEPS = [
  { dc: 0, dr: -1, bit: Wall.north },
  { dc: 1, dr: 0, bit: Wall.east },
  { dc: 0, dr: 1, bit: Wall.south },
  { dc: -1, dr: 0, bit: Wall.west },
] as const;

const BOOSTS: Direction[] = ["n", "e", "s", "w"];

export function generateCampaign(seed: number): Campaign {
  const floors: CampaignFloor[] = [];
  let landing: GridPoint = { c: 0, r: 0 };
  for (let index = 0; index < CAMPAIGN_FLOORS; index += 1) {
    const t = index / (CAMPAIGN_FLOORS - 1);
    const cols = gridSize(t);
    const maze = carveFloor(seed + index * 97, cols, cols, landing, {
      braid: Math.max(1, Math.round((1 - t) * 7)),
      holes: holeCount(t, cols),
    });
    if (index < CAMPAIGN_FLOORS - 1) {
      maze.hatch = { ...maze.goal };
      separateHatch(maze);
    }
    floors.push({ maze, hearts: furnish(maze, seed + index * 131, t, index) });
    landing = { ...(maze.hatch ?? maze.start) };
  }
  return { seed, floors };
}

export function campaignSizes(campaign: Campaign): number[] {
  return campaign.floors.map((floor) => floor.maze.cols);
}

function gridSize(t: number): number {
  return SIZE_MIN + Math.round(t ** 1.15 * SIZE_SPAN);
}

function holeCount(t: number, cols: number): number {
  const cap = Math.max(0, Math.floor(cols * cols * 0.06));
  return Math.min(cap, Math.round(t ** 1.1 * 8));
}

function heartCount(index: number): number {
  if (index === 0) return 1;
  if (index % 7 !== 6) return 0;
  return index >= 80 ? 2 : 1;
}

function furnish(maze: Maze, seed: number, t: number, index: number): GridPoint[] {
  const rand = mulberry32(seed >>> 0);
  const exit = maze.hatch ?? maze.goal;
  const onPath = pathBetween(maze, maze.start, exit);
  const route = [...onPath]
    .map(parseKey)
    .filter((cell) => manhattan(cell, maze.start) >= 2 && manhattan(cell, exit) >= 2);
  const spaced = (chosen: GridPoint[], cell: GridPoint) => chosen.every((other) => manhattan(other, cell) > 2);

  const ice = take(shuffle(route, rand), t < 0.18 ? 0 : Math.round((t - 0.18) * 7), spaced);
  for (const cell of ice) setIce(maze, cell);

  const afterIce = route.filter((cell) => !ice.some((used) => same(used, cell)));
  const crumble = take(shuffle(afterIce, rand), t < 0.42 ? 0 : Math.round((t - 0.42) * 6), spaced);
  for (const cell of crumble) setCrumble(maze, cell);

  const used = new Set([...ice, ...crumble].map(key));
  const beside = shuffle(sideCells(maze, onPath, exit, used), rand);
  const boosts = take(beside, t < 0.28 ? 0 : Math.round((t - 0.28) * 4), spaced);
  for (const cell of boosts) {
    const dir = BOOSTS[Math.floor(rand() * BOOSTS.length)] ?? "e";
    setBoost(maze, cell, dir);
    used.add(key(cell));
  }

  const hearts = take(
    [
      ...beside.filter((cell) => !used.has(key(cell))),
      ...shuffle(route.filter((cell) => !used.has(key(cell))), rand),
    ],
    heartCount(index),
    spaced,
  );
  return hearts;
}

function separateHatch(maze: Maze): void {
  const hatch = maze.hatch;
  if (!hatch || !same(hatch, maze.start)) return;
  const corners = [
    { c: maze.cols - 1, r: maze.rows - 1 },
    { c: 0, r: maze.rows - 1 },
    { c: maze.cols - 1, r: 0 },
  ];
  maze.hatch = corners.find((cell) => !same(cell, maze.start)) ?? { c: maze.cols - 1, r: maze.rows - 1 };
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

function shuffle(items: GridPoint[], rand: () => number): GridPoint[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (!a || !b) continue;
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
