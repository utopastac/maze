import { describe, expect, it } from "vitest";
import { generateTower } from "./tower.ts";
import { isSolid, layoutMaze, layoutTower } from "./layout.ts";

describe("layoutTower", () => {
  it("produces one floor layout per tower floor", () => {
    const tower = generateTower(21, 7, 7, 3);
    const layout = layoutTower(tower);
    expect(layout.floors).toHaveLength(3);
    expect(layout.story).toBeGreaterThan(0);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.depth).toBeGreaterThan(0);
  });

  it("marks only the last floor as finale", () => {
    const tower = generateTower(8, 5, 5, 2);
    const layout = layoutTower(tower);
    expect(layout.floors[0]!.finale).toBe(false);
    expect(layout.floors[1]!.finale).toBe(true);
  });
});

describe("layoutMaze", () => {
  it("keeps start and goal inside bounds", () => {
    const tower = generateTower(3, 7, 7, 1);
    const maze = tower.floors[0]!;
    const layout = layoutMaze(maze, true);
    expect(layout.cols).toBe(7);
    expect(layout.rows).toBe(7);
    expect(layout.start.x).toBeGreaterThanOrEqual(layout.minX);
    expect(layout.start.x).toBeLessThanOrEqual(layout.maxX);
    expect(layout.goal.z).toBeGreaterThanOrEqual(layout.minZ);
    expect(layout.goal.z).toBeLessThanOrEqual(layout.maxZ);
    expect(layout.pieces.some((piece) => piece.kind === "start")).toBe(true);
  });

  it("includes solid wall pieces for closed interiors", () => {
    const tower = generateTower(11, 5, 5, 1);
    const layout = layoutMaze(tower.floors[0]!, true);
    expect(layout.pieces.some((piece) => isSolid(piece.kind))).toBe(true);
  });
});
