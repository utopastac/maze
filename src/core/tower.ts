import {
  carveFloor,
  cloneMaze,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  resizeMaze,
  type GridPoint,
  type Maze,
} from "./maze.ts";

export interface Tower {
  floors: Maze[];
  name?: string;
  /** Starting lives for the whole tower (0 = unlimited). Collectable hearts add lives. */
  maxHearts?: number;
}

export const FLOOR_MIN = 1;
export const FLOOR_MAX = 5;
export const MAX_HEARTS_CAP = 5;
export const DEFAULT_MAX_HEARTS = 3;
export const TOWER_FLOORS = 3;
export const DEFAULT_LEVEL_NAME = "Untitled";
export const LEVEL_NAME_MAX = 40;

export function levelNameOf(tower: Tower): string {
  const name = tower.name?.trim();
  return name ? name.slice(0, LEVEL_NAME_MAX) : DEFAULT_LEVEL_NAME;
}

export function setLevelName(tower: Tower, value: string): void {
  const next = value.replace(/\s+/g, " ").trim().slice(0, LEVEL_NAME_MAX);
  if (!next || next === DEFAULT_LEVEL_NAME) delete tower.name;
  else tower.name = next;
}

export function generateTower(seed: number, cols = 7, rows = 7, count = TOWER_FLOORS): Tower {
  const total = Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, Math.round(count)));
  const floors: Maze[] = [];
  let landing: GridPoint = { c: 0, r: 0 };
  for (let i = 0; i < total; i += 1) {
    const maze = carveFloor(seed + i * 97, cols, rows, landing);
    if (i < total - 1) maze.hatch = { ...maze.goal };
    floors.push(maze);
    landing = { ...maze.goal };
  }
  const tower = { floors };
  repairTower(tower);
  return tower;
}

export function cloneTower(tower: Tower): Tower {
  const next: Tower = { floors: tower.floors.map((floor) => cloneMaze(floor)) };
  if (tower.name !== undefined) next.name = tower.name;
  if (tower.maxHearts !== undefined) next.maxHearts = tower.maxHearts;
  return next;
}

export function heartTotal(tower: Tower): number {
  return tower.floors.reduce((sum, floor) => sum + floor.hearts.length, 0);
}

export function coinTotal(tower: Tower): number {
  return tower.floors.reduce((sum, floor) => sum + floor.coins.length, 0);
}

export function maxHeartsOf(tower: Tower): number {
  const value = tower.maxHearts ?? 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(MAX_HEARTS_CAP, Math.max(0, Math.round(value)));
}

export function setMaxHearts(tower: Tower, value: number): void {
  const next = Math.min(MAX_HEARTS_CAP, Math.max(0, Math.round(value)));
  if (next <= 0) delete tower.maxHearts;
  else tower.maxHearts = next;
}

export function resizeTower(tower: Tower, cols: number, rows: number): Tower {
  const next = { floors: tower.floors.map((floor) => resizeMaze(floor, cols, rows)) };
  repairTower(next);
  return next;
}

/** Resize a single floor; other floors keep their own size. */
export function resizeFloor(tower: Tower, index: number, cols: number, rows: number): Tower {
  if (index < 0 || index >= tower.floors.length) return cloneTower(tower);
  const next = cloneTower(tower);
  const floor = next.floors[index];
  if (!floor) return next;
  next.floors[index] = resizeMaze(floor, cols, rows);
  repairTower(next);
  return next;
}

export function insertFloorColumn(tower: Tower, index: number, at: number): Tower {
  return mapFloor(tower, index, (floor) => insertColumn(floor, at));
}

export function insertFloorRow(tower: Tower, index: number, at: number): Tower {
  return mapFloor(tower, index, (floor) => insertRow(floor, at));
}

export function deleteFloorColumn(tower: Tower, index: number, col: number): Tower {
  return mapFloor(tower, index, (floor) => deleteColumn(floor, col));
}

export function deleteFloorRow(tower: Tower, index: number, row: number): Tower {
  return mapFloor(tower, index, (floor) => deleteRow(floor, row));
}

