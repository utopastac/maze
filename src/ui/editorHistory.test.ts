import { describe, expect, it } from "vitest";
import { carveFloor } from "../core/maze.ts";
import { cloneTower, type Tower } from "../core/tower.ts";
import { EditorHistory } from "./editorHistory.ts";

function blankTower(cols = 3): Tower {
  return { floors: [carveFloor(1, cols, 3, { c: 0, r: 0 })] };
}

function buttons(): { undo: HTMLButtonElement; redo: HTMLButtonElement } {
  return {
    undo: document.createElement("button"),
    redo: document.createElement("button"),
  };
}

describe("EditorHistory", () => {
  it("snapshots and undoes to the prior tower", () => {
    const history = new EditorHistory(buttons());
    const a = blankTower(3);
    const b = blankTower(5);

    history.snapshot(a, 0);
    const restored = history.undo({ tower: b, floorIndex: 0 });
    expect(restored?.tower.floors[0]?.cols).toBe(3);
    expect(history.canRedo).toBe(true);
  });

  it("coalesces beginEdit into one undo step", () => {
    const history = new EditorHistory(buttons());
    const a = blankTower();
    history.beginEdit(a, 0);
    history.beginEdit(a, 0);
    history.beginEdit(a, 0);
    history.endEdit();
    expect(history.canUndo).toBe(true);
    history.undo({ tower: a, floorIndex: 0 });
    expect(history.canUndo).toBe(false);
  });

  it("redo restores the discarded state", () => {
    const history = new EditorHistory(buttons());
    const a = blankTower(3);
    const b = blankTower(5);
    history.snapshot(a, 0);
    const undone = history.undo({ tower: b, floorIndex: 0 });
    expect(undone?.tower.floors[0]?.cols).toBe(3);
    const redone = history.redo({ tower: cloneTower(undone!.tower), floorIndex: 0 });
    expect(redone?.tower.floors[0]?.cols).toBe(5);
  });
});
