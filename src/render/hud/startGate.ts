import { Group, Mesh } from "three";
import { MAX_HEARTS_CAP } from "../../core/tower.ts";
import { makeHeartIcon } from "../collectibleMeshes.ts";
import type { HudContext } from "./context.ts";
import { GATE_SHATTER_LIFE, type HudFx } from "./fx.ts";
import { StartButton, StartLabel } from "./plates.ts";
import type { HudHitBox, PlayHudStartGate } from "./types.ts";
import { clamp01, easeOutBack, tokenColor, tokenHex } from "./util.ts";

const START_TITLE_PX = 36;
const START_FLOOR_PX = 22;
const START_BTN_PX = 40;
const START_ICON = 18;
const START_GAP = 10;
const START_TITLE_FLOOR_GAP = 2;
const START_COLLECT_GAP = 0.55;
/** Show individual coin meshes up to this many; beyond that, one coin + count. */
const MAX_COIN_ICONS = 5;
/** Start-gate briefing pop-in after the enter-play camera lands. */
const START_INTRO_SECS = 0.48;

/** Centered level briefing + Start button (free-play only). */
export class StartGate {
  readonly layer = new Group();
  private readonly ctx: HudContext;
  private readonly fx: HudFx;
  private readonly heartsRow = new Group();
  private readonly coinsRow = new Group();
  private readonly btnRow = new Group();
  private readonly heartIcons: Group[] = [];
  private readonly coinMeshes: Mesh[] = [];
  private coinCountPlate: StartLabel | null = null;
  private titlePlate: StartLabel | null = null;
  private floorPlate: StartLabel | null = null;
  private btn: StartButton | null = null;
  private btnHit: HudHitBox | null = null;
  private isOpen = false;
  /** 0..1 pop-in for the start briefing (1 = settled). */
  private introT = 1;
  private title = "";
  private floors = 1;
  private lives: number | null = null;
  private coins = 0;

  constructor(ctx: HudContext, fx: HudFx) {
    this.ctx = ctx;
    this.fx = fx;
    this.layer.visible = false;
  }

  get open(): boolean {
    return this.isOpen;
  }

  /** Open with a briefing (restarts the intro) or close with `null`. */
  setGate(gate: PlayHudStartGate | null): void {
    this.isOpen = gate !== null;
    if (gate) {
      this.title = gate.title;
      this.floors = Math.max(1, Math.round(gate.floors));
      this.lives = gate.lives;
      this.coins = Math.max(0, Math.round(gate.coins));
      this.introT = 0;
    } else {
      this.btnHit = null;
      this.introT = 1;
      this.resetIntroScales();
    }
  }

  /** Intro pop-in plus idle spin/bob. */
  tick(dt: number, reduceMotion: boolean): void {
    if (!this.isOpen) return;
    if (this.introT < 1) {
      this.introT = reduceMotion
        ? 1
        : Math.min(1, this.introT + dt / START_INTRO_SECS);
      this.applyIntro(this.introT);
    }
    if (reduceMotion) return;
    const a = this.ctx.assets;
    for (const mesh of this.coinMeshes) {
      if (!mesh.visible || mesh.material !== a.coinMat) continue;
      mesh.rotation.y += dt * 3.6;
    }
    for (const heart of this.heartIcons) {
      if (!heart.visible) continue;
      heart.rotation.y = 0.2 + Math.sin(performance.now() * 0.0024 + heart.id) * 0.35;
    }
    if (this.btnRow.visible) {
      const bob = Math.sin(performance.now() * 0.0032) * this.ctx.designScale() * 1.2;
      this.btnRow.position.y = (this.btnRow.userData.baseY as number ?? 0) + bob;
    }
  }

  /** Hit-test the Start button in CSS client coordinates. */
  hitTest(clientX: number, clientY: number): boolean {
    if (!this.isOpen || !this.btnHit || !this.ctx.shown) return false;
    const p = this.ctx.clientToBuffer(clientX, clientY);
    if (!p) return false;
    const hit = this.btnHit;
    return p.x >= hit.x && p.x <= hit.x + hit.w && p.y >= hit.y && p.y <= hit.y + hit.h;
  }

  /** Re-apply the staggered pop-in at progress `t` (no-op values at 1). */
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

  /** Re-apply the in-flight intro after a relayout. */
  reapplyIntro(): void {
    if (this.introT < 1) this.applyIntro(this.introT);
  }

