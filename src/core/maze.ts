import { DEFAULT_FLOOR_THEME, parseFloorTheme, type FloorThemeId } from "./theme.ts";

export const Wall = {
  north: 1,
  east: 2,
  south: 4,
  west: 8,
} as const;

export interface GridPoint {
  c: number;
  r: number;
}

export type Direction = "n" | "e" | "s" | "w";

export const WARP_COLOR_COUNT = 6;
export const SWITCH_COLOR_COUNT = 6;

/** Board axes: +x is east, +z is south. */
export const DIRECTION_VECTOR: Record<Direction, { x: number; z: number }> = {
  n: { x: 0, z: -1 },
  e: { x: 1, z: 0 },
  s: { x: 0, z: 1 },
  w: { x: -1, z: 0 },
};

export interface WallRef {
  axis: WallAxis;
  c: number;
  r: number;
}

export type FloorTile =
  | { kind: "boost"; c: number; r: number; dir: Direction }
  | { kind: "warp"; c: number; r: number; pair: number }
  | { kind: "ice"; c: number; r: number }
  | { kind: "crumble"; c: number; r: number }
  | { kind: "switch"; c: number; r: number; tone: number; wall: WallRef | null };

export function wallKey(wall: WallRef): string {
  return `${wall.axis}:${wall.c},${wall.r}`;
}

export interface Maze {
  cols: number;
  rows: number;
  walls: number[][];
  holes: GridPoint[];
  tiles: FloorTile[];
  start: GridPoint;
  goal: GridPoint;
  hatch: GridPoint | null;
  theme: FloorThemeId;
}

export type WallAxis = "v" | "h";

export const MAZE_MIN = 3;
export const MAZE_MAX = 16;

const DIRS = [
  { dc: 0, dr: -1, wall: Wall.north, opposite: Wall.south },
  { dc: 1, dr: 0, wall: Wall.east, opposite: Wall.west },
  { dc: 0, dr: 1, wall: Wall.south, opposite: Wall.north },
  { dc: -1, dr: 0, wall: Wall.west, opposite: Wall.east },
] as const;

const FULL = Wall.north | Wall.east | Wall.south | Wall.west;

export function generateMaze(seed: number, cols = 7, rows = 7): Maze {
  return carveFloor(seed, cols, rows, { c: 0, r: 0 });
}

export interface CarveOptions {
  braid?: number;
  holes?: number;
}

