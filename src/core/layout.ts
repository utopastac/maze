import { Wall, tileAt, wallKey, type Direction, type FloorTile, type GridPoint, type Maze } from "./maze.ts";
import type { Tower } from "./tower.ts";

export const CELL = 1.2;
export const WALL = 0.17;
export const WALL_H = 0.68;
export const FRAME_H = 0.92;
/** Extra collider height above the rim. Stays clear of the floor above (story gap is 1.85). */
export const FRAME_GUARD = 0.72;
export const BALL_R = 0.21;
export const FLOOR_T = 0.18;
export const SPAWN_Y = BALL_R + 0.02;
export const GOAL_REACH = (CELL - WALL) * 0.5 - 0.04;
export const STORY = 1.85;
export const MEADOW_DROP = STORY * 5.5;
export const PIT_WELL = 1.16;

export type PieceKind =
  | "floor"
  | "start"
  | "goal"
  | "boost"
  | "warp"
  | "ice"
  | "crumble"
  | "switch"
  | "wall"
  | "frame"
  | "pit"
  | "lip"
  | "hatch"
  | "exit"
  | "grout";

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
}

export interface FloorPlan {
  maze: Maze;
  hearts?: GridPoint[];
  goal?: boolean;
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
  const floors = plans.map((plan) => layoutMaze(plan.maze, plan.goal === true, plan.hearts ?? []));
  let width = 0;
  let depth = 0;
  for (const floor of floors) {
    width = Math.max(width, floor.width);
    depth = Math.max(depth, floor.depth);
  }
  return { floors, width, depth, story: STORY };
}

export function layoutMaze(maze: Maze, showGoal = true, hearts: GridPoint[] = []): MazeLayout {
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
        pieces.push(...pit(at.x, at.z), ...lips(at.x, at.z));
        continue;
      }
      const tile = tileAt(maze, c, r);
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

  for (const heart of hearts) {
    if (heart.c < 0 || heart.r < 0 || heart.c >= maze.cols || heart.r >= maze.rows) continue;
    const at = center(originX, originZ, heart);
    heartMarks.push({ c: heart.c, r: heart.r, x: at.x, z: at.z });
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

function pit(x: number, z: number): Piece[] {
  const gap = (CELL - WALL) / 2 - 0.012;
  const thickness = 0.05;
  const top = -0.008;
  const floor = -PIT_WELL;
  const mid = (top + floor) / 2;
  const hy = (top - floor) / 2;
  const inset = gap - thickness / 2;
  const sink = BALL_R * 2 + 0.06;
  return [
    { kind: "pit", x, y: mid, z: z - inset, hx: gap, hy, hz: thickness / 2 },
    { kind: "pit", x, y: mid, z: z + inset, hx: gap, hy, hz: thickness / 2 },
    { kind: "pit", x: x - inset, y: mid, z, hx: thickness / 2, hy, hz: inset },
    { kind: "pit", x: x + inset, y: mid, z, hx: thickness / 2, hy, hz: inset },
    { kind: "pit", x, y: floor - sink / 2, z, hx: gap - thickness, hy: sink / 2, hz: gap - thickness },
  ];
}

function lips(x: number, z: number, kind: "lip" | "hatch" | "exit" = "lip"): Piece[] {
  const gap = (CELL - WALL) / 2 - 0.012;
  const lipT = 0.03;
  const hy = 0.012;
  const y = 0.014;
  const along = gap;
  const inset = gap - lipT / 2;
  return [
    { kind, x, y, z: z - inset, hx: along, hy, hz: lipT / 2 },
    { kind, x, y, z: z + inset, hx: along, hy, hz: lipT / 2 },
    { kind, x: x - inset, y, z, hx: lipT / 2, hy, hz: along },
    { kind, x: x + inset, y, z, hx: lipT / 2, hy, hz: along },
  ];
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
