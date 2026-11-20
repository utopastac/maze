export type ToggleOptions = {
  label: string;
  checked?: boolean;
  className?: string;
  onChange: (checked: boolean) => void;
};

export type ToggleController = {
  root: HTMLLabelElement;
  input: HTMLInputElement;
  setChecked: (checked: boolean) => void;
};

/** Checkbox styled as a switch. */
export function createToggle(opts: ToggleOptions): ToggleController {
  const root = document.createElement("label");
  root.className = ["kit-toggle", opts.className ?? ""].filter(Boolean).join(" ");

  const text = document.createElement("span");
  text.textContent = opts.label;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("aria-label", opts.label);
  input.checked = opts.checked ?? false;
  input.addEventListener("change", () => opts.onChange(input.checked));

  const track = document.createElement("span");
  track.className = "kit-switch";
  track.setAttribute("aria-hidden", "true");

  root.append(text, input, track);

  return {
    root,
    input,
    setChecked: (checked) => {
      input.checked = checked;
    },
  };
}
