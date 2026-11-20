import { createButton } from "./button.ts";
import { createActions, createCard, createPanelHead, createScrim } from "./panel.ts";

export type ModalPhaseHost = Pick<HTMLElement, "dataset" | "hidden">;

/** Shared open/close animation used by overlays, pause, menus. */
export function playEnter(host: ModalPhaseHost): void {
  host.hidden = false;
  host.dataset.phase = "out";
  requestAnimationFrame(() => {
    if (host.hidden) return;
    host.dataset.phase = "in";
  });
}

export function playExit(host: ModalPhaseHost): void {
  delete host.dataset.phase;
  host.hidden = true;
}

export type ConfirmDialogOptions = {
  className?: string;
  titleId: string;
  bodyId: string;
  title: string;
  body?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Nested confirm dialog (pause quit, destructive actions). */
export function createConfirmDialog(opts: ConfirmDialogOptions): {
  root: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  show: () => void;
  hide: () => void;
} {
  const root = document.createElement("div");
  root.className = ["kit-confirm", opts.className ?? ""].filter(Boolean).join(" ");
  root.hidden = true;
  root.dataset.confirm = "";

  const scrim = createScrim({ data: "confirmScrim" });
  scrim.addEventListener("click", () => opts.onCancel());

  const card = document.createElement("div");
  card.className = "kit-card";
  card.style.setProperty("--kit-card-width", "360px");
  card.setAttribute("role", "alertdialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", opts.titleId);
  card.setAttribute("aria-describedby", opts.bodyId);

  const title = document.createElement("p");
  title.className = "kit-title";
  title.id = opts.titleId;
  title.textContent = opts.title;

  const body = document.createElement("p");
  body.className = "kit-meta";
  body.id = opts.bodyId;
  body.textContent = opts.body ?? "";

  const cancel = createButton({
    label: opts.cancelLabel ?? "Cancel",
    tone: "ghost",
    data: { confirmCancel: "" },
    onClick: () => opts.onCancel(),
  });
  const confirm = createButton({
    label: opts.confirmLabel ?? "Confirm",
    tone: "accent",
    data: { confirmOk: "" },
    onClick: () => opts.onConfirm(),
  });

  card.append(
    title,
    body,
    createActions({ center: true, children: [cancel, confirm] }),
  );
  root.append(scrim, card);

  return {
    root,
    title,
    body,
    show: () => {
      root.hidden = false;
    },
    hide: () => {
      root.hidden = true;
    },
  };
}

export type SimpleModalOptions = {
  title: string;
  meta?: string;
  width?: string;
  center?: boolean;
  closeLabel?: string;
  onClose: () => void;
  body?: HTMLElement;
  actions?: HTMLElement[];
};

/** Full-screen scrim + card modal shell. */
export function createSimpleModal(opts: SimpleModalOptions): {
  root: HTMLElement;
  card: HTMLElement;
  bodySlot: HTMLElement;
  open: () => void;
  close: () => void;
} {
  const root = document.createElement("div");
  root.append(createScrim());

  const closeBtn = createButton({
    variant: "icon",
    icon: "close",
    ariaLabel: opts.closeLabel ?? "Close",
    onClick: () => opts.onClose(),
  });

  const card = createCard({
    width: opts.width,
    center: opts.center,
    children: [
      createPanelHead({
        title: opts.title,
        meta: opts.meta,
        trailing: closeBtn,
      }),
    ],
  });

  const bodySlot = document.createElement("div");
  if (opts.body) bodySlot.append(opts.body);
  card.append(bodySlot);

  if (opts.actions?.length) {
    card.append(createActions({ center: opts.center, children: opts.actions }));
  }

  root.append(card);
  return {
    root,
    card,
    bodySlot,
    open: () => playEnter(root),
    close: () => playExit(root),
  };
}
