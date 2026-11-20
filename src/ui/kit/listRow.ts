export type ListRowOptions = {
  label: string;
  className?: string;
  body: HTMLElement | DocumentFragment;
  trailing?: HTMLElement | null;
  onActivate: () => void;
  /** Selector for trailing controls that should not trigger row activate. */
  ignoreSelector?: string;
};

/** Clickable / keyboard-activatable list row with optional trailing control. */
export function createListRow(opts: ListRowOptions): HTMLElement {
  const row = document.createElement("div");
  row.className = ["kit-list-row", opts.className ?? ""].filter(Boolean).join(" ");
  row.setAttribute("role", "button");
  row.tabIndex = 0;
  row.setAttribute("aria-label", opts.label);

  row.append(opts.body);
  if (opts.trailing) row.append(opts.trailing);

  const ignore = opts.ignoreSelector;
  const activate = (): void => opts.onActivate();

  row.addEventListener("click", (event) => {
    if (ignore && (event.target as Element | null)?.closest(ignore)) return;
    activate();
  });
  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  });

  return row;
}

export type ListRowCopyOptions = {
  title: string;
  details: string[];
  className?: string;
  titleClassName?: string;
  detailClassName?: string;
};

/** Title + stacked detail lines for save/list rows. */
export function createListRowCopy(opts: ListRowCopyOptions): HTMLElement {
  const copy = document.createElement("div");
  copy.className = ["kit-list-copy", opts.className ?? ""].filter(Boolean).join(" ");

  const title = document.createElement("span");
  title.className = ["kit-list-title", opts.titleClassName ?? ""].filter(Boolean).join(" ");
  title.textContent = opts.title;
  copy.append(title);

  for (const line of opts.details) {
    const detail = document.createElement("span");
    detail.className = ["kit-list-detail", opts.detailClassName ?? ""].filter(Boolean).join(" ");
    detail.textContent = line;
    copy.append(detail);
  }

  return copy;
}
