# UI kit

Single place for Mazespire’s non-3D chrome. **Split CSS** so concurrent agents can edit different partials.

| File | Role |
|------|------|
| `kit.css` | Entry (`@import` partials) — imported from `main.ts` |
| `buttons.css` | `glass-btn` / `glass-pill` / tones |
| `shell.css` | Cards, scrims, confirms, toast, list rows |
| `forms.css` | Tabs, ranges, toggles |
| `button.ts` / `tabs.ts` / `rangeField.ts` / `toggle.ts` / `listRow.ts` / … | Factories |
| `index.ts` | Public exports |

Tokens (`--ink`, `--space-*`, `--text-*`, …) live in `src/style.css` `:root`.

```ts
import { createButton, createListRow, createRangeField, createTabList } from "./kit/index.ts";
```