export function carveFloor(
  seed: number,
  cols: number,
  rows: number,
  start: GridPoint,
  options?: CarveOptions,
): Maze {
  const originCell = {
    c: Math.min(Math.max(start.c, 0), cols - 1),
    r: Math.min(Math.max(start.r, 0), rows - 1),
  };
  const rand = mulberry32(seed);
  const walls = Array.from({ length: rows }, () => Array.from({ length: cols }, () => FULL));
  const seen = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  const stack: GridPoint[] = [originCell];
  const origin = seen[originCell.r];
  if (origin) origin[originCell.c] = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    if (!current) break;
    const options = DIRS.filter((dir) => {
      const nc = current.c + dir.dc;
      const nr = current.r + dir.dr;
      return nr >= 0 && nc >= 0 && nr < rows && nc < cols && seen[nr]?.[nc] === false;
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const dir = options[Math.floor(rand() * options.length)];
    if (!dir) continue;
    const nc = current.c + dir.dc;
    const nr = current.r + dir.dr;
    openWall(walls, current.c, current.r, nc, nr, dir.wall, dir.opposite);
    const row = seen[nr];
    if (row) row[nc] = true;
    stack.push({ c: nc, r: nr });
  }

  braid(walls, cols, rows, rand, options?.braid ?? 3);

  const goal = farthest(walls, cols, rows, originCell);
  const onPath = shortestPath(walls, cols, rows, originCell, goal);
  const holes = pickHoles(walls, cols, rows, originCell, goal, onPath, rand, options?.holes ?? 2);

  return {
    cols,
    rows,
    walls,
    holes,
    tiles: [],
    start: originCell,
    goal,
    hatch: null,
    theme: DEFAULT_FLOOR_THEME,
  };
}

export function cloneMaze(maze: Maze): Maze {
  return {
    cols: maze.cols,
    rows: maze.rows,
    walls: maze.walls.map((row) => row.slice()),
    holes: maze.holes.map((hole) => ({ c: hole.c, r: hole.r })),
    tiles: maze.tiles.map((tile) => cloneTile(tile)),
    start: { ...maze.start },
    goal: { ...maze.goal },
    hatch: maze.hatch ? { ...maze.hatch } : null,
    theme: parseFloorTheme(maze.theme),
  };
}

export function resizeMaze(maze: Maze, cols: number, rows: number): Maze {
  const nextCols = clampSize(cols);
  const nextRows = clampSize(rows);
  const next: Maze = {
    cols: nextCols,
    rows: nextRows,
    walls: Array.from({ length: nextRows }, (_, r) =>
      Array.from({ length: nextCols }, (_, c) => maze.walls[r]?.[c] ?? 0),
    ),
    holes: maze.holes
      .filter((hole) => hole.c < nextCols && hole.r < nextRows)
      .map((hole) => ({ c: hole.c, r: hole.r })),
    tiles: maze.tiles
      .filter((tile) => tile.c < nextCols && tile.r < nextRows)
      .map((tile) => cloneTile(tile)),
    start: clampCell(maze.start, nextCols, nextRows),
    goal: clampCell(maze.goal, nextCols, nextRows),
    hatch: maze.hatch ? clampCell(maze.hatch, nextCols, nextRows) : null,
    theme: parseFloorTheme(maze.theme),
  };

  for (let r = 0; r < nextRows; r += 1) {
    for (let c = 0; c < nextCols - 1; c += 1) {
      const both = r < maze.rows && c + 1 < maze.cols;
      const closed = both && ((maze.walls[r]?.[c] ?? 0) & Wall.east) !== 0;
      setInteriorWall(next, "v", c, r, closed);
    }
  }

  for (let r = 0; r < nextRows - 1; r += 1) {
    for (let c = 0; c < nextCols; c += 1) {
      const both = r + 1 < maze.rows && c < maze.cols;
      const closed = both && ((maze.walls[r]?.[c] ?? 0) & Wall.south) !== 0;
      setInteriorWall(next, "h", c, r, closed);
    }
  }

  sealBorder(next);
  separateEnds(next);
  if (next.hatch && same(next.hatch, next.start)) next.hatch = null;
  next.holes = next.holes.filter(
    (hole) => !same(hole, next.start) && !same(hole, next.goal) && !(next.hatch && same(hole, next.hatch)),
  );
  next.tiles = next.tiles.filter(
    (tile) => !same(tile, next.start) && !same(tile, next.goal) && !(next.hatch && same(tile, next.hatch)),
  );
  scrubSwitchWalls(next);
  return next;
}

/** Insert an empty column before `at` (0 = west edge, cols = east edge). */
export function insertColumn(maze: Maze, at: number): Maze {
  if (maze.cols >= MAZE_MAX) return cloneMaze(maze);
  const index = Math.min(Math.max(Math.round(at), 0), maze.cols);
  const next = cloneMaze(maze);
  next.cols += 1;
  next.walls = next.walls.map((row) => {
    const copy = row.slice();
    copy.splice(index, 0, 0);
    return copy;
  });
  next.start = shiftPointCol(next.start, index, 1);
  next.goal = shiftPointCol(next.goal, index, 1);
  next.hatch = next.hatch ? shiftPointCol(next.hatch, index, 1) : null;
  next.holes = next.holes.map((hole) => shiftPointCol(hole, index, 1));
  next.tiles = next.tiles.map((tile) => shiftTileCol(tile, index, 1));
  openInsertSeamCol(next, index);
  sealBorder(next);
  scrubSwitchWalls(next);
  return next;
}

/** Insert an empty row before `at` (0 = north edge, rows = south edge). */
export function insertRow(maze: Maze, at: number): Maze {
  if (maze.rows >= MAZE_MAX) return cloneMaze(maze);
  const index = Math.min(Math.max(Math.round(at), 0), maze.rows);
  const next = cloneMaze(maze);
  next.rows += 1;
  next.walls.splice(index, 0, Array.from({ length: next.cols }, () => 0));
  next.start = shiftPointRow(next.start, index, 1);
  next.goal = shiftPointRow(next.goal, index, 1);
  next.hatch = next.hatch ? shiftPointRow(next.hatch, index, 1) : null;
  next.holes = next.holes.map((hole) => shiftPointRow(hole, index, 1));
  next.tiles = next.tiles.map((tile) => shiftTileRow(tile, index, 1));
  openInsertSeamRow(next, index);
  sealBorder(next);
  scrubSwitchWalls(next);
  return next;
}

export function deleteColumn(maze: Maze, index: number): Maze {
  if (maze.cols <= MAZE_MIN || index < 0 || index >= maze.cols) return cloneMaze(maze);
  const next = cloneMaze(maze);
  const lostStart = next.start.c === index;
  const lostGoal = next.goal.c === index;
  const lostHatch = !!next.hatch && next.hatch.c === index;
  next.cols -= 1;
  next.walls = next.walls.map((row) => row.filter((_, c) => c !== index));
  next.start = lostStart ? next.start : shiftPointCol(next.start, index, -1);
  next.goal = lostGoal ? next.goal : shiftPointCol(next.goal, index, -1);
  next.hatch = lostHatch || !next.hatch ? null : shiftPointCol(next.hatch, index, -1);
  next.holes = next.holes
    .filter((hole) => hole.c !== index)
    .map((hole) => shiftPointCol(hole, index, -1));
  next.tiles = next.tiles
    .filter((tile) => tile.c !== index)
    .map((tile) => shiftTileCol(tile, index, -1));
  if (lostStart) next.start = spareAfterDelete(next, [next.goal, next.hatch]);
  if (lostGoal) next.goal = spareAfterDelete(next, [next.start, next.hatch]);
  next.start = clampCell(next.start, next.cols, next.rows);
  next.goal = clampCell(next.goal, next.cols, next.rows);
  if (next.hatch) next.hatch = clampCell(next.hatch, next.cols, next.rows);
  sealBorder(next);
  separateEnds(next);
  scrubSwitchWalls(next);
  return next;
}

export function deleteRow(maze: Maze, index: number): Maze {
  if (maze.rows <= MAZE_MIN || index < 0 || index >= maze.rows) return cloneMaze(maze);
  const next = cloneMaze(maze);
  const lostStart = next.start.r === index;
  const lostGoal = next.goal.r === index;
  const lostHatch = !!next.hatch && next.hatch.r === index;
  next.rows -= 1;
  next.walls = next.walls.filter((_, r) => r !== index);
  next.start = lostStart ? next.start : shiftPointRow(next.start, index, -1);
  next.goal = lostGoal ? next.goal : shiftPointRow(next.goal, index, -1);
  next.hatch = lostHatch || !next.hatch ? null : shiftPointRow(next.hatch, index, -1);
  next.holes = next.holes
    .filter((hole) => hole.r !== index)
    .map((hole) => shiftPointRow(hole, index, -1));
  next.tiles = next.tiles
    .filter((tile) => tile.r !== index)
    .map((tile) => shiftTileRow(tile, index, -1));
  if (lostStart) next.start = spareAfterDelete(next, [next.goal, next.hatch]);
  if (lostGoal) next.goal = spareAfterDelete(next, [next.start, next.hatch]);
  next.start = clampCell(next.start, next.cols, next.rows);
  next.goal = clampCell(next.goal, next.cols, next.rows);
  if (next.hatch) next.hatch = clampCell(next.hatch, next.cols, next.rows);
  sealBorder(next);
  separateEnds(next);
  scrubSwitchWalls(next);
  return next;
}

/** Move column `from` to index `to` (0-based), keeping cell contents and adjacent seams. */
export function moveColumn(maze: Maze, from: number, to: number): Maze {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return cloneMaze(maze);
  if (from === to || from < 0 || to < 0 || from >= maze.cols || to >= maze.cols) return cloneMaze(maze);

  const order = Array.from({ length: maze.cols }, (_, index) => index);
  const [taken] = order.splice(from, 1);
  order.splice(to, 0, taken!);
  const mapC = (c: number) => order.indexOf(c);

  const next = cloneMaze(maze);
  next.walls = Array.from({ length: next.rows }, () => Array.from({ length: next.cols }, () => 0));

  for (let nc = 0; nc < next.cols; nc += 1) {
    const oc = order[nc]!;
    for (let r = 0; r < next.rows - 1; r += 1) {
      setInteriorWall(next, "h", nc, r, interiorClosed(maze, "h", oc, r));
    }
  }
  for (let nc = 0; nc < next.cols - 1; nc += 1) {
    const left = order[nc]!;
    const right = order[nc + 1]!;
    for (let r = 0; r < next.rows; r += 1) {
      let closed = false;
      if (right === left + 1) closed = interiorClosed(maze, "v", left, r);
      else if (left === right + 1) closed = interiorClosed(maze, "v", right, r);
      setInteriorWall(next, "v", nc, r, closed);
    }
  }

  next.start = { c: mapC(maze.start.c), r: maze.start.r };
  next.goal = { c: mapC(maze.goal.c), r: maze.goal.r };
  next.hatch = maze.hatch ? { c: mapC(maze.hatch.c), r: maze.hatch.r } : null;
  next.holes = maze.holes.map((hole) => ({ c: mapC(hole.c), r: hole.r }));
  next.tiles = maze.tiles.map((tile) => remapTileCol(tile, mapC));
  sealBorder(next);
  scrubSwitchWalls(next);
  return next;
}

/** Move row `from` to index `to` (0-based), keeping cell contents and adjacent seams. */
export function moveRow(maze: Maze, from: number, to: number): Maze {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return cloneMaze(maze);
  if (from === to || from < 0 || to < 0 || from >= maze.rows || to >= maze.rows) return cloneMaze(maze);

  const order = Array.from({ length: maze.rows }, (_, index) => index);
  const [taken] = order.splice(from, 1);
  order.splice(to, 0, taken!);
  const mapR = (r: number) => order.indexOf(r);

  const next = cloneMaze(maze);
  next.walls = Array.from({ length: next.rows }, () => Array.from({ length: next.cols }, () => 0));

  for (let nr = 0; nr < next.rows; nr += 1) {
    const or = order[nr]!;
    for (let c = 0; c < next.cols - 1; c += 1) {
      setInteriorWall(next, "v", c, nr, interiorClosed(maze, "v", c, or));
    }
  }
  for (let nr = 0; nr < next.rows - 1; nr += 1) {
    const above = order[nr]!;
    const below = order[nr + 1]!;
    for (let c = 0; c < next.cols; c += 1) {
      let closed = false;
      if (below === above + 1) closed = interiorClosed(maze, "h", c, above);
      else if (above === below + 1) closed = interiorClosed(maze, "h", c, below);
      setInteriorWall(next, "h", c, nr, closed);
    }
  }

  next.start = { c: maze.start.c, r: mapR(maze.start.r) };
  next.goal = { c: maze.goal.c, r: mapR(maze.goal.r) };
  next.hatch = maze.hatch ? { c: maze.hatch.c, r: mapR(maze.hatch.r) } : null;
  next.holes = maze.holes.map((hole) => ({ c: hole.c, r: mapR(hole.r) }));
  next.tiles = maze.tiles.map((tile) => remapTileRow(tile, mapR));
  sealBorder(next);
  scrubSwitchWalls(next);
  return next;
}

export function clearInterior(maze: Maze): void {
  for (const row of maze.walls) row.fill(0);
  sealBorder(maze);
  maze.holes = [];
  maze.tiles = [];
}

export function interiorClosed(maze: Maze, axis: WallAxis, c: number, r: number): boolean {
  const bit = axis === "v" ? Wall.east : Wall.south;
  return ((maze.walls[r]?.[c] ?? 0) & bit) !== 0;
}

export function setInteriorWall(maze: Maze, axis: WallAxis, c: number, r: number, closed: boolean): void {
  if (axis === "v") {
    if (c < 0 || r < 0 || c >= maze.cols - 1 || r >= maze.rows) return;
    writeBit(maze, c, r, Wall.east, closed);
    writeBit(maze, c + 1, r, Wall.west, closed);
  } else {
    if (c < 0 || r < 0 || c >= maze.cols || r >= maze.rows - 1) return;
    writeBit(maze, c, r, Wall.south, closed);
    writeBit(maze, c, r + 1, Wall.north, closed);
  }
  if (!closed) releaseSwitch(maze, { axis, c, r });
}

export function placeStart(maze: Maze, cell: GridPoint): boolean {
  if (!contains(maze, cell) || same(cell, maze.goal) || (maze.hatch && same(cell, maze.hatch))) return false;
  maze.start = { c: cell.c, r: cell.r };
  maze.holes = maze.holes.filter((hole) => !same(hole, cell));
  clearTile(maze, cell);
  return true;
}

export function placeGoal(maze: Maze, cell: GridPoint): boolean {
  if (!contains(maze, cell) || same(cell, maze.start) || (maze.hatch && same(cell, maze.hatch))) return false;
  maze.goal = { c: cell.c, r: cell.r };
  maze.holes = maze.holes.filter((hole) => !same(hole, cell));
  clearTile(maze, cell);
  return true;
}

export function setPit(maze: Maze, cell: GridPoint, pit: boolean): void {
  if (!paintable(maze, cell)) return;
  if (!pit) {
    maze.holes = maze.holes.filter((hole) => !same(hole, cell));
    return;
  }
  clearTile(maze, cell);
  if (!maze.holes.some((hole) => same(hole, cell))) maze.holes.push({ c: cell.c, r: cell.r });
}

export function clearFloor(maze: Maze, cell: GridPoint): void {
  if (!paintable(maze, cell)) return;
  stripCell(maze, cell);
}

export function setBoost(maze: Maze, cell: GridPoint, dir: Direction): void {
  if (!paintable(maze, cell)) return;
  stripCell(maze, cell);
  maze.tiles.push({ kind: "boost", c: cell.c, r: cell.r, dir });
}

export function setIce(maze: Maze, cell: GridPoint): void {
  if (!paintable(maze, cell)) return;
  stripCell(maze, cell);
  maze.tiles.push({ kind: "ice", c: cell.c, r: cell.r });
}

export function setCrumble(maze: Maze, cell: GridPoint): void {
  if (!paintable(maze, cell)) return;
  stripCell(maze, cell);
  maze.tiles.push({ kind: "crumble", c: cell.c, r: cell.r });
}

export function paintSwitch(maze: Maze, cell: GridPoint): void {
  if (!paintable(maze, cell)) return;
  const existing = tileAt(maze, cell.c, cell.r);
  if (existing?.kind === "switch") {
    clearTile(maze, cell);
    return;
  }
  stripCell(maze, cell);
  maze.tiles.push({ kind: "switch", c: cell.c, r: cell.r, tone: nextSwitchTone(maze), wall: null });
}

export function bindSwitchWall(maze: Maze, wall: WallRef): void {
  if (!interiorClosed(maze, wall.axis, wall.c, wall.r)) return;
  for (const tile of maze.tiles) {
    if (tile.kind === "switch" && tile.wall && sameWall(tile.wall, wall)) {
      tile.wall = null;
      return;
    }
  }
  for (let i = maze.tiles.length - 1; i >= 0; i -= 1) {
    const tile = maze.tiles[i];
    if (tile?.kind === "switch" && tile.wall === null) {
      tile.wall = { axis: wall.axis, c: wall.c, r: wall.r };
      return;
    }
  }
}

export function pendingSwitch(maze: Maze): boolean {
  return maze.tiles.some((tile) => tile.kind === "switch" && tile.wall === null);
}

/** Drop an unfinished switch plate or lone warp so pairing can end. */
export function cancelPendingPair(maze: Maze): boolean {
  const before = maze.tiles.length;
  maze.tiles = maze.tiles.filter((tile) => !(tile.kind === "switch" && tile.wall === null));
  const lone = loneWarpPair(maze);
  if (lone !== null) {
    maze.tiles = maze.tiles.filter((tile) => !(tile.kind === "warp" && tile.pair === lone));
  }
  return maze.tiles.length !== before;
}

export function paintWarp(maze: Maze, cell: GridPoint): void {
  if (!paintable(maze, cell)) return;
  const existing = tileAt(maze, cell.c, cell.r);
  if (existing?.kind === "warp") {
    clearTile(maze, cell);
    return;
  }
  stripCell(maze, cell);
  const pair = loneWarpPair(maze) ?? nextWarpPair(maze);
  maze.tiles.push({ kind: "warp", c: cell.c, r: cell.r, pair });
}

export function tileAt(maze: Maze, c: number, r: number): FloorTile | undefined {
  return maze.tiles.find((tile) => tile.c === c && tile.r === r);
}

export type LiftedTile =
  | { kind: "start" }
  | { kind: "goal" }
  | { kind: "hatch" }
  | { kind: "pit" }
  | { kind: "boost"; dir: Direction }
  | { kind: "warp"; pair: number }
  | { kind: "ice" }
  | { kind: "crumble" }
  | { kind: "switch"; tone: number; wall: WallRef | null };

export function liftAt(
  maze: Maze,
  cell: GridPoint,
  opts: { start: boolean; goal: boolean; hatch: boolean },
): LiftedTile | null {
  if (!contains(maze, cell)) return null;
  if (opts.start && same(cell, maze.start)) return { kind: "start" };
  if (opts.hatch && maze.hatch && same(cell, maze.hatch)) return { kind: "hatch" };
  if (opts.goal && same(cell, maze.goal)) return { kind: "goal" };
  if (maze.holes.some((hole) => same(hole, cell))) return { kind: "pit" };
  const tile = tileAt(maze, cell.c, cell.r);
  if (!tile) return null;
  if (tile.kind === "boost") return { kind: "boost", dir: tile.dir };
  if (tile.kind === "warp") return { kind: "warp", pair: tile.pair };
  if (tile.kind === "ice") return { kind: "ice" };
  if (tile.kind === "crumble") return { kind: "crumble" };
  return { kind: "switch", tone: tile.tone, wall: tile.wall ? { ...tile.wall } : null };
}

/** Whether a lifted tile can land on `to` without mutating the maze. Hatch is handled by the caller. */
export function canDropLifted(maze: Maze, from: GridPoint, to: GridPoint, lift: LiftedTile): boolean {
  if (lift.kind === "hatch") return false;
  if (!contains(maze, to)) return false;
  if (same(from, to)) return true;
  if (lift.kind === "start") return !same(to, maze.goal) && !(maze.hatch && same(to, maze.hatch));
  if (lift.kind === "goal") return !same(to, maze.start) && !(maze.hatch && same(to, maze.hatch));
  return !same(to, maze.start) && !same(to, maze.goal) && !(maze.hatch && same(to, maze.hatch));
}

/** Move a lifted tile from one cell to another. Hatch is handled by the caller. */
export function moveLifted(maze: Maze, from: GridPoint, to: GridPoint, lift: LiftedTile): boolean {
  if (lift.kind === "hatch") return false;
  if (!canDropLifted(maze, from, to, lift)) return false;
  if (same(from, to)) return true;
  if (!liftStillAt(maze, from, lift)) return false;

  if (lift.kind === "start") return placeStart(maze, to);
  if (lift.kind === "goal") return placeGoal(maze, to);

  stripCell(maze, from);
  stripCell(maze, to);
  if (lift.kind === "pit") maze.holes.push({ c: to.c, r: to.r });
  else if (lift.kind === "boost") maze.tiles.push({ kind: "boost", c: to.c, r: to.r, dir: lift.dir });
  else if (lift.kind === "warp") maze.tiles.push({ kind: "warp", c: to.c, r: to.r, pair: lift.pair });
  else if (lift.kind === "ice") maze.tiles.push({ kind: "ice", c: to.c, r: to.r });
  else if (lift.kind === "crumble") maze.tiles.push({ kind: "crumble", c: to.c, r: to.r });
  else maze.tiles.push({ kind: "switch", c: to.c, r: to.r, tone: lift.tone, wall: lift.wall });
  return true;
}

function liftStillAt(maze: Maze, cell: GridPoint, lift: LiftedTile): boolean {
  if (lift.kind === "start") return same(cell, maze.start);
  if (lift.kind === "goal") return same(cell, maze.goal);
  if (lift.kind === "hatch") return !!maze.hatch && same(cell, maze.hatch);
  if (lift.kind === "pit") return maze.holes.some((hole) => same(hole, cell));
  const tile = tileAt(maze, cell.c, cell.r);
  if (!tile || tile.kind !== lift.kind) return false;
  if (lift.kind === "boost") return tile.kind === "boost" && tile.dir === lift.dir;
  if (lift.kind === "warp") return tile.kind === "warp" && tile.pair === lift.pair;
  if (lift.kind === "switch") {
    return tile.kind === "switch" && tile.tone === lift.tone;
  }
  return true;
}

export function loneWarpPair(maze: Maze): number | null {
  const counts = new Map<number, number>();
  for (const tile of maze.tiles) {
    if (tile.kind !== "warp") continue;
    counts.set(tile.pair, (counts.get(tile.pair) ?? 0) + 1);
  }
  for (const [pair, count] of counts) {
    if (count === 1) return pair;
  }
  return null;
}

function cloneTile(tile: FloorTile): FloorTile {
  if (tile.kind === "switch") return { ...tile, wall: tile.wall ? { ...tile.wall } : null };
  return { ...tile };
}

function releaseSwitch(maze: Maze, wall: WallRef): void {
  for (const tile of maze.tiles) {
    if (tile.kind === "switch" && tile.wall && sameWall(tile.wall, wall)) tile.wall = null;
  }
}

function sameWall(a: WallRef, b: WallRef): boolean {
  return a.axis === b.axis && a.c === b.c && a.r === b.r;
}

function nextSwitchTone(maze: Maze): number {
  let next = 0;
  for (const tile of maze.tiles) {
    if (tile.kind === "switch" && tile.tone >= next) next = tile.tone + 1;
  }
  return next % SWITCH_COLOR_COUNT;
}

function stripCell(maze: Maze, cell: GridPoint): void {
  clearTile(maze, cell);
  maze.holes = maze.holes.filter((hole) => !same(hole, cell));
}

function clearTile(maze: Maze, cell: GridPoint): void {
  maze.tiles = maze.tiles.filter((tile) => tile.c !== cell.c || tile.r !== cell.r);
}

function paintable(maze: Maze, cell: GridPoint): boolean {
  return contains(maze, cell)
    && !same(cell, maze.start)
    && !same(cell, maze.goal)
    && !(maze.hatch && same(cell, maze.hatch));
}

function nextWarpPair(maze: Maze): number {
  let next = 0;
  for (const tile of maze.tiles) {
    if (tile.kind === "warp" && tile.pair >= next) next = tile.pair + 1;
  }
  return next;
}

function clampSize(value: number): number {
  return Math.min(MAZE_MAX, Math.max(MAZE_MIN, Math.round(value)));
}

function clampCell(cell: GridPoint, cols: number, rows: number): GridPoint {
  return {
    c: Math.min(Math.max(cell.c, 0), cols - 1),
    r: Math.min(Math.max(cell.r, 0), rows - 1),
  };
}

function scrubSwitchWalls(maze: Maze): void {
  for (const tile of maze.tiles) {
    if (tile.kind !== "switch" || !tile.wall) continue;
    const wall = tile.wall;
    const inside = wall.axis === "v"
      ? wall.c >= 0 && wall.r >= 0 && wall.c < maze.cols - 1 && wall.r < maze.rows
      : wall.c >= 0 && wall.r >= 0 && wall.c < maze.cols && wall.r < maze.rows - 1;
    if (!inside || !interiorClosed(maze, wall.axis, wall.c, wall.r)) tile.wall = null;
  }
}

function shiftPointCol(point: GridPoint, at: number, dir: 1 | -1): GridPoint {
  if (dir === 1) return point.c >= at ? { c: point.c + 1, r: point.r } : { ...point };
  return point.c > at ? { c: point.c - 1, r: point.r } : { ...point };
}

function shiftPointRow(point: GridPoint, at: number, dir: 1 | -1): GridPoint {
  if (dir === 1) return point.r >= at ? { c: point.c, r: point.r + 1 } : { ...point };
  return point.r > at ? { c: point.c, r: point.r - 1 } : { ...point };
}

function shiftWallCol(wall: WallRef, at: number, dir: 1 | -1): WallRef | null {
  if (dir === 1) {
    if (wall.c >= at) return { ...wall, c: wall.c + 1 };
    return { ...wall };
  }
  if (wall.axis === "v" && (wall.c === at || wall.c === at - 1)) return null;
  if (wall.axis === "h" && wall.c === at) return null;
  if (wall.c > at) return { ...wall, c: wall.c - 1 };
  return { ...wall };
}

function shiftWallRow(wall: WallRef, at: number, dir: 1 | -1): WallRef | null {
  if (dir === 1) {
    if (wall.r >= at) return { ...wall, r: wall.r + 1 };
    return { ...wall };
  }
  if (wall.axis === "h" && (wall.r === at || wall.r === at - 1)) return null;
  if (wall.axis === "v" && wall.r === at) return null;
  if (wall.r > at) return { ...wall, r: wall.r - 1 };
  return { ...wall };
}

function shiftTileCol(tile: FloorTile, at: number, dir: 1 | -1): FloorTile {
  const point = shiftPointCol(tile, at, dir);
  if (tile.kind === "switch") {
    const wall = tile.wall ? shiftWallCol(tile.wall, at, dir) : null;
    return { ...tile, c: point.c, r: point.r, wall };
  }
  return { ...tile, c: point.c, r: point.r };
}

function shiftTileRow(tile: FloorTile, at: number, dir: 1 | -1): FloorTile {
  const point = shiftPointRow(tile, at, dir);
  if (tile.kind === "switch") {
    const wall = tile.wall ? shiftWallRow(tile.wall, at, dir) : null;
    return { ...tile, c: point.c, r: point.r, wall };
  }
  return { ...tile, c: point.c, r: point.r };
}

function remapWallCol(wall: WallRef, mapC: (c: number) => number): WallRef | null {
  if (wall.axis === "h") return { axis: "h", c: mapC(wall.c), r: wall.r };
  const a = mapC(wall.c);
  const b = mapC(wall.c + 1);
  if (Math.abs(a - b) !== 1) return null;
  return { axis: "v", c: Math.min(a, b), r: wall.r };
}

function remapWallRow(wall: WallRef, mapR: (r: number) => number): WallRef | null {
  if (wall.axis === "v") return { axis: "v", c: wall.c, r: mapR(wall.r) };
  const a = mapR(wall.r);
  const b = mapR(wall.r + 1);
  if (Math.abs(a - b) !== 1) return null;
  return { axis: "h", c: wall.c, r: Math.min(a, b) };
}

function remapTileCol(tile: FloorTile, mapC: (c: number) => number): FloorTile {
  const next = cloneTile(tile);
  next.c = mapC(tile.c);
  if (next.kind === "switch") next.wall = next.wall ? remapWallCol(next.wall, mapC) : null;
  return next;
}

function remapTileRow(tile: FloorTile, mapR: (r: number) => number): FloorTile {
  const next = cloneTile(tile);
  next.r = mapR(tile.r);
  if (next.kind === "switch") next.wall = next.wall ? remapWallRow(next.wall, mapR) : null;
  return next;
}

function spareAfterDelete(maze: Maze, avoid: Array<GridPoint | null>): GridPoint {
  const blocked = (cell: GridPoint) => avoid.some((item) => item !== null && same(item, cell));
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      const cell = { c, r };
      if (!blocked(cell)) return cell;
    }
  }
  return { c: 0, r: 0 };
}

