import { Wall, type Maze } from "../core/maze.ts";
import { parseFloorTheme } from "../core/theme.ts";
import styles from "./mazeThumbnail.module.css";

type CellKind = "floor" | "start" | "goal" | "hatch" | "pit" | "boost" | "ice" | "crumble" | "warp" | "switch";

export function renderMazeThumbnail(maze: Maze): HTMLElement {
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
      cell.dataset.kind = cellKind(maze, c, r);
      board.append(cell);
    }
  }

  return board;
}

function cellKind(maze: Maze, c: number, r: number): CellKind {
  if (maze.start.c === c && maze.start.r === r) return "start";
  if (maze.hatch && maze.hatch.c === c && maze.hatch.r === r) return "hatch";
  if (!maze.hatch && maze.goal.c === c && maze.goal.r === r) return "goal";
  if (maze.holes.some((hole) => hole.c === c && hole.r === r)) return "pit";
  const tile = maze.tiles.find((item) => item.c === c && item.r === r);
  if (!tile) return "floor";
  if (tile.kind === "boost") return "boost";
  if (tile.kind === "ice") return "ice";
  if (tile.kind === "crumble") return "crumble";
  if (tile.kind === "warp") return "warp";
  return "switch";
}
