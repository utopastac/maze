/**
 * Dump procedurally painted surface textures to PNGs for manual editing.
 * Usage: node scripts/dump-textures.mjs
 * Requires Vite reachable at http://127.0.0.1:5173 (starts one if needed).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "texture-exports");
const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, "themes"), { recursive: true });
  await mkdir(path.join(outDir, "win-floors"), { recursive: true });
  await mkdir(path.join(outDir, "gates"), { recursive: true });
  await mkdir(path.join(outDir, "skies"), { recursive: true });

  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port: PORT, strictPort: true },
  });
  await server.listen();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("pageerror:", err));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("console:", msg.text());
  });

  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });

  const dumps = await page.evaluate(async () => {
    const {
      loadTileTextures,
      crumbleTexture,
      themeFloorTexture,
      themeWallTexture,
    } = await import("/src/render/tileTextures.ts");
    const {
      makeGateTopTexture,
      gateSignMaterial,
      token,
      ramp,
    } = await import("/src/render/boardMaterials.ts");
    const {
      makeFloorMats,
      makeFailFloorMat,
      WIN_SCENES,
      GALLERY_SCENE_SKY,
    } = await import("/src/render/winGalleryKit.ts");
    const { FLOOR_THEMES } = await import("/src/core/theme.ts");
    const { VoidSky } = await import("/src/render/voidSky.ts");
    const { SKY_THEMES } = await import("/src/core/playSettings.ts");

    await loadTileTextures();

    const out = [];

    const pngFromCanvas = (canvas) => {
      const dataUrl = canvas.toDataURL("image/png");
      const comma = dataUrl.indexOf(",");
      return dataUrl.slice(comma + 1);
    };

    const pngFromTexture = (tex) => {
      const image = tex.image;
      if (image instanceof HTMLCanvasElement) return pngFromCanvas(image);
      if (
        image instanceof HTMLImageElement
        || (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
      ) {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2d context unavailable");
        ctx.drawImage(image, 0, 0);
        return pngFromCanvas(canvas);
      }
      if (image && image.data && image.width && image.height) {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2d context unavailable");
        const data = image.data instanceof Uint8ClampedArray
          ? image.data
          : new Uint8ClampedArray(image.data.buffer.slice(0));
        ctx.putImageData(new ImageData(data, image.width, image.height), 0, 0);
        return pngFromCanvas(canvas);
      }
      throw new Error("Unsupported texture image");
    };

    // Tile textures (source of truth: texture-imports/)
    out.push({ path: "crumble.png", png: pngFromTexture(crumbleTexture()) });
    for (const id of FLOOR_THEMES) {
      out.push({
        path: `themes/${id}-floor.png`,
        png: pngFromTexture(themeFloorTexture(id)),
      });
      out.push({
        path: `themes/${id}-wall.png`,
        png: pngFromTexture(themeWallTexture(id)),
      });
    }

    for (const dir of ["e", "w", "n", "s"]) {
      out.push({
        path: `gates/gate-top-${dir}.png`,
        png: pngFromTexture(makeGateTopTexture(dir)),
      });
    }

    out.push({
      path: "gates/gate-sign-ok.png",
      png: pngFromTexture(gateSignMaterial(token("--maze-gate-ok"), "ok").map),
    });
    out.push({
      path: "gates/gate-sign-no.png",
      png: pngFromTexture(gateSignMaterial(token("--maze-gate-no"), "no").map),
    });

    const floorMats = makeFloorMats();
    for (const kind of WIN_SCENES) {
      out.push({
        path: `win-floors/${kind}.png`,
        png: pngFromTexture(floorMats[kind].map),
      });
    }
    out.push({
      path: "win-floors/fail.png",
      png: pngFromTexture(makeFailFloorMat().map),
    });

    out.push({ path: "shade-ramp.png", png: pngFromTexture(ramp) });

    const skyIds = new Set([
      ...SKY_THEMES.map((t) => t.id),
      ...Object.values(GALLERY_SCENE_SKY),
      "rainbow",
    ]);
    const sky = new VoidSky();
    for (const id of skyIds) {
      sky.configure(4, 6, id);
      sky.paint(0, true);
      out.push({
        path: `skies/${id}.png`,
        png: pngFromTexture(sky.texture),
      });
    }

    return out;
  });

  for (const entry of dumps) {
    const dest = path.join(outDir, entry.path);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(entry.png, "base64"));
    console.log(`wrote ${entry.path}`);
  }

  console.log(`\n${dumps.length} textures → ${outDir}`);

  await browser.close();
  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