  /** Blow the briefing into shards (caller then closes the gate). */
  spawnShards(): void {
    const ctx = this.ctx;
    const fx = this.fx;
    const a = ctx.assets;
    const life = GATE_SHATTER_LIFE;
    for (const icon of this.heartIcons) {
      if (!icon.visible) continue;
      fx.burstHeartIcon(icon, 14, life, true);
    }

    const coinHex = a.coinMat.color.getHex();
    const coinShine = tokenHex("--maze-coin-shine", "#ffe9a0");
    const coinPalette = [coinHex, coinHex, coinShine, 0xffffff];
    for (const mesh of this.coinMeshes) {
      if (!mesh.visible) continue;
      const origin = fx.originOf(mesh);
      const size = Math.max(0.01, mesh.scale.x);
      fx.spawnShards(origin.x, origin.y, origin.z, size, 12, life, true, coinPalette, {
        coinPieces: 3,
      });
    }

    const u = ctx.designScale();
    const titleH = START_TITLE_PX * u;
    if (this.titlePlate) {
      fx.shatterPlate(
        this.titlePlate.root,
        this.titlePlate.width,
        titleH,
        [0xffffff, 0xffffff, 0xf0f0f0, 0x222222],
        life,
      );
    }
    const floorH = START_FLOOR_PX * u;
    if (this.floorPlate) {
      fx.shatterPlate(
        this.floorPlate.root,
        this.floorPlate.width,
        floorH,
        [0xffffff, 0xe8e8e8, 0x1a1a1a],
        life,
      );
    }
    if (this.coinCountPlate?.root.visible) {
      const countH = START_ICON * u * 1.15;
      fx.shatterPlate(
        this.coinCountPlate.root,
        this.coinCountPlate.width,
        countH,
        coinPalette,
        life,
      );
    }
    if (this.btn) {
      const btnH = START_BTN_PX * u;
      const face = tokenHex("--maze-goal", "#ffbc61");
      const ink = tokenHex("--maze-void", "#000000");
      fx.shatterPlate(
        this.btn.root,
        this.btn.width,
        btnH,
        [face, face, 0xffffff, ink],
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
    const icon = START_ICON * u;
    const gap = START_GAP * u;
    const cx = viewW * 0.5;
    this.layer.add(
      this.heartsRow,
      this.coinsRow,
      this.btnRow,
    );

    const rows: { height: number; after: number; place: (y: number) => void }[] = [];

    const title = this.title.trim() || "Untitled";
    const titleH = START_TITLE_PX * u;
    if (!this.titlePlate) {
      this.titlePlate = new StartLabel(title, "#ffffff", titleH, true);
      this.layer.add(this.titlePlate.root);
    } else {
      this.titlePlate.set(title, "#ffffff", titleH);
    }
    this.titlePlate.root.rotation.x = -0.08;
    this.titlePlate.root.rotation.y = 0.04;
    const floorLabel = this.floors === 1 ? "1 floor" : `${this.floors} floors`;
    const floorH = START_FLOOR_PX * u;
    // StartLabel canvases include transparent pad; pull the pair together optically.
    const titleFloorAfter = START_TITLE_FLOOR_GAP * u - titleH * 0.2 - floorH * 0.12;
    rows.push({
      height: titleH,
      after: titleFloorAfter,
      place: (y) => {
        if (!this.titlePlate) return;
        this.titlePlate.root.position.set(cx, y, 2);
      },
    });
    if (!this.floorPlate) {
      this.floorPlate = new StartLabel(floorLabel, "#ffffff", floorH, false);
      this.layer.add(this.floorPlate.root);
    } else {
      this.floorPlate.set(floorLabel, "#ffffff", floorH);
    }
    this.floorPlate.root.rotation.x = -0.08;
    this.floorPlate.root.rotation.y = 0.04;
    rows.push({
      height: floorH,
      after: gap,
      place: (y) => {
        if (!this.floorPlate) return;
        this.floorPlate.root.position.set(cx, y, 2);
      },
    });

    const heartCount = this.lives === null
      ? 0
      : Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(this.lives)));
    const coinCount = Math.max(0, Math.round(this.coins));
    if (heartCount > 0 || coinCount > 0) {
      rows.push({
        height: icon,
        after: gap,
        place: (y) => this.syncCollectibles(cx, y, icon, heartCount, coinCount),
      });
    } else {
      this.heartsRow.visible = false;
      this.coinsRow.visible = false;
    }

    const btnH = START_BTN_PX * u;
    const face = tokenColor("--maze-goal", "#ffbc61");
    const ink = tokenColor("--maze-void", "#000000");
    if (!this.btn) {
      this.btn = new StartButton("Start", face, ink, btnH);
      this.btnRow.add(this.btn.root);
    } else {
      this.btn.set("Start", face, ink, btnH);
    }
    const btnW = this.btn.width;
    this.btn.root.rotation.x = -0.1;
    this.btnRow.rotation.x = -0.08;
    rows.push({
      height: btnH,
      after: 0,
      place: (y) => {
        this.btnRow.visible = true;
        this.btnRow.userData.baseY = y;
        this.btnRow.position.set(cx, y, 4);
        // Buffer-pixel hit box (y grows down); client coords map into buffer space.
        const bufY = ctx.bufferH - (y + btnH * 0.5) / s;
        this.btnHit = {
          x: (cx - btnW * 0.5) / s,
          y: bufY,
          w: btnW / s,
          h: btnH / s,
        };
      },
    });

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

  private introItems(): (Group | null | undefined)[] {
    return [
      this.titlePlate?.root,
      this.floorPlate?.root,
      this.heartsRow,
      this.coinsRow,
      this.btnRow,
    ];
  }

  private resetIntroScales(): void {
    for (const item of this.introItems()) {
      if (item) item.scale.setScalar(1);
    }
  }

  private syncCollectibles(
    centerX: number,
    y: number,
    icon: number,
    heartCount: number,
    coinCount: number,
  ): void {
    const heartW = heartCount > 0 ? this.layoutHearts(icon, heartCount) : 0;
    const coinW = coinCount > 0 ? this.layoutCoins(icon, coinCount) : 0;
    const groupGap = heartCount > 0 && coinCount > 0 ? icon * START_COLLECT_GAP : 0;
    const span = heartW + groupGap + coinW;
    let x = centerX - span * 0.5;
    if (heartCount > 0) {
      this.heartsRow.visible = true;
      this.heartsRow.position.set(x + heartW * 0.5, y, 1);
      x += heartW + groupGap;
    } else {
      this.heartsRow.visible = false;
    }
    if (coinCount > 0) {
      this.coinsRow.visible = true;
      this.coinsRow.position.set(x + coinW * 0.5, y, 1);
    } else {
      this.coinsRow.visible = false;
    }
  }

  /** Layout hearts around local origin; returns the row width. */
  private layoutHearts(icon: number, count: number): number {
    const a = this.ctx.assets;
    const gap = icon * 1.08;
    while (this.heartIcons.length < count) {
      const iconGroup = makeHeartIcon(
        a.heartGeo,
        a.heartOutlineMat,
        a.heartBodyMat,
        a.heartShadeMat,
      );
      this.heartIcons.push(iconGroup);
      this.heartsRow.add(iconGroup);
    }
    for (let i = 0; i < this.heartIcons.length; i += 1) {
      const iconGroup = this.heartIcons[i];
      if (!iconGroup) continue;
      const on = i < count;
      iconGroup.visible = on;
      if (!on) continue;
      iconGroup.scale.setScalar(icon);
      iconGroup.position.set((i - (count - 1) * 0.5) * gap, 0, 0);
      iconGroup.rotation.x = -0.18;
    }
    return count <= 1 ? icon : (count - 1) * gap + icon;
  }

  /** Layout coins around local origin; returns the row width. */
  private layoutCoins(icon: number, total: number): number {
    const a = this.ctx.assets;
    const compact = total > MAX_COIN_ICONS;
    const shown = compact ? 1 : total;
    const gap = icon * 1.1;
    while (this.coinMeshes.length < shown) {
      const mesh = new Mesh(a.coinGeo, a.coinMat);
      this.coinMeshes.push(mesh);
      this.coinsRow.add(mesh);
    }
    for (let i = 0; i < this.coinMeshes.length; i += 1) {
      const mesh = this.coinMeshes[i];
      if (!mesh) continue;
      const on = i < shown;
      mesh.visible = on;
      if (!on) continue;
      mesh.geometry = a.coinGeo;
      mesh.material = a.coinMat;
      mesh.scale.setScalar(icon);
      mesh.rotation.x = -0.2;
      if (!compact) {
        mesh.position.set((i - (shown - 1) * 0.5) * gap, 0, 0);
      }
    }
    if (compact) {
      const fill = tokenColor("--maze-coin", "#f0c43a");
      const countH = icon * 1.15;
      const label = String(total);
      if (!this.coinCountPlate) {
        this.coinCountPlate = new StartLabel(label, fill, countH, true);
        this.coinsRow.add(this.coinCountPlate.root);
      } else {
        this.coinCountPlate.set(label, fill, countH);
      }
      const countW = this.coinCountPlate.width;
      const pairGap = icon * 0.28;
      const span = icon + pairGap + countW;
      const coin = this.coinMeshes[0];
      if (coin) coin.position.set(-span * 0.5 + icon * 0.5, 0, 0);
      this.coinCountPlate.root.visible = true;
      this.coinCountPlate.root.position.set(-span * 0.5 + icon + pairGap + countW * 0.5, 0, 0);
      this.coinCountPlate.root.rotation.x = -0.1;
      this.coinCountPlate.root.rotation.y = 0.04;
      return span;
    }
    if (this.coinCountPlate) this.coinCountPlate.root.visible = false;
    return shown <= 1 ? icon : (shown - 1) * gap + icon;
  }
}
