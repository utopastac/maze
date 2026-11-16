import {
  MAZE_MAX,
  MAZE_MIN,
  WARP_COLOR_COUNT,
  bindSwitchWall,
  canDropLifted,
  cancelPendingPair,
  clearFloor,
  clearInterior,
  interiorClosed,
  liftAt,
  loneWarpPair,
  moveLifted,
  paintSwitch,
  paintWarp,
  pendingSwitch,
  resizeMaze,
  setBoost,
  setCrumble,
  setIce,
  setInteriorWall,
  setPit,
  tileAt,
  type Direction,
  type LiftedTile,
  type Maze,
  type WallAxis,
} from "../core/maze.ts";
import {
  copyText,
  formatAuthoredFloorLine,
  parseLevelInput,
  readText,
} from "../core/share.ts";
import {
  DEFAULT_FLOOR_THEME,
  FLOOR_THEMES,
  FLOOR_THEME_META,
  parseFloorTheme,
  type FloorThemeId,
} from "../core/theme.ts";
import {
  DEFAULT_LEVEL_NAME,
  FLOOR_MAX,
  FLOOR_MIN,
  LEVEL_NAME_MAX,
  addFloor,
  cloneTower,
  deleteFloorColumn,
  deleteFloorRow,
  insertFloorColumn,
  insertFloorRow,
  levelNameOf,
  moveFloorColumn,
  moveFloorRow,
  removeFloor,
  setHatch,
  setLevelName,
  type Tower,
} from "../core/tower.ts";
import { iconSvg, type IconName } from "./icons.ts";
import styles from "./editor.module.css";

export type EditorMode = "share" | "campaign";

export interface EditorCallbacks {
  onPlay: (tower: Tower) => void;
  onClose: () => void;
  onShare: (tower: Tower) => Promise<boolean | null>;
}

type PaletteKind = "pit" | "boost" | "warp" | "ice" | "crumble" | "switch" | "hatch";
type EditorTool = "move" | "erase" | "wall" | PaletteKind;

const HINT_TITLE: Record<EditorTool | "warp-pair" | "switch-pair", string> = {
  move: "Move",
  erase: "Erase",
  wall: "Wall",
  pit: "Pit",
  boost: "Boost",
  warp: "Warp",
  ice: "Ice",
  crumble: "Crumble",
  switch: "Switch",
  hatch: "Hatch",
  "warp-pair": "Warp",
  "switch-pair": "Switch",
};
type Stroke = "open" | "close";
type CellKind = "start" | "goal" | "pit" | "floor" | "boost" | "warp" | "ice" | "crumble" | "switch" | "hatch";
type WallDrag = {
  axis: WallAxis;
  anchor: number;
  origin: number;
  dir: -1 | 1 | 0;
};

type TileDrag = {
  lift: LiftedTile;
  from: { c: number; r: number };
  over: { c: number; r: number };
  moved: boolean;
};

type LineDrag = {
  kind: "col" | "row";
  from: number;
  over: number;
  moved: boolean;
  pointerId: number;
};

const PALETTE: readonly { id: PaletteKind; label: string; icon: IconName }[] = [
  { id: "pit", label: "Pit", icon: "pit" },
  { id: "boost", label: "Boost", icon: "boost" },
  { id: "warp", label: "Warp", icon: "warp" },
  { id: "ice", label: "Ice", icon: "ice" },
  { id: "crumble", label: "Crumble", icon: "crumble" },
  { id: "switch", label: "Switch", icon: "switch" },
  { id: "hatch", label: "Hatch", icon: "hatch" },
];

const TOOLS: readonly { id: EditorTool; label: string; icon: IconName }[] = [
  { id: "move", label: "Move", icon: "move" },
  { id: "erase", label: "Erase", icon: "erase" },
  { id: "wall", label: "Wall", icon: "wall" },
  ...PALETTE,
];

