import { hasLevelHash } from "../core/share.ts";
import { parseRoute, routeHash, routesEqual, type AppRoute } from "../core/route.ts";

export type ShellScreen = AppRoute["kind"] | "play";

export interface AppRouterHooks {
  /** Run the screen transition for a route (open menus, mount play, …). */
  apply(route: AppRoute, fromHash: boolean): void;
}

/** Does the current `location.hash` already describe `route`? */
export function routeMatchesHash(route: AppRoute): boolean {
  if (route.kind === "level") return hasLevelHash(location.hash);
  return parseRoute(location.hash).kind === route.kind;
}

/** Shell CSS hook: `[data-screen]` drives which chrome is visible. */
export function setShellScreen(shell: HTMLElement, kind: ShellScreen): void {
  shell.dataset.screen = kind;
}

/**
 * Owns the current route, settings-return memory, and `location.hash` sync.
 * Screen transitions stay in App via `hooks.apply`.
 */
export class AppRouter {
  private current: AppRoute = { kind: "home" };
  private settingsReturn: AppRoute = { kind: "home" };
  private syncingHash = false;

  private readonly hooks: AppRouterHooks;

  constructor(hooks: AppRouterHooks) {
    this.hooks = hooks;
  }

  get route(): AppRoute {
    return this.current;
  }

  /** Listen for browser back/forward and manual hash edits. */
  attach(): void {
    window.addEventListener("hashchange", this.onHashChange);
  }

  /** Update the route without touching the URL or running a transition. */
  set(route: AppRoute): void {
    this.current = route;
  }

  /** Record the route to return to, then adopt `route` (no URL change). */
  enter(route: AppRoute): void {
    if (route.kind === "settings" && this.current.kind !== "settings") {
      this.rememberSettingsReturn();
    }
    this.current = route;
  }

  navigate(route: AppRoute, replace = false): void {
    if (route.kind === "settings" && this.current.kind !== "settings") {
      this.rememberSettingsReturn();
    }
    if (routesEqual(this.current, route) && routeMatchesHash(route)) {
      this.hooks.apply(route, true);
      return;
    }
    this.current = route;
    this.writeHash(routeHash(route), replace);
    this.hooks.apply(route, true);
  }

  /** Replace the URL hash without triggering a route transition. */
  replaceHash(next: string): void {
    this.writeHash(next, true);
  }

  rememberSettingsReturn(): void {
    if (this.current.kind === "settings") return;
    // Shared-level hash is cleared when parking; land on free play instead.
    this.settingsReturn = this.current.kind === "level"
      ? { kind: "play" }
      : { kind: this.current.kind };
  }

  /** Where leaving settings should go (never settings itself). */
  settingsReturnTarget(): AppRoute {
    return this.settingsReturn.kind === "settings"
      ? { kind: "home" }
      : this.settingsReturn;
  }

  private writeHash(next: string, replace: boolean): void {
    if (location.hash === next) return;
    this.syncingHash = true;
    if (replace) history.replaceState(null, "", next);
    else history.pushState(null, "", next);
    this.syncingHash = false;
  }

  private onHashChange = (): void => {
    if (this.syncingHash) return;
    this.hooks.apply(parseRoute(location.hash), true);
  };
}
