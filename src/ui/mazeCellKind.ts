import {
  WARP_COLOR_COUNT,
  hasCoin,
  hasGhost,
  hasHeart,
  hasStar,
  hasWings,
  tileAt,
  type Direction,
  type Maze,
} from "../core/maze.ts";

export type MazeCellKind =
  | "floor"
  | "start"
  | "goal"
  | "hatch"
  | "pit"
  | "boost"
  | "ice"
  | "crumble"
  | "block"
  | "warp"
  | "switch"
  | "heart"
  | "coin"
  | "star"
  | "wings"
  | "ghost";

export type MazeCellPaint = {
  kind: MazeCellKind;
  dir?: Direction;
  pair?: number;
  open?: boolean;
};

/** Thumbnail-friendly kind (no pickups — those are separate markers in rich previews). */
export function thumbnailCellKind(maze: Maze, c: number, r: number): MazeCellKind {
  if (maze.start.c === c && maze.start.r === r) return "start";
  if (maze.hatch && maze.hatch.c === c && maze.hatch.r === r) return "hatch";
  if (!maze.hatch && maze.goal.c === c && maze.goal.r === r) return "goal";
  if (maze.holes.some((hole) => hole.c === c && hole.r === r)) return "pit";
  const tile = maze.tiles.find((item) => item.c === c && item.r === r);
  if (!tile) return "floor";
  if (tile.kind === "boost") return "boost";
  if (tile.kind === "ice") return "ice";
  if (tile.kind === "crumble") return "crumble";
  if (tile.kind === "block") return "block";
  if (tile.kind === "warp") return "warp";
  return "switch";
}

export function openWarpPairs(maze: Maze): Set<number> {
  const counts = new Map<number, number>();
  for (const tile of maze.tiles) {
    if (tile.kind !== "warp") continue;
    counts.set(tile.pair, (counts.get(tile.pair) ?? 0) + 1);
  }
  const open = new Set<number>();
  for (const [pair, count] of counts) {
    if (count < 2) open.add(pair);
  }
  return open;
}

/** Rich board paint including pickups and warp/switch metadata. */
export function describeCell(
  maze: Maze,
  c: number,
  r: number,
  openPairs: Set<number>,
  showGoal: boolean,
): MazeCellPaint {
  if (maze.start.c === c && maze.start.r === r) {
    return { kind: "start" };
  }
  if (maze.hatch && maze.hatch.c === c && maze.hatch.r === r) return { kind: "hatch" };
  if (showGoal && maze.goal.c === c && maze.goal.r === r) return { kind: "goal" };
  if (maze.holes.some((hole) => hole.c === c && hole.r === r)) return { kind: "pit" };
  const tile = tileAt(maze, c, r);
  if (tile?.kind === "boost") return { kind: "boost", dir: tile.dir };
  if (tile?.kind === "ice") return { kind: "ice" };
  if (tile?.kind === "crumble") return { kind: "crumble" };
  if (tile?.kind === "block") return { kind: "block" };
  if (tile?.kind === "switch") {
    return { kind: "switch", pair: tile.tone % 6, open: tile.wall === null };
  }
  if (tile?.kind === "warp") {
    return {
      kind: "warp",
      pair: tile.pair % WARP_COLOR_COUNT,
      open: openPairs.has(tile.pair),
    };
  }
  if (hasHeart(maze, { c, r })) return { kind: "heart" };
  if (hasCoin(maze, { c, r })) return { kind: "coin" };
  if (hasStar(maze, { c, r })) return { kind: "star" };
  if (hasWings(maze, { c, r })) return { kind: "wings" };
  if (hasGhost(maze, { c, r })) return { kind: "ghost" };
  return { kind: "floor" };
}