export function moveFloorColumn(tower: Tower, index: number, from: number, to: number): Tower {
  return mapFloor(tower, index, (floor) => moveColumn(floor, from, to));
}

export function moveFloorRow(tower: Tower, index: number, from: number, to: number): Tower {
  return mapFloor(tower, index, (floor) => moveRow(floor, from, to));
}

function mapFloor(tower: Tower, index: number, map: (floor: Maze) => Maze): Tower {
  if (index < 0 || index >= tower.floors.length) return cloneTower(tower);
  const next = cloneTower(tower);
  const floor = next.floors[index];
  if (!floor) return next;
  next.floors[index] = map(floor);
  repairTower(next);
  return next;
}

export function addFloor(tower: Tower): Tower {
  if (tower.floors.length >= FLOOR_MAX) return cloneTower(tower);
  const next = cloneTower(tower);
  const above = next.floors[next.floors.length - 1];
  if (!above) return next;
  const landing = above.hatch && !same(above.hatch, above.start)
    ? { ...above.hatch }
    : same(above.goal, above.start)
      ? spareCell(above, [above.start])
      : { ...above.goal };
  above.hatch = landing;
  above.holes = above.holes.filter((hole) => !same(hole, landing));
  above.tiles = above.tiles.filter((tile) => !same(tile, landing));
  above.hearts = above.hearts.filter((heart) => !same(heart, landing));
  above.coins = above.coins.filter((coin) => !same(coin, landing));
  above.stars = above.stars.filter((star) => !same(star, landing));
  above.wings = above.wings.filter((wing) => !same(wing, landing));
  const seed = Math.floor(Math.random() * 0x7fffffff);
  next.floors.push(carveFloor(seed, above.cols, above.rows, landing));
  repairTower(next);
  return next;
}

export function removeFloor(tower: Tower, index: number): Tower {
  if (tower.floors.length <= FLOOR_MIN || index < 0 || index >= tower.floors.length) return cloneTower(tower);
  const next = cloneTower(tower);
  next.floors.splice(index, 1);
  repairTower(next);
  return next;
}

export function setHatch(tower: Tower, floorIndex: number, cell: GridPoint): void {
  const floor = tower.floors[floorIndex];
  if (!floor || floorIndex >= tower.floors.length - 1) return;
  if (!inside(floor, cell) || same(cell, floor.start)) return;
  floor.hatch = { c: cell.c, r: cell.r };
  // Intermediate floors use the hatch as the exit; keep goal aligned so the old
  // cell does not stay blocked as an invisible goal.
  floor.goal = { c: cell.c, r: cell.r };
  floor.holes = floor.holes.filter((hole) => !same(hole, cell));
  floor.tiles = floor.tiles.filter((tile) => !same(tile, cell));
  floor.hearts = floor.hearts.filter((heart) => !same(heart, cell));
  floor.coins = floor.coins.filter((coin) => !same(coin, cell));
  floor.stars = floor.stars.filter((star) => !same(star, cell));
  floor.wings = floor.wings.filter((wing) => !same(wing, cell));
  repairTower(tower);
}

