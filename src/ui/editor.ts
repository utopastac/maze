import {
  MAZE_MAX,
  MAZE_MIN,
  WARP_COLOR_COUNT,
  clearFloor,
  clearInterior,
  interiorClosed,
  loneWarpPair,
  bindSwitchWall,
  paintSwitch,
  paintWarp,
  pendingSwitch,
  placeGoal,
  placeStart,
  resizeMaze,
  setBoost,
  setCrumble,
  setIce,
  setInteriorWall,
  setPit,
  tileAt,
  type Direction,
  type Maze,
  type WallAxis,
} from "../core/maze.ts";
import {
  FLOOR_MAX,
  FLOOR_MIN,
  addFloor,
  cloneTower,
  removeFloor,
  resizeTower,
  setHatch,
  type Tower,
} from "../core/tower.ts";
import { iconSvg, type IconName } from "./icons.ts";
import styles from "./editor.module.css";

export interface EditorCallbacks {
  onPlay: (tower: Tower) => void;
  onClose: () => void;
  onShare: (tower: Tower) => Promise<boolean | null>;
}

type Tool = "wall" | "pit" | "start" | "goal" | "floor" | "boost" | "warp" | "ice" | "crumble" | "switch" | "hatch";
type Stroke = "open" | "close";
type CellKind = "start" | "goal" | "pit" | "floor" | "boost" | "warp" | "ice" | "crumble" | "switch" | "hatch";
type WallDrag = {
  axis: WallAxis;
  anchor: number;
  origin: number;
  dir: -1 | 1 | 0;
};

const TOOLS: readonly { id: Tool; label: string; icon: IconName }[] = [
  { id: "wall", label: "Wall", icon: "wall" },
  { id: "pit", label: "Pit", icon: "pit" },
  { id: "floor", label: "Floor", icon: "floor" },
  { id: "boost", label: "Boost", icon: "boost" },
  { id: "warp", label: "Warp", icon: "warp" },
  { id: "ice", label: "Ice", icon: "ice" },
  { id: "crumble", label: "Crumble", icon: "crumble" },
  { id: "switch", label: "Switch", icon: "switch" },
  { id: "hatch", label: "Hatch", icon: "hatch" },
  { id: "start", label: "Start", icon: "start" },
  { id: "goal", label: "Goal", icon: "goal" },
];

const HINTS: Record<Tool, string> = {
  wall: "Drag along a row or column, in one direction, to open or close walls.",
  pit: "Paint pits the ball can fall through.",
  start: "Place the start cell.",
  goal: "Place the goal on the lowest floor.",
  hatch: "Cut a hole through to the floor below.",
  floor: "Clear pits and special tiles.",
  boost: "Pick a direction, then paint lanes that shove the ball.",
  warp: "Click two cells to link a warp. Click a warp to remove that end.",
  ice: "Paint slick tiles. The ball keeps sliding until it reaches something with grip.",
  crumble: "Paint floors that hold for a moment, then fall away.",
  switch: "Click a cell, then a wall. Stop on the plate to open that wall.",
};

const DIR_WORD: Record<Direction, string> = {
  n: "north",
  e: "east",
  s: "south",
  w: "west",
};

const DIRECTION_TOOLS: readonly { id: Direction; label: string; icon: IconName }[] = [
  { id: "n", label: "North", icon: "north" },
  { id: "e", label: "East", icon: "east" },
  { id: "s", label: "South", icon: "south" },
  { id: "w", label: "West", icon: "west" },
];

export class LevelEditor {
  private readonly root: HTMLElement;
  private readonly callbacks: EditorCallbacks;
  private readonly board: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly colReadout: HTMLElement;
  private readonly rowReadout: HTMLElement;
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly cells = new Map<string, HTMLButtonElement>();
  private readonly walls = new Map<string, HTMLElement>();
  private tower: Tower = {
    floors: [
      resizeMaze(
        { cols: 1, rows: 1, walls: [[0]], holes: [], tiles: [], start: { c: 0, r: 0 }, goal: { c: 0, r: 0 }, hatch: null },
        MAZE_MIN,
        MAZE_MIN,
      ),
    ],
  };
  private floorIndex = 0;
  private tool: Tool = "wall";
  private boostDir: Direction = "n";
  private readonly dirs: HTMLElement;
  private readonly dirButtons = new Map<Direction, HTMLButtonElement>();
  private stroke: Stroke | null = null;
  private wallDrag: WallDrag | null = null;
  private pointerId: number | null = null;
  private noticeTimer = 0;