function separateEnds(maze: Maze): void {
  if (!same(maze.start, maze.goal)) return;
  const corners = [
    { c: maze.cols - 1, r: maze.rows - 1 },
    { c: 0, r: maze.rows - 1 },
    { c: maze.cols - 1, r: 0 },
    { c: 0, r: 0 },
  ];
  const goal = corners.find((cell) => !same(cell, maze.start));
  if (goal) maze.goal = goal;
}

function contains(maze: Maze, cell: GridPoint): boolean {
  return cell.c >= 0 && cell.r >= 0 && cell.c < maze.cols && cell.r < maze.rows;
}

function same(a: GridPoint, b: GridPoint): boolean {
  return a.c === b.c && a.r === b.r;
}

function writeBit(maze: Maze, c: number, r: number, bit: number, closed: boolean): void {
  const row = maze.walls[r];
  if (!row) return;
  const bits = row[c];
  if (bits === undefined) return;
  row[c] = closed ? bits | bit : bits & ~bit;
}

function sealBorder(maze: Maze): void {
  for (let c = 0; c < maze.cols; c += 1) {
    writeBit(maze, c, 0, Wall.north, true);
    writeBit(maze, c, maze.rows - 1, Wall.south, true);
  }
  for (let r = 0; r < maze.rows; r += 1) {
    writeBit(maze, 0, r, Wall.west, true);
    writeBit(maze, maze.cols - 1, r, Wall.east, true);
  }
}

