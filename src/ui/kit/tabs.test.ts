import { describe, expect, it, vi } from "vitest";
import { createTabList } from "./tabs.ts";

describe("createTabList", () => {
  it("selects the active tab and reports changes", () => {
    const onChange = vi.fn();
    const tabs = createTabList({
      items: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      active: "a",
      label: "Sections",
      onChange,
    });
    const buttons = [...tabs.root.querySelectorAll("[role='tab']")] as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.getAttribute("aria-selected")).toBe("true");
    expect(buttons[1]!.getAttribute("aria-selected")).toBe("false");

    buttons[1]!.click();
    expect(onChange).toHaveBeenCalledWith("b");
    expect(buttons[1]!.getAttribute("aria-selected")).toBe("true");
  });
});
