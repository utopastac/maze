import { cloneTower, type Tower } from "../core/tower.ts";

export type EditorHistoryEntry = {
  tower: Tower;
  floorIndex: number;
};

const DEFAULT_LIMIT = 100;

/** Undo/redo stack for the level editor — UI buttons sync via `syncButtons`. */
export class EditorHistory {
  private past: EditorHistoryEntry[] = [];
  private future: EditorHistoryEntry[] = [];
  /** True while a continuous gesture (stroke / drag / slider) owns one undo step. */
  private gestureOpen = false;
  private readonly limit: number;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;

  constructor(
    buttons: { undo: HTMLButtonElement; redo: HTMLButtonElement },
    limit = DEFAULT_LIMIT,
  ) {
    this.undoBtn = buttons.undo;
    this.redoBtn = buttons.redo;
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  reset(): void {
    this.past = [];
    this.future = [];
    this.gestureOpen = false;
    this.syncButtons();
  }

  /** Snapshot before a one-shot mutation (always starts a new undo step). */
  snapshot(tower: Tower, floorIndex: number): void {
    this.gestureOpen = false;
    this.past.push({ tower: cloneTower(tower), floorIndex });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.syncButtons();
  }

  /** Snapshot once for a continuous gesture (paint stroke, wall drag, slider). */
  beginEdit(tower: Tower, floorIndex: number): void {
    if (this.gestureOpen) return;
    this.snapshot(tower, floorIndex);
    this.gestureOpen = true;
  }

  endEdit(): void {
    this.gestureOpen = false;
  }

  /** Pop past → apply; returns the entry to restore, or null. */
  undo(current: EditorHistoryEntry): EditorHistoryEntry | null {
    if (this.past.length === 0) return null;
    this.endEdit();
    this.future.push({ tower: cloneTower(current.tower), floorIndex: current.floorIndex });
    const entry = this.past.pop()!;
    this.syncButtons();
    return entry;
  }

  /** Pop future → apply; returns the entry to restore, or null. */
  redo(current: EditorHistoryEntry): EditorHistoryEntry | null {
    if (this.future.length === 0) return null;
    this.endEdit();
    this.past.push({ tower: cloneTower(current.tower), floorIndex: current.floorIndex });
    const entry = this.future.pop()!;
    this.syncButtons();
    return entry;
  }

  syncButtons(): void {
    this.undoBtn.disabled = this.past.length === 0;
    this.redoBtn.disabled = this.future.length === 0;
  }
}