/** Clear walls along the seam created by inserting a column at `at`. */
function openInsertSeamCol(maze: Maze, at: number): void {
  for (let r = 0; r < maze.rows; r += 1) {
    if (at > 0) writeBit(maze, at - 1, r, Wall.east, false);
    if (at < maze.cols) writeBit(maze, at, r, Wall.west, false);
    if (at + 1 < maze.cols) writeBit(maze, at + 1, r, Wall.west, false);
  }
}

/** Clear walls along the seam created by inserting a row at `at`. */
function openInsertSeamRow(maze: Maze, at: number): void {
  for (let c = 0; c < maze.cols; c += 1) {
    if (at > 0) writeBit(maze, c, at - 1, Wall.south, false);
    if (at < maze.rows) writeBit(maze, c, at, Wall.north, false);
    if (at + 1 < maze.rows) writeBit(maze, c, at + 1, Wall.north, false);
  }
}

function openWall(
  walls: number[][],
  c: number,
  r: number,
  nc: number,
  nr: number,
  wall: number,
  opposite: number,
): void {
  const row = walls[r];
  const next = walls[nr];
  if (!row || !next) return;
  const bits = row[c];
  const nextBits = next[nc];
  if (bits === undefined || nextBits === undefined) return;
  row[c] = bits & ~wall;
  next[nc] = nextBits & ~opposite;
}

