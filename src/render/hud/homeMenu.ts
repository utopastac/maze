import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { HudContext } from "./context.ts";
import { GATE_SHATTER_LIFE, type HudFx } from "./fx.ts";
import { ArchLabel, StartButton } from "./plates.ts";
import type { HudHitBox, PlayHudHomeAction, PlayHudHomeMenuMode } from "./types.ts";
import { clamp01, easeOutBack, tokenColor, tokenHex } from "./util.ts";

const HOME_TITLE_PX = 52;
const HOME_BTN_PX = 38;
const HOME_BTN_GAP = 10;
/** Design-pixel inset from the right edge for the main CTA stack. */
const HOME_PAD_RIGHT = 22;
/** Title-screen: CTA stagger only (Mazespire wordmark lives in the 3D sky). */
const HOME_INTRO_SECS = 0.72;
const HOME_INTRO_BTNS = 0;

type HomeHit = HudHitBox & { action: PlayHudHomeAction };

const HOME_ACTIONS: readonly PlayHudHomeAction[] = [
  "tower",
  "play",
  "create",
  "saved",
  "settings",
];

const TOWER_HOME_ACTIONS: readonly PlayHudHomeAction[] = [
  "towerNew",
  "towerLoad",
  "towerPractice",
  "towerBack",
];

const HOME_LABELS: Record<PlayHudHomeAction, string> = {
  tower: "Tower",
  play: "Free play",
  create: "Create level",
  saved: "Saved levels",
  settings: "Settings",
  towerNew: "New game",
  towerLoad: "Load",
  towerPractice: "Practice",
  towerBack: "Back",
};

/** Full-screen title menu: CTA buttons + tower submenu (brand mark is in the 3D sky). */
export class HomeMenu {
  readonly layer = new Group();
  private readonly ctx: HudContext;
  private readonly fx: HudFx;
  private readonly btnRows: Group[] = HOME_ACTIONS.map(() => new Group());
  private readonly btns: (StartButton | null)[] = HOME_ACTIONS.map(() => null);
  private scrim: Mesh | null = null;
  /** Tower-submenu title only — main Mazespire mark lives in the home 3D scene. */
  private titlePlate: ArchLabel | null = null;
  private isOpen = false;
  private mode: PlayHudHomeMenuMode = "main";
  /** 0..1 title-screen intro (1 = settled). */
  private introT = 1;
  private hits: HomeHit[] = [];
  private hover: PlayHudHomeAction | null = null;

  constructor(ctx: HudContext, fx: HudFx) {
    this.ctx = ctx;
    this.fx = fx;
    this.layer.visible = false;
    for (const row of this.btnRows) this.layer.add(row);
  }

  get open(): boolean {
    return this.isOpen;
  }

  get menuMode(): PlayHudHomeMenuMode {
    return this.mode;
  }

  /** True while the CTA intro stagger is still running. */
  get intro(): boolean {
    return this.introT < 1;
  }

  /** Flip open state and reset/seed intro state. */
  setOpenState(open: boolean): void {
    this.isOpen = open;
    if (!open) {
      this.hits = [];
      this.hover = null;
      this.mode = "main";
      this.introT = 1;
      this.resetIntroScales();
    } else {
      this.introT = this.mode === "main" ? 0 : 1;
    }
  }

  /** Switch main/tower mode. Returns false when unchanged. */
  setMode(mode: PlayHudHomeMenuMode): boolean {
    if (this.mode === mode) return false;
    this.mode = mode;
    this.hover = null;
    this.introT = 1;
    return true;
  }

  /** Soft hover scale on the pointed home CTA. */
  setHover(action: PlayHudHomeAction | null): void {
    if (this.hover === action) return;
    this.hover = action;
  }

