import {
  deleteCampaignProgress,
  isCampaignAutosave,
  listCampaignProgress,
  type CampaignProgress,
} from "../core/campaignProgress.ts";
import { formatTime } from "../core/format.ts";
import { iconSvg } from "./icons.ts";
import {
  createButton,
  createEmptyState,
  createListRow,
  createListRowCopy,
  playEnter,
  playExit,
} from "./kit/index.ts";
import styles from "./towerIntro.module.css";

export interface TowerIntroCallbacks {
  onNewGame: () => void;
  onLoad: (save: CampaignProgress) => void;
  onPractice: () => void;
  onBack: () => void;
}

/** Tower save list — full page (legacy) or load modal over the home backdrop. */
export class TowerIntro {
  private readonly root: HTMLElement;
  private readonly callbacks: TowerIntroCallbacks;
  private readonly metaEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private open = false;
  private modal = false;

  constructor(root: HTMLElement, callbacks: TowerIntroCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div class="${styles.page}" data-page>
        <header class="${styles.head}">
          <span data-back-slot></span>
          <div class="${styles.headCopy}">
            <h1 class="${styles.title}" data-title>Tower</h1>
            <p class="${styles.meta}" data-meta>100 floors. Load a save, start fresh, or practice any floor.</p>
          </div>
        </header>
        <div class="${styles.body}">
          <div class="${styles.list}" data-list></div>
          <div class="${styles.actions}" data-actions>
          </div>
        </div>
      </div>
    `;
    this.metaEl = this.require("[data-meta]");
    this.listEl = this.require("[data-list]");
    this.require("[data-back-slot]").replaceWith(
      createButton({
        variant: "icon",
        icon: "close",
        ariaLabel: "Back",
        className: styles.back,
        data: { back: "" },
        onClick: () => this.callbacks.onBack(),
      }),
    );
    this.require("[data-actions]").append(
      createButton({
        label: "New game",
        tone: "accent",
        className: styles.primary,
        data: { new: "" },
        onClick: () => this.callbacks.onNewGame(),
      }),
      createButton({
        label: "Practice",
        className: styles.secondary,
        data: { practice: "" },
        onClick: () => this.callbacks.onPractice(),
      }),
    );
    this.root.addEventListener("click", (event) => {
      if (!this.modal || event.target !== this.root) return;
      this.callbacks.onBack();
    });
  }

  isOpen(): boolean {
    return this.open;
  }

  isModal(): boolean {
    return this.open && this.modal;
  }

  show(): void {
    this.openAs(false);
  }

  /** Save picker floating over the storm-tower home scene. */
  showLoadModal(): void {
    this.openAs(true);
  }

  hide(): void {
    this.open = false;
    this.modal = false;
    this.listEl.replaceChildren();
    delete this.root.dataset.mode;
    playExit(this.root);
  }

  private openAs(modal: boolean): void {
    this.open = true;
    this.modal = modal;
    this.root.dataset.mode = modal ? "modal" : "page";
    this.require("[data-title]").textContent = modal ? "Load game" : "Tower";
    this.require<HTMLElement>("[data-actions]").hidden = modal;
    this.require<HTMLButtonElement>("[data-back]").setAttribute(
      "aria-label",
      modal ? "Close load menu" : "Back to home",
    );
    this.renderList();
    playEnter(this.root);
  }

  private renderList(): void {
    const saves = listCampaignProgress();
    if (this.modal) {
      this.metaEl.textContent = saves.length === 0
        ? "No saved games yet."
        : `${saves.length} ${saves.length === 1 ? "save" : "saves"} · tap to load`;
    } else {
      this.metaEl.textContent = saves.length === 0
        ? "100 floors. Load a save, start fresh, or practice any floor."
        : `${saves.length} ${saves.length === 1 ? "save" : "saves"} · tap to load`;
    }
    this.listEl.replaceChildren();
    if (saves.length === 0) {
      this.listEl.append(createEmptyState("No saved games yet.", styles.empty));
      return;
    }
    for (const save of saves) {
      this.listEl.append(this.mountItem(save));
    }
  }

  private mountItem(save: CampaignProgress): HTMLElement {
    const auto = isCampaignAutosave(save.id);
    const copy = createListRowCopy({
      title: auto ? `Autosave · Floor ${save.floor}` : `Floor ${save.floor}`,
      details: [
        `${save.lives} ${save.lives === 1 ? "heart" : "hearts"} · ${formatTime(save.seconds)}${save.drops > 0 ? ` · ${save.drops} ${save.drops === 1 ? "drop" : "drops"}` : ""}`,
        formatSavedAt(save.savedAt),
      ],
      titleClassName: styles.saveTitle,
      detailClassName: styles.saveDetail,
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = styles.delete;
    remove.setAttribute("aria-label", auto ? "Delete autosave" : `Delete save on floor ${save.floor}`);
    remove.innerHTML = iconSvg("close", 14);
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteCampaignProgress(save.id);
      this.renderList();
    });

    return createListRow({
      label: `${auto ? "Autosave, " : ""}Load floor ${save.floor}, ${save.lives} hearts, ${formatTime(save.seconds)}`,
      className: auto ? `${styles.save} ${styles.saveAutosave}` : styles.save,
      body: copy,
      trailing: remove,
      onActivate: () => this.callbacks.onLoad(save),
      ignoreSelector: `.${styles.delete}`,
    });
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
