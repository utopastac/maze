import {
  deleteCampaignProgress,
  isCampaignAutosave,
  listCampaignProgress,
  type CampaignProgress,
} from "../core/campaignProgress.ts";
import { formatTime } from "../core/format.ts";
import { iconSvg } from "./icons.ts";
import styles from "./towerIntro.module.css";

export interface TowerIntroCallbacks {
  onNewGame: () => void;
  onLoad: (save: CampaignProgress) => void;
  onPractice: () => void;
  onBack: () => void;
}

/** Full tower landing screen — not a modal over play. */
export class TowerIntro {
  private readonly root: HTMLElement;
  private readonly callbacks: TowerIntroCallbacks;
  private readonly metaEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private open = false;

  constructor(root: HTMLElement, callbacks: TowerIntroCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.className = styles.root;
    this.root.innerHTML = `
      <div class="${styles.page}">
        <header class="${styles.head}">
          <button type="button" class="glass-btn ${styles.back}" data-back aria-label="Back to home">${iconSvg("home")}</button>
          <div class="${styles.headCopy}">
            <h1 class="${styles.title}">Tower</h1>
            <p class="${styles.meta}" data-meta>100 floors. Load a save, start fresh, or practice any floor.</p>
          </div>
        </header>
        <div class="${styles.body}">
          <div class="${styles.list}" data-list></div>
          <div class="${styles.actions}">
            <button type="button" class="glass-pill metal-ring ${styles.primary}" data-new>New game</button>
            <button type="button" class="glass-pill ${styles.secondary}" data-practice>Practice</button>
          </div>
        </div>
      </div>
    `;
    this.metaEl = this.require("[data-meta]");
    this.listEl = this.require("[data-list]");
    this.require("[data-back]").addEventListener("click", () => this.callbacks.onBack());
    this.require("[data-new]").addEventListener("click", () => this.callbacks.onNewGame());
    this.require("[data-practice]").addEventListener("click", () => this.callbacks.onPractice());
  }

  isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.renderList();
    this.root.hidden = false;
    this.root.dataset.phase = "out";
    requestAnimationFrame(() => {
      this.root.dataset.phase = "in";
    });
  }

  hide(): void {
    this.open = false;
    this.listEl.replaceChildren();
    delete this.root.dataset.phase;
    this.root.hidden = true;
  }

  private renderList(): void {
    const saves = listCampaignProgress();
    this.metaEl.textContent = saves.length === 0
      ? "100 floors. Load a save, start fresh, or practice any floor."
      : `${saves.length} ${saves.length === 1 ? "save" : "saves"} · tap to load`;
    this.listEl.replaceChildren();
    if (saves.length === 0) {
      const empty = document.createElement("p");
      empty.className = styles.empty;
      empty.textContent = "No saved games yet.";
      this.listEl.append(empty);
      return;
    }
    for (const save of saves) {
      this.listEl.append(this.mountItem(save));
    }
  }

  private mountItem(save: CampaignProgress): HTMLElement {
    const auto = isCampaignAutosave(save.id);
    const row = document.createElement("div");
    row.className = auto ? `${styles.save} ${styles.saveAutosave}` : styles.save;
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.setAttribute(
      "aria-label",
      `${auto ? "Autosave, " : ""}Load floor ${save.floor}, ${save.lives} hearts, ${formatTime(save.seconds)}`,
    );

    const copy = document.createElement("div");
    copy.className = styles.saveCopy;
    const title = auto
      ? `<span class="${styles.saveTitle}">Autosave · Floor ${save.floor}</span>`
      : `<span class="${styles.saveTitle}">Floor ${save.floor}</span>`;
    copy.innerHTML = `
      ${title}
      <span class="${styles.saveDetail}">${save.lives} ${save.lives === 1 ? "heart" : "hearts"} · ${formatTime(save.seconds)}${save.drops > 0 ? ` · ${save.drops} ${save.drops === 1 ? "drop" : "drops"}` : ""}</span>
      <span class="${styles.saveDetail}">${formatSavedAt(save.savedAt)}</span>
    `;

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

    const load = (): void => this.callbacks.onLoad(save);
    row.addEventListener("click", (event) => {
      if ((event.target as Element | null)?.closest(`.${styles.delete}`)) return;
      load();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      load();
    });

    row.append(copy, remove);
    return row;
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
