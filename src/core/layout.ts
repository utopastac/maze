import { Wall, tileAt, wallKey, type Direction, type FloorTile, type Maze } from "./maze.ts";
import { parseFloorTheme, type FloorThemeId } from "./theme.ts";
import type { Tower } from "./tower.ts";

export const CELL = 1.2;
export const WALL = 0.17;
export const WALL_H = 0.68;
export const FRAME_H = 0.92;
/** Extra collider height above the rim. Stays clear of the floor above (story gap is 1.85). */
export const FRAME_GUARD = 0.72;
export const BALL_R = 0.21;
export const FLOOR_T = 0.18;
export const ROOF_T = 0.1;
export const SPAWN_Y = BALL_R + 0.02;
export const GOAL_REACH = (CELL - WALL) * 0.5 - 0.04;
export const STORY = 1.85;
export const MEADOW_DROP = STORY * 5.5;
/** Visual/physics pit depth. Kept above the next floor's roof so pits read as black voids. */
export const PIT_WELL = STORY - FRAME_H - ROOF_T - 0.18;

export type PieceKind =
  | "floor"
  | "start"
  | "goal"
  | "boost"
  | "warp"
  | "ice"
  | "crumble"
  | "block"
  | "switch"
  | "wall"
  | "frame"
  | "pit"
  | "void"
  | "lip"
  | "hatch"
  | "exit"
  | "grout"
  | "roof";

export interface BoostMark {
  c: number;
  r: number;
  x: number;
  z: number;
  dir: Direction;
}

export interface WarpMark {
  c: number;
  r: number;
  x: number;
  z: number;
  pair: number;
  open: boolean;
}

export interface IceMark {
  c: number;
  r: number;
  x: number;
  z: number;
}

export interface CrumbleMark {
  c: number;
  r: number;
  x: number;
  z: number;
}

export interface SwitchMark {
  c: number;
  r: number;
  x: number;
  z: number;
  tone: number;
  gate: string | null;
}

export interface HeartMark {
  c: number;
  r: number;
  x: number;
  z: number;
}

export interface CoinMark {
  c: number;
  r: number;
  x: number;
  z: number;
}

export interface Piece {
  kind: PieceKind;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  gate?: string;
  cell?: string;
  tone?: number;
}

export interface MazeLayout {
  pieces: Piece[];
  boosts: BoostMark[];
  warps: WarpMark[];
  holes: string[];
  ices: IceMark[];
  crumbles: CrumbleMark[];
  switches: SwitchMark[];
  hearts: HeartMark[];
  coins: CoinMark[];
  start: { x: number; z: number };
  goal: { x: number; z: number };
  hatch: { x: number; z: number } | null;
  width: number;
  depth: number;
  cols: number;
  rows: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  finale: boolean;
  theme: FloorThemeId;
}

export interface FloorPlan {
  maze: Maze;
  goal?: boolean;
  /** Cap this floor with a shatterable roof (hole at start). */
  roof?: boolean;
}

export interface TowerLayout {
  floors: MazeLayout[];
  width: number;
  depth: number;
  story: number;
}

export function isSolid(kind: PieceKind): boolean {
  return (
    kind === "floor" ||
    kind === "start" ||
    kind === "goal" ||
    kind === "boost" ||
    kind === "warp" ||
    kind === "ice" ||
    kind === "crumble" ||
    kind === "block" ||
    kind === "switch" ||
    kind === "wall" ||
    kind === "frame"
  );
}

export function layoutTower(tower: Tower): TowerLayout {
  const last = tower.floors.length - 1;
  return layoutPlans(tower.floors.map((maze, index) => ({ maze, goal: index === last })));
}

export function layoutPlans(plans: FloorPlan[]): TowerLayout {
  const floors = plans.map((plan, index) =>
    layoutMaze(plan.maze, plan.goal === true, plan.roof ?? index > 0),
  );
  let width = 0;
  let depth = 0;
  for (const floor of floors) {
    width = Math.max(width, floor.width);
    depth = Math.max(depth, floor.depth);
  }
  return { floors, width, depth, story: STORY };
}

