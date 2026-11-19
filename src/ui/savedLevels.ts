import { listSavedLevels, loadSavedLevel, deleteSavedLevel, type SavedLevel } from "../core/savedLevels.ts";
import { FLOOR_THEME_META, parseFloorTheme } from "../core/theme.ts";
import type { Tower } from "../core/tower.ts";
import { iconSvg } from "./icons.ts";
import { renderMazeBoardPreview } from "./mazeBoardPreview.ts";
import styles from "./savedLevels.module.css";

export interface SavedLevelsCallbacks {
  onPick: (tower: Tower) => void;
  onClose: () => void;
}

export class SavedLevelsPanel {
  private readonly root: HTMLElement;
  private readonly callbacks: SavedLevelsCallbacks;
  private readonly list: HTMLElement;
  private readonly confirmRoot: HTMLElement;
  private readonly confirmTitle: HTMLElement;
  private readonly confirmBody: HTMLElement;
  private readonly confirmOk: HTMLButtonElement;
  private pendingDeleteId: string | null = null;
  private open = false;

  constructor(root: HTMLElement, callbacks: SavedLevelsCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div class="${styles.scrim}" data-scrim></div>
      <div class="${styles.card}">
        <header class="${styles.head}">
          <div>
            <h2 class="${styles.title}">Saved levels</h2>
          </div>
          <button type="button" class="glass-btn ${styles.close}" data-close aria-label="Close saved levels">${iconSvg("close")}</button>
        </header>
        <div class="${styles.list}" data-list></div>
      </div>
      <div class="${styles.confirm}" data-confirm hidden>
        <div class="${styles.confirmScrim}" data-confirm-scrim></div>
        <div
          class="${styles.confirmCard}"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="saved-confirm-title"
          aria-describedby="saved-confirm-body"
        >
          <p class="${styles.confirmTitle}" id="saved-confirm-title" data-confirm-title></p>
          <p class="${styles.confirmBody}" id="saved-confirm-body" data-confirm-body></p>
          <div class="${styles.confirmActions}">
            <button type="button" class="glass-pill ${styles.confirmCancel}" data-confirm-cancel>Cancel</button>
            <button type="button" class="glass-pill metal-ring ${styles.confirmOk}" data-confirm-ok>Delete</button>
          </div>
        </div>
      </div>
    `;
    this.list = this.require("[data-list]");
    this.confirmRoot = this.require("[data-confirm]");
    this.confirmTitle = this.require("[data-confirm-title]");
    this.confirmBody = this.require("[data-confirm-body]");
    this.confirmOk = this.require("[data-confirm-ok]");
    this.require("[data-close]").addEventListener("click", () => this.callbacks.onClose());
    this.require("[data-scrim]").addEventListener("click", () => this.callbacks.onClose());
    this.require("[data-confirm-scrim]").addEventListener("click", () => this.hideDeleteConfirm());
    this.require("[data-confirm-cancel]").addEventListener("click", () => this.hideDeleteConfirm());
    this.confirmOk.addEventListener("click", () => this.commitDeleteConfirm());
  }

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.hideDeleteConfirm();
    this.renderList();
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    this.open = false;
    this.hideDeleteConfirm();
    this.list.replaceChildren();
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  private renderList(): void {
    const entries = listSavedLevels();
    this.list.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = styles.empty;
      empty.textContent = "No saved levels yet.";
      this.list.append(empty);
      return;
    }
    for (const entry of entries) {
      this.list.append(this.mountItem(entry));
    }
  }

  private mountItem(entry: SavedLevel): HTMLElement {
    const tower = loadSavedLevel(entry.id);
    const floor = tower?.floors[0];
    const theme = parseFloorTheme(floor?.theme ?? entry.theme);
    const wrap = document.createElement("div");
    wrap.className = styles.item;
    wrap.setAttribute("role", "button");
    wrap.tabIndex = 0;
    wrap.setAttribute(
      "aria-label",
      `${entry.name}, ${entry.cols} by ${entry.rows}, ${FLOOR_THEME_META[theme].label}`,
    );

    const thumb = document.createElement("div");
    thumb.className = styles.thumb;
    if (floor) {
      thumb.append(renderMazeBoardPreview(floor, {
        showGoal: true,
        landing: entry.floors > 1,
      }));
    }

    const label = document.createElement("div");
    label.className = styles.label;
    const floors = entry.floors === 1 ? "1 floor" : `${entry.floors} floors`;
    label.innerHTML = `
      <span class="${styles.name}">${escapeHtml(entry.name)}</span>
      <span class="${styles.detail}">${entry.cols}×${entry.rows} · ${floors} · ${FLOOR_THEME_META[theme].label}</span>
      <span class="${styles.detail}">${formatSavedAt(entry.savedAt)}</span>
    `;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = styles.delete;
    remove.setAttribute("aria-label", `Delete ${entry.name}`);
    remove.innerHTML = iconSvg("close", 14);
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openDeleteConfirm(entry);
    });

    const play = (): void => {
      const loaded = loadSavedLevel(entry.id);
      if (!loaded) {
        this.renderList();
        return;
      }
      this.callbacks.onPick(loaded);
    };

    wrap.addEventListener("click", (event) => {
      if ((event.target as Element | null)?.closest(`.${styles.delete}`)) return;
      play();
    });
    wrap.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      play();
    });

    wrap.append(thumb, label, remove);
    return wrap;
  }

  private openDeleteConfirm(entry: SavedLevel): void {
    this.pendingDeleteId = entry.id;
    this.confirmTitle.textContent = "Delete this level?";
    this.confirmBody.textContent = `“${entry.name}” will be removed from this device.`;
    this.confirmOk.textContent = "Delete";
    this.confirmRoot.hidden = false;
    this.confirmOk.focus();
  }

  private hideDeleteConfirm(): void {
    this.pendingDeleteId = null;
    this.confirmRoot.hidden = true;
  }

  private commitDeleteConfirm(): void {
    const id = this.pendingDeleteId;
    this.hideDeleteConfirm();
    if (!id) return;
    deleteSavedLevel(id);
    this.renderList();
  }

  private require<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }
}

function formatSavedAt(stamp: number): string {
  try {
    return new Date(stamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
