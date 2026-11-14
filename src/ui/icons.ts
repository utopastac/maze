import {
  ArrowDown,
  ArrowLeft,
  CircleArrowDown,
  ArrowRight,
  ArrowUp,
  BrickWall,
  Circle,
  Compass,
  Eraser,
  FastForward,
  Flag,
  Hourglass,
  Link,
  Snowflake,
  MapPin,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
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
  | "motion"
  | "settings"
  | "edit"
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
  | "share";

const NODES: Record<IconName, IconNode> = {
  level: Compass,
  reset: RotateCcw,
  new: Shuffle,
  motion: Smartphone,
  settings: SlidersHorizontal,
  edit: Pencil,
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
