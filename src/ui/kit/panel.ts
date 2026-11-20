export type PanelOptions = {
  className?: string;
  width?: string;
  center?: boolean;
  children?: Array<Node | string | null | undefined>;
};

export type PanelHeadOptions = {
  title: string;
  meta?: string;
  titleTag?: "h1" | "h2" | "p";
  titleAttr?: Record<string, string>;
  metaAttr?: Record<string, string>;
  trailing?: HTMLElement | null;
  className?: string;
};

export type ActionsOptions = {
  center?: boolean;
  className?: string;
  children?: Array<HTMLElement | null | undefined>;
};

/** Floating glass card used by modals / result overlays. */
export function createCard(opts: PanelOptions = {}): HTMLElement {
  const card = document.createElement("div");
  card.className = ["kit-card", opts.center ? "kit-card-center" : "", opts.className ?? ""]
    .filter(Boolean)
    .join(" ");
  if (opts.width) card.style.setProperty("--kit-card-width", opts.width);
  appendChildren(card, opts.children);
  return card;
}

export function createScrim(opts: { className?: string; data?: string } = {}): HTMLElement {
  const scrim = document.createElement("div");
  scrim.className = ["kit-scrim", opts.className ?? ""].filter(Boolean).join(" ");
  if (opts.data) scrim.dataset[opts.data] = "";
  return scrim;
}

export function createPanelHead(opts: PanelHeadOptions): HTMLElement {
  const head = document.createElement("header");
  head.className = ["kit-head", opts.className ?? ""].filter(Boolean).join(" ");

  const copy = document.createElement("div");
  copy.className = "kit-head-copy";

  const title = document.createElement(opts.titleTag ?? "h2");
  title.className = "kit-title";
  title.textContent = opts.title;
  applyAttrs(title, opts.titleAttr);

  copy.append(title);
  if (opts.meta !== undefined) {
    const meta = document.createElement("p");
    meta.className = "kit-meta";
    meta.textContent = opts.meta;
    applyAttrs(meta, opts.metaAttr);
    copy.append(meta);
  }

  head.append(copy);
  if (opts.trailing) head.append(opts.trailing);
  return head;
}

export function createActions(opts: ActionsOptions = {}): HTMLElement {
  const row = document.createElement("div");
  row.className = [
    "kit-actions",
    opts.center ? "kit-actions-center" : "",
    opts.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  for (const child of opts.children ?? []) {
    if (child) row.append(child);
  }
  return row;
}

export function createKicker(text: string, className = ""): HTMLElement {
  const el = document.createElement("p");
  el.className = ["kit-kicker", className].filter(Boolean).join(" ");
  el.textContent = text;
  return el;
}

export function createEmptyState(text: string, className = ""): HTMLElement {
  const el = document.createElement("p");
  el.className = ["kit-empty", className].filter(Boolean).join(" ");
  el.textContent = text;
  return el;
}

function appendChildren(
  parent: HTMLElement,
  children: Array<Node | string | null | undefined> | undefined,
): void {
  for (const child of children ?? []) {
    if (child == null) continue;
    parent.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

function applyAttrs(el: HTMLElement, attrs?: Record<string, string>): void {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") el.className = `${el.className} ${value}`.trim();
    else if (key.startsWith("data-")) el.setAttribute(key, value);
    else if (key === "id") el.id = value;
    else el.setAttribute(key, value);
  }
}