export function repairTower(tower: Tower): void {
  const last = tower.floors.length - 1;
  for (let i = 0; i < tower.floors.length; i += 1) {
    const floor = tower.floors[i];
    if (!floor) continue;
    if (i > 0) {
      const above = tower.floors[i - 1];
      if (above?.hatch) floor.start = cellUnder(above, above.hatch, floor);
    }
    if (i === last) floor.hatch = null;
    else if (!floor.hatch || !inside(floor, floor.hatch) || same(floor.hatch, floor.start)) {
      const below = tower.floors[i + 1];
      floor.hatch = below
        ? cellOver(below, spareCell(below, [below.start]), floor)
        : spareCell(floor, [floor.start]);
      if (same(floor.hatch, floor.start)) floor.hatch = spareCell(floor, [floor.start]);
    }
    if (floor.hatch) {
      floor.goal = { ...floor.hatch };
      floor.holes = floor.holes.filter((hole) => !same(hole, floor.hatch as GridPoint));
      floor.tiles = floor.tiles.filter((tile) => !same(tile, floor.hatch as GridPoint));
    } else if (same(floor.goal, floor.start)) {
      floor.goal = spareCell(floor, [floor.start]);
    }
    floor.holes = floor.holes.filter((hole) => !same(hole, floor.start) && !same(hole, floor.goal));
    floor.tiles = floor.tiles.filter((tile) => !same(tile, floor.start) && !same(tile, floor.goal));
    floor.hearts = floor.hearts.filter(
      (heart) => !same(heart, floor.start) && !same(heart, floor.goal)
        && !(floor.hatch && same(heart, floor.hatch))
        && !floor.holes.some((hole) => same(hole, heart))
        && floor.tiles.every((tile) => tile.kind !== "block" || !same(tile, heart)),
    );
    floor.coins = floor.coins.filter(
      (coin) => !same(coin, floor.start) && !same(coin, floor.goal)
        && !(floor.hatch && same(coin, floor.hatch))
        && !floor.holes.some((hole) => same(hole, coin))
        && floor.tiles.every((tile) => tile.kind !== "block" || !same(tile, coin))
        && !floor.hearts.some((heart) => same(heart, coin)),
    );
    floor.stars = floor.stars.filter(
      (star) => !same(star, floor.start) && !same(star, floor.goal)
        && !(floor.hatch && same(star, floor.hatch))
        && !floor.holes.some((hole) => same(hole, star))
        && floor.tiles.every((tile) => tile.kind !== "block" || !same(tile, star))
        && !floor.hearts.some((heart) => same(heart, star))
        && !floor.coins.some((coin) => same(coin, star)),
    );
    floor.wings = floor.wings.filter(
      (wing) => !same(wing, floor.start) && !same(wing, floor.goal)
        && !(floor.hatch && same(wing, floor.hatch))
        && !floor.holes.some((hole) => same(hole, wing))
        && floor.tiles.every((tile) => tile.kind !== "block" || !same(tile, wing))
        && !floor.hearts.some((heart) => same(heart, wing))
        && !floor.coins.some((coin) => same(coin, wing))
        && !floor.stars.some((star) => same(star, wing)),
    );
  }
  setMaxHearts(tower, tower.maxHearts ?? 0);
}

/** Map a cell on `from` to the overlapping cell on centered `onto`. */
function cellUnder(from: Maze, cell: GridPoint, onto: Maze): GridPoint {
  const wx = cell.c + 0.5 - from.cols / 2;
  const wz = cell.r + 0.5 - from.rows / 2;
  const c = Math.min(onto.cols - 1, Math.max(0, Math.floor(wx + onto.cols / 2)));
  const r = Math.min(onto.rows - 1, Math.max(0, Math.floor(wz + onto.rows / 2)));
  return { c, r };
}

/** Map a cell on `onto` back to the overlapping cell on centered `from`. */
function cellOver(onto: Maze, cell: GridPoint, from: Maze): GridPoint {
  return cellUnder(onto, cell, from);
}

function spareCell(maze: Maze, avoid: GridPoint[]): GridPoint {
  const blocked = (cell: GridPoint) => avoid.some((item) => same(item, cell));
  const corners = [
    { c: maze.cols - 1, r: maze.rows - 1 },
    { c: 0, r: maze.rows - 1 },
    { c: maze.cols - 1, r: 0 },
    { c: 0, r: 0 },
  ];
  for (const cell of corners) {
    if (!blocked(cell)) return { ...cell };
  }
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      const cell = { c, r };
      if (!blocked(cell)) return cell;
    }
  }
  return { c: 0, r: 0 };
}

function inside(maze: Maze, cell: GridPoint): boolean {
  return cell.c >= 0 && cell.r >= 0 && cell.c < maze.cols && cell.r < maze.rows;
}

function same(a: GridPoint, b: GridPoint): boolean {
  return a.c === b.c && a.r === b.r;
}
