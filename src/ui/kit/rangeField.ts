export type RangeFieldOptions = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  className?: string;
  onInput: (value: number) => void;
};

export type RangeFieldController = {
  root: HTMLElement;
  input: HTMLInputElement;
  readout: HTMLElement;
  setValue: (value: number) => void;
  setDisabled: (disabled: boolean) => void;
  setDimmed: (dimmed: boolean) => void;
  setStep: (step: number) => void;
};

/** Labeled range slider with live readout — settings Physics/Camera/Picture. */
export function createRangeField(opts: RangeFieldOptions): RangeFieldController {
  const root = document.createElement("div");
  root.className = ["kit-range", "field", opts.className ?? ""].filter(Boolean).join(" ");

  const label = document.createElement("label");
  const name = document.createElement("span");
  name.textContent = opts.label;
  const readout = document.createElement("span");
  readout.dataset.readout = "";
  readout.textContent = opts.format(opts.value);
  label.append(name, readout);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(opts.value);
  input.setAttribute("aria-label", opts.label);
  input.addEventListener("input", () => {
    const value = Number(input.value);
    readout.textContent = opts.format(value);
    opts.onInput(value);
  });

  root.append(label, input);

  return {
    root,
    input,
    readout,
    setValue: (value) => {
      input.value = String(value);
      readout.textContent = opts.format(value);
    },
    setDisabled: (disabled) => {
      input.disabled = disabled;
    },
    setDimmed: (dimmed) => {
      root.classList.toggle("kit-range-dimmed", dimmed);
    },
    setStep: (step) => {
      input.step = String(step);
    },
  };
}
