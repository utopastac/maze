import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_HEARTS, generateTower, maxHeartsOf } from "./tower.ts";

describe("generateTower", () => {
  it("starts free-play towers with the default heart limit", () => {
    const tower = generateTower(42, 7, 7, 3);
    expect(maxHeartsOf(tower)).toBe(DEFAULT_MAX_HEARTS);
    expect(tower.maxHearts).toBe(DEFAULT_MAX_HEARTS);
  });
});
