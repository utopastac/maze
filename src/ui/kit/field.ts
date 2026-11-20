export type FieldOptions = {
  label: string;
  forId?: string;
  className?: string;
  control: HTMLElement;
};

export type InputOptions = {
  id?: string;
  name?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  data?: Record<string, string>;
};

export type SelectOptions = {
  id?: string;
  name?: string;
  className?: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
  data?: Record<string, string>;
};

export function createField(opts: FieldOptions): HTMLElement {
  const field = document.createElement("label");
  field.className = ["kit-field", opts.className ?? ""].filter(Boolean).join(" ");
  if (opts.forId) field.htmlFor = opts.forId;

  const label = document.createElement("span");
  label.className = "kit-label";
  label.textContent = opts.label;

  field.append(label, opts.control);
  return field;
}

export function createInput(opts: InputOptions = {}): HTMLInputElement {
  const input = document.createElement("input");
  input.className = ["kit-input", opts.className ?? ""].filter(Boolean).join(" ");
  input.type = opts.type ?? "text";
  if (opts.id) input.id = opts.id;
  if (opts.name) input.name = opts.name;
  if (opts.value !== undefined) input.value = opts.value;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.maxLength !== undefined) input.maxLength = opts.maxLength;
  applyData(input, opts.data);
  return input;
}

export function createSelect(opts: SelectOptions): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = ["kit-select", opts.className ?? ""].filter(Boolean).join(" ");
  if (opts.id) select.id = opts.id;
  if (opts.name) select.name = opts.name;
  applyData(select, opts.data);
  for (const option of opts.options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    if (opts.value !== undefined && opts.value === option.value) el.selected = true;
    select.append(el);
  }
  return select;
}

function applyData(el: HTMLElement, data?: Record<string, string>): void {
  if (!data) return;
  for (const [key, value] of Object.entries(data)) el.dataset[key] = value;
}
