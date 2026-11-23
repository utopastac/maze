import { Group } from "three";
import type { HudContext } from "./context.ts";
import { GATE_SHATTER_LIFE, type HudFx } from "./fx.ts";
import { StartButton, TextPlate } from "./plates.ts";
import type { HudHitBox, PlayHudResult, PlayHudResultAction } from "./types.ts";
import { clamp01, easeOutBack, tokenColor, tokenHex } from "./util.ts";

const RESULT_TITLE_PX = 28;
const RESULT_BTN_PX = 40;
const RESULT_GAP = 14;
const RESULT_BTN_GAP = 10;
/** Design-pixel inset from the bottom of the HUD buffer. */
const RESULT_PAD_BOTTOM = 28;
const RESULT_INTRO_SECS = 0.42;

const RESULT_COPY: Record<PlayHudResult, { title: string; primary: string }> = {
  win: { title: "FREE.", primary: "Again" },
  loss: { title: "OUT OF HEARTS.", primary: "Retry" },
};

type ResultHit = HudHitBox & { action: PlayHudResultAction };

/** Bottom-aligned result stack: title + primary / Quit (no card). */
export class ResultPanel {
  readonly layer = new Group();
  private readonly ctx: HudContext;
  private readonly fx: HudFx;
  private readonly btnRow = new Group();
  private titlePlate: TextPlate | null = null;
  private primaryBtn: StartButton | null = null;
  private leaveBtn: StartButton | null = null;
  private kind: PlayHudResult | null = null;
  private introT = 1;
  private hits: ResultHit[] = [];

  constructor(ctx: HudContext, fx: HudFx) {
    this.ctx = ctx;
    this.fx = fx;
    this.layer.visible = false;
    this.layer.add(this.btnRow);
  }

  get open(): boolean {
    return this.kind !== null;
  }

  get result(): PlayHudResult | null {
    return this.kind;
  }

  /** Open a win/loss stack (restarts the intro) or close with `null`. */
  setResult(kind: PlayHudResult | null): void {
    this.kind = kind;
    if (kind) {
      this.introT = 0;
    } else {
      this.hits = [];
      this.introT = 1;
      this.resetIntroScales();
    }
  }

  applyLook(soft: boolean): void {
    this.titlePlate?.setSoft(soft);
  }

  tick(dt: number, reduceMotion: boolean): void {
    if (!this.kind) return;
    if (this.introT < 1) {
      this.introT = reduceMotion
        ? 1
        : Math.min(1, this.introT + dt / RESULT_INTRO_SECS);
      this.applyIntro(this.introT);
    }
    if (reduceMotion || this.introT < 1) return;
    if (this.btnRow.visible) {
      const bob = Math.sin(performance.now() * 0.0032) * this.ctx.designScale() * 1.2;
      this.btnRow.position.y = (this.btnRow.userData.baseY as number ?? 0) + bob;
    }
  }

  hitTest(clientX: number, clientY: number): PlayHudResultAction | null {
    if (!this.kind || !this.ctx.shown || this.hits.length === 0 || this.introT < 1) {
      return null;
    }
    const p = this.ctx.clientToBuffer(clientX, clientY);
    if (!p) return null;
    for (const hit of this.hits) {
      if (p.x >= hit.x && p.x <= hit.x + hit.w && p.y >= hit.y && p.y <= hit.y + hit.h) {
        return hit.action;
      }
    }
    return null;
  }