export function layoutMaze(
  maze: Maze,
  showGoal = true,
  capped = false,
): MazeLayout {
  const width = maze.cols * CELL;
  const depth = maze.rows * CELL;
  const originX = -width / 2;
  const originZ = -depth / 2;
  const pieces: Piece[] = [];
  const boosts: BoostMark[] = [];
  const warps: WarpMark[] = [];
  const ices: IceMark[] = [];
  const crumbles: CrumbleMark[] = [];
  const switches: SwitchMark[] = [];
  const heartMarks: HeartMark[] = [];
  const coinMarks: CoinMark[] = [];
  const switchWalls = new Map<string, number>();
  const holes = new Set(maze.holes.map((hole) => `${hole.c},${hole.r}`));
  const warpCount = new Map<number, number>();
  for (const tile of maze.tiles) {
    if (tile.kind !== "warp") continue;
    warpCount.set(tile.pair, (warpCount.get(tile.pair) ?? 0) + 1);
  }
  for (const tile of maze.tiles) {
    if (tile.kind === "switch" && tile.wall) switchWalls.set(wallKey(tile.wall), tile.tone);
  }

  for (let vz = 0; vz <= maze.rows; vz += 1) {
    for (let vx = 0; vx <= maze.cols; vx += 1) {
      const south = vz < maze.rows && hasVertical(maze, vx, vz);
      const north = vz > 0 && hasVertical(maze, vx, vz - 1);
      const east = vx < maze.cols && hasHorizontal(maze, vx, vz);
      const west = vx > 0 && hasHorizontal(maze, vx - 1, vz);
      if (!south && !north && !east && !west) continue;
      const frame = vx === 0 || vx === maze.cols || vz === 0 || vz === maze.rows;
      pieces.push(post(originX + vx * CELL, originZ + vz * CELL, frame));
    }
  }

  for (let row = 0; row < maze.rows; row += 1) {
    for (let edge = 0; edge <= maze.cols; edge += 1) {
      if (!hasVertical(maze, edge, row)) continue;
      const gate = edge > 0 && edge < maze.cols ? wallKey({ axis: "v", c: edge - 1, r: row }) : "";
      pieces.push(segment(
        originX + edge * CELL,
        originZ + (row + 0.5) * CELL,
        WALL / 2,
        (CELL - WALL) / 2 + 0.01,
        edge === 0 || edge === maze.cols,
        switchWalls.has(gate) ? gate : undefined,
        switchWalls.get(gate),
      ));
    }
  }

  for (let edge = 0; edge <= maze.rows; edge += 1) {
    for (let col = 0; col < maze.cols; col += 1) {
      if (!hasHorizontal(maze, col, edge)) continue;
      const gate = edge > 0 && edge < maze.rows ? wallKey({ axis: "h", c: col, r: edge - 1 }) : "";
      pieces.push(segment(
        originX + (col + 0.5) * CELL,
        originZ + edge * CELL,
        (CELL - WALL) / 2 + 0.01,
        WALL / 2,
        edge === 0 || edge === maze.rows,
        switchWalls.has(gate) ? gate : undefined,
        switchWalls.get(gate),
      ));
    }
  }

  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      const at = center(originX, originZ, { c, r });
      if (maze.hatch && maze.hatch.c === c && maze.hatch.r === r) {
        pieces.push(...lips(at.x, at.z, "hatch"));
        continue;
      }
      if (showGoal && c === maze.goal.c && r === maze.goal.r) {
        pieces.push(...lips(at.x, at.z, "exit"));
        continue;
      }
      if (holes.has(`${c},${r}`)) {
        pieces.push(...pitCell(c, r, at.x, at.z, holes));
        continue;
      }
      const tile = tileAt(maze, c, r);
      if (tile?.kind === "block") {
        pieces.push(blockCube(at.x, at.z));
        continue;
      }
      const kind = floorKind(maze, c, r, tile);
      const span = (CELL - WALL) / 2 + 0.02;
      pieces.push({
        kind,
        x: at.x,
        y: -FLOOR_T / 2,
        z: at.z,
        hx: span,
        hy: FLOOR_T / 2,
        hz: span,
        cell: tile?.kind === "crumble" ? `${c},${r}` : undefined,
      });
      if (tile?.kind === "boost") boosts.push({ c, r, x: at.x, z: at.z, dir: tile.dir });
      else if (tile?.kind === "warp") {
        warps.push({ c, r, x: at.x, z: at.z, pair: tile.pair, open: (warpCount.get(tile.pair) ?? 0) < 2 });
      } else if (tile?.kind === "ice") ices.push({ c, r, x: at.x, z: at.z });
      else if (tile?.kind === "crumble") crumbles.push({ c, r, x: at.x, z: at.z });
      else if (tile?.kind === "switch") {
        switches.push({
          c,
          r,
          x: at.x,
          z: at.z,
          tone: tile.tone,
          gate: tile.wall ? wallKey(tile.wall) : null,
        });
      }
    }
  }

  addGrout(pieces, maze, originX, originZ, holes, showGoal);
  if (capped) addRoof(pieces, maze, originX, originZ);

  for (const heart of maze.hearts) {
    if (heart.c < 0 || heart.r < 0 || heart.c >= maze.cols || heart.r >= maze.rows) continue;
    const at = center(originX, originZ, heart);
    heartMarks.push({ c: heart.c, r: heart.r, x: at.x, z: at.z });
  }
  for (const coin of maze.coins) {
    if (coin.c < 0 || coin.r < 0 || coin.c >= maze.cols || coin.r >= maze.rows) continue;
    const at = center(originX, originZ, coin);
    coinMarks.push({ c: coin.c, r: coin.r, x: at.x, z: at.z });
  }

  return {
    pieces,
    boosts,
    warps,
    holes: [...holes],
    ices,
    crumbles,
    switches,
    hearts: heartMarks,
    coins: coinMarks,
    start: center(originX, originZ, maze.start),
    goal: center(originX, originZ, maze.goal),
    hatch: maze.hatch ? center(originX, originZ, maze.hatch) : null,
    width,
    depth,
    cols: maze.cols,
    rows: maze.rows,
    minX: originX,
    maxX: originX + width,
    minZ: originZ,
    maxZ: originZ + depth,
    finale: showGoal,
    theme: parseFloorTheme(maze.theme),
  };
}

