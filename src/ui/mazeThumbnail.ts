import { Wall, type Maze } from "../core/maze.ts";
import { parseFloorTheme } from "../core/theme.ts";
import { installCrumblePreviewCss } from "../render/crumblePaint.ts";
import { thumbnailCellKind } from "./mazeCellKind.ts";
import styles from "./mazeThumbnail.module.css";

export function renderMazeThumbnail(maze: Maze): HTMLElement {
  installCrumblePreviewCss();
  const board = document.createElement("div");
  board.className = styles.board;
  board.dataset.theme = parseFloorTheme(maze.theme);
  board.style.setProperty("--cols", String(maze.cols));
  board.style.setProperty("--rows", String(maze.rows));
  board.setAttribute("aria-hidden", "true");

  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      const cell = document.createElement("div");
      cell.className = styles.cell;
      const bits = maze.walls[r]?.[c] ?? 0;
      if ((bits & Wall.north) !== 0) cell.dataset.n = "";
      if ((bits & Wall.west) !== 0) cell.dataset.w = "";
      if (r === maze.rows - 1 && (bits & Wall.south) !== 0) cell.dataset.s = "";
      if (c === maze.cols - 1 && (bits & Wall.east) !== 0) cell.dataset.e = "";
      cell.dataset.kind = thumbnailCellKind(maze, c, r);
      board.append(cell);
    }
  }

  return board;
}
