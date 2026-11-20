import type { WallAxis } from "../core/maze.ts";
import styles from "./editor.module.css";

export interface BoardDomTargets {
  board: HTMLElement;
  sheet: HTMLElement;
  colRail: HTMLElement;
  rowRail: HTMLElement;
  /** Filled with `"c,r"` → cell button. */
  cells: Map<string, HTMLButtonElement>;
  /** Filled with `"axis:c,r"` → wall element. */
  walls: Map<string, HTMLElement>;
}

export function wallKey(axis: WallAxis, c: number, r: number): string {
  return `${axis}:${c},${r}`;
}

export function createCell(c: number, r: number): HTMLButtonElement {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = styles.cell;
  cell.tabIndex = -1;
  cell.dataset.cell = "";
  cell.dataset.c = String(c);
  cell.dataset.r = String(r);
  cell.style.setProperty("--c", String(c));
  cell.style.setProperty("--r", String(r));
  const pickup = document.createElement("span");
  pickup.className = styles.pickup;
  pickup.setAttribute("aria-hidden", "true");
  cell.append(pickup);
  return cell;
}

export function createWall(axis: WallAxis, c: number, r: number): HTMLElement {
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
  return wall;
}

function createRailHandle(kind: "col" | "row", index: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = styles.handle;
  button.dataset.handle = kind;
  button.dataset.index = String(index);
  button.style.setProperty("--i", String(index));
  button.setAttribute("aria-label", `Select ${kind === "col" ? "column" : "row"} ${index + 1}`);
  button.dataset.tip = "Drag to move";
  button.dataset.tipSide = kind === "col" ? "top" : "left";
  button.innerHTML = `<span class="${styles.handleBars}" aria-hidden="true"></span>`;
  return button;
}

export function mountRails(colRail: HTMLElement, rowRail: HTMLElement, cols: number, rows: number): void {
  colRail.replaceChildren();
  rowRail.replaceChildren();
  for (let c = 0; c < cols; c += 1) colRail.append(createRailHandle("col", c));
  for (let r = 0; r < rows; r += 1) rowRail.append(createRailHandle("row", r));
}

/** Rebuild rails, cells, and interior walls for a `cols` × `rows` board. */
export function renderBoardDom(targets: BoardDomTargets, cols: number, rows: number): void {
  const { board, sheet, colRail, rowRail, cells, walls } = targets;
  board.style.setProperty("--cols", String(cols));
  board.style.setProperty("--rows", String(rows));
  sheet.style.setProperty("--cols", String(cols));
  sheet.style.setProperty("--rows", String(rows));
  board.replaceChildren();
  cells.clear();
  walls.clear();
  mountRails(colRail, rowRail, cols, rows);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = createCell(c, r);
      cells.set(`${c},${r}`, cell);
      board.append(cell);
    }
  }

  const addWall = (axis: WallAxis, c: number, r: number): void => {
    const wall = createWall(axis, c, r);
    board.append(wall);
    walls.set(wallKey(axis, c, r), wall);
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) addWall("v", c, r);
  }
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols; c += 1) addWall("h", c, r);
  }
}