function braid(walls: number[][], cols: number, rows: number, rand: () => number, extras: number): void {
  let made = 0;
  let guard = 0;
  while (made < extras && guard < 600) {
    guard += 1;
    const c = Math.floor(rand() * cols);
    const r = Math.floor(rand() * rows);
    const dir = DIRS[Math.floor(rand() * DIRS.length)];
    if (!dir) continue;
    const nc = c + dir.dc;
    const nr = r + dir.dr;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
    const bits = walls[r]?.[c];
    if (bits === undefined || (bits & dir.wall) === 0) continue;
    openWall(walls, c, r, nc, nr, dir.wall, dir.opposite);
    made += 1;
  }
}

function farthest(walls: number[][], cols: number, rows: number, start: GridPoint): GridPoint {
  const dist = new Map<string, number>();
  const queue: GridPoint[] = [start];
  dist.set(key(start), 0);
  let best = start;
  let bestDist = 0;

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (!current) break;
    const currentDist = dist.get(key(current)) ?? 0;
    if (currentDist > bestDist) {
      best = current;
      bestDist = currentDist;
    }
    for (const next of neighbors(walls, cols, rows, current)) {
      const id = key(next);
      if (dist.has(id)) continue;
      dist.set(id, currentDist + 1);
      queue.push(next);
    }
  }

  if (!same(best, start)) return { c: best.c, r: best.r };
  const corners = [
    { c: cols - 1, r: rows - 1 },
    { c: 0, r: rows - 1 },
    { c: cols - 1, r: 0 },
  ];
  return corners.find((cell) => !same(cell, start)) ?? { c: cols - 1, r: rows - 1 };
}

