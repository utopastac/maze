import { describe, expect, it } from "vitest";
import { Wall, carveFloor, cloneMaze } from "./maze.ts";

describe("carveFloor", () => {
  it("is deterministic for a seed", () => {
    const a = carveFloor(123, 7, 7, { c: 0, r: 0 });
    const b = carveFloor(123, 7, 7, { c: 0, r: 0 });
    expect(a.walls).toEqual(b.walls);
    expect(a.start).toEqual(b.start);
    expect(a.goal).toEqual(b.goal);
  });

  it("keeps start and goal inside bounds", () => {
    const maze = carveFloor(7, 9, 5, { c: 20, r: -3 });
    expect(maze.cols).toBe(9);
    expect(maze.rows).toBe(5);
    expect(maze.start.c).toBeGreaterThanOrEqual(0);
    expect(maze.start.c).toBeLessThan(maze.cols);
    expect(maze.start.r).toBeGreaterThanOrEqual(0);
    expect(maze.start.r).toBeLessThan(maze.rows);
    expect(maze.goal.c).toBeGreaterThanOrEqual(0);
    expect(maze.goal.r).toBeLessThan(maze.rows);
  });

  it("opens at least one wall path from a carved cell", () => {
    const maze = carveFloor(1, 5, 5, { c: 0, r: 0 });
    let open = 0;
    for (let r = 0; r < maze.rows; r += 1) {
      for (let c = 0; c < maze.cols; c += 1) {
        const bits = maze.walls[r]![c]!;
        if ((bits & Wall.north) === 0) open += 1;
        if ((bits & Wall.east) === 0) open += 1;
        if ((bits & Wall.south) === 0) open += 1;
        if ((bits & Wall.west) === 0) open += 1;
      }
    }
    expect(open).toBeGreaterThan(0);
  });
});

describe("cloneMaze", () => {
  it("deep-copies walls and markers", () => {
    const maze = carveFloor(3, 4, 4, { c: 1, r: 1 });
    maze.holes = [{ c: 2, r: 2 }];
    const copy = cloneMaze(maze);
    copy.walls[0]![0] = 0;
    copy.holes[0]!.c = 0;
    expect(maze.walls[0]![0]).not.toBe(0);
    expect(maze.holes[0]!.c).toBe(2);
  });
});