  constructor(root: HTMLElement, callbacks: EditorCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div class="${styles.scrim}" data-scrim></div>
      <div class="${styles.card}" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <header class="${styles.head}">
          <div>
            <p class="${styles.kicker}" id="editor-title">Level</p>
            <p class="${styles.lead}">Stack floors, cut a hatch to the one below, and put the goal on the lowest floor.</p>
          </div>
          <button type="button" class="glass-btn ${styles.close}" data-close aria-label="Close editor">${iconSvg("close")}</button>
        </header>
        <div class="${styles.toolbar}">
          <div class="${styles.sizes}" data-sizes>
            <div class="${styles.size}">
              <span class="${styles.label}">Columns</span>
              <div class="${styles.stepper}">
                <button type="button" class="glass-btn ${styles.step}" data-axis="cols" data-delta="-1" aria-label="Fewer columns">${iconSvg("minus")}</button>
                <span class="${styles.count}" data-cols>7</span>
                <button type="button" class="glass-btn ${styles.step}" data-axis="cols" data-delta="1" aria-label="More columns">${iconSvg("plus")}</button>
              </div>
            </div>
            <div class="${styles.size}">
              <span class="${styles.label}">Rows</span>
              <div class="${styles.stepper}">
                <button type="button" class="glass-btn ${styles.step}" data-axis="rows" data-delta="-1" aria-label="Fewer rows">${iconSvg("minus")}</button>
                <span class="${styles.count}" data-rows>7</span>
                <button type="button" class="glass-btn ${styles.step}" data-axis="rows" data-delta="1" aria-label="More rows">${iconSvg("plus")}</button>
              </div>
            </div>
          </div>
          <div class="${styles.floors}" data-floors role="tablist" aria-label="Floors"></div>
          <button type="button" class="glass-pill ${styles.clear}" data-clear>Clear</button>
        </div>
        <div class="${styles.tools}" role="radiogroup" aria-label="Brush" data-tools></div>
        <div class="${styles.dirs}" data-dirs role="radiogroup" aria-label="Boost direction" hidden>
          <span class="${styles.dirLabel}">Direction</span>
        </div>
        <div class="${styles.stage}">
          <div class="${styles.board}" data-board data-tool="wall" role="group" aria-label="Maze grid"></div>
        </div>
        <p class="${styles.hint}" data-hint aria-live="polite"></p>
        <div class="${styles.footer}">
          <button type="button" class="glass-pill" data-share>${iconSvg("share")}Share</button>
          <button type="button" class="glass-pill metal-ring ${styles.play}" data-play>Play</button>
        </div>
      </div>
    `;

    this.board = this.require("[data-board]");
    this.hint = this.require("[data-hint]");
    this.colReadout = this.require("[data-cols]");
    this.rowReadout = this.require("[data-rows]");
    this.dirs = this.require("[data-dirs]");
    this.mountTools();
    this.mountDirections();
    this.require("[data-scrim]").addEventListener("click", this.requestClose);
    this.require("[data-close]").addEventListener("click", this.requestClose);
    this.require("[data-clear]").addEventListener("click", () => {
      clearInterior(this.draft);
      this.renderBoard();
    });
    this.require("[data-share]").addEventListener("click", () => {
      void this.share();
    });
    this.require("[data-play]").addEventListener("click", () => {
      const tower = cloneTower(this.tower);
      this.hide();
      this.callbacks.onPlay(tower);
    });
    this.require("[data-floors]").addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-floor]");
      if (!button || button.disabled) return;
      const index = button.dataset.floor;
      if (index === "add") this.changeFloors(1);
      else if (index === "remove") this.changeFloors(-1);
      else this.selectFloor(Number(index));
    });
    this.require("[data-sizes]").addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-delta]");
      if (!button || button.disabled) return;
      const axis = button.dataset.axis === "rows" ? "rows" : "cols";
      this.changeSize(axis, Number(button.dataset.delta));
    });
    this.board.addEventListener("pointerdown", this.onPointerDown);
    this.board.addEventListener("pointermove", this.onPointerMove);
    this.board.addEventListener("pointerup", this.onPointerUp);
    this.board.addEventListener("pointercancel", this.onPointerUp);
    this.board.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", this.onKey, true);
    this.setTool("wall");
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  open(tower: Tower): void {
    this.tower = cloneTower(tower);
    this.floorIndex = 0;
    this.setTool("wall");
    this.syncSize();
    this.syncFloors();
    this.syncTools();
    this.renderBoard();
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    this.pointerId = null;
    this.stroke = null;
    this.wallDrag = null;
    this.clearNotice();
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  private requestClose = (): void => {
    if (!this.isOpen()) return;
    this.hide();
    this.callbacks.onClose();
  };

  private mountTools(): void {
    const host = this.require("[data-tools]");
    for (const tool of TOOLS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `glass-pill ${styles.tool}`;
      button.dataset.tool = tool.id;
      button.setAttribute("role", "radio");
      button.innerHTML = `${iconSvg(tool.icon)}${tool.label}`;
      button.addEventListener("click", () => this.setTool(tool.id));
      this.toolButtons.set(tool.id, button);
      host.append(button);
    }
  }

  private mountDirections(): void {
    for (const dir of DIRECTION_TOOLS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `glass-btn ${styles.dir}`;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-label", dir.label);
      button.innerHTML = iconSvg(dir.icon);
      button.addEventListener("click", () => {
        this.boostDir = dir.id;
        this.syncDirections();
      });
      this.dirButtons.set(dir.id, button);
      this.dirs.append(button);
    }
    this.syncDirections();
  }

  private syncDirections(): void {
    for (const [id, button] of this.dirButtons) {
      const on = id === this.boostDir;
      button.classList.toggle("selected", on);
      button.setAttribute("aria-checked", String(on));
    }
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.board.dataset.tool = tool;
    this.dirs.hidden = tool !== "boost";
    this.refreshHint();
    for (const [id, button] of this.toolButtons) {
      const on = id === tool;
      button.classList.toggle("selected", on);
      button.setAttribute("aria-checked", String(on));
    }
  }

  private async share(): Promise<void> {
    const result = await this.callbacks.onShare(cloneTower(this.tower));
    if (!this.isOpen()) return;
    if (result === null) this.flash("This level is too big to fit in a link.");
    else if (result) this.flash("Link copied.");
    else this.flash("Couldn't copy. The address bar has the link.");
  }

  private flash(message: string): void {
    this.hint.textContent = message;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.noticeTimer = 0;
      if (this.isOpen()) this.refreshHint();
    }, 1600);
  }

  private clearNotice(): void {
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = 0;
  }

  private refreshHint(): void {
    if (this.noticeTimer !== 0) return;
    if (this.tool === "warp" && loneWarpPair(this.draft) !== null) {
      this.hint.textContent = "Click a second cell to place the other end of the warp.";
      return;
    }
    if (this.tool === "switch" && pendingSwitch(this.draft)) {
      this.hint.textContent = "Click a wall. The plate opens it once the ball stops there.";
      return;
    }
    this.hint.textContent = HINTS[this.tool];
  }

  private get draft(): Maze {
    const floor = this.tower.floors[this.floorIndex];
    if (!floor) throw new Error("Missing floor");
    return floor;
  }

  private changeSize(axis: "cols" | "rows", delta: number): void {
    const cols = this.draft.cols + (axis === "cols" ? delta : 0);
    const rows = this.draft.rows + (axis === "rows" ? delta : 0);
    this.tower = resizeTower(this.tower, cols, rows);
    this.syncSize();
    this.renderBoard();
  }

  private selectFloor(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.tower.floors.length) return;
    if (index === this.floorIndex) return;
    this.floorIndex = index;
    this.stroke = null;
    this.wallDrag = null;
    this.syncFloors();
    this.syncTools();
    this.renderBoard();
    this.refreshHint();
  }

  private changeFloors(delta: number): void {
    if (delta > 0) {
      this.tower = addFloor(this.tower);
      this.floorIndex = this.tower.floors.length - 1;
    } else {
      this.tower = removeFloor(this.tower, this.floorIndex);
      this.floorIndex = Math.min(this.floorIndex, this.tower.floors.length - 1);
    }
    this.stroke = null;
    this.wallDrag = null;
    this.syncFloors();
    this.syncTools();
    this.renderBoard();
    this.refreshHint();
  }

  private syncFloors(): void {
    const host = this.require("[data-floors]");
    host.replaceChildren();
    const count = this.tower.floors.length;
    this.tower.floors.forEach((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `glass-pill ${styles.tab}`;
      button.dataset.floor = String(index);
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === this.floorIndex));
      button.textContent = floorName(index, count);
      if (index === this.floorIndex) button.classList.add("selected");
      host.append(button);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = `glass-btn ${styles.step}`;
    add.dataset.floor = "add";
    add.disabled = count >= FLOOR_MAX;
    add.setAttribute("aria-label", "Add a floor below");
    add.innerHTML = iconSvg("plus");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = `glass-btn ${styles.step}`;
    remove.dataset.floor = "remove";
    remove.disabled = count <= FLOOR_MIN;
    remove.setAttribute("aria-label", "Remove this floor");
    remove.innerHTML = iconSvg("minus");
    host.append(add, remove);
  }

  private syncTools(): void {
    const last = this.tower.floors.length - 1;
    const allow: Record<Tool, boolean> = {
      wall: true,
      pit: true,
      floor: true,
      boost: true,
      warp: true,
      ice: true,
      crumble: true,
      switch: true,
      hatch: this.floorIndex !== last,
      start: this.floorIndex === 0,
      goal: this.floorIndex === last,
    };
    for (const [id, button] of this.toolButtons) button.hidden = !allow[id];
    if (!allow[this.tool]) this.setTool("wall");
  }

  private syncSize(): void {
    this.colReadout.textContent = String(this.draft.cols);
    this.rowReadout.textContent = String(this.draft.rows);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-delta]")) {
      const axis = button.dataset.axis === "rows" ? "rows" : "cols";
      const value = axis === "rows" ? this.draft.rows : this.draft.cols;
      const delta = Number(button.dataset.delta);
      button.disabled = delta < 0 ? value <= MAZE_MIN : value >= MAZE_MAX;
    }
  }

  private renderBoard(): void {
    const { cols, rows } = this.draft;
    this.board.style.setProperty("--cols", String(cols));
    this.board.style.setProperty("--rows", String(rows));
    this.board.replaceChildren();
    this.cells.clear();
    this.walls.clear();

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = styles.cell;
        cell.tabIndex = -1;
        cell.dataset.cell = "";
        cell.dataset.c = String(c);
        cell.dataset.r = String(r);
        cell.style.setProperty("--c", String(c));
        cell.style.setProperty("--r", String(r));
        this.board.append(cell);
        this.cells.set(`${c},${r}`, cell);
      }
    }

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) this.addWall("v", c, r);
    }
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols; c += 1) this.addWall("h", c, r);
    }

    this.syncCells();
    this.syncWalls();
  }

  private addWall(axis: WallAxis, c: number, r: number): void {
    const wall = document.createElement("div");
    wall.className = styles.wall;
    wall.role = "button";
    wall.tabIndex = -1;
    wall.dataset.wall = "";
    wall.dataset.axis = axis;
    wall.dataset.c = String(c);
    wall.dataset.r = String(r);
    wall.style.setProperty("--c", String(c));
    wall.style.setProperty("--r", String(r));
    this.board.append(wall);
    this.walls.set(`${axis}:${c},${r}`, wall);
  }

  private syncCells(): void {
    const openPairs = openWarpPairs(this.draft);
    for (const [id, cell] of this.cells) {
      const [c, r] = id.split(",").map(Number);
      if (c === undefined || r === undefined) continue;
      const last = this.tower.floors.length - 1;
      const paint = describeCell(this.draft, c, r, openPairs, this.floorIndex === last, this.floorIndex > 0);
      cell.dataset.kind = paint.kind;
      if (paint.dir) cell.dataset.dir = paint.dir;
      else delete cell.dataset.dir;
      if (paint.pair !== undefined) cell.dataset.pair = String(paint.pair);
      else delete cell.dataset.pair;
      if (paint.open) cell.dataset.open = "true";
      else delete cell.dataset.open;
      cell.setAttribute("aria-label", paint.label);
    }
  }

  private syncWalls(): void {
    for (const [id, wall] of this.walls) {
      const axis: WallAxis = id.startsWith("h:") ? "h" : "v";
      const c = Number(wall.dataset.c);
      const r = Number(wall.dataset.r);
      this.paintWall(wall, axis, c, r);
    }
  }

  private paintWall(wall: HTMLElement, axis: WallAxis, c: number, r: number): void {
    const open = !interiorClosed(this.draft, axis, c, r);
    wall.dataset.open = String(open);
    const tone = switchTone(this.draft, axis, c, r);
    if (tone === null) delete wall.dataset.pair;
    else wall.dataset.pair = String(tone);
    const direction = axis === "v" ? "Vertical" : "Horizontal";
    const linked = tone === null ? "" : ", linked to a switch";
    wall.setAttribute("aria-label", `${direction} wall, ${open ? "open" : "closed"}${linked}`);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointerId !== null) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.stroke = null;
    this.wallDrag = null;
    this.board.setPointerCapture(event.pointerId);
    this.applyPaint(event.clientX, event.clientY);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.applyPaint(event.clientX, event.clientY);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.stroke = null;
    this.wallDrag = null;
  };

  private applyPaint(x: number, y: number): void {
    if (this.tool === "wall") {
      if (this.wallDrag === null) this.beginWallDrag(x, y);
      else this.extendWallDrag(x, y);
      return;
    }

    if ((this.tool === "warp" || this.tool === "switch") && this.stroke !== null) return;

    if (this.tool === "switch") {
      const wall = elementAt(x, y, "data-wall");
      if (wall) {
        this.stroke = "close";
        this.bindSwitch(wall);
        this.syncCells();
        this.syncWalls();
        this.refreshHint();
        return;
      }
    }

    const cell = elementAt(x, y, "data-cell");
    if (!cell) return;
    const c = Number(cell.dataset.c);
    const r = Number(cell.dataset.r);
    if (!Number.isInteger(c) || !Number.isInteger(r)) return;
    const point = { c, r };
    if (this.tool === "warp" || this.tool === "switch") this.stroke = "close";
    if (this.tool === "start") placeStart(this.draft, point);
    else if (this.tool === "goal") placeGoal(this.draft, point);
    else if (this.tool === "hatch") setHatch(this.tower, this.floorIndex, point);
    else if (this.tool === "pit") setPit(this.draft, point, true);
    else if (this.tool === "floor") clearFloor(this.draft, point);
    else if (this.tool === "boost") setBoost(this.draft, point, this.boostDir);
    else if (this.tool === "ice") setIce(this.draft, point);
    else if (this.tool === "crumble") setCrumble(this.draft, point);
    else if (this.tool === "switch") paintSwitch(this.draft, point);
    else paintWarp(this.draft, point);
    this.syncCells();
    this.syncWalls();
    if (this.tool === "warp" || this.tool === "switch") this.refreshHint();
  }

  private bindSwitch(wall: HTMLElement): void {
    const axis: WallAxis = wall.dataset.axis === "h" ? "h" : "v";
    const c = Number(wall.dataset.c);
    const r = Number(wall.dataset.r);
    if (!Number.isInteger(c) || !Number.isInteger(r)) return;
    bindSwitchWall(this.draft, { axis, c, r });
  }

  private beginWallDrag(x: number, y: number): void {
    const wall = elementAt(x, y, "data-wall");
    if (!wall) return;
    const axis: WallAxis = wall.dataset.axis === "h" ? "h" : "v";
    const c = Number(wall.dataset.c);
    const r = Number(wall.dataset.r);
    if (!Number.isInteger(c) || !Number.isInteger(r)) return;
    this.stroke = interiorClosed(this.draft, axis, c, r) ? "open" : "close";
    this.wallDrag = {
      axis,
      anchor: axis === "v" ? c : r,
      origin: axis === "v" ? r : c,
      dir: 0,
    };
    this.commitWall(axis, c, r);
  }

  private extendWallDrag(x: number, y: number): void {
    const drag = this.wallDrag;
    if (!drag) return;
    const along = this.alongIndex(x, y, drag.axis);
    if (drag.dir === 0) {
      if (along === drag.origin) return;
      drag.dir = along > drag.origin ? 1 : -1;
    }
    const reach = Math.max(0, (along - drag.origin) * drag.dir);
    for (let step = 0; step <= reach; step += 1) {
      const index = drag.origin + step * drag.dir;
      const c = drag.axis === "v" ? drag.anchor : index;
      const r = drag.axis === "v" ? index : drag.anchor;
      this.commitWall(drag.axis, c, r);
    }
  }

  private commitWall(axis: WallAxis, c: number, r: number): void {
    if (this.stroke === null) return;
    setInteriorWall(this.draft, axis, c, r, this.stroke === "close");
    const wall = this.walls.get(`${axis}:${c},${r}`);
    if (wall) this.paintWall(wall, axis, c, r);
    this.syncCells();
  }

  private alongIndex(x: number, y: number, axis: WallAxis): number {
    const rect = this.board.getBoundingClientRect();
    const style = getComputedStyle(this.board);
    const left = parseFloat(style.borderLeftWidth) || 0;
    const top = parseFloat(style.borderTopWidth) || 0;
    const right = parseFloat(style.borderRightWidth) || 0;
    const bottom = parseFloat(style.borderBottomWidth) || 0;
    const span = axis === "v" ? this.draft.rows : this.draft.cols;
    const size = axis === "v" ? rect.height - top - bottom : rect.width - left - right;
    const local = axis === "v" ? y - rect.top - top : x - rect.left - left;
    const index = Math.floor((local / Math.max(size, 1)) * span);
    return Math.min(span - 1, Math.max(0, index));
  }

  private onKey = (event: KeyboardEvent): void => {
    if (!this.isOpen() || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.requestClose();
  };

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
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

function describeCell(
  maze: Maze,
  c: number,
  r: number,
  openPairs: Set<number>,
  showGoal: boolean,
  landing: boolean,
): { kind: CellKind; dir?: Direction; pair?: number; open?: boolean; label: string } {
  const where = `column ${c + 1}, row ${r + 1}`;
  if (maze.start.c === c && maze.start.r === r) {
    return { kind: "start", label: `${landing ? "Landing" : "Start"}, ${where}` };
  }
  if (maze.hatch && maze.hatch.c === c && maze.hatch.r === r) return { kind: "hatch", label: `Hatch, ${where}` };
  if (showGoal && maze.goal.c === c && maze.goal.r === r) return { kind: "goal", label: `Goal, ${where}` };
  if (maze.holes.some((hole) => hole.c === c && hole.r === r)) return { kind: "pit", label: `Pit, ${where}` };
  const tile = tileAt(maze, c, r);
  if (tile?.kind === "boost") return { kind: "boost", dir: tile.dir, label: `Boost ${DIR_WORD[tile.dir]}, ${where}` };
  if (tile?.kind === "ice") return { kind: "ice", label: `Ice, ${where}` };
  if (tile?.kind === "crumble") return { kind: "crumble", label: `Crumble, ${where}` };
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
  return { kind: "floor", label: `Floor, ${where}` };
}

function floorName(index: number, count: number): string {
  if (count === 1) return "Floor";
  if (index === 0) return "Top";
  if (index === count - 1) return "Goal";
  return String(index + 1);
}

function switchTone(maze: Maze, axis: WallAxis, c: number, r: number): number | null {
  for (const tile of maze.tiles) {
    if (tile.kind !== "switch" || !tile.wall) continue;
    if (tile.wall.axis === axis && tile.wall.c === c && tile.wall.r === r) return tile.tone % 6;
  }
  return null;
}

function elementAt(x: number, y: number, attr: "data-wall" | "data-cell"): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el instanceof HTMLElement && el.hasAttribute(attr)) return el;
  }
  return null;
}
