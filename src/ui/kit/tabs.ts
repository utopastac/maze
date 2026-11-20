export type TabItem<T extends string> = {
  id: T;
  label: string;
  iconHtml?: string;
  title?: string;
};

export type TabListOptions<T extends string> = {
  items: readonly TabItem<T>[];
  active: T;
  label: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
  tabClassName?: string;
  activeClassName?: string;
  idPrefix?: string;
  onChange: (id: T) => void;
};

export type TabListController<T extends string> = {
  root: HTMLElement;
  setActive: (id: T) => void;
  focusActive: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

/** Accessible tablist with arrow-key navigation. */
export function createTabList<T extends string>(
  opts: TabListOptions<T>,
): TabListController<T> {
  const prefix = opts.idPrefix ?? "kit-tab";
  const orientation = opts.orientation ?? "horizontal";
  const tabs = new Map<T, HTMLButtonElement>();
  let active = opts.active;

  const root = document.createElement("div");
  root.className = ["kit-tabs", opts.className ?? ""].filter(Boolean).join(" ");
  root.setAttribute("role", "tablist");
  root.setAttribute("aria-label", opts.label);
  root.setAttribute("aria-orientation", orientation);

  const setActive = (id: T): void => {
    active = id;
    for (const [key, button] of tabs) {
      const on = key === id;
      button.setAttribute("aria-selected", on ? "true" : "false");
      button.tabIndex = on ? 0 : -1;
      if (opts.activeClassName) button.classList.toggle(opts.activeClassName, on);
      button.classList.toggle("kit-tab-active", on);
    }
  };

  opts.items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = ["kit-tab", opts.tabClassName ?? ""].filter(Boolean).join(" ");
    button.id = `${prefix}-${index}`;
    button.dataset.tab = item.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `${prefix}-panel-${index}`);
    if (item.title) button.title = item.title;
    button.innerHTML = `${item.iconHtml ?? ""}<span>${item.label}</span>`;
    button.addEventListener("click", () => {
      if (active === item.id) return;
      setActive(item.id);
      opts.onChange(item.id);
    });
    tabs.set(item.id, button);
    root.append(button);
  });

  setActive(active);

  const onKeyDown = (event: KeyboardEvent): void => {
    const ids = opts.items.map((item) => item.id);
    const index = ids.indexOf(active);
    if (index < 0) return;
    const vertical = orientation === "vertical";
    let next = index;
    if (event.key === "ArrowRight" || (vertical && event.key === "ArrowDown")) {
      next = (index + 1) % ids.length;
    } else if (event.key === "ArrowLeft" || (vertical && event.key === "ArrowUp")) {
      next = (index - 1 + ids.length) % ids.length;
    } else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    else return;
    event.preventDefault();
    const id = ids[next];
    if (!id) return;
    setActive(id);
    opts.onChange(id);
    tabs.get(id)?.focus();
  };

  return {
    root,
    setActive: (id) => {
      setActive(id);
    },
    focusActive: () => {
      tabs.get(active)?.focus();
    },
    onKeyDown,
  };
}