function floorKind(
  maze: Maze,
  c: number,
  r: number,
  tile: FloorTile | undefined,
): PieceKind {
  if (c === maze.start.c && r === maze.start.r) return "start";
  if (tile) return tile.kind;
  return "floor";
}

function center(originX: number, originZ: number, cell: GridPoint): { x: number; z: number } {
  return {
    x: originX + (cell.c + 0.5) * CELL,
    z: originZ + (cell.r + 0.5) * CELL,
  };
}

function extents(frame: boolean): { y: number; hy: number } {
  const height = frame ? FRAME_H : WALL_H;
  const hy = height / 2;
  return { y: hy - 0.04, hy };
}

function post(x: number, z: number, frame: boolean): Piece {
  const { y, hy } = extents(frame);
  const half = WALL / 2 + 0.004;
  return { kind: frame ? "frame" : "wall", x, y, z, hx: half, hy, hz: half };
}

/** Solid cube that fills a cell's open floor area at wall height. */
function blockCube(x: number, z: number): Piece {
  const { y, hy } = extents(false);
  const span = (CELL - WALL) / 2 + 0.02;
  return { kind: "block", x, y, z, hx: span, hy, hz: span };
}

function segment(
  x: number,
  z: number,
  hx: number,
  hz: number,
  frame: boolean,
  gate?: string,
  tone?: number,
): Piece {
  const { y, hy } = extents(frame);
  return { kind: frame ? "frame" : "wall", x, y, z, hx, hy, hz, gate, tone };
}