  /** Hit-test a home menu CTA in CSS client coordinates. */
  hitTest(clientX: number, clientY: number): PlayHudHomeAction | null {
    if (!this.isOpen || !this.ctx.shown || this.hits.length === 0 || this.introT < 1) {
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

  /** Intro progress plus idle bob / hover scale. */
  tick(dt: number, reduceMotion: boolean): void {
    if (!this.isOpen) return;
    if (this.introT < 1) {
      const prevIntro = this.introT;
      if (reduceMotion) {
        this.introT = 1;
      } else {
        this.introT = Math.min(1, this.introT + dt / HOME_INTRO_SECS);
        this.applyIntro(this.introT);
      }
      if (prevIntro < 1 && this.introT >= 1) this.ctx.layoutDirty = true;
    }
    if (reduceMotion || this.introT < 1) return;
    const u = this.ctx.designScale();
    const now = performance.now();
    if (this.titlePlate?.root.visible) {
      this.titlePlate.root.rotation.y = 0.04 + Math.sin(now * 0.0011) * 0.03;
      this.titlePlate.root.rotation.x = -0.08 + Math.sin(now * 0.0009) * 0.02;
    }
    const homeActions = this.mode === "tower" ? TOWER_HOME_ACTIONS : HOME_ACTIONS;
    for (let i = 0; i < this.btnRows.length; i += 1) {
      const row = this.btnRows[i];
      const action = homeActions[i];
      if (!row) continue;
      if (!action || !row.visible) continue;
      const baseY = (row.userData.baseY as number) ?? 0;
      const primary = action === "tower" || action === "towerNew";
      const hover = this.hover === action;
      const bob = primary
        ? Math.sin(now * 0.0032) * u * 1.4
        : Math.sin(now * 0.0024 + i) * u * 0.45;
      row.position.y = baseY + bob;
      const target = hover ? 1.08 : 1;
      const cur = (row.userData.scale as number) ?? 1;
      const next = cur + (target - cur) * Math.min(1, dt * 14);
      row.userData.scale = next;
      row.scale.setScalar(next);
    }
  }

  /** Re-apply the in-flight CTA intro after a relayout. */
  reapplyIntro(): void {
    if (this.introT < 1) this.applyIntro(this.introT);
  }

  /** Buttons stagger in over the live 3D sky wordmark. */
  applyIntro(t: number): void {
    if (this.mode !== "main") {
      this.resetIntroScales();
      return;
    }

    const btnT = clamp01((t - HOME_INTRO_BTNS) / Math.max(1e-4, 1 - HOME_INTRO_BTNS));
    for (let i = 0; i < this.btnRows.length; i += 1) {
      const row = this.btnRows[i];
      if (!row?.visible) continue;
      const local = clamp01((btnT - i * 0.09) / 0.55);
      const a = easeOutBack(local);
      const s = Math.max(0.001, a);
      row.scale.setScalar(s);
      row.userData.scale = s;
      const baseY = (row.userData.baseY as number) ?? row.position.y;
      const finalX = (row.userData.finalX as number) ?? row.position.x;
      row.position.x = finalX;
      row.position.y = baseY - (1 - a) * this.ctx.designScale() * 18;
    }

    if (t < 1) this.hits = [];
  }

  /** Blow apart the home menu plates (caller then closes the menu). */
  spawnShards(): void {
    const ctx = this.ctx;
    const fx = this.fx;
    const u = ctx.designScale();
    const life = GATE_SHATTER_LIFE;
    const titleH = HOME_TITLE_PX * u;
    if (this.titlePlate?.root.visible) {
      fx.shatterPlate(
        this.titlePlate.root,
        this.titlePlate.width,
        titleH,
        [0xffffff, 0xffffff, 0xf0f0f0, 0x222222],
        life,
      );
    }
    const btnH = HOME_BTN_PX * u;
    const goal = tokenHex("--maze-goal", "#ffbc61");
    const ink = tokenHex("--maze-void", "#000000");
    const face = tokenHex("--ink", "#ffffff");
    const actions = this.mode === "tower" ? TOWER_HOME_ACTIONS : HOME_ACTIONS;
    for (let i = 0; i < this.btns.length; i += 1) {
      const btn = this.btns[i];
      const row = this.btnRows[i];
      const action = actions[i];
      if (!btn || !action || !row?.visible) continue;
      const primary = action === "tower" || action === "towerNew";
      fx.shatterPlate(
        btn.root,
        btn.width,
        btnH,
        primary ? [goal, goal, 0xffffff, ink] : [face, face, 0xffffff, ink],
        life,
      );
    }
  }

  layout(): void {
    const ctx = this.ctx;
    const s = ctx.viewScale;
    const u = ctx.designScale();
    const viewW = ctx.bufferW * s;
    const viewH = ctx.bufferH * s;
    const cx = viewW * 0.5;
    const btnGap = HOME_BTN_GAP * u;

    if (!this.scrim) {
      const mat = new MeshBasicMaterial({
        color: tokenColor("--sky-sad-deep", "#080a10"),
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        toneMapped: false,
      });
      this.scrim = new Mesh(new PlaneGeometry(1, 1), mat);
      this.layer.add(this.scrim);
    } else if (this.scrim.material instanceof MeshBasicMaterial) {
      this.scrim.material.opacity = 0.08;
      this.scrim.material.transparent = true;
      this.scrim.material.color.set(tokenColor("--sky-sad-deep", "#080a10"));
    }
    this.scrim.scale.set(viewW * 1.2, viewH * 1.2, 1);
    this.scrim.position.set(cx, viewH * 0.5, -2);

    const towerMode = this.mode === "tower";
    const actions = towerMode ? TOWER_HOME_ACTIONS : HOME_ACTIONS;
    const titleH = HOME_TITLE_PX * u;
    if (towerMode) {
      if (!this.titlePlate) {
        this.titlePlate = new ArchLabel("TOWER", "#ffffff", titleH);
        this.layer.add(this.titlePlate.root);
      } else {
        this.titlePlate.set("TOWER", "#ffffff", titleH);
      }
    } else if (this.titlePlate) {
      this.titlePlate.root.visible = false;
    }

    const btnH = HOME_BTN_PX * u;
    const goal = tokenColor("--maze-goal", "#ffbc61");
    const voidInk = tokenColor("--maze-void", "#000000");
    const face = tokenColor("--ink", "#ffffff");
    const hits: HomeHit[] = [];
    let menuWidth = 0;

    const syncBtn = (
      i: number,
      action: PlayHudHomeAction,
      minWidth = 0,
    ): StartButton | null => {
      const row = this.btnRows[i];
      if (!row) return null;
      const label = HOME_LABELS[action];
      const primary = action === "tower" || action === "towerNew";
      const fill = primary ? goal : face;
      let btn = this.btns[i];
      if (!btn) {
        btn = new StartButton(label, fill, voidInk, btnH, minWidth);
        this.btns[i] = btn;
        row.add(btn.root);
      } else {
        btn.set(label, fill, voidInk, btnH, minWidth);
      }
      return btn;
    };

    for (let i = 0; i < this.btnRows.length; i += 1) {
      const row = this.btnRows[i];
      if (!row) continue;
      if (!actions[i]) row.visible = false;
    }

    if (towerMode) {
      // Title up top; New / Load / Back as a bottom bar so the summit stays clear.
      if (this.titlePlate) {
        this.titlePlate.root.visible = true;
        this.titlePlate.root.position.set(cx, viewH * 0.84, 3);
        this.titlePlate.root.rotation.x = -0.08;
        this.titlePlate.root.rotation.y = 0.04;
        this.titlePlate.root.scale.setScalar(1);
        this.titlePlate.root.userData.final = {
          x: cx,
          y: viewH * 0.84,
          z: 3,
        };
      }
      const gap = btnGap * 1.6;
      const widths: number[] = [];
      for (let i = 0; i < actions.length; i += 1) {
        const action = actions[i];
        if (!action) continue;
        const btn = syncBtn(i, action);
        widths[i] = btn?.width ?? 0;
        menuWidth += widths[i] ?? 0;
      }
      menuWidth += gap * Math.max(0, actions.length - 1);
      const barY = viewH * 0.14;
      let x = cx - menuWidth * 0.5;
      for (let i = 0; i < actions.length; i += 1) {
        const action = actions[i];
        const btn = this.btns[i];
        const row = this.btnRows[i];
        const w = widths[i] ?? 0;
        if (!action || !btn || !row) continue;
        const px = x + w * 0.5;
        row.visible = true;
        row.userData.baseY = barY;
        row.userData.finalX = px;
        row.scale.setScalar(1);
        row.userData.scale = 1;
        row.position.set(px, barY, 4 + i * 0.05);
        row.rotation.x = -0.08;
        btn.root.rotation.x = -0.1;
        const bufY = ctx.bufferH - (barY + btnH * 0.5) / s;
        hits.push({
          action,
          x: (px - w * 0.5) / s,
          y: bufY,
          w: w / s,
          h: btnH / s,
        });
        x += w + gap;
      }
    } else {
      // Brand mark sits in the home 3D sky — HUD only carries the CTA stack.
      // Natural widths first, then stretch every CTA to the widest label.
      let uniformW = 0;
      for (let i = 0; i < actions.length; i += 1) {
        const action = actions[i];
        if (!action) continue;
        const btn = syncBtn(i, action);
        if (btn) uniformW = Math.max(uniformW, btn.width);
      }
      for (let i = 0; i < actions.length; i += 1) {
        const action = actions[i];
        if (!action) continue;
        syncBtn(i, action, uniformW);
      }
      const menuX = viewW - HOME_PAD_RIGHT * u - uniformW * 0.5;
      const rows: { height: number; after: number; place: (y: number) => void }[] = [];
      for (let i = 0; i < actions.length; i += 1) {
        const action = actions[i];
        if (!action) continue;
        const index = i;
        const act = action;
        rows.push({
          height: btnH,
          after: index < actions.length - 1 ? btnGap : 0,
          place: (y) => {
            const current = this.btns[index];
            const slot = this.btnRows[index];
            if (!current || !slot) return;
            slot.visible = true;
            slot.userData.baseY = y;
            slot.userData.finalX = menuX;
            slot.scale.setScalar(1);
            slot.userData.scale = 1;
            slot.position.set(menuX, y, 4 + index * 0.05);
            slot.rotation.x = -0.08;
            current.root.rotation.x = -0.1;
            const bufY = ctx.bufferH - (y + btnH * 0.5) / s;
            hits.push({
              action: act,
              x: (menuX - current.width * 0.5) / s,
              y: bufY,
              w: current.width / s,
              h: btnH / s,
            });
          },
        });
      }
      const totalH = rows.reduce((sum, row, i) => {
        const after = i < rows.length - 1 ? row.after : 0;
        return sum + row.height + after;
      }, 0);
      let y = viewH * 0.55 + totalH * 0.5;
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row) continue;
        y -= row.height * 0.5;
        row.place(y);
        y -= row.height * 0.5 + (i < rows.length - 1 ? row.after : 0);
      }
    }

    this.hits = this.introT < 1 && !towerMode ? [] : hits;
  }

  private resetIntroScales(): void {
    if (this.titlePlate) {
      this.titlePlate.root.scale.setScalar(1);
      this.titlePlate.root.visible = this.mode === "tower";
    }
    for (const row of this.btnRows) {
      row.scale.setScalar(1);
      row.userData.scale = 1;
    }
  }
}
