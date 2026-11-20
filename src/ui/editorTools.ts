import type { Direction } from "../core/maze.ts";
import type { IconName } from "./icons.ts";

export type PaletteKind =
  | "pit"
  | "boost"
  | "warp"
  | "ice"
  | "crumble"
  | "block"
  | "switch"
  | "heart"
  | "coin"
  | "star"
  | "wings"
  | "ghost";

export type EditorTool = "move" | "erase" | "wall" | "gate" | PaletteKind;

export const HINT_TITLE: Record<EditorTool | "warp-pair" | "switch-pair", string> = {
  move: "Move",
  erase: "Erase",
  wall: "Wall",
  gate: "Gate",
  pit: "Pit",
  boost: "Boost",
  warp: "Warp",
  ice: "Ice",
  crumble: "Crumble",
  block: "Block",
  switch: "Switch",
  heart: "Heart",
  coin: "Coin",
  star: "Star",
  wings: "Wings",
  ghost: "Ghost",
  "warp-pair": "Warp",
  "switch-pair": "Switch",
};

export const PALETTE: readonly { id: PaletteKind; label: string; icon: IconName }[] = [
  { id: "pit", label: "Pit", icon: "pit" },
  { id: "block", label: "Block", icon: "block" },
  { id: "boost", label: "Boost", icon: "boost" },
  { id: "warp", label: "Warp", icon: "warp" },
  { id: "ice", label: "Ice", icon: "ice" },
  { id: "crumble", label: "Crumble", icon: "crumble" },
  { id: "switch", label: "Switch", icon: "switch" },
  { id: "heart", label: "Heart", icon: "heart" },
  { id: "coin", label: "Coin", icon: "coin" },
  { id: "star", label: "Star", icon: "star" },
  { id: "wings", label: "Wings", icon: "wings" },
  { id: "ghost", label: "Ghost", icon: "ghost" },
];

export const TOOLS: readonly { id: EditorTool; label: string; icon: IconName }[] = [
  { id: "move", label: "Move", icon: "move" },
  { id: "erase", label: "Erase", icon: "erase" },
  { id: "wall", label: "Wall", icon: "wall" },
  { id: "gate", label: "Gate", icon: "gate" },
  ...PALETTE,
];

export const isBuildTool = (id: EditorTool): boolean =>
  id === "wall"
  || id === "gate"
  || id === "pit"
  || id === "block"
  || id === "boost"
  || id === "warp"
  || id === "ice"
  || id === "crumble"
  || id === "switch";

export const isPowerUpTool = (id: EditorTool): boolean =>
  id === "heart" || id === "coin" || id === "star" || id === "wings" || id === "ghost";

export const MAIN_TOOLS = TOOLS.filter((tool) => !isBuildTool(tool.id) && !isPowerUpTool(tool.id));
export const BUILD_TOOLS = TOOLS.filter((tool) => isBuildTool(tool.id));
export const POWER_UP_TOOLS = TOOLS.filter((tool) => isPowerUpTool(tool.id));

export const HINT_BRUSH: Record<EditorTool, string> = {
  move: "Click a cell for tile options. Drag tiles or row/column handles to edit.",
  erase: "Click tiles or walls to clear them.",
  wall: "Click or drag along edges to draw or clear walls.",
  gate: "Click a wall to make it a one-way gate. Click again to flip it. Erase to remove.",
  pit: "Paint pits the ball can fall through.",
  boost: "Paint boost lanes. Click a boost to rotate, or pick a direction beside it.",
  warp: "Click two cells to link a warp. Click a warp to remove that end.",
  ice: "Paint slick tiles.",
  crumble: "Paint floors that crumble when the ball touches them.",
  block: "Fill a cell with an impassable cube.",
  switch: "Click a cell, then a wall. Stop on the plate to open that wall.",
  heart: "Place hearts that add a life when collected.",
  coin: "Place coins to collect while playing.",
  star: "Place a star that grows the ball and smashes walls for a while.",
  wings: "Place wings that let the ball hover over pits for a while.",
  ghost: "Place a ghost — pass through interior walls for a while (not pits).",
};

export const DIR_WORD: Record<Direction, string> = {
  n: "north",
  e: "east",
  s: "south",
  w: "west",
};

export const DIRECTION_TOOLS: readonly { id: Direction; label: string; icon: IconName }[] = [
  { id: "n", label: "North", icon: "north" },
  { id: "e", label: "East", icon: "east" },
  { id: "s", label: "South", icon: "south" },
  { id: "w", label: "West", icon: "west" },
];

export const NEXT_DIR: Record<Direction, Direction> = {
  n: "e",
  e: "s",
  s: "w",
  w: "n",
};
