import { hasLevelHash } from "./share.ts";

export type AppRoute =
  | { kind: "home" }
  | { kind: "tower" }
  | { kind: "play" }
  | { kind: "create" }
  | { kind: "saved" }
  | { kind: "settings" }
  | { kind: "level" };

const KNOWN = new Set(["", "home", "tower", "play", "create", "saved", "settings"]);

/** Parse `location.hash` into an app route. Shared levels (`#m.…`) win over named routes. */
export function parseRoute(hash = location.hash): AppRoute {
  if (hasLevelHash(hash)) return { kind: "level" };
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw.split(/[/?&]/, 1)[0]?.toLowerCase() ?? "";
  if (!KNOWN.has(path) || path === "" || path === "home") return { kind: "home" };
  return { kind: path as Exclude<AppRoute["kind"], "home" | "level"> };
}

export function routeHash(route: AppRoute): string {
  switch (route.kind) {
    case "home":
      return "#home";
    case "tower":
      return "#tower";
    case "play":
      return "#play";
    case "create":
      return "#create";
    case "saved":
      return "#saved";
    case "settings":
      return "#settings";
    case "level":
      return location.hash.startsWith("#m.") ? location.hash : "#home";
  }
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
  return a.kind === b.kind;
}

/** Menu destinations that own the shell — not overlays on a live maze. */
export function isMenuScreen(route: AppRoute): boolean {
  return (
    route.kind === "home"
    || route.kind === "tower"
    || route.kind === "settings"
    || route.kind === "create"
    || route.kind === "saved"
  );
}

/** Routes that need a mounted play world. */
export function isPlayScreen(route: AppRoute): boolean {
  return route.kind === "play" || route.kind === "level";
}
