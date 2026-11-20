import { listSavedLevels, loadSavedLevel, deleteSavedLevel, type SavedLevel } from "../core/savedLevels.ts";
import { FLOOR_THEME_META, parseFloorTheme } from "../core/theme.ts";
import type { Tower } from "../core/tower.ts";
import { iconSvg } from "./icons.ts";
import {
  createButton,
  createConfirmDialog,
  createEmptyState,
  createListRow,
  createListRowCopy,
  playEnter,
  playExit,
} from "./kit/index.ts";
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
  private readonly confirmTitle: HTMLElement;
  private readonly confirmBody: HTMLElement;
  private readonly confirmOk: HTMLButtonElement;
  private readonly confirm: ReturnType<typeof createConfirmDialog>;
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
          <span data-close-slot></span>
        </header>
        <div class="${styles.list}" data-list></div>
      </div>
      <div data-confirm-slot></div>
    `;
    this.list = this.require("[data-list]");
    this.confirm = createConfirmDialog({
      titleId: "saved-confirm-title",
      bodyId: "saved-confirm-body",
      title: "",
      confirmLabel: "Delete",
      onCancel: () => this.hideDeleteConfirm(),
      onConfirm: () => this.commitDeleteConfirm(),
    });
    this.confirm.title.dataset.confirmTitle = "";
    this.confirm.body.dataset.confirmBody = "";
    this.require("[data-confirm-slot]").replaceWith(this.confirm.root);
    this.confirmTitle = this.confirm.title;
    this.confirmBody = this.confirm.body;
    this.confirmOk = this.require("[data-confirm-ok]");
    this.require("[data-close-slot]").replaceWith(
      createButton({
        icon: "close",
        ariaLabel: "Close saved levels",
        className: styles.close,
        data: { close: "" },
        onClick: () => this.callbacks.onClose(),
      }),
    );
    this.require("[data-scrim]").addEventListener("click", () => this.callbacks.onClose());
  }

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.hideDeleteConfirm();
    this.renderList();
    playEnter(this.root);
  }

  hide(): void {
    this.open = false;
    this.hideDeleteConfirm();
    this.list.replaceChildren();
    playExit(this.root);
  }

  private renderList(): void {
    const entries = listSavedLevels();
    this.list.replaceChildren();
    if (entries.length === 0) {
      this.list.append(createEmptyState("No saved levels yet.", styles.empty));
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
    const thumb = document.createElement("div");
    thumb.className = styles.thumb;
    if (floor) {
      thumb.append(renderMazeBoardPreview(floor, {
        showGoal: true,
        landing: entry.floors > 1,
      }));
    }

    const floors = entry.floors === 1 ? "1 floor" : `${entry.floors} floors`;
    const copy = createListRowCopy({
      title: entry.name,
      details: [
        `${entry.cols}×${entry.rows} · ${floors} · ${FLOOR_THEME_META[theme].label}`,
        formatSavedAt(entry.savedAt),
      ],
      className: styles.label,
      titleClassName: styles.name,
      detailClassName: styles.detail,
    });

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

    const body = document.createDocumentFragment();
    body.append(thumb, copy);

    return createListRow({
      label: `${entry.name}, ${entry.cols} by ${entry.rows}, ${FLOOR_THEME_META[theme].label}`,
      className: styles.item,
      body,
      trailing: remove,
      onActivate: play,
      ignoreSelector: `.${styles.delete}`,
    });
  }

  private openDeleteConfirm(entry: SavedLevel): void {
    this.pendingDeleteId = entry.id;
    this.confirmTitle.textContent = "Delete this level?";
    this.confirmBody.textContent = `“${entry.name}” will be removed from this device.`;
    this.confirmOk.textContent = "Delete";
    this.confirm.show();
    this.confirmOk.focus();
  }

  private hideDeleteConfirm(): void {
    this.pendingDeleteId = null;
    this.confirm.hide();
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