const HINT_BRUSH: Record<EditorTool, string> = {
  move: "Click a cell for tile options. Drag tiles or row/column handles to edit.",
  erase: "Click tiles or walls to clear them.",
  wall: "Click or drag along edges to draw or clear walls.",
  pit: "Paint pits the ball can fall through.",
  boost: "Pick a direction, then paint boost lanes.",
  warp: "Click two cells to link a warp. Click a warp to remove that end.",
  ice: "Paint slick tiles.",
  crumble: "Paint floors that crumble when the ball touches them.",
  switch: "Click a cell, then a wall. Stop on the plate to open that wall.",
  hatch: "Cut a hole through to the floor below.",
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
  private readonly hintTitle: HTMLElement;
  private readonly hintBody: HTMLElement;
  private readonly paletteButtons = new Map<EditorTool, HTMLButtonElement>();
  private readonly cells = new Map<string, HTMLButtonElement>();
  private readonly walls = new Map<string, HTMLElement>();
  private readonly colReadout: HTMLElement;
  private readonly rowReadout: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly playFrame: HTMLElement;
  private readonly chrome: HTMLElement;
  private readonly colRail: HTMLElement;
  private readonly rowRail: HTMLElement;
  private readonly gapBtn: HTMLButtonElement;
  private readonly gapLine: HTMLElement;
  private readonly edgeSouth: HTMLButtonElement;
  private readonly edgeEast: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;
  private readonly selectBox: HTMLElement;
  private lineSelect: { kind: "col" | "row"; index: number } | null = null;
  private lineDrag: LineDrag | null = null;
  private tileMenuAt: { c: number; r: number } | null = null;
  private readonly tileMenu: HTMLElement;
  private readonly boardWrap: HTMLElement;
  private tower: Tower = {
    floors: [
      resizeMaze(
        {
          cols: 1,
          rows: 1,
          walls: [[0]],
          holes: [],
          tiles: [],
          start: { c: 0, r: 0 },
          goal: { c: 0, r: 0 },
          hatch: null,
          theme: DEFAULT_FLOOR_THEME,
        },
        MAZE_MIN,
        MAZE_MIN,
      ),
    ],
  };
  private floorIndex = 0;
  private mode: EditorMode = "share";
  private brush: EditorTool = "move";
  private boostDir: Direction = "n";
  private readonly dirs: HTMLElement;
  private readonly themeSelect: HTMLSelectElement;
  private readonly nameInput: HTMLInputElement;
  private readonly dirButtons = new Map<Direction, HTMLButtonElement>();
  private stroke: Stroke | null = null;
  private wallDrag: WallDrag | null = null;
  private tileDrag: TileDrag | null = null;
  private brushHover: { c: number; r: number } | null = null;
  private pointerId: number | null = null;
  private noticeTimer = 0;

  constructor(root: HTMLElement, callbacks: EditorCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.dataset.mode = "share";
    this.root.innerHTML = `
      <div class="${styles.scrim}" data-scrim></div>
      <div class="${styles.card}" role="dialog" aria-modal="true" aria-labelledby="editor-level-name">
        <div class="${styles.body}">
          <aside class="${styles.side}">
            <div class="${styles.sideHead}">
              <input
                class="${styles.levelName}"
                id="editor-level-name"
                data-level-name
                type="text"
                maxlength="${LEVEL_NAME_MAX}"
                spellcheck="false"
                autocomplete="off"
                aria-label="Level name"
                value="${DEFAULT_LEVEL_NAME}"
              />
            </div>
            <div class="${styles.sideCols}">
              <section class="${styles.panel} ${styles.floorsPanel}" data-share-only>
                <h2 class="${styles.panelTitle}">Floors</h2>
                <nav class="${styles.floorNav}" data-floors role="tablist" aria-label="Floors"></nav>
              </section>
              <section class="${styles.panel} ${styles.toolsPanel}">
                <label class="${styles.themeField}">
                  <select class="${styles.themeSelect}" data-theme-select aria-label="Floor theme"></select>
                </label>
                <h2 class="${styles.panelTitle}">Tools</h2>
                <div class="${styles.palette}" role="list" aria-label="Tools" data-palette></div>
                <div class="${styles.dirs}" data-dirs role="radiogroup" aria-label="Boost direction" hidden>
                  <span class="${styles.dirLabel}">Boost dir</span>
                </div>
                <div class="${styles.hint}" data-hint aria-live="polite">
                  <p class="${styles.hintTitle}" data-hint-title></p>
                  <p class="${styles.hintBody}" data-hint-body></p>
                </div>
              </section>
            </div>
          </aside>
          <div class="${styles.stage}">
            <header class="${styles.stageBar}">
              <div class="${styles.sizes}" data-sizes>
                <div class="${styles.size}">
                  <span class="${styles.label}">Cols</span>
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
              <div class="${styles.stageActions}">
                <button type="button" class="glass-pill ${styles.headBtn}" data-paste title="Paste a model into the editor">${iconSvg("paste")}Paste</button>
                <button type="button" class="glass-pill ${styles.headBtn}" data-copy data-campaign-only title="Copy a paste-ready line for authoredFloors.ts">${iconSvg("copy")}Copy model</button>
                <button type="button" class="glass-pill ${styles.headBtn}" data-share data-share-only>${iconSvg("share")}Share</button>
                <button type="button" class="glass-pill metal-ring ${styles.play}" data-play>Play</button>
                <button type="button" class="glass-btn ${styles.close}" data-close aria-label="Close editor">${iconSvg("close")}</button>
              </div>
            </header>
            <div class="${styles.stageBody}">
              <div class="${styles.stageTop}">
                <button type="button" class="${styles.clear}" data-clear>Clear</button>
              </div>
              <div class="${styles.boardWrap}" data-board-wrap>
                <div class="${styles.sheet}" data-sheet data-theme="${DEFAULT_FLOOR_THEME}">
                  <div class="${styles.board}" data-board data-theme="${DEFAULT_FLOOR_THEME}" role="group" aria-label="Maze grid"></div>
                  <div class="${styles.playFrame}" data-play-frame aria-hidden="true"></div>
                  <div class="${styles.chrome}" data-chrome>
                    <div class="${styles.colRail}" data-col-rail role="toolbar" aria-label="Columns"></div>
                    <div class="${styles.rowRail}" data-row-rail role="toolbar" aria-label="Rows"></div>
                    <div class="${styles.selectBox}" data-select-box hidden></div>
                    <div class="${styles.gapLine}" data-gap-line hidden></div>
                    <button type="button" class="${styles.gapBtn}" data-gap-btn hidden aria-label="Insert">${iconSvg("plus")}</button>
                    <button type="button" class="${styles.edgePill} ${styles.edgeSouth}" data-append="row" aria-label="Add a row below">${iconSvg("plus")}</button>
                    <button type="button" class="${styles.edgePill} ${styles.edgeEast}" data-append="col" aria-label="Add a column right">${iconSvg("plus")}</button>
                    <button type="button" class="${styles.deleteBtn}" data-delete-line hidden aria-label="Delete">${iconSvg("minus")}</button>
                  </div>
                </div>
                <div class="${styles.tileMenu}" data-tile-menu hidden role="menu" aria-label="Place tile"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.board = this.require("[data-board]");
    this.boardWrap = this.require("[data-board-wrap]");
    this.hint = this.require("[data-hint]");
    this.hintTitle = this.require("[data-hint-title]");
    this.hintBody = this.require("[data-hint-body]");
    this.dirs = this.require("[data-dirs]");
    this.themeSelect = this.require("[data-theme-select]");
    this.nameInput = this.require("[data-level-name]");
    this.colReadout = this.require("[data-cols]");
    this.rowReadout = this.require("[data-rows]");
    this.sheet = this.require("[data-sheet]");
    this.playFrame = this.require("[data-play-frame]");
    this.chrome = this.require("[data-chrome]");
    this.colRail = this.require("[data-col-rail]");
    this.rowRail = this.require("[data-row-rail]");
    this.gapBtn = this.require("[data-gap-btn]");
    this.gapLine = this.require("[data-gap-line]");
    this.edgeSouth = this.require("[data-append='row']");
    this.edgeEast = this.require("[data-append='col']");
    this.deleteBtn = this.require("[data-delete-line]");
    this.selectBox = this.require("[data-select-box]");
    this.tileMenu = this.require("[data-tile-menu]");
    this.mountPalette();
    this.mountTileMenu();
    this.mountDirections();
    this.mountThemes();
    this.require("[data-scrim]").addEventListener("click", this.requestClose);
    this.require("[data-close]").addEventListener("click", this.requestClose);
    this.require("[data-clear]").addEventListener("click", () => {
      if (this.pairing()) return;
      clearInterior(this.draft);
      this.renderBoard();
    });
    this.require("[data-copy]").addEventListener("click", () => {
      void this.copyModel();
    });
    this.require("[data-paste]").addEventListener("click", () => {
      void this.pasteModel();
    });
    this.require("[data-share]").addEventListener("click", () => {
      void this.share();
    });
    this.require("[data-play]").addEventListener("click", () => {
      const tower = cloneTower(this.tower);
      this.hide();
      this.callbacks.onPlay(tower);
    });
    this.nameInput.addEventListener("input", () => {
      setLevelName(this.tower, this.nameInput.value);
    });
    this.nameInput.addEventListener("blur", () => {
      this.syncName();
    });
    this.nameInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.nameInput.blur();
    });
    this.require("[data-floors]").addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-floor]");
      if (!button || button.disabled) return;
      const index = button.dataset.floor;
      if (index === "add") {
        this.changeFloors(1);
        return;
      }
      if (index === "remove") {
        this.removeFloorAt(Number(button.dataset.index));
        return;
      }
      this.selectFloor(Number(index));
    });
    this.require("[data-sizes]").addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-delta]");
      if (!button || button.disabled) return;
      const axis = button.dataset.axis === "rows" ? "rows" : "cols";
      this.changeSize(axis, Number(button.dataset.delta));
    });
    this.edgeSouth.addEventListener("click", () => this.insertAt("row", this.draft.rows));
    this.edgeEast.addEventListener("click", () => this.insertAt("col", this.draft.cols));
    this.gapBtn.addEventListener("click", () => {
      const kind = this.gapBtn.dataset.kind === "col" ? "col" : "row";
      const at = Number(this.gapBtn.dataset.at);
      if (!Number.isInteger(at)) return;
      this.insertAt(kind, at);
    });
    this.deleteBtn.addEventListener("click", () => {
      if (!this.lineSelect) return;
      if (this.lineSelect.kind === "col") this.removeColumn(this.lineSelect.index);
      else this.removeRow(this.lineSelect.index);
    });
    this.colRail.addEventListener("pointerdown", (event) => this.onHandlePointerDown(event, "col"));
    this.rowRail.addEventListener("pointerdown", (event) => this.onHandlePointerDown(event, "row"));
    this.colRail.addEventListener("pointermove", this.onLinePointerMove);
    this.rowRail.addEventListener("pointermove", this.onLinePointerMove);
    this.colRail.addEventListener("pointerup", this.onLinePointerUp);
    this.rowRail.addEventListener("pointerup", this.onLinePointerUp);
    this.colRail.addEventListener("pointercancel", this.onLinePointerUp);
    this.rowRail.addEventListener("pointercancel", this.onLinePointerUp);
    this.sheet.addEventListener("pointermove", this.onSheetPointerMove);
    this.sheet.addEventListener("pointerleave", this.onSheetPointerLeave);
    this.tileMenu.addEventListener("click", (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-place]");
      if (!button || button.disabled) return;
      const place = button.dataset.place;
      if (place === "clear" || PALETTE.some((tile) => tile.id === place)) {
        this.placeFromMenu(place as PaletteKind | "clear");
      }
    });
    this.themeSelect.addEventListener("change", () => {
      this.setTheme(parseFloorTheme(this.themeSelect.value));
    });
    this.board.addEventListener("pointerdown", this.onPointerDown);
    this.board.addEventListener("pointermove", this.onPointerMove);
    this.board.addEventListener("pointerup", this.onPointerUp);
    this.board.addEventListener("pointercancel", this.onPointerUp);
    this.board.addEventListener("pointerleave", this.onPairHoverLeave);
    this.board.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", this.onKey, true);
    this.syncPalette();
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  modeOf(): EditorMode {
    return this.mode;
  }

  open(tower: Tower, mode: EditorMode = "share"): void {
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.tower = cloneTower(tower);
    if (mode === "campaign") {
      const name = this.tower.name;
      if (this.tower.floors.length > 1) this.tower = { floors: [cloneTower(this.tower).floors[0]!] };
      if (name !== undefined) this.tower.name = name;
      const floor = this.tower.floors[0];
      if (floor?.hatch) {
        floor.goal = { ...floor.hatch };
        floor.hatch = null;
      }
    }
    this.floorIndex = 0;
    this.brush = "move";
    this.syncName();
    this.syncSize();
    this.syncFloors();
    this.syncPalette();
    this.syncThemes();
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
    this.lineDrag = null;
    this.clearTileDrag();
    this.lineSelect = null;
    this.hideTileMenu();
    this.hideGap();
    this.clearNotice();
    delete this.chrome.dataset.dragging;
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  private requestClose = (): void => {
    if (!this.isOpen()) return;
    this.hide();
    this.callbacks.onClose();
  };

  private mountPalette(): void {
    const host = this.require("[data-palette]");
    for (const tool of TOOLS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.swatch;
      button.dataset.palette = tool.id;
      button.dataset.kind = tool.id;
      button.setAttribute("role", "radio");
      button.title = tool.label;
      button.innerHTML = `${iconSvg(tool.icon)}<span>${tool.label}</span>`;
      button.addEventListener("click", () => this.setBrush(tool.id));
      this.paletteButtons.set(tool.id, button);
      host.append(button);
    }
  }

  private mountTileMenu(): void {
    this.tileMenu.replaceChildren();
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = styles.tileMenuItem;
    clear.dataset.place = "clear";
    clear.setAttribute("role", "menuitem");
    clear.title = "Clear";
    clear.innerHTML = `${iconSvg("floor")}<span>Clear</span>`;
    this.tileMenu.append(clear);
    for (const tile of PALETTE) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.tileMenuItem;
      button.dataset.place = tile.id;
      button.setAttribute("role", "menuitem");
      button.title = tile.label;
      button.innerHTML = `${iconSvg(tile.icon)}<span>${tile.label}</span>`;
      this.tileMenu.append(button);
    }
  }

  private openTileMenu(point: { c: number; r: number }): void {
    if (this.pairing()) return;
    const cell = this.cells.get(`${point.c},${point.r}`);
    if (!cell) return;
    this.tileMenuAt = point;
    const hatchOk = this.floorIndex !== this.tower.floors.length - 1;
    for (const button of this.tileMenu.querySelectorAll<HTMLButtonElement>("[data-place]")) {
      const hide = button.dataset.place === "hatch" && !hatchOk;
      button.hidden = hide;
      button.disabled = hide;
    }
    this.tileMenu.hidden = false;
    this.syncMenuHighlight();
    this.tileMenu.style.left = "0px";
    this.tileMenu.style.top = "0px";
    const wrap = this.boardWrap.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    const menuW = this.tileMenu.offsetWidth;
    const menuH = this.tileMenu.offsetHeight;
    let left = rect.left - wrap.left + rect.width + 8;
    let top = rect.top - wrap.top;
    if (left + menuW > wrap.width) left = rect.left - wrap.left - menuW - 8;
    if (top + menuH > wrap.height) top = Math.max(0, wrap.height - menuH);
    if (left < 0) left = Math.max(0, rect.left - wrap.left);
    this.tileMenu.style.left = `${Math.round(left)}px`;
    this.tileMenu.style.top = `${Math.round(top)}px`;
  }

  private hideTileMenu(): void {
    this.tileMenuAt = null;
    this.tileMenu.hidden = true;
    this.syncMenuHighlight();
  }

  private syncMenuHighlight(): void {
    for (const cell of this.cells.values()) {
      const on = !!this.tileMenuAt
        && Number(cell.dataset.c) === this.tileMenuAt.c
        && Number(cell.dataset.r) === this.tileMenuAt.r;
      if (on) cell.dataset.menu = "true";
      else delete cell.dataset.menu;
    }
  }

  private pairing(): "switch" | "warp" | null {
    if (pendingSwitch(this.draft)) return "switch";
    if (loneWarpPair(this.draft) !== null) return "warp";
    return null;
  }

  private enterPairing(kind: "switch" | "warp"): void {
    this.brush = kind;
    this.dirs.hidden = true;
    this.hideTileMenu();
    this.syncFloors();
    this.syncPalette();
    this.syncCells();
    this.syncWalls();
    this.refreshHint();
  }

  private cancelPairing(): boolean {
    if (!this.pairing()) return false;
    cancelPendingPair(this.draft);
    this.brush = "move";
    this.stroke = null;
    this.brushHover = null;
    this.syncFloors();
    this.syncPalette();
    this.syncCells();
    this.syncWalls();
    this.refreshHint();
    return true;
  }

  private placeFromMenu(kind: PaletteKind | "clear"): void {
    const point = this.tileMenuAt;
    this.hideTileMenu();
    if (!point) return;
    if (kind === "clear") clearFloor(this.draft, point);
    else if (kind === "hatch") setHatch(this.tower, this.floorIndex, point);
    else if (kind === "pit") setPit(this.draft, point, true);
    else if (kind === "boost") setBoost(this.draft, point, this.boostDir);
    else if (kind === "ice") setIce(this.draft, point);
    else if (kind === "crumble") setCrumble(this.draft, point);
    else if (kind === "switch") {
      paintSwitch(this.draft, point);
      if (pendingSwitch(this.draft)) this.enterPairing("switch");
    } else if (kind === "warp") {
      paintWarp(this.draft, point);
      if (loneWarpPair(this.draft) !== null) this.enterPairing("warp");
      else this.brushHover = null;
    }
    this.syncCells();
    this.syncWalls();
    this.refreshHint();
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
        if (this.brush === "boost" && this.brushHover) this.syncCells();
      });
      this.dirButtons.set(dir.id, button);
      this.dirs.append(button);
    }
    this.syncDirections();
  }

  private mountThemes(): void {
    this.themeSelect.replaceChildren();
    for (const id of FLOOR_THEMES) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = FLOOR_THEME_META[id].label;
      this.themeSelect.append(option);
    }
    this.syncThemes();
  }

  private syncDirections(): void {
    for (const [id, button] of this.dirButtons) {
      const on = id === this.boostDir;
      button.classList.toggle("selected", on);
      button.setAttribute("aria-checked", String(on));
    }
  }

  private setTheme(theme: FloorThemeId): void {
    this.draft.theme = theme;
    this.syncThemes();
  }

  private syncThemes(): void {
    const theme = parseFloorTheme(this.draft.theme);
    this.board.dataset.theme = theme;
    this.sheet.dataset.theme = theme;
    this.themeSelect.value = theme;
  }

  private setBrush(kind: EditorTool): void {
    if (this.pairing() && kind !== this.pairing()) return;
    this.brush = kind;
    if (this.pairing() && this.brush !== this.pairing()) this.brush = this.pairing();
    this.dirs.hidden = this.brush !== "boost";
    if (!this.hoverBrush()) this.brushHover = null;
    this.hideTileMenu();
    this.syncPalette();
    this.syncCells();
    this.refreshHint();
  }

  private async share(): Promise<void> {
    const result = await this.callbacks.onShare(cloneTower(this.tower));
    if (!this.isOpen()) return;
    if (result === null) this.flash("This level is too big to fit in a link.");
    else if (result) this.flash("Link copied.");
    else this.flash("Couldn't copy. The address bar has the link.");
  }

  private async copyModel(): Promise<void> {
    if (this.mode !== "campaign") return;
    const line = formatAuthoredFloorLine(this.tower);
    if (!line) {
      this.flash("This level is too big to copy.");
      return;
    }
    const ok = await copyText(line);
    if (!this.isOpen()) return;
    if (ok) this.flash("Copied model. Paste it into authoredFloors.ts.");
    else this.flash("Couldn't copy. Try again or check clipboard permission.");
  }

  private async pasteModel(): Promise<void> {
    const text = await readText();
    if (!this.isOpen()) return;
    if (!text) {
      this.flash("Clipboard is empty or blocked. Allow paste, then try again.");
      return;
    }
    const tower = parseLevelInput(text);
    if (!tower) {
      this.flash("That clipboard text isn't a level model.");
      return;
    }
    this.applyTower(tower);
    this.flash("Model pasted.");
  }

  private applyTower(tower: Tower): void {
    this.tower = cloneTower(tower);
    this.floorIndex = 0;
    this.stroke = null;
    this.wallDrag = null;
    this.clearTileDrag();
    this.syncName();
    this.syncSize();
    this.syncFloors();
    this.syncPalette();
    this.syncThemes();
    this.renderBoard();
    this.refreshHint();
  }

  private syncName(): void {
    this.nameInput.value = levelNameOf(this.tower);
  }

  private flash(message: string): void {
    this.setHint("", message);
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

  private setHint(title: string, body: string): void {
    this.hintTitle.textContent = title;
    this.hintTitle.hidden = !title;
    this.hintBody.textContent = body;
    this.hint.hidden = !title && !body;
  }

  private refreshHint(): void {
    if (this.noticeTimer !== 0) return;
    const pair = this.pairing();
    if (pair === "warp") {
      this.setHint(HINT_TITLE["warp-pair"], "Click two cells to link a warp. Click a warp to remove that end.");
      return;
    }
    if (pair === "switch") {
      this.setHint(HINT_TITLE["switch-pair"], "Click a wall to link. Esc cancels.");
      return;
    }
    this.setHint(HINT_TITLE[this.brush], HINT_BRUSH[this.brush]);
  }

  private get draft(): Maze {
    const floor = this.tower.floors[this.floorIndex];
    if (!floor) throw new Error("Missing floor");
    return floor;
  }

  private changeSize(axis: "cols" | "rows", delta: number): void {
    if (this.pairing()) return;
    if (delta > 0) {
      this.insertAt(axis === "cols" ? "col" : "row", axis === "cols" ? this.draft.cols : this.draft.rows);
      return;
    }
    if (axis === "cols") this.removeColumn(this.draft.cols - 1);
    else this.removeRow(this.draft.rows - 1);
  }

  private insertAt(kind: "col" | "row", at: number): void {
    if (this.pairing()) return;
    if (kind === "col") {
      if (this.draft.cols >= MAZE_MAX) return;
      this.tower = insertFloorColumn(this.tower, this.floorIndex, at);
    } else {
      if (this.draft.rows >= MAZE_MAX) return;
      this.tower = insertFloorRow(this.tower, this.floorIndex, at);
    }
    this.clearLineSelect();
    this.hideGap();
    this.syncSize();
    this.renderBoard();
  }

  private removeColumn(index: number): void {
    if (this.draft.cols <= MAZE_MIN) return;
    this.tower = deleteFloorColumn(this.tower, this.floorIndex, index);
    this.clearLineSelect();
    this.hideGap();
    this.syncSize();
    this.renderBoard();
  }

  private removeRow(index: number): void {
    if (this.draft.rows <= MAZE_MIN) return;
    this.tower = deleteFloorRow(this.tower, this.floorIndex, index);
    this.clearLineSelect();
    this.hideGap();
    this.syncSize();
    this.renderBoard();
  }

  private selectLine(kind: "col" | "row", index: number): void {
    if (kind === "col" && (index < 0 || index >= this.draft.cols)) return;
    if (kind === "row" && (index < 0 || index >= this.draft.rows)) return;
    this.lineSelect = { kind, index };
    this.hideGap();
    this.hideTileMenu();
    this.syncChrome();
  }

  private clearLineSelect(): void {
    this.lineSelect = null;
    this.syncChrome();
  }

  private onHandlePointerDown = (event: PointerEvent, kind: "col" | "row"): void => {
    if (event.button !== 0 || this.pairing()) return;
    const handle = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-handle]");
    if (!handle || handle.disabled) return;
    const index = Number(handle.dataset.index);
    if (!Number.isInteger(index)) return;
    event.preventDefault();
    event.stopPropagation();
    this.hideTileMenu();
    this.hideGap();
    this.lineDrag = { kind, from: index, over: index, moved: false, pointerId: event.pointerId };
    this.selectLine(kind, index);
    handle.setPointerCapture(event.pointerId);
    this.chrome.dataset.dragging = kind;
  };

  private onLinePointerMove = (event: PointerEvent): void => {
    const drag = this.lineDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const active = this.activeBoardRect();
    if (!active) return;
    const count = drag.kind === "col" ? this.draft.cols : this.draft.rows;
    const span = drag.kind === "col" ? active.width : active.height;
    const local = drag.kind === "col" ? event.clientX - active.left : event.clientY - active.top;
    const over = Math.min(count - 1, Math.max(0, Math.floor(local / Math.max(span / count, 1))));
    if (over === drag.over) return;
    drag.over = over;
    drag.moved = over !== drag.from;
    this.selectLine(drag.kind, over);
  };

  private onLinePointerUp = (event: PointerEvent): void => {
    const drag = this.lineDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.lineDrag = null;
    delete this.chrome.dataset.dragging;
    if (drag.moved && drag.over !== drag.from) {
      if (drag.kind === "col") this.tower = moveFloorColumn(this.tower, this.floorIndex, drag.from, drag.over);
      else this.tower = moveFloorRow(this.tower, this.floorIndex, drag.from, drag.over);
      this.renderBoard();
      this.selectLine(drag.kind, drag.over);
      return;
    }
    this.selectLine(drag.kind, drag.from);
  };

  private hideGap(): void {
    this.gapBtn.hidden = true;
    this.gapLine.hidden = true;
    delete this.sheet.dataset.gap;
  }

  private onSheetPointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== null || this.tileDrag || this.lineDrag || this.pairing()) return;
    const target = event.target as Element | null;
    const onChromeControl = target?.closest<HTMLElement>("[data-gap-btn], [data-append], [data-delete-line], [data-handle]");
    if (onChromeControl?.hasAttribute("data-gap-btn")) {
      if (!this.gapBtn.hidden) this.gapLine.hidden = false;
      this.clearRailHover();
      return;
    }
    if (onChromeControl && !onChromeControl.hasAttribute("data-handle")) return;

    const active = this.activeBoardRect();
    if (!active) {
      this.hideGap();
      this.sheet.dataset.edge = "";
      this.clearRailHover();
      return;
    }
    const { cols, rows } = this.draft;
    const cellW = active.width / cols;
    const cellH = active.height / rows;
    const x = event.clientX - active.left;
    const y = event.clientY - active.top;
    const rail = 34;
    const edge = 24;
    const gapHit = 12;

    const inRailX = x >= -rail && x < Math.min(cellW * 0.55, 40);
    const inRailY = y >= -rail && y < Math.min(cellH * 0.55, 40);
    const inBoard = x >= 0 && y >= 0 && x <= active.width && y <= active.height;

    let gap: { kind: "col" | "row"; at: number } | null = null;
    if (this.draft.cols < MAZE_MAX && (inBoard || inRailY) && y >= -rail && y <= active.height + edge) {
      for (let at = 0; at <= cols; at += 1) {
        if (Math.abs(x - at * cellW) <= gapHit) {
          gap = { kind: "col", at };
          break;
        }
      }
    }
    if (!gap && this.draft.rows < MAZE_MAX && (inBoard || inRailX) && x >= -rail && x <= active.width + edge) {
      for (let at = 0; at <= rows; at += 1) {
        if (Math.abs(y - at * cellH) <= gapHit) {
          gap = { kind: "row", at };
          break;
        }
      }
    }

    if (gap) {
      this.showGap(gap.kind, gap.at, active, cellW, cellH);
      this.clearRailHover();
      this.sheet.dataset.edge = "";
      this.sheet.dataset.hot = "true";
      return;
    }

    this.hideGap();

    let hoverCol: number | null = null;
    let hoverRow: number | null = null;
    if (onChromeControl?.hasAttribute("data-handle")) {
      const kind = onChromeControl.dataset.handle === "row" ? "row" : "col";
      const index = Number(onChromeControl.dataset.index);
      if (kind === "col") hoverCol = index;
      else hoverRow = index;
    } else {
      if (inBoard || inRailY) {
        const col = Math.floor(x / cellW);
        if (col >= 0 && col < cols) hoverCol = col;
      }
      if (inBoard || inRailX) {
        const row = Math.floor(y / cellH);
        if (row >= 0 && row < rows) hoverRow = row;
      }
      if (inRailY && !inBoard) hoverRow = null;
      if (inRailX && !inBoard) hoverCol = null;
    }
    this.setRailHover(hoverCol, hoverRow);

    let edgeMode: "" | "south" | "east" | "both" = "";
    if (x >= 0 && x <= active.width && y >= active.height - edge && y <= active.height + edge + 10) {
      edgeMode = "south";
    }
    if (y >= 0 && y <= active.height && x >= active.width - edge && x <= active.width + edge + 10) {
      edgeMode = edgeMode === "south" ? "both" : "east";
    }
    this.sheet.dataset.edge = edgeMode;
    this.sheet.dataset.hot = inBoard || inRailX || inRailY || edgeMode !== "" ? "true" : "";
  };

  private onSheetPointerLeave = (): void => {
    this.hideGap();
    this.sheet.dataset.edge = "";
    this.sheet.dataset.hot = "";
    this.clearRailHover();
  };

  private setRailHover(col: number | null, row: number | null): void {
    for (const handle of this.colRail.querySelectorAll<HTMLButtonElement>("[data-handle]")) {
      const index = Number(handle.dataset.index);
      handle.dataset.hot = col === index ? "true" : "";
    }
    for (const handle of this.rowRail.querySelectorAll<HTMLButtonElement>("[data-handle]")) {
      const index = Number(handle.dataset.index);
      handle.dataset.hot = row === index ? "true" : "";
    }
  }

  private clearRailHover(): void {
    this.setRailHover(null, null);
  }

  private showGap(
    kind: "col" | "row",
    at: number,
    active: DOMRect,
    cellW: number,
    cellH: number,
  ): void {
    const chrome = this.chrome.getBoundingClientRect();
    this.gapBtn.hidden = false;
    this.gapLine.hidden = true;
    this.gapBtn.dataset.kind = kind;
    this.gapBtn.dataset.at = String(at);
    this.sheet.dataset.gap = kind;
    if (kind === "row") {
      const y = active.top - chrome.top + at * cellH;
      this.gapLine.style.left = `${active.left - chrome.left}px`;
      this.gapLine.style.top = `${y}px`;
      this.gapLine.style.width = `${active.width}px`;
      this.gapLine.style.height = "2px";
      this.gapBtn.style.left = `${active.left - chrome.left - 14}px`;
      this.gapBtn.style.top = `${y}px`;
      this.gapBtn.setAttribute("aria-label", at === 0 ? "Add a row above" : at >= this.draft.rows ? "Add a row below" : "Insert a row");
    } else {
      const x = active.left - chrome.left + at * cellW;
      this.gapLine.style.left = `${x}px`;
      this.gapLine.style.top = `${active.top - chrome.top}px`;
      this.gapLine.style.width = "2px";
      this.gapLine.style.height = `${active.height}px`;
      this.gapBtn.style.left = `${x}px`;
      this.gapBtn.style.top = `${active.top - chrome.top - 14}px`;
      this.gapBtn.setAttribute("aria-label", at === 0 ? "Add a column left" : at >= this.draft.cols ? "Add a column right" : "Insert a column");
    }
  }

  private activeBoardRect(): DOMRect | null {
    const rect = this.board.getBoundingClientRect();
    const style = getComputedStyle(this.board);
    const left = parseFloat(style.borderLeftWidth) || 0;
    const top = parseFloat(style.borderTopWidth) || 0;
    const right = parseFloat(style.borderRightWidth) || 0;
    const bottom = parseFloat(style.borderBottomWidth) || 0;
    const width = rect.width - left - right;
    const height = rect.height - top - bottom;
    if (width <= 0 || height <= 0) return null;
    return new DOMRect(rect.left + left, rect.top + top, width, height);
  }

  private syncChrome(): void {
    const { cols, rows } = this.draft;
    for (const el of [this.chrome, this.playFrame, this.sheet]) {
      el.style.setProperty("--cols", String(cols));
      el.style.setProperty("--rows", String(rows));
    }
    this.edgeSouth.disabled = rows >= MAZE_MAX;
    this.edgeEast.disabled = cols >= MAZE_MAX;

    const canDeleteCol = cols > MAZE_MIN;
    const canDeleteRow = rows > MAZE_MIN;
    for (const handle of this.colRail.querySelectorAll<HTMLButtonElement>("[data-handle]")) {
      const index = Number(handle.dataset.index);
      handle.dataset.selected = this.lineSelect?.kind === "col" && this.lineSelect.index === index ? "true" : "";
    }
    for (const handle of this.rowRail.querySelectorAll<HTMLButtonElement>("[data-handle]")) {
      const index = Number(handle.dataset.index);
      handle.dataset.selected = this.lineSelect?.kind === "row" && this.lineSelect.index === index ? "true" : "";
    }

    for (const cell of this.cells.values()) delete cell.dataset.line;

    if (!this.lineSelect) {
      this.selectBox.hidden = true;
      this.deleteBtn.hidden = true;
      return;
    }

    const { kind, index } = this.lineSelect;
    if ((kind === "col" && index >= cols) || (kind === "row" && index >= rows)) {
      this.lineSelect = null;
      this.selectBox.hidden = true;
      this.deleteBtn.hidden = true;
      return;
    }

    this.selectBox.hidden = false;
    this.deleteBtn.hidden = false;
    this.deleteBtn.disabled = kind === "col" ? !canDeleteCol : !canDeleteRow;
    this.deleteBtn.setAttribute("aria-label", kind === "col" ? `Delete column ${index + 1}` : `Delete row ${index + 1}`);
    this.selectBox.dataset.kind = kind;
    if (kind === "col") {
      this.selectBox.style.left = `calc(${index} / var(--cols) * 100%)`;
      this.selectBox.style.top = "0";
      this.selectBox.style.width = `calc(100% / var(--cols))`;
      this.selectBox.style.height = "100%";
      this.deleteBtn.style.left = `calc((${index} + 0.5) / var(--cols) * 100%)`;
      this.deleteBtn.style.top = "0";
      this.deleteBtn.style.transform = "translate(-50%, calc(-100% - 8px))";
    } else {
      this.selectBox.style.left = "0";
      this.selectBox.style.top = `calc(${index} / var(--rows) * 100%)`;
      this.selectBox.style.width = "100%";
      this.selectBox.style.height = `calc(100% / var(--rows))`;
      this.deleteBtn.style.left = "0";
      this.deleteBtn.style.top = `calc((${index} + 0.5) / var(--rows) * 100%)`;
      this.deleteBtn.style.transform = "translate(calc(-100% - 8px), -50%)";
    }

    for (const cell of this.cells.values()) {
      const match = kind === "col"
        ? Number(cell.dataset.c) === index
        : Number(cell.dataset.r) === index;
      if (match) cell.dataset.line = "true";
    }
  }

  private selectFloor(index: number): void {
    if (this.pairing()) return;
    if (!Number.isInteger(index) || index < 0 || index >= this.tower.floors.length) return;
    if (index === this.floorIndex) return;
    this.floorIndex = index;
    this.stroke = null;
    this.wallDrag = null;
    this.clearTileDrag();
    this.syncFloors();
    this.syncPalette();
    this.syncThemes();
    this.renderBoard();
    this.refreshHint();
  }

  private changeFloors(delta: number): void {
    if (this.mode === "campaign" || this.pairing()) return;
    if (delta > 0) {
      this.tower = addFloor(this.tower);
      this.floorIndex = this.tower.floors.length - 1;
    } else {
      this.tower = removeFloor(this.tower, this.floorIndex);
      this.floorIndex = Math.min(this.floorIndex, this.tower.floors.length - 1);
    }
    this.stroke = null;
    this.wallDrag = null;
    this.clearTileDrag();
    this.syncFloors();
    this.syncPalette();
    this.syncThemes();
    this.renderBoard();
    this.refreshHint();
  }

  private syncFloors(): void {
    const host = this.require("[data-floors]");
    host.replaceChildren();
    const count = this.tower.floors.length;
    const busy = this.pairing() !== null;
    const canRemove = count > FLOOR_MIN && !busy;
    this.tower.floors.forEach((_, index) => {
      const row = document.createElement("div");
      row.className = styles.floorRow;

      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.floorTab;
      button.dataset.floor = String(index);
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(index === this.floorIndex));
      button.textContent = floorName(index);
      button.disabled = busy;
      if (index === this.floorIndex) button.classList.add(styles.floorTabActive);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = styles.floorRemove;
      remove.dataset.floor = "remove";
      remove.dataset.index = String(index);
      remove.disabled = !canRemove;
      remove.setAttribute("aria-label", `Remove ${floorName(index)}`);
      remove.innerHTML = iconSvg("minus");

      row.append(button, remove);
      host.append(row);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = styles.floorAdd;
    add.dataset.floor = "add";
    add.disabled = count >= FLOOR_MAX || busy;
    add.innerHTML = `${iconSvg("plus")}Add floor`;
    host.append(add);
  }

  private removeFloorAt(index: number): void {
    if (this.mode === "campaign" || this.pairing()) return;
    if (!Number.isInteger(index) || this.tower.floors.length <= FLOOR_MIN) return;
    this.tower = removeFloor(this.tower, index);
    this.floorIndex = Math.min(this.floorIndex, this.tower.floors.length - 1);
    this.clearLineSelect();
    this.stroke = null;
    this.wallDrag = null;
    this.clearTileDrag();
    this.syncFloors();
    this.syncPalette();
    this.syncThemes();
    this.renderBoard();
    this.refreshHint();
  }

  private syncFloorLocks(busy: boolean): void {
    const host = this.require("[data-floors]");
    const canRemove = this.tower.floors.length > FLOOR_MIN && !busy;
    for (const button of host.querySelectorAll<HTMLButtonElement>("[data-floor]")) {
      if (button.dataset.floor === "add") {
        button.disabled = this.tower.floors.length >= FLOOR_MAX || busy;
      } else if (button.dataset.floor === "remove") {
        button.disabled = !canRemove;
      } else {
        button.disabled = busy;
      }
    }
  }

  private syncPalette(): void {
    const last = this.tower.floors.length - 1;
    const hatchOk = this.floorIndex !== last;
    const pairing = this.pairing();
    if (this.brush === "hatch" && !hatchOk) this.brush = "move";
    for (const [id, button] of this.paletteButtons) {
      const hide = id === "hatch" && !hatchOk;
      const on = this.brush === id;
      button.hidden = hide;
      button.disabled = hide || pairing !== null;
      button.classList.toggle("selected", on);
      button.setAttribute("aria-checked", String(on));
    }
    this.syncFloorLocks(pairing !== null);
    this.dirs.hidden = this.brush !== "boost" || pairing !== null;
    this.board.dataset.brush = this.brush;
    if (pairing) this.board.dataset.pairing = pairing;
    else delete this.board.dataset.pairing;
    if (pairing === "switch") {
      const pending = this.draft.tiles.find((tile) => tile.kind === "switch" && tile.wall === null);
      const tone = pending && pending.kind === "switch" ? pending.tone % 6 : 0;
      this.board.style.setProperty("--switch-link", `var(--maze-switch-${tone})`);
    } else {
      this.board.style.removeProperty("--switch-link");
    }
    if (pairing === "warp") {
      const pair = loneWarpPair(this.draft) ?? 0;
      this.board.style.setProperty("--warp-link", `var(--maze-warp-${pair % WARP_COLOR_COUNT})`);
    } else {
      this.board.style.removeProperty("--warp-link");
    }
  }

  private syncSize(): void {
    this.colReadout.textContent = String(this.draft.cols);
    this.rowReadout.textContent = String(this.draft.rows);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-sizes] [data-delta]")) {
      const axis = button.dataset.axis === "rows" ? "rows" : "cols";
      const value = axis === "rows" ? this.draft.rows : this.draft.cols;
      const delta = Number(button.dataset.delta);
      button.disabled = delta < 0 ? value <= MAZE_MIN : value >= MAZE_MAX;
    }
    this.syncChrome();
  }

  private renderBoard(): void {
    const { cols, rows } = this.draft;
    this.board.style.setProperty("--cols", String(cols));
    this.board.style.setProperty("--rows", String(rows));
    this.sheet.style.setProperty("--cols", String(cols));
    this.sheet.style.setProperty("--rows", String(rows));
    this.board.replaceChildren();
    this.cells.clear();
    this.walls.clear();
    this.mountRails();

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
        this.cells.set(`${c},${r}`, cell);
        this.board.append(cell);
      }
    }

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) this.addWall("v", c, r);
    }
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols; c += 1) this.addWall("h", c, r);
    }

    this.syncSize();
    this.syncCells();
    this.syncWalls();
  }

  private mountRails(): void {
    const { cols, rows } = this.draft;
    this.colRail.replaceChildren();
    this.rowRail.replaceChildren();
    for (let c = 0; c < cols; c += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.handle;
      button.dataset.handle = "col";
      button.dataset.index = String(c);
      button.style.setProperty("--i", String(c));
      button.setAttribute("aria-label", `Select column ${c + 1}`);
      button.innerHTML = `<span class="${styles.handleBars}" aria-hidden="true"></span>`;
      this.colRail.append(button);
    }
    for (let r = 0; r < rows; r += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.handle;
      button.dataset.handle = "row";
      button.dataset.index = String(r);
      button.style.setProperty("--i", String(r));
      button.setAttribute("aria-label", `Select row ${r + 1}`);
      button.innerHTML = `<span class="${styles.handleBars}" aria-hidden="true"></span>`;
      this.rowRail.append(button);
    }
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
    const drag = this.tileDrag;
    const hoverBrush = this.hoverBrush();
    const selectHover = this.selectHoverActive() ? this.brushHover : null;
    const hoverAt = hoverBrush && this.brushHover ? this.brushHover : null;
    const loneWarp = this.pairing() === "warp" ? loneWarpPair(this.draft) : null;
    for (const [id, cell] of this.cells) {
      const [c, r] = id.split(",").map(Number);
      if (c === undefined || r === undefined) continue;
      const last = this.tower.floors.length - 1;
      let paint = describeCell(this.draft, c, r, openPairs, this.floorIndex === last, this.floorIndex > 0);
      const isSource = !!drag && drag.from.c === c && drag.from.r === r;
      const isOver = !!drag && drag.moved && drag.over.c === c && drag.over.r === r;
      const here = tileAt(this.draft, c, r);
      const isPairSource = loneWarp !== null && here?.kind === "warp" && here.pair === loneWarp;
      const isBrushHover = !!hoverAt && hoverAt.c === c && hoverAt.r === r && !isPairSource;
      const isSelectHover = !!selectHover && selectHover.c === c && selectHover.r === r && !isSource;
      const ghost = isBrushHover && hoverBrush ? this.describeBrushGhost(hoverBrush, c, r) : null;
      if (isOver && this.canDropAt(drag.over, drag.lift)) {
        paint = describeLift(drag.lift, c, r, this.floorIndex > 0);
      } else if (ghost?.ok) {
        paint = ghost.paint;
      }
      cell.dataset.kind = paint.kind;
      if (paint.dir) cell.dataset.dir = paint.dir;
      else delete cell.dataset.dir;
      if (paint.pair !== undefined) cell.dataset.pair = String(paint.pair);
      else delete cell.dataset.pair;
      if (paint.open) cell.dataset.open = "true";
      else delete cell.dataset.open;
      if (isSource || isPairSource) cell.dataset.dragging = "true";
      else delete cell.dataset.dragging;
      if (isOver) cell.dataset.drop = this.canDropAt(drag.over, drag.lift) ? "ok" : "no";
      else if (ghost) cell.dataset.drop = ghost.ok ? "ok" : "no";
      else delete cell.dataset.drop;
      const menuOn = !!this.tileMenuAt && this.tileMenuAt.c === c && this.tileMenuAt.r === r;
      if (menuOn) cell.dataset.menu = "true";
      else delete cell.dataset.menu;
      if (isSelectHover && !menuOn) cell.dataset.hover = "true";
      else delete cell.dataset.hover;
      if (this.pairing() === "warp" && !isPairSource) {
        const linkOk = loneWarp !== null
          && tileAt(this.draft, c, r)?.kind !== "warp"
          && this.canBrushAt({ c, r }, { kind: "warp", pair: loneWarp });
        if (linkOk) cell.dataset.link = "true";
        else delete cell.dataset.link;
      } else {
        delete cell.dataset.link;
      }
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
    if (this.pairing() === "switch" && !open) wall.dataset.link = "true";
    else delete wall.dataset.link;
    if (axis === "v") {
      const joinN = !open && r > 0
        && (interiorClosed(this.draft, "h", c, r - 1) || interiorClosed(this.draft, "h", c + 1, r - 1));
      const joinS = !open
        && (interiorClosed(this.draft, "h", c, r) || interiorClosed(this.draft, "h", c + 1, r));
      if (joinN) wall.dataset.joinN = "true";
      else delete wall.dataset.joinN;
      if (joinS) wall.dataset.joinS = "true";
      else delete wall.dataset.joinS;
      delete wall.dataset.joinW;
      delete wall.dataset.joinE;
    } else {
      const joinW = !open && c > 0
        && (interiorClosed(this.draft, "v", c - 1, r) || interiorClosed(this.draft, "v", c - 1, r + 1));
      const joinE = !open
        && (interiorClosed(this.draft, "v", c, r) || interiorClosed(this.draft, "v", c, r + 1));
      if (joinW) wall.dataset.joinW = "true";
      else delete wall.dataset.joinW;
      if (joinE) wall.dataset.joinE = "true";
      else delete wall.dataset.joinE;
      delete wall.dataset.joinN;
      delete wall.dataset.joinS;
    }
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
    this.clearTileDrag();
    if (this.lineSelect) this.clearLineSelect();
    this.hideGap();
    if (!this.tileMenu.contains(event.target as Node)) this.hideTileMenu();
    this.board.setPointerCapture(event.pointerId);

    const pair = this.pairing();
    if (pair === "switch") {
      const wall = elementAt(event.clientX, event.clientY, "data-wall");
      if (wall?.dataset.link === "true") {
        this.stroke = "close";
        this.bindSwitch(wall);
        if (!pendingSwitch(this.draft)) this.brush = "move";
        this.syncPalette();
        this.syncCells();
        this.syncWalls();
        this.refreshHint();
      }
      return;
    }
    if (pair === "warp") {
      const point = this.cellAt(event.clientX, event.clientY);
      const lone = loneWarpPair(this.draft);
      if (
        point
        && lone !== null
        && tileAt(this.draft, point.c, point.r)?.kind !== "warp"
        && this.canBrushAt(point, { kind: "warp", pair: lone })
      ) {
        this.brush = "warp";
        this.applyPaint(event.clientX, event.clientY);
      }
      return;
    }

    if (this.brush === "move" && this.beginTileDrag(event.clientX, event.clientY)) return;

    if (this.brush === "wall") {
      this.beginWallDrag(event.clientX, event.clientY);
      if (this.wallDrag) return;
    }

    this.applyPaint(event.clientX, event.clientY);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      this.updateBrushHover(event.clientX, event.clientY);
      return;
    }
    if (this.tileDrag) {
      this.extendTileDrag(event.clientX, event.clientY);
      return;
    }
    if (this.wallDrag) {
      this.extendWallDrag(event.clientX, event.clientY);
      return;
    }
    this.applyPaint(event.clientX, event.clientY);
  };

  private onPairHoverLeave = (): void => {
    if (!this.brushHover) return;
    this.brushHover = null;
    if (this.hoverBrush() || this.selectHoverActive()) this.syncCells();
  };

  private hoverBrush(): PaletteKind | null {
    if (this.pairing() === "switch") return null;
    if (this.pairing() === "warp") return "warp";
    if (this.brush === "move" || this.brush === "erase" || this.brush === "wall") return null;
    return this.brush;
  }

  private selectHoverActive(): boolean {
    return this.brush === "move" && !this.pairing() && !this.tileDrag;
  }

  private updateBrushHover(x: number, y: number): void {
    if (!this.hoverBrush() && !this.selectHoverActive()) {
      if (this.brushHover) {
        this.brushHover = null;
        this.syncCells();
      }
      return;
    }
    const point = this.cellAt(x, y);
    if (point && this.brushHover && samePoint(point, this.brushHover)) return;
    if (!point && !this.brushHover) return;
    this.brushHover = point;
    this.syncCells();
  }

  private describeBrushGhost(brush: PaletteKind, c: number, r: number): { paint: CellPaint; ok: boolean } {
    const where = `column ${c + 1}, row ${r + 1}`;
    const point = { c, r };
    if (brush === "pit") {
      return {
        paint: { kind: "pit", label: `Place pit, ${where}` },
        ok: this.canBrushAt(point, { kind: "pit" }),
      };
    }
    if (brush === "boost") {
      return {
        paint: { kind: "boost", dir: this.boostDir, label: `Place boost ${DIR_WORD[this.boostDir]}, ${where}` },
        ok: this.canBrushAt(point, { kind: "boost", dir: this.boostDir }),
      };
    }
    if (brush === "ice") {
      return {
        paint: { kind: "ice", label: `Place ice, ${where}` },
        ok: this.canBrushAt(point, { kind: "ice" }),
      };
    }
    if (brush === "crumble") {
      return {
        paint: { kind: "crumble", label: `Place crumble, ${where}` },
        ok: this.canBrushAt(point, { kind: "crumble" }),
      };
    }
    if (brush === "hatch") {
      return {
        paint: { kind: "hatch", label: `Place hatch, ${where}` },
        ok: this.canBrushAt(point, { kind: "hatch" }),
      };
    }
    if (brush === "warp") {
      const pair = loneWarpPair(this.draft) ?? previewWarpPair(this.draft);
      const color = pair % WARP_COLOR_COUNT;
      const ok = tileAt(this.draft, c, r)?.kind !== "warp"
        && this.canBrushAt(point, { kind: "warp", pair });
      return {
        paint: {
          kind: "warp",
          pair: color,
          open: true,
          label: `Place warp ${color + 1}, ${where}`,
        },
        ok,
      };
    }
    const tone = previewSwitchTone(this.draft);
    return {
      paint: {
        kind: "switch",
        pair: tone % 6,
        open: true,
        label: `Place switch, ${where}`,
      },
      ok: this.canBrushAt(point, { kind: "switch", tone, wall: null }),
    };
  }

  private canBrushAt(point: { c: number; r: number }, lift: LiftedTile): boolean {
    if (lift.kind === "hatch") {
      if (this.floorIndex >= this.tower.floors.length - 1) return false;
      return !samePoint(point, this.draft.start);
    }
    return canDropLifted(this.draft, { c: -1, r: -1 }, point, lift);
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const drag = this.tileDrag;
    const hadWallDrag = this.wallDrag !== null;
    const hadStroke = this.stroke !== null;
    this.pointerId = null;
    this.stroke = null;
    this.wallDrag = null;
    if (drag && drag.moved) {
      if (this.canDropAt(drag.over, drag.lift)) this.commitLift(drag.from, drag.over, drag.lift);
      this.clearTileDrag();
      this.syncCells();
      this.syncWalls();
      return;
    }
    const clickAt = drag?.from ?? (!hadWallDrag && !hadStroke ? this.cellAt(event.clientX, event.clientY) : null);
    this.clearTileDrag();
    if (!this.pairing() && this.brush === "move" && !hadWallDrag && !hadStroke && clickAt) {
      this.openTileMenu(clickAt);
    }
  };

  private clearTileDrag(): void {
    this.tileDrag = null;
    this.board.classList.remove(styles.dragging);
    for (const cell of this.cells.values()) {
      delete cell.dataset.dragging;
      delete cell.dataset.drop;
    }
    if (this.hoverBrush() && this.brushHover) this.syncCells();
  }

  private applyPaint(x: number, y: number): void {
    if (this.pairing() === "switch") return;
    if (this.brush === "erase") {
      const wall = elementAt(x, y, "data-wall");
      if (wall) {
        const axis: WallAxis = wall.dataset.axis === "h" ? "h" : "v";
        const c = Number(wall.dataset.c);
        const r = Number(wall.dataset.r);
        if (Number.isInteger(c) && Number.isInteger(r) && interiorClosed(this.draft, axis, c, r)) {
          setInteriorWall(this.draft, axis, c, r, false);
          this.syncCells();
          this.syncWalls();
        }
        return;
      }
      const point = this.cellAt(x, y);
      if (!point) return;
      clearFloor(this.draft, point);
      this.syncCells();
      this.syncWalls();
      return;
    }

    const brush = this.brush;
    if (brush === "move" || brush === "wall") return;
    if ((brush === "warp" || brush === "switch") && this.stroke !== null) return;
    if (this.pairing() === "warp" && brush !== "warp") return;

    if (brush === "switch") {
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

    const point = this.cellAt(x, y);
    if (!point) return;
    if (brush === "warp" || brush === "switch") this.stroke = "close";
    if (brush === "hatch") setHatch(this.tower, this.floorIndex, point);
    else if (brush === "pit") setPit(this.draft, point, true);
    else if (brush === "boost") setBoost(this.draft, point, this.boostDir);
    else if (brush === "ice") setIce(this.draft, point);
    else if (brush === "crumble") setCrumble(this.draft, point);
    else if (brush === "switch") {
      paintSwitch(this.draft, point);
      if (pendingSwitch(this.draft)) this.enterPairing("switch");
    } else if (brush === "warp") {
      paintWarp(this.draft, point);
      if (loneWarpPair(this.draft) !== null) this.enterPairing("warp");
      else this.brushHover = null;
    }
    this.syncPalette();
    this.syncCells();
    this.syncWalls();
    if (brush === "warp" || brush === "switch") this.refreshHint();
  }

  private beginTileDrag(x: number, y: number): boolean {
    const point = this.cellAt(x, y);
    if (!point) return false;
    const last = this.tower.floors.length - 1;
    const lift = liftAt(this.draft, point, {
      start: this.floorIndex === 0,
      goal: this.floorIndex === last,
      hatch: this.floorIndex !== last,
    });
    if (!lift) return false;
    this.tileDrag = { lift, from: point, over: point, moved: false };
    this.board.classList.add(styles.dragging);
    this.syncCells();
    return true;
  }

  private extendTileDrag(x: number, y: number): void {
    const drag = this.tileDrag;
    if (!drag) return;
    const point = this.cellAt(x, y);
    if (!point) return;
    if (drag.over.c === point.c && drag.over.r === point.r) return;
    drag.over = point;
    drag.moved = drag.moved || !samePoint(point, drag.from);
    this.syncCells();
  }

  private canDropAt(to: { c: number; r: number }, lift: LiftedTile): boolean {
    if (lift.kind === "hatch") return !samePoint(to, this.draft.start);
    return canDropLifted(this.draft, this.tileDrag?.from ?? to, to, lift);
  }

  private commitLift(from: { c: number; r: number }, to: { c: number; r: number }, lift: LiftedTile): boolean {
    if (lift.kind === "hatch") {
      if (samePoint(to, this.draft.start)) return false;
      setHatch(this.tower, this.floorIndex, to);
      return !!this.draft.hatch && samePoint(this.draft.hatch, to);
    }
    return moveLifted(this.draft, from, to, lift);
  }

  private cellAt(x: number, y: number): { c: number; r: number } | null {
    const rect = this.board.getBoundingClientRect();
    const style = getComputedStyle(this.board);
    const left = parseFloat(style.borderLeftWidth) || 0;
    const top = parseFloat(style.borderTopWidth) || 0;
    const right = parseFloat(style.borderRightWidth) || 0;
    const bottom = parseFloat(style.borderBottomWidth) || 0;
    const width = rect.width - left - right;
    const height = rect.height - top - bottom;
    if (width <= 0 || height <= 0) return null;
    const localX = x - rect.left - left;
    const localY = y - rect.top - top;
    if (localX < 0 || localY < 0 || localX >= width || localY >= height) return null;
    const c = Math.floor((localX / width) * this.draft.cols);
    const r = Math.floor((localY / height) * this.draft.rows);
    if (c < 0 || r < 0 || c >= this.draft.cols || r >= this.draft.rows) return null;
    return { c, r };
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
    this.syncWalls();
    this.syncCells();
  }

  private alongIndex(x: number, y: number, axis: WallAxis): number {
    const rect = this.board.getBoundingClientRect();
    const style = getComputedStyle(this.board);
    const left = parseFloat(style.borderLeftWidth) || 0;
    const top = parseFloat(style.borderTopWidth) || 0;
    const right = parseFloat(style.borderRightWidth) || 0;
    const bottom = parseFloat(style.borderBottomWidth) || 0;
    const active = axis === "v" ? this.draft.rows : this.draft.cols;
    const size = axis === "v" ? rect.height - top - bottom : rect.width - left - right;
    const local = axis === "v" ? y - rect.top - top : x - rect.left - left;
    const index = Math.floor((local / Math.max(size, 1)) * active);
    return Math.min(active - 1, Math.max(0, index));
  }

  private onKey = (event: KeyboardEvent): void => {
    if (!this.isOpen()) return;
    if (event.target === this.nameInput || this.nameInput.contains(event.target as Node)) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.nameInput.blur();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (this.cancelPairing()) return;
      if (this.tileMenuAt) {
        this.hideTileMenu();
        return;
      }
      if (this.lineSelect) {
        this.clearLineSelect();
        return;
      }
      this.requestClose();
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && this.lineSelect && !this.deleteBtn.disabled) {
      event.preventDefault();
      event.stopPropagation();
      if (this.lineSelect.kind === "col") this.removeColumn(this.lineSelect.index);
      else this.removeRow(this.lineSelect.index);
      return;
    }
    const meta = event.metaKey || event.ctrlKey;
    if (!meta || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === "c") {
      event.preventDefault();
      event.stopPropagation();
      if (this.mode === "campaign") void this.copyModel();
      else void this.share();
    } else if (key === "v") {
      event.preventDefault();
      event.stopPropagation();
      void this.pasteModel();
    }
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

function previewWarpPair(maze: Maze): number {
  let next = 0;
  for (const tile of maze.tiles) {
    if (tile.kind === "warp" && tile.pair >= next) next = tile.pair + 1;
  }
  return next;
}

function previewSwitchTone(maze: Maze): number {
  const pending = maze.tiles.find((tile) => tile.kind === "switch" && tile.wall === null);
  if (pending?.kind === "switch") return pending.tone;
  let next = 0;
  for (const tile of maze.tiles) {
    if (tile.kind === "switch" && tile.tone >= next) next = tile.tone + 1;
  }
  return next;
}

type CellPaint = { kind: CellKind; dir?: Direction; pair?: number; open?: boolean; label: string };

function describeCell(
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

function describeLift(lift: LiftedTile, c: number, r: number, landing: boolean): CellPaint {
  const where = `column ${c + 1}, row ${r + 1}`;
  if (lift.kind === "start") return { kind: "start", label: `${landing ? "Landing" : "Start"}, ${where}` };
  if (lift.kind === "goal") return { kind: "goal", label: `Exit, ${where}` };
  if (lift.kind === "hatch") return { kind: "hatch", label: `Hatch, ${where}` };
  if (lift.kind === "pit") return { kind: "pit", label: `Pit, ${where}` };
  if (lift.kind === "boost") return { kind: "boost", dir: lift.dir, label: `Boost ${DIR_WORD[lift.dir]}, ${where}` };
  if (lift.kind === "ice") return { kind: "ice", label: `Ice, ${where}` };
  if (lift.kind === "crumble") return { kind: "crumble", label: `Crumble, ${where}` };
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

function floorName(index: number): string {
  return `Floor ${index + 1}`;
}

function switchTone(maze: Maze, axis: WallAxis, c: number, r: number): number | null {
  for (const tile of maze.tiles) {
    if (tile.kind !== "switch" || !tile.wall) continue;
    if (tile.wall.axis === axis && tile.wall.c === c && tile.wall.r === r) return tile.tone % 6;
  }
  return null;
}

function samePoint(a: { c: number; r: number }, b: { c: number; r: number }): boolean {
  return a.c === b.c && a.r === b.r;
}

function elementAt(x: number, y: number, attr: "data-wall" | "data-cell"): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el instanceof HTMLElement && el.hasAttribute(attr)) return el;
  }
  return null;
}
