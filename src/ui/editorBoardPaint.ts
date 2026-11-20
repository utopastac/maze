import {
  WARP_COLOR_COUNT,
  hasCoin,
  hasGhost,
  hasHeart,
  hasStar,
  hasWings,
  tileAt,
  type Direction,
  type LiftedTile,
  type Maze,
  type WallAxis,
} from "../core/maze.ts";
import { DIR_WORD } from "./editorTools.ts";

export type CellKind = "start" | "goal" | "pit" | "floor" | "boost" | "warp" | "ice" | "crumble" | "block" | "switch" | "hatch" | "heart" | "coin" | "star" | "wings" | "ghost";
export const PICKUP_KINDS: readonly CellKind[] = ["heart", "coin", "star", "wings", "ghost"];

export { openWarpPairs } from "./mazeCellKind.ts";

export function previewWarpPair(maze: Maze): number {
  let next = 0;
  for (const tile of maze.tiles) {
    if (tile.kind === "warp" && tile.pair >= next) next = tile.pair + 1;
  }
  return next;
}

export function previewSwitchTone(maze: Maze): number {
  const pending = maze.tiles.find((tile) => tile.kind === "switch" && tile.wall === null);
  if (pending?.kind === "switch") return pending.tone;
  let next = 0;
  for (const tile of maze.tiles) {
    if (tile.kind === "switch" && tile.tone >= next) next = tile.tone + 1;
  }
  return next;
}

export type CellPaint = { kind: CellKind; dir?: Direction; pair?: number; open?: boolean; label: string };

export function describeCell(
  maze: Maze,
  c: number,
  r: number,
  openPairs: Set<number>,
  showGoal: boolean,
  landing: boolean,
): CellPaint {
  const where = `column ${c + 1}, row ${r + 1}`;
  if (maze.start.c === c && maze.start.r === r) {
    return { kind: "start", label: `${landing ? "Landing" : "Start"}, ${where}` };
  }
  if (maze.hatch && maze.hatch.c === c && maze.hatch.r === r) return { kind: "hatch", label: `Hatch, ${where}` };
  if (showGoal && maze.goal.c === c && maze.goal.r === r) return { kind: "goal", label: `Exit, ${where}` };
  if (maze.holes.some((hole) => hole.c === c && hole.r === r)) return { kind: "pit", label: `Pit, ${where}` };
  const tile = tileAt(maze, c, r);
  if (tile?.kind === "boost") return { kind: "boost", dir: tile.dir, label: `Boost ${DIR_WORD[tile.dir]}, ${where}` };
  if (tile?.kind === "ice") return { kind: "ice", label: `Ice, ${where}` };
  if (tile?.kind === "crumble") return { kind: "crumble", label: `Crumble, ${where}` };
  if (tile?.kind === "block") return { kind: "block", label: `Block, ${where}` };
  if (tile?.kind === "switch") {
    return {
      kind: "switch",
      pair: tile.tone % 6,
      open: tile.wall === null,
      label: tile.wall ? `Switch, ${where}` : `Unlinked switch, ${where}`,
    };
  }
  if (tile?.kind === "warp") {
    const open = openPairs.has(tile.pair);
    const color = tile.pair % WARP_COLOR_COUNT;
    return {
      kind: "warp",
      pair: color,
      open,
      label: open ? `Open warp, ${where}` : `Warp ${color + 1}, ${where}`,
    };
  }
  if (hasHeart(maze, { c, r })) return { kind: "heart", label: `Heart, ${where}` };
  if (hasCoin(maze, { c, r })) return { kind: "coin", label: `Coin, ${where}` };
  if (hasStar(maze, { c, r })) return { kind: "star", label: `Star, ${where}` };
  if (hasWings(maze, { c, r })) return { kind: "wings", label: `Wings, ${where}` };
  if (hasGhost(maze, { c, r })) return { kind: "ghost", label: `Ghost, ${where}` };
  return { kind: "floor", label: `Floor, ${where}` };
}

export function describeLift(lift: LiftedTile, c: number, r: number, landing: boolean): CellPaint {
  const where = `column ${c + 1}, row ${r + 1}`;
  if (lift.kind === "start") return { kind: "start", label: `${landing ? "Landing" : "Start"}, ${where}` };
  if (lift.kind === "goal") return { kind: "goal", label: `Exit, ${where}` };
  if (lift.kind === "hatch") return { kind: "hatch", label: `Hatch, ${where}` };
  if (lift.kind === "pit") return { kind: "pit", label: `Pit, ${where}` };
  if (lift.kind === "heart") return { kind: "heart", label: `Heart, ${where}` };
  if (lift.kind === "coin") return { kind: "coin", label: `Coin, ${where}` };
  if (lift.kind === "star") return { kind: "star", label: `Star, ${where}` };
  if (lift.kind === "wings") return { kind: "wings", label: `Wings, ${where}` };
  if (lift.kind === "ghost") return { kind: "ghost", label: `Ghost, ${where}` };
  if (lift.kind === "boost") return { kind: "boost", dir: lift.dir, label: `Boost ${DIR_WORD[lift.dir]}, ${where}` };
  if (lift.kind === "ice") return { kind: "ice", label: `Ice, ${where}` };
  if (lift.kind === "crumble") return { kind: "crumble", label: `Crumble, ${where}` };
  if (lift.kind === "block") return { kind: "block", label: `Block, ${where}` };
  if (lift.kind === "warp") {
    return {
      kind: "warp",
      pair: lift.pair % WARP_COLOR_COUNT,
      label: `Warp ${(lift.pair % WARP_COLOR_COUNT) + 1}, ${where}`,
    };
  }
  return {
    kind: "switch",
    pair: lift.tone % 6,
    open: lift.wall === null,
    label: lift.wall ? `Switch, ${where}` : `Unlinked switch, ${where}`,
  };
}

export function floorName(index: number): string {
  return `Floor ${index + 1}`;
}

export function switchTone(maze: Maze, axis: WallAxis, c: number, r: number): number | null {
  for (const tile of maze.tiles) {
    if (tile.kind !== "switch" || !tile.wall) continue;
    if (tile.wall.axis === axis && tile.wall.c === c && tile.wall.r === r) return tile.tone % 6;
  }
  return null;
}

export function samePoint(a: { c: number; r: number }, b: { c: number; r: number }): boolean {
  return a.c === b.c && a.r === b.r;
}

export function elementAt(x: number, y: number, attr: "data-wall" | "data-cell"): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el instanceof HTMLElement && el.hasAttribute(attr)) return el;
  }
  return null;
}
