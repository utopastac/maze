import { describe, expect, it, vi } from "vitest";
import { createListRow, createListRowCopy } from "./listRow.ts";

describe("createListRow", () => {
  it("activates on click and ignores trailing control", () => {
    const onActivate = vi.fn();
    const trailing = document.createElement("button");
    trailing.className = "delete";
    trailing.type = "button";
    const row = createListRow({
      label: "Save",
      body: createListRowCopy({ title: "Floor 3", details: ["2 hearts"] }),
      trailing,
      ignoreSelector: ".delete",
      onActivate,
    });
    row.click();
    expect(onActivate).toHaveBeenCalledTimes(1);
    trailing.click();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