function addGrout(
  pieces: Piece[],
  maze: Maze,
  originX: number,
  originZ: number,
  holes: Set<string>,
  finale: boolean,
): void {
  const joint = WALL / 2;
  const along = CELL / 2 - joint + 0.006;

  for (let row = 0; row < maze.rows; row += 1) {
    for (let edge = 1; edge < maze.cols; edge += 1) {
      if (hasVertical(maze, edge, row)) continue;
      if (!hasFloor(maze, holes, edge - 1, row, finale) && !hasFloor(maze, holes, edge, row, finale)) continue;
      pieces.push(grout(
        originX + edge * CELL,
        originZ + (row + 0.5) * CELL,
        joint,
        along,
      ));
    }
  }

  for (let edge = 1; edge < maze.rows; edge += 1) {
    for (let col = 0; col < maze.cols; col += 1) {
      if (hasHorizontal(maze, col, edge)) continue;
      if (!hasFloor(maze, holes, col, edge - 1, finale) && !hasFloor(maze, holes, col, edge, finale)) continue;
      pieces.push(grout(
        originX + (col + 0.5) * CELL,
        originZ + edge * CELL,
        along,
        joint,
      ));
    }
  }

  for (let vz = 1; vz < maze.rows; vz += 1) {
    for (let vx = 1; vx < maze.cols; vx += 1) {
      if (walledVertex(maze, vx, vz)) continue;
      const touched =
        hasFloor(maze, holes, vx - 1, vz - 1, finale) ||
        hasFloor(maze, holes, vx, vz - 1, finale) ||
        hasFloor(maze, holes, vx - 1, vz, finale) ||
        hasFloor(maze, holes, vx, vz, finale);
      if (!touched) continue;
      pieces.push(grout(originX + vx * CELL, originZ + vz * CELL, joint, joint));
    }
  }
}

function grout(x: number, z: number, hx: number, hz: number): Piece {
  const recess = 0.014;
  const top = -recess;
  const bottom = -FLOOR_T;
  const hy = (top - bottom) / 2;
  return { kind: "grout", x, y: (top + bottom) / 2, z, hx, hy, hz };
}

/** Ceiling slab over a lower stack floor, open above the landing/start cell. */
function addRoof(pieces: Piece[], maze: Maze, originX: number, originZ: number): void {
  const span = (CELL - WALL) / 2 + 0.02;
  const hy = ROOF_T / 2;
  const y = FRAME_H - 0.06 - hy;
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (c === maze.start.c && r === maze.start.r) continue;
      const at = center(originX, originZ, { c, r });
      pieces.push({ kind: "roof", x: at.x, y, z: at.z, hx: span, hy, hz: span });
    }
  }
  const landing = center(originX, originZ, maze.start);
  pieces.push(...roofOpening(landing.x, landing.z, y + hy));
}

function roofOpening(x: number, z: number, y: number): Piece[] {
  const gap = (CELL - WALL) / 2 - 0.012;
  const lipT = 0.04;
  const hy = 0.014;
  const along = gap;
  const inset = gap - lipT / 2;
  return [
    { kind: "roof", x, y, z: z - inset, hx: along, hy, hz: lipT / 2 },
    { kind: "roof", x, y, z: z + inset, hx: along, hy, hz: lipT / 2 },
    { kind: "roof", x: x - inset, y, z, hx: lipT / 2, hy, hz: along },
    { kind: "roof", x: x + inset, y, z, hx: lipT / 2, hy, hz: along },
  ];
}