  applyIntro(t: number): void {
    const items = this.introItems();
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || !item.visible) continue;
      const local = clamp01((t - i * 0.07) / 0.72);
      const a = easeOutBack(local);
      item.scale.setScalar(Math.max(0.001, a));
    }
  }

  reapplyIntro(): void {
    if (this.introT < 1) this.applyIntro(this.introT);
  }

  spawnShards(): void {
    const u = this.ctx.designScale();
    const life = GATE_SHATTER_LIFE;
    const ink = tokenHex("--ink", "#ffffff");
    const goal = tokenHex("--maze-goal", "#ffbc61");
    const voidInk = tokenHex("--maze-void", "#000000");

    const titleH = RESULT_TITLE_PX * u;
    if (this.titlePlate) {
      this.fx.shatterPlate(
        this.titlePlate.root,
        this.titlePlate.width,
        titleH,
        [0xffffff, 0xe8e8e8, 0x1a1a1a],
        life,
      );
    }
    const btnH = RESULT_BTN_PX * u;
    if (this.primaryBtn) {
      this.fx.shatterPlate(
        this.primaryBtn.root,
        this.primaryBtn.width,
        btnH,
        [goal, goal, 0xffffff, voidInk],
        life,
      );
    }
    if (this.leaveBtn) {
      this.fx.shatterPlate(
        this.leaveBtn.root,
        this.leaveBtn.width,
        btnH,
        [ink, ink, 0xffffff, voidInk],
        life,
      );
    }
  }

  layout(): void {
    const kind = this.kind;
    if (!kind) return;
    const copy = RESULT_COPY[kind];
    const ctx = this.ctx;
    const s = ctx.viewScale;
    const u = ctx.designScale();
    const viewW = ctx.bufferW * s;
    const cx = viewW * 0.5;
    const gap = RESULT_GAP * u;
    const crisp = !ctx.normalLook;

    const titleH = RESULT_TITLE_PX * u;
    if (!this.titlePlate) {
      this.titlePlate = new TextPlate(copy.title, "#ffffff", titleH, crisp);
      this.layer.add(this.titlePlate.root);
    } else {
      this.titlePlate.set(copy.title, "#ffffff", titleH);
      this.titlePlate.setSoft(!crisp);
    }

    const btnH = RESULT_BTN_PX * u;
    const goal = tokenColor("--maze-goal", "#ffbc61");
    const voidInk = tokenColor("--maze-void", "#000000");
    const face = tokenColor("--ink", "#ffffff");
    if (!this.primaryBtn) {
      this.primaryBtn = new StartButton(copy.primary, goal, voidInk, btnH);
      this.btnRow.add(this.primaryBtn.root);
    } else {
      this.primaryBtn.set(copy.primary, goal, voidInk, btnH);
    }
    if (!this.leaveBtn) {
      this.leaveBtn = new StartButton("Quit", face, voidInk, btnH);
      this.btnRow.add(this.leaveBtn.root);
    } else {
      this.leaveBtn.set("Quit", face, voidInk, btnH);
    }

    const btnGap = RESULT_BTN_GAP * u;
    const primaryW = this.primaryBtn.width;
    const leaveW = this.leaveBtn.width;

    const rows: { height: number; after: number; place: (y: number) => void }[] = [
      {
        height: titleH,
        after: gap,
        place: (y) => {
          if (!this.titlePlate) return;
          this.titlePlate.root.rotation.x = -0.08;
          this.titlePlate.root.rotation.y = 0.04;
          this.titlePlate.root.position.set(cx, y, 2);
        },
      },
      {
        height: btnH,
        after: 0,
        place: (y) => {
          if (!this.primaryBtn || !this.leaveBtn) return;
          this.btnRow.visible = true;
          this.btnRow.userData.baseY = y;
          this.btnRow.position.set(cx, y, 4);
          this.btnRow.rotation.x = -0.08;
          const span = primaryW + btnGap + leaveW;
          const primaryX = -span * 0.5 + primaryW * 0.5;
          const leaveX = span * 0.5 - leaveW * 0.5;
          this.primaryBtn.root.position.set(primaryX, 0, 0);
          this.primaryBtn.root.rotation.x = -0.1;
          this.leaveBtn.root.position.set(leaveX, 0, 0);
          this.leaveBtn.root.rotation.x = -0.1;
          const bufY = ctx.bufferH - (y + btnH * 0.5) / s;
          this.hits = [
            {
              action: "primary",
              x: (cx + primaryX - primaryW * 0.5) / s,
              y: bufY,
              w: primaryW / s,
              h: btnH / s,
            },
            {
              action: "leave",
              x: (cx + leaveX - leaveW * 0.5) / s,
              y: bufY,
              w: leaveW / s,
              h: btnH / s,
            },
          ];
        },
      },
    ];

    const totalH = rows.reduce((sum, row, i) => {
      const after = i < rows.length - 1 ? row.after : 0;
      return sum + row.height + after;
    }, 0);
    const margin = RESULT_PAD_BOTTOM * u;
    let y = margin + totalH;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;
      y -= row.height * 0.5;
      row.place(y);
      y -= row.height * 0.5 + (i < rows.length - 1 ? row.after : 0);
    }
  }

  private introItems(): (Group | null | undefined)[] {
    return [this.titlePlate?.root, this.btnRow];
  }

  private resetIntroScales(): void {
    for (const item of this.introItems()) {
      if (item) item.scale.setScalar(1);
    }
  }
}
