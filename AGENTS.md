# Agent guide — concurrent development

Read `ARCHITECTURE.md` first. This file is the short rule set for Cursor agents.

## Parallel work

1. **Claim one ownership lane** from `ARCHITECTURE.md` (A–I). Stay in that lane’s file set.
2. **Do not** both edit `src/app/App.ts` and `src/render/MazeWorld.ts` in the same concurrent run unless one agent only adds an import/call at the edge.
3. Prefer **new files** over growing god files. If a change needs >~80 lines inside `MazeWorld.ts`, `editor.ts`, or `playHud.ts`, extract a sibling module first.
4. Shared chrome goes through **`src/ui/kit`** — no new one-off `glass-btn` CSS copies.
5. Domain logic belongs in **`src/core`** so it can be unit-tested without WebGL.

## Conflict hotspots (serialize)

These files are merge magnets — only one agent should own them per batch:

- `src/app/App.ts` (prefer `shellMenus.ts` / `appRouting.ts` / `campaignSession.ts`)
- `src/render/MazeWorld.ts`
- `src/ui/editor.ts` (prefer `editorHistory` / `editorDraftsPanel` / `editorPhysicsPanel`)
- `src/render/playHud.ts`
- `src/style.css` (tokens only when possible)
- Kit CSS: edit one partial — `buttons.css` / `shell.css` / `forms.css` — not all at once

## Verification

After substantive edits:

```bash
npm run typecheck
npm test
```

Use Node **22+**. Full e2e (`npm run test:e2e`) when touching boot, home, or routing.

## Style

- 2-space indent, TypeScript strict, no `any`
- CSS modules per component; reuse CSS variables from `:root` / kit
- Match existing naming; do not introduce React/R3F unless explicitly requested
