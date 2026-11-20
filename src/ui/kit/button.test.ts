import { describe, expect, it } from "vitest";
import { buttonClass, createButton } from "./button.ts";

describe("buttonClass", () => {
  it("maps variants and tones", () => {
    expect(buttonClass("icon")).toBe("glass-btn");
    expect(buttonClass("pill", "accent")).toBe("glass-pill metal-ring");
    expect(buttonClass("pill", "ghost")).toBe("glass-pill kit-ghost");
    expect(buttonClass("pill", "danger", "extra")).toBe("glass-pill kit-danger extra");
  });
});

describe("createButton", () => {
  it("builds an icon button with aria label", () => {
    const button = createButton({
      variant: "icon",
      icon: "close",
      ariaLabel: "Close",
      data: { close: "" },
    });
    expect(button.type).toBe("button");
    expect(button.className).toContain("glass-btn");
    expect(button.getAttribute("aria-label")).toBe("Close");
    expect(button.dataset.close).toBe("");
    expect(button.querySelector(".btn-icon")).not.toBeNull();
  });

  it("builds an accent pill with label", () => {
    const button = createButton({
      label: "Resume",
      tone: "accent",
    });
    expect(button.className).toBe("glass-pill metal-ring");
    expect(button.textContent).toContain("Resume");
  });
});
