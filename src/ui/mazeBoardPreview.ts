import {
  WARP_COLOR_COUNT,
  hasCoin,
  hasGhost,
  hasHeart,
  hasStar,
  hasWings,
  interiorClosed,
  oneWayAt,
  tileAt,
  type Direction,
  type Maze,
  type WallAxis,
} from "../core/maze.ts";
import { parseFloorTheme } from "../core/theme.ts";
import { installCrumblePreviewCss } from "../render/crumblePaint.ts";
import editor from "./editor.module.css";
import { setPickupIcon, type CellMarkIcon } from "./icons.ts";
import styles from "./mazeBoardPreview.module.css";

type CellKind =
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

type CellPaint = {
  kind: CellKind;
  dir?: Direction;
  pair?: number;
  open?: boolean;
};

/** Read-only board that matches the level editor’s cell/wall look. */
export function renderMazeBoardPreview(maze: Maze, opts: { showGoal?: boolean; landing?: boolean } = {}): HTMLElement {
  installCrumblePreviewCss();
  const showGoal = opts.showGoal !== false;
  const landing = opts.landing === true;
  const theme = parseFloorTheme(maze.theme);
  const wrap = document.createElement("div");
  wrap.className = styles.preview;
  wrap.setAttribute("aria-hidden", "true");

  const sheet = document.createElement("div");
  sheet.className = editor.sheet;
  sheet.dataset.theme = theme;
  sheet.style.setProperty("--cols", String(maze.cols));
  sheet.style.setProperty("--rows", String(maze.rows));
  // Thin outer rim — full editor edge/frame reads as a slab in card thumbs.
  sheet.style.setProperty("--edge", "4px");
  sheet.style.setProperty("--frame", "3px");
  sheet.style.setProperty("--rail", "0px");
  sheet.style.setProperty("--cell-max", "56px");

  const frame = document.createElement("div");
  frame.className = editor.playFrame;

  const board = document.createElement("div");
  board.className = editor.board;
  board.dataset.theme = theme;
  board.style.setProperty("--cols", String(maze.cols));
  board.style.setProperty("--rows", String(maze.rows));

  const openPairs = openWarpPairs(maze);
  const cells = new Map<string, HTMLElement>();

  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      const cell = document.createElement("div");
      cell.className = editor.cell;
      cell.dataset.cell = "";
      cell.dataset.c = String(c);
      cell.dataset.r = String(r);
      cell.style.setProperty("--c", String(c));
      cell.style.setProperty("--r", String(r));
      const pickup = document.createElement("span");
      pickup.className = editor.pickup;
      cell.append(pickup);
      cells.set(`${c},${r}`, cell);
      board.append(cell);
    }
  }

  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols - 1; c += 1) {
      board.append(makeWall(maze, "v", c, r));
    }
  }
  for (let r = 0; r < maze.rows - 1; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      board.append(makeWall(maze, "h", c, r));
    }
  }

  for (const [id, cell] of cells) {
    const [c, r] = id.split(",").map(Number);
    if (c === undefined || r === undefined) continue;
    const paint = describeCell(maze, c, r, openPairs, showGoal, landing);
    cell.dataset.kind = paint.kind;
    if (paint.dir) cell.dataset.dir = paint.dir;
    if (paint.pair !== undefined) cell.dataset.pair = String(paint.pair);
    if (paint.open) cell.dataset.open = "true";

    const spot = { c, r };
    const otherPickup = (kind: CellKind) =>
      (["heart", "coin", "star", "wings", "ghost"] as const).some((other) => other !== kind && paint.kind === other);
    const showHeart = paint.kind === "heart" || (hasHeart(maze, spot) && !otherPickup("heart"));
    const showCoin = paint.kind === "coin" || (hasCoin(maze, spot) && !otherPickup("coin"));
    const showStar = paint.kind === "star" || (hasStar(maze, spot) && !otherPickup("star"));
    const showWings = paint.kind === "wings" || (hasWings(maze, spot) && !otherPickup("wings"));
    const showGhost = paint.kind === "ghost" || (hasGhost(maze, spot) && !otherPickup("ghost"));
    if (showHeart) cell.dataset.heart = "true";
    if (showCoin) cell.dataset.coin = "true";
    if (showStar) cell.dataset.star = "true";
    if (showWings) cell.dataset.wings = "true";
    if (showGhost) cell.dataset.ghost = "true";
    const pickupKind: CellMarkIcon | null = showHeart
      ? "heart"
      : showCoin
        ? "coin"
        : showStar
          ? "star"
          : showWings
            ? "wings"
            : showGhost
              ? "ghost"
              : paint.kind === "boost" && paint.dir
                ? ({ n: "north", e: "east", s: "south", w: "west" } as const)[paint.dir]
                : null;
    const pickup = cell.firstElementChild as HTMLElement | null;
    if (pickup) setPickupIcon(pickup, pickupKind);
  }

  sheet.append(frame, board);
  wrap.append(sheet);
  return wrap;
}

function makeWall(maze: Maze, axis: WallAxis, c: number, r: number): HTMLElement {
  const wall = document.createElement("div");
  wall.className = editor.wall;
  wall.dataset.wall = "";
  wall.dataset.axis = axis;
  wall.dataset.c = String(c);
  wall.dataset.r = String(r);
  wall.style.setProperty("--c", String(c));
  wall.style.setProperty("--r", String(r));
  const open = !interiorClosed(maze, axis, c, r);
  wall.dataset.open = String(open);
  const tone = switchTone(maze, axis, c, r);
  if (tone !== null) wall.dataset.pair = String(tone);
  const gate = open ? undefined : oneWayAt(maze, { axis, c, r });
  if (gate) wall.dataset.oneWay = gate.dir;
  if (axis === "v") {
    const joinN = !open && r > 0
      && (interiorClosed(maze, "h", c, r - 1) || interiorClosed(maze, "h", c + 1, r - 1));
    const joinS = !open
      && (interiorClosed(maze, "h", c, r) || interiorClosed(maze, "h", c + 1, r));
    if (joinN) wall.dataset.joinN = "true";
    if (joinS) wall.dataset.joinS = "true";
  } else {
    const joinW = !open && c > 0
      && (interiorClosed(maze, "v", c - 1, r) || interiorClosed(maze, "v", c - 1, r + 1));
    const joinE = !open
      && (interiorClosed(maze, "v", c, r) || interiorClosed(maze, "v", c, r + 1));
    if (joinW) wall.dataset.joinW = "true";
    if (joinE) wall.dataset.joinE = "true";
  }
  return wall;
}

function openWarpPairs(maze: Maze): Set<number> {
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

function switchTone(maze: Maze, axis: WallAxis, c: number, r: number): number | null {
  for (const tile of maze.tiles) {
    if (tile.kind !== "switch" || !tile.wall) continue;
    if (tile.wall.axis === axis && tile.wall.c === c && tile.wall.r === r) return tile.tone % 6;
  }
  return null;
}

function describeCell(
  maze: Maze,
  c: number,
  r: number,
  openPairs: Set<number>,
  showGoal: boolean,
  _landing: boolean,
): CellPaint {
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
