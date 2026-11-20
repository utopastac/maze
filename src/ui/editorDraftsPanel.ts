import {
  deleteAuthoredLevel,
  listAuthoredLevels,
  loadAuthoredLevel,
  type AuthoredLevel,
} from "../core/authoredLevels.ts";
import { cloneTower, type Tower } from "../core/tower.ts";
import {
  createButton,
  createEmptyState,
  createListRow,
  createListRowCopy,
} from "./kit/index.ts";
import styles from "./editor.module.css";

export type EditorDraftsHooks = {
  /** Currently open draft id (if any). */
  draftId: () => string | null;
  setDraftId: (id: string | null) => void;
  /** Apply a loaded tower into the editor. */
  onLoad: (tower: Tower, id: string) => void;
  onFlash: (message: string) => void;
};

/** Campaign drafts list overlay — kit list rows, no board logic. */
export class EditorDraftsPanel {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly hooks: EditorDraftsHooks;

  constructor(
    roots: { root: HTMLElement; list: HTMLElement },
    hooks: EditorDraftsHooks,
  ) {
    this.root = roots.root;
    this.list = roots.list;
    this.hooks = hooks;
  }

  show(): void {
    this.render();
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.list.replaceChildren();
  }

  render(): void {
    const entries = listAuthoredLevels();
    this.list.replaceChildren();
    if (entries.length === 0) {
      this.list.append(
        createEmptyState("No tower drafts yet. Hit Save to keep one here.", styles.draftsEmpty),
      );
      return;
    }
    for (const entry of entries) {
      this.list.append(this.mountItem(entry));
    }
  }

  private mountItem(entry: AuthoredLevel): HTMLElement {
    const copy = createListRowCopy({
      title: entry.name,
      details: [`${entry.cols}×${entry.rows}`],
      titleClassName: styles.draftName,
      detailClassName: styles.draftMeta,
    });

    const del = createButton({
      icon: "close",
      ariaLabel: `Delete ${entry.name}`,
      title: "Delete draft",
      className: styles.draftDelete,
      onClick: (event) => {
        event.stopPropagation();
        if (!deleteAuthoredLevel(entry.id)) return;
        if (this.hooks.draftId() === entry.id) this.hooks.setDraftId(null);
        this.render();
        this.hooks.onFlash("Draft deleted.");
      },
    });

    return createListRow({
      label: `Open draft ${entry.name}, ${entry.cols} by ${entry.rows}`,
      className: styles.draftItem,
      body: copy,
      trailing: del,
      onActivate: () => this.load(entry.id),
      ignoreSelector: `.${styles.draftDelete}`,
    });
  }

  private load(id: string): void {
    const tower = loadAuthoredLevel(id);
    if (!tower) {
      this.hooks.onFlash("Couldn't load that draft.");
      this.render();
      return;
    }
    this.hide();
    this.hooks.setDraftId(id);
    this.hooks.onLoad(cloneTower(tower), id);
  }
}
