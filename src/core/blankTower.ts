import { resizeMaze } from "./maze.ts";
import { DEFAULT_FLOOR_THEME } from "./theme.ts";
import type { Tower } from "./tower.ts";

/** One empty 7×7 floor — the starting canvas for the level editor. */
export function blankAuthorTower(): Tower {
  return {
    floors: [
      resizeMaze(
        {
          cols: 1,
          rows: 1,
          walls: [[0]],
          holes: [],
          tiles: [],
          hearts: [],
          coins: [],
          stars: [],
          wings: [],
          ghosts: [],
          oneWays: [],
          start: { c: 0, r: 0 },
          goal: { c: 0, r: 0 },
          hatch: null,
          theme: DEFAULT_FLOOR_THEME,
        },
        7,
        7,
      ),
    ],
  };
}
