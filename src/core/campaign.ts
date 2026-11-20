import { AUTHORED_FLOORS } from "./authoredFloors.ts";
import { decorateMaze } from "./decorate.ts";
import {
  carveFloor,
  cloneMaze,
  ensureMaze,
  type GridPoint,
  type Maze,
} from "./maze.ts";
import { decodeLevel } from "./share.ts";
import { parseFloorTheme, themeForFloor, type FloorThemeId } from "./theme.ts";

export { decorateMaze } from "./decorate.ts";

export const CAMPAIGN_FLOORS = 100;
export const CAMPAIGN_LIVES = 3;

const SIZE_MIN = 5;
const SIZE_SPAN = 11;

export interface CampaignFloor {
  maze: Maze;
}

export interface Campaign {
  seed: number;
  floors: CampaignFloor[];
}

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
    maze.theme = themeForFloor(index);
    decorateMaze(maze, seed + index * 131, { richness: t, index });
    floors.push({ maze });
    landing = { ...(maze.hatch ?? maze.start) };
  }
  return applyAuthoredFloors({ seed, floors });
}

/** Overlay pasted editor models onto the procedural campaign, then re-chain drops. */
export function applyAuthoredFloors(campaign: Campaign): Campaign {
  const floors = campaign.floors.map((floor, index) => {
    const code = AUTHORED_FLOORS[index];
    if (!code) return { maze: cloneMaze(floor.maze) };
    const tower = decodeLevel(code);
    const maze = tower?.floors[0];
    if (!maze) return { maze: cloneMaze(floor.maze) };
    return { maze: cloneMaze(maze) };
  });
  chainCampaignFloors(floors);
  return { seed: campaign.seed, floors };
}

function chainCampaignFloors(floors: CampaignFloor[]): void {
  for (let index = 0; index < floors.length; index += 1) {
    const maze = floors[index]?.maze;
    if (!maze) continue;
    ensureMaze(maze);
    const last = index === floors.length - 1;
    if (last) maze.hatch = null;
    else {
      const drop = maze.hatch && insideMaze(maze, maze.hatch) ? maze.hatch : { ...maze.goal };
      maze.hatch = same(drop, maze.start) ? spareDrop(maze, maze.start) : drop;
      maze.holes = maze.holes.filter((hole) => !same(hole, maze.hatch as GridPoint));
      maze.tiles = maze.tiles.filter((tile) => !same(tile, maze.hatch as GridPoint));
    }
    if (index > 0) {
      const hatch = floors[index - 1]?.maze.hatch;
      if (hatch && insideMaze(maze, hatch)) maze.start = { c: hatch.c, r: hatch.r };
    }
    maze.holes = maze.holes.filter((hole) => !same(hole, maze.start) && !same(hole, maze.goal));
    maze.tiles = maze.tiles.filter((tile) => !same(tile, maze.start) && !same(tile, maze.goal));
    if (maze.hatch) {
      maze.holes = maze.holes.filter((hole) => !same(hole, maze.hatch as GridPoint));
      maze.tiles = maze.tiles.filter((tile) => !same(tile, maze.hatch as GridPoint));
    }
    maze.hearts = maze.hearts.filter(
      (heart) => !same(heart, maze.start) && !same(heart, maze.goal)
        && !(maze.hatch && same(heart, maze.hatch))
        && !maze.holes.some((hole) => same(hole, heart))
        && maze.tiles.every((tile) => tile.kind !== "block" || !same(tile, heart)),
    );
    maze.coins = maze.coins.filter(
      (coin) => !same(coin, maze.start) && !same(coin, maze.goal)
        && !(maze.hatch && same(coin, maze.hatch))
        && !maze.holes.some((hole) => same(hole, coin))
        && maze.tiles.every((tile) => tile.kind !== "block" || !same(tile, coin))
        && !maze.hearts.some((heart) => same(heart, coin)),
    );
    maze.stars = maze.stars.filter(
      (star) => !same(star, maze.start) && !same(star, maze.goal)
        && !(maze.hatch && same(star, maze.hatch))
        && !maze.holes.some((hole) => same(hole, star))
        && maze.tiles.every((tile) => tile.kind !== "block" || !same(tile, star))
        && !maze.hearts.some((heart) => same(heart, star))
        && !maze.coins.some((coin) => same(coin, star)),
    );
    maze.wings = maze.wings.filter(
      (wing) => !same(wing, maze.start) && !same(wing, maze.goal)
        && !(maze.hatch && same(wing, maze.hatch))
        && !maze.holes.some((hole) => same(hole, wing))
        && maze.tiles.every((tile) => tile.kind !== "block" || !same(tile, wing))
        && !maze.hearts.some((heart) => same(heart, wing))
        && !maze.coins.some((coin) => same(coin, wing))
        && !maze.stars.some((star) => same(star, wing)),
    );
    maze.ghosts = maze.ghosts.filter(
      (ghost) => !same(ghost, maze.start) && !same(ghost, maze.goal)
        && !(maze.hatch && same(ghost, maze.hatch))
        && !maze.holes.some((hole) => same(hole, ghost))
        && maze.tiles.every((tile) => tile.kind !== "block" || !same(tile, ghost))
        && !maze.hearts.some((heart) => same(heart, ghost))
        && !maze.coins.some((coin) => same(coin, ghost))
        && !maze.stars.some((star) => same(star, ghost))
        && !maze.wings.some((wing) => same(wing, ghost)),
    );
  }
}

function spareDrop(maze: Maze, start: GridPoint): GridPoint {
  const corners = [
    { c: maze.cols - 1, r: maze.rows - 1 },
    { c: 0, r: maze.rows - 1 },
    { c: maze.cols - 1, r: 0 },
    { c: 0, r: 0 },
  ];
  for (const cell of corners) {
    if (!same(cell, start)) return cell;
  }
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      const cell = { c, r };
      if (!same(cell, start)) return cell;
    }
  }
  return { c: Math.min(1, maze.cols - 1), r: 0 };
}

function insideMaze(maze: Maze, cell: GridPoint): boolean {
  return cell.c >= 0 && cell.r >= 0 && cell.c < maze.cols && cell.r < maze.rows;
}

export function campaignSizes(campaign: Campaign): number[] {
  return campaign.floors.map((floor) => floor.maze.cols);
}

export function campaignThemes(campaign: Campaign): FloorThemeId[] {
  return campaign.floors.map((floor, index) => parseFloorTheme(floor.maze.theme ?? themeForFloor(index)));
}

function gridSize(t: number): number {
  return SIZE_MIN + Math.round(t ** 1.15 * SIZE_SPAN);
}

function holeCount(t: number, cols: number): number {
  const cap = Math.max(0, Math.floor(cols * cols * 0.06));
  return Math.min(cap, Math.round(t ** 1.1 * 8));
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

function same(a: GridPoint, b: GridPoint): boolean {
  return a.c === b.c && a.r === b.r;
}