function hasFloor(maze: Maze, holes: Set<string>, c: number, r: number, finale: boolean): boolean {
  if (c < 0 || r < 0 || c >= maze.cols || r >= maze.rows) return false;
  if (maze.hatch && maze.hatch.c === c && maze.hatch.r === r) return false;
  if (finale && maze.goal.c === c && maze.goal.r === r) return false;
  return !holes.has(`${c},${r}`);
}

function walledVertex(maze: Maze, vx: number, vz: number): boolean {
  const south = vz < maze.rows && hasVertical(maze, vx, vz);
  const north = vz > 0 && hasVertical(maze, vx, vz - 1);
  const east = vx < maze.cols && hasHorizontal(maze, vx, vz);
  const west = vx > 0 && hasHorizontal(maze, vx - 1, vz);
  return south || north || east || west;
}

/** Outer walls, rim, and starfield floor for one hole cell. Shared edges with other holes stay open. */
function pitCell(c: number, r: number, x: number, z: number, holes: Set<string>): Piece[] {
  const thickness = 0.05;
  const top = -0.008;
  const floor = -PIT_WELL;
  const mid = (top + floor) / 2;
  const hy = (top - floor) / 2;
  const half = CELL / 2;
  const wallAlong = half - 0.01;
  const wallInset = half - thickness / 2;
  // Overlap neighbors so merged pits share one continuous starfield floor.
  const voidHalf = half + 0.02;
  const north = !holes.has(`${c},${r - 1}`);
  const south = !holes.has(`${c},${r + 1}`);
  const west = !holes.has(`${c - 1},${r}`);
  const east = !holes.has(`${c + 1},${r}`);
  const out: Piece[] = [
    { kind: "void", x, y: floor - 0.03, z, hx: voidHalf, hy: 0.03, hz: voidHalf },
  ];
  if (north) out.push({ kind: "pit", x, y: mid, z: z - wallInset, hx: wallAlong, hy, hz: thickness / 2 });
  if (south) out.push({ kind: "pit", x, y: mid, z: z + wallInset, hx: wallAlong, hy, hz: thickness / 2 });
  if (west) out.push({ kind: "pit", x: x - wallInset, y: mid, z, hx: thickness / 2, hy, hz: wallAlong });
  if (east) out.push({ kind: "pit", x: x + wallInset, y: mid, z, hx: thickness / 2, hy, hz: wallAlong });
  out.push(...edgeLips(x, z, north, south, west, east, "lip"));
  return out;
}

function lips(x: number, z: number, kind: "lip" | "hatch" | "exit" = "lip"): Piece[] {
  return edgeLips(x, z, true, true, true, true, kind);
}

function edgeLips(
  x: number,
  z: number,
  north: boolean,
  south: boolean,
  west: boolean,
  east: boolean,
  kind: "lip" | "hatch" | "exit",
): Piece[] {
  const lipT = 0.03;
  const hy = 0.012;
  const y = 0.014;
  const half = CELL / 2;
  const along = half - 0.01;
  const inset = half - lipT / 2;
  const out: Piece[] = [];
  if (north) out.push({ kind, x, y, z: z - inset, hx: along, hy, hz: lipT / 2 });
  if (south) out.push({ kind, x, y, z: z + inset, hx: along, hy, hz: lipT / 2 });
  if (west) out.push({ kind, x: x - inset, y, z, hx: lipT / 2, hy, hz: along });
  if (east) out.push({ kind, x: x + inset, y, z, hx: lipT / 2, hy, hz: along });
  return out;
}

function hasVertical(maze: Maze, edgeC: number, row: number): boolean {
  if (edgeC <= 0 || edgeC >= maze.cols) return true;
  const bits = maze.walls[row]?.[edgeC];
  if (bits === undefined) return true;
  return (bits & Wall.west) !== 0;
}

function hasHorizontal(maze: Maze, col: number, edgeR: number): boolean {
  if (edgeR <= 0 || edgeR >= maze.rows) return true;
  const bits = maze.walls[edgeR]?.[col];
  if (bits === undefined) return true;
  return (bits & Wall.north) !== 0;
}
