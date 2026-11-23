/** Crumble slab preview for 2D editor / thumbnails (PNG from `texture-imports/`). */

import {
  crumbleTextureUrl,
} from "./tileTextures.ts";

/** Installs the crumble PNG as `--maze-crumble-tex` for 2D previews. */
export function installCrumblePreviewCss(): void {
  const root = document.documentElement;
  if (root.style.getPropertyValue("--maze-crumble-tex")) return;
  root.style.setProperty("--maze-crumble-tex", `url("${crumbleTextureUrl()}")`);
}
