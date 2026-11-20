# UI kit

Single place for Mazespire’s non-3D chrome.

| File | Role |
|------|------|
| `kit.css` | Shared styles: buttons, cards, confirms, fields, tabs, ranges, toggles, list rows |
| `button.ts` | `createButton` / `buttonClass` |
| `panel.ts` | Cards, scrims, heads, action rows |
| `modal.ts` | Enter/exit animation + confirm dialogs |
| `field.ts` | Labeled inputs / selects |
| `tabs.ts` | Accessible tab lists |
| `rangeField.ts` | Settings-style range + readout |
| `toggle.ts` | Switch-styled checkbox |
| `listRow.ts` | Clickable save/list rows |
| `index.ts` | Public exports |

Tokens (`--ink`, `--space-*`, `--text-*`, …) live in `src/style.css` `:root`.

```ts
import {
  createButton,
  createListRow,
  createRangeField,
  createTabList,
  createToggle,
} from "./kit/index.ts";
```
