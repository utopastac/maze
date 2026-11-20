import { iconSvg, type IconName } from "../icons.ts";

export type ButtonVariant = "icon" | "pill";
export type ButtonTone = "default" | "accent" | "ghost" | "danger";

export type ButtonOptions = {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  label?: string;
  icon?: IconName;
  iconSize?: number;
  ariaLabel?: string;
  title?: string;
  className?: string;
  data?: Record<string, string | undefined>;
  disabled?: boolean;
  pressed?: boolean;
  hidden?: boolean;
  onClick?: (event: MouseEvent) => void;
};

/** Canonical class names — edit styles in kit.css. */
export function buttonClass(
  variant: ButtonVariant = "pill",
  tone: ButtonTone = "default",
  extra = "",
): string {
  const parts = [variant === "icon" ? "glass-btn" : "glass-pill"];
  if (tone === "accent") parts.push("metal-ring");
  if (tone === "ghost") parts.push("kit-ghost");
  if (tone === "danger") parts.push("kit-danger");
  if (extra.trim()) parts.push(extra.trim());
  return parts.join(" ");
}

/** Build a glass icon or pill button. Prefer this over hand-rolled markup. */
export function createButton(opts: ButtonOptions = {}): HTMLButtonElement {
  const variant = opts.variant ?? (opts.label ? "pill" : "icon");
  const tone = opts.tone ?? "default";
  const button = document.createElement("button");
  button.type = "button";
  button.className = buttonClass(variant, tone, opts.className);
  if (opts.ariaLabel) button.setAttribute("aria-label", opts.ariaLabel);
  if (opts.title) button.title = opts.title;
  if (opts.disabled) button.disabled = true;
  if (opts.hidden) button.hidden = true;
  if (opts.pressed !== undefined) button.setAttribute("aria-pressed", String(opts.pressed));
  if (opts.data) {
    for (const [key, value] of Object.entries(opts.data)) {
      if (value !== undefined) button.dataset[key] = value;
    }
  }
  const chunks: string[] = [];
  if (opts.icon) chunks.push(iconSvg(opts.icon, opts.iconSize));
  if (opts.label) chunks.push(opts.label);
  button.innerHTML = chunks.join("");
  if (opts.onClick) button.addEventListener("click", opts.onClick);
  return button;
}

/** Class string for templates that still use innerHTML. */
export function buttonClassAttr(
  variant: ButtonVariant = "pill",
  tone: ButtonTone = "default",
  extra = "",
): string {
  return buttonClass(variant, tone, extra);
}
