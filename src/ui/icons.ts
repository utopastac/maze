import {
  ArrowDown,
  ArrowLeft,
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
  Compass,
  Download,
  Eraser,
  FastForward,
  Flag,
  Heart,
  Hourglass,
  Images,
  LayoutGrid,
  Link,
  Snowflake,
  MapPin,
  Minus,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
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
  | "motion"
  | "settings"
  | "edit"
  | "author"
  | "wall"
  | "pit"
  | "start"
  | "goal"
  | "floor"
  | "boost"
  | "warp"
  | "ice"
  | "crumble"
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
  | "wins"
  | "copy"
  | "paste"
  | "load"
  | "angleDown"
  | "angleUp"
  | "orbitLeft"
  | "orbitRight";

const NODES: Record<IconName, IconNode> = {
  level: Compass,
  reset: RotateCcw,
  new: Shuffle,
  campaign: Castle,
  levels: LayoutGrid,
  heart: Heart,
  motion: Smartphone,
  settings: SlidersHorizontal,
  edit: Pencil,
  author: NotebookPen,
  wins: Images,
  wall: BrickWall,
  pit: Circle,
  start: MapPin,
  goal: Flag,
  floor: Eraser,
  boost: FastForward,
  warp: Waypoints,
  ice: Snowflake,
  crumble: Hourglass,
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
