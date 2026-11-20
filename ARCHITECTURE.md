# Architecture (for humans & parallel agents)

Mazespire is a Vite + TypeScript browser game. Prefer **editing different ownership lanes** so concurrent agents rarely touch the same files.

## Boot

`index.html` → `src/main.ts` → `App.start()` → physics init → hash route → rAF `frame`.

## Layers

| Layer | Path | Owns |
|-------|------|------|
| Domain | `src/core/` | Maze data, tower/campaign, Rapier sim, share codec, routes, settings, storage |
| Render | `src/render/` | Three.js world, play HUD canvas, materials, enter-play, home tower |
| DOM UI | `src/ui/` | Menus, editor, pause, settings; shared chrome in `src/ui/kit/` |
| App | `src/app/` | Orchestration only: wire layers, game loop, input, campaign session |

**Rule:** put new game rules in `core/`, new 3D visuals in `render/`, new menus in `ui/` (+ kit), only wire in `app/`.

## Parallel ownership lanes

Agents working at the same time should pick **different lanes** (different file sets):

| Lane | Primary files | Avoid also editing |
|------|---------------|--------------------|
| **A · Domain / rules** | `src/core/**` | `MazeWorld.ts`, `App.ts`, editor DOM |
| **B · Play 3D board** | `MazeWorld.ts`, `boardEffects.ts`, `boardMaterials.ts`, `themeMaterials.ts`, `collectibleMeshes.ts` | `winGallery*.ts`, `hud/**`, `ui/kit/**` |
| **C · Home / enter-play** | `homeTower.ts`, `homeEnterConstants.ts`, `enterPlayCamera.ts`, `enterPlayCurtains.ts`, `playCamera.ts` | play-board floor builders in `MazeWorld` |
| **D · Win / fail gallery** | `winGalleryKit.ts`, `winGalleryScenes.ts` | play HUD, editor |
| **E · Play HUD (WebGL)** | `src/render/hud/**` (`homeMenu`, `startGate`, `playStats`, `fx`, …); `playHud.ts` is a re-export | DOM `ui/hud.ts` |
| **F · DOM chrome / kit** | `src/ui/kit/**` (CSS: `buttons.css` / `shell.css` / `forms.css` separately) | `MazeWorld.ts`, `simulation.ts` |
| **G · Level editor** | `editor.ts`, `editorTools.ts`, `editorBoardPaint.ts`, `editorBoardDom.ts`, `editorHistory.ts`, `editorDraftsPanel.ts`, `editorPhysicsPanel.ts`, `editor.module.css` | campaign session, play HUD |
| **H · Campaign / routing** | `campaignSession.ts`, `appRouting.ts`, `shellMenus.ts`, `campaign*.ts`, `route.ts`, thin `App` wiring | editor board paint |
| **I · Tests / CI** | `**/*.test.ts`, `e2e/**`, workflows | production logic unless fixing a test |

If two agents must touch `App.ts` or `MazeWorld.ts`, serialize those edits or extract a new module first.

## Stable contracts (safe seams)

- **Hash routes** — `src/core/route.ts` (`#home`, `#play`, `#m.…`)
- **Pose** — `Simulation.pose()` → `MazeWorld.update(time, pose)`
- **Level codes** — `encodeLevel` / `decodeLevel` in `share.ts`
- **Storage** — `levelStorage.ts` (saved + authored), `campaignProgress.ts`
- **DOM kit** — `createButton`, `createTabList`, `createRangeField`, `createListRow`, … from `ui/kit`
- **Enter play** — `MazeWorld.beginEnterPlay` / `tickEnterPlay` / `enterPlayNeedsSwap` (App mounts tower mid-transition)

## Dual canvases

- `#viewport` — main 3D world (`MazeWorld`)
- `#play-hud` — orthographic HUD (`src/render/hud/`): home menu, start gate, hearts/coins/timer

Do not merge these systems casually; concurrent work should treat them as separate lanes (B/C vs E).

## Where new code goes

| Kind of change | Create / edit |
|----------------|---------------|
| New tile / mechanic | `core/maze.ts` + `layout.ts` + `simulation.ts`; then render in lane B |
| New menu screen | New `ui/foo.ts` + `foo.module.css`; use kit; wire route in App |
| New shared control | `ui/kit/` only |
| New win scene props | `winGalleryKit.ts` |
| New home backdrop prop | `homeTower.ts` |
| Persistence | `core/*Storage*` or `campaignProgress.ts` |

## Tests

- Unit: Vitest (`src/**/*.test.ts`) — prefer testing `core/` and `ui/kit`
- E2E: Playwright (`e2e/`) — smoke only; don’t block domain PRs on e2e flakiness

Run: `npm test` · `npm run typecheck` · `npm run test:e2e` (needs Node 22+)
