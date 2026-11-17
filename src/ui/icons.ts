import {
  ArrowDown,
  ArrowLeft,
  Bookmark,
  Box,
  CircleArrowDown,
  ArrowRight,
  ArrowUp,
  BrickWall,
  Castle,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardCopy,
  ClipboardPaste,
  Coins,
  Compass,
  Download,
  Eraser,
  FastForward,
  Feather,
  Flag,
  Heart,
  Hourglass,
  Images,
  Keyboard,
  LayoutGrid,
  Link,
  Snowflake,
  MapPin,
  Minus,
  MousePointer2,
  NotebookPen,
  Pause,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
  Star,
  ToggleLeft,
  Waypoints,
  X,
  createElement,
  type IconNode,
} from "lucide";

const ICON_SIZE = 18;
const STROKE = 1.5;

export type IconName =
  | "level"
  | "reset"
  | "new"
  | "campaign"
  | "levels"
  | "heart"
  | "coin"
  | "star"
  | "wings"
  | "motion"
  | "settings"
  | "edit"
  | "author"
  | "move"
  | "erase"
  | "wall"
  | "pit"
  | "start"
  | "goal"
  | "floor"
  | "boost"
  | "warp"
  | "ice"
  | "crumble"
  | "block"
  | "switch"
  | "hatch"
  | "north"
  | "east"
  | "south"
  | "west"
  | "close"
  | "minus"
  | "plus"
  | "share"
  | "save"
  | "saved"
  | "keyboard"
  | "wins"
  | "copy"
  | "paste"
  | "load"
  | "angleDown"
  | "angleUp"
  | "orbitLeft"
  | "orbitRight"
  | "pause";

const NODES: Record<IconName, IconNode> = {
  level: Compass,
  reset: RotateCcw,
  new: Shuffle,
  campaign: Castle,
  pause: Pause,
  levels: LayoutGrid,
  heart: Heart,
  coin: Coins,
  star: Star,
  wings: Feather,
  motion: Smartphone,
  settings: SlidersHorizontal,
  edit: Pencil,
  author: NotebookPen,
  wins: Images,
  move: MousePointer2,
  erase: Eraser,
  wall: BrickWall,
  pit: Circle,
  start: MapPin,
  goal: Flag,
  floor: Eraser,
  boost: FastForward,
  warp: Waypoints,
  ice: Snowflake,
  crumble: Hourglass,
  block: Box,
  switch: ToggleLeft,
  hatch: CircleArrowDown,
  north: ArrowUp,
  east: ArrowRight,
  south: ArrowDown,
  west: ArrowLeft,
  close: X,
  minus: Minus,
  plus: Plus,
  share: Link,
  save: Save,
  saved: Bookmark,
  keyboard: Keyboard,
  copy: ClipboardCopy,
  paste: ClipboardPaste,
  load: Download,
  angleDown: ChevronDown,
  angleUp: ChevronUp,
  orbitLeft: RotateCcw,
  orbitRight: RotateCw,
};

export function iconSvg(name: IconName, size = ICON_SIZE): string {
  const el = createElement(NODES[name], {
    width: size,
    height: size,
    "stroke-width": STROKE,
    class: "btn-icon",
    "aria-hidden": "true",
  });
  return el.outerHTML;
}

export type PickupIcon = "heart" | "coin" | "star" | "wings";

/** Swap the collectible glyph in an editor/preview pickup slot when the kind changes. */
export function setPickupIcon(pickup: HTMLElement, kind: PickupIcon | null): void {
  const next = kind ?? "";
  if (pickup.dataset.icon === next) return;
  pickup.dataset.icon = next;
  pickup.innerHTML = kind ? iconSvg(kind) : "";
}
