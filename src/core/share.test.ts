import { describe, expect, it } from "vitest";
import { generateTower, setLevelName, setMaxHearts } from "./tower.ts";
import { decodeLevel, encodeLevel, hasLevelHash, parseLevelInput } from "./share.ts";

describe("encodeLevel / decodeLevel", () => {
  it("round-trips a generated tower", () => {
    const tower = generateTower(42, 7, 7, 3);
    setLevelName(tower, "Round Trip");
    setMaxHearts(tower, 3);
    const code = encodeLevel(tower);
    expect(code).toBeTruthy();
    const decoded = decodeLevel(code!);
    expect(decoded).not.toBeNull();
    expect(decoded!.floors).toHaveLength(tower.floors.length);
    expect(decoded!.name).toBe("Round Trip");
    expect(decoded!.maxHearts).toBe(3);
    expect(decoded!.floors[0]!.cols).toBe(7);
    expect(decoded!.floors[0]!.rows).toBe(7);
  });

  it("rejects empty and oversized codes", () => {
    expect(decodeLevel("")).toBeNull();
    expect(decodeLevel("not-valid!!!")).toBeNull();
  });

  it("is stable across encode → decode → encode", () => {
    const tower = generateTower(99, 5, 5, 2);
    const a = encodeLevel(tower);
    expect(a).toBeTruthy();
    const b = encodeLevel(decodeLevel(a!)!);
    expect(b).toBe(a);
  });
});

describe("hasLevelHash / parseLevelInput", () => {
  it("detects level hash prefix", () => {
    expect(hasLevelHash("#m.abc")).toBe(true);
    expect(hasLevelHash("#home")).toBe(false);
  });

  it("parses bare codes and hash-prefixed input", () => {
    const tower = generateTower(7, 7, 7, 1);
    const code = encodeLevel(tower);
    expect(code).toBeTruthy();
    expect(parseLevelInput(code!)).not.toBeNull();
    expect(parseLevelInput(`#m.${code}`)).not.toBeNull();
    expect(parseLevelInput("   ")).toBeNull();
  });
});