function shortestPath(
  walls: number[][],
  cols: number,
  rows: number,
  start: GridPoint,
  goal: GridPoint,
): Set<string> {
  const prev = new Map<string, string | null>();
  const queue: GridPoint[] = [start];
  prev.set(key(start), null);

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (!current) break;
    if (current.c === goal.c && current.r === goal.r) break;
    for (const next of neighbors(walls, cols, rows, current)) {
      const id = key(next);
      if (prev.has(id)) continue;
      prev.set(id, key(current));
      queue.push(next);
    }
  }

  if (!prev.has(key(goal))) throw new Error("Maze has no path to the goal.");

  const onPath = new Set<string>();
  let cursor: string | null = key(goal);
  while (cursor) {
    onPath.add(cursor);
    cursor = prev.get(cursor) ?? null;
  }
  return onPath;
}

function pickHoles(
  walls: number[][],
  cols: number,
  rows: number,
  start: GridPoint,
  goal: GridPoint,
  onPath: Set<string>,
  rand: () => number,
  count: number,
): GridPoint[] {
  const candidates: GridPoint[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = { c, r };
      if (onPath.has(key(cell))) continue;
      if (manhattan(cell, start) < 3 || manhattan(cell, goal) < 2) continue;
      const besidePath = neighbors(walls, cols, rows, cell).some((next) => onPath.has(key(next)));
      if (besidePath) candidates.push(cell);
    }
  }

  const chosen: GridPoint[] = [];
  for (const cell of shuffled(candidates, rand)) {
    const spaced = chosen.every((other) => manhattan(other, cell) > 2);
    if (!spaced) continue;
    chosen.push(cell);
    if (chosen.length === count) break;
  }
  return chosen;
}

function neighbors(walls: number[][], cols: number, rows: number, cell: GridPoint): GridPoint[] {
  const bits = walls[cell.r]?.[cell.c] ?? 0;
  const found: GridPoint[] = [];
  if ((bits & Wall.north) === 0 && cell.r > 0) found.push({ c: cell.c, r: cell.r - 1 });
  if ((bits & Wall.east) === 0 && cell.c + 1 < cols) found.push({ c: cell.c + 1, r: cell.r });
  if ((bits & Wall.south) === 0 && cell.r + 1 < rows) found.push({ c: cell.c, r: cell.r + 1 });
  if ((bits & Wall.west) === 0 && cell.c > 0) found.push({ c: cell.c - 1, r: cell.r });
  return found;
}

function manhattan(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}

function key(cell: GridPoint): string {
  return `${cell.c},${cell.r}`;
}

function shuffled(items: GridPoint[], rand: () => number): GridPoint[] {
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

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
