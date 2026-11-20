import { describe, expect, it } from "vitest";
import { isMenuScreen, isPlayScreen, parseRoute, routeHash, routesEqual } from "./route.ts";

describe("parseRoute", () => {
  it("defaults empty and home to home", () => {
    expect(parseRoute("")).toEqual({ kind: "home" });
    expect(parseRoute("#")).toEqual({ kind: "home" });
    expect(parseRoute("#home")).toEqual({ kind: "home" });
  });

  it("parses known menu routes", () => {
    expect(parseRoute("#tower")).toEqual({ kind: "tower" });
    expect(parseRoute("#play")).toEqual({ kind: "play" });
    expect(parseRoute("#create")).toEqual({ kind: "create" });
    expect(parseRoute("#saved")).toEqual({ kind: "saved" });
    expect(parseRoute("#settings")).toEqual({ kind: "settings" });
  });

  it("treats shared level hashes as level", () => {
    expect(parseRoute("#m.abc123")).toEqual({ kind: "level" });
  });

  it("falls back to home for unknown paths", () => {
    expect(parseRoute("#nope")).toEqual({ kind: "home" });
  });
});

describe("routeHash", () => {
  it("round-trips named routes", () => {
    for (const kind of ["home", "tower", "play", "create", "saved", "settings"] as const) {
      const route = { kind };
      expect(parseRoute(routeHash(route))).toEqual(route);
    }
  });
});

describe("route helpers", () => {
  it("compares by kind", () => {
    expect(routesEqual({ kind: "home" }, { kind: "home" })).toBe(true);
    expect(routesEqual({ kind: "home" }, { kind: "play" })).toBe(false);
  });

  it("classifies menu vs play screens", () => {
    expect(isMenuScreen({ kind: "home" })).toBe(true);
    expect(isMenuScreen({ kind: "play" })).toBe(false);
    expect(isPlayScreen({ kind: "play" })).toBe(true);
    expect(isPlayScreen({ kind: "level" })).toBe(true);
    expect(isPlayScreen({ kind: "home" })).toBe(false);
  });
});
