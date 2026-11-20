# Mazespire

Tilt a marble through procedural 3D maze towers — campaign, free play, level editor, and shareable URL-encoded levels.

Live: [mazespire.f-90.co.uk](https://mazespire.f-90.co.uk)

## Stack

- **Vite 8** + **TypeScript** (strict)
- **Three.js** for rendering (`src/render`)
- **Rapier3D** for physics (`src/core/simulation.ts`)
- Vanilla DOM UI with CSS modules (`src/ui`)

## Requirements

- Node **22+** (`engines` in `package.json`)

## Scripts

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc + vite build
npm test           # Vitest unit tests
npm run test:e2e   # Playwright smoke (builds + preview)
npm run typecheck  # tsc --noEmit
```

## Layout

| Path | Role |
|------|------|
| `src/core/` | Domain: maze, tower, campaign, physics, share codec, routing, storage |
| `src/render/` | Three.js: `MazeWorld`, `boardEffects`, `winGallery*`, `homeTower`, `enterPlay*`, `hud/` |
| `src/ui/kit/` | **Shared DOM design system** — buttons, tabs, ranges, list rows, modals |
| `src/ui/` | Screen panels + editor helpers (`editorTools`, `editorBoardPaint`, `editorBoardDom`) |
| `src/app/` | `App` + `playInput` + `campaignSession` + `appRouting` |

See **`ARCHITECTURE.md`** and **`AGENTS.md`** for parallel-work ownership lanes.

### UI kit (non-3D chrome)

Edit common controls in one place:

- **Styles:** `src/ui/kit/{buttons,shell,forms}.css` via `kit.css` (imported from `main.ts`)
- **Factories:** `src/ui/kit/` — `createButton`, `createCard`, `createConfirmDialog`, `createField`, …
- **Tokens:** `:root` in `src/style.css` (`--ink`, `--space-*`, `--text-*`, `--seam`, …)

Screens should prefer kit factories over hand-rolled `glass-btn` markup.

### Useful seams

- **Hash routes** — `src/core/route.ts` (`#home`, `#play`, `#m.…` shared levels)
- **Pose** — `Simulation` → `MazeWorld.update` each frame
- **Level codes** — `encodeLevel` / `decodeLevel` in `src/core/share.ts`
- **Saved / authored levels** — shared impl in `src/core/levelStorage.ts`

## Controls (play)

- Arrow keys / WASD — tilt
- Drag on the board — tilt
- Q/E, Z/C — camera; `+`/`-` — zoom (see settings keybinds)
- `R` reset ball · `Esc` pause · device orientation optional in settings
