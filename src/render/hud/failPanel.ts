import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { formatTime } from "../../core/format.ts";
import type { HudContext } from "./context.ts";
import { GATE_SHATTER_LIFE, type HudFx } from "./fx.ts";
import { OutlineButton, StartLabel } from "./plates.ts";
import type { HudHitBox, PlayHudLoss, PlayHudLossAction } from "./types.ts";
import { clamp01, easeOutBack, tokenColor, tokenHex } from "./util.ts";

const LOSS_KICKER_PX = 14;
const LOSS_SCORE_PX = 56;
const LOSS_DETAIL_PX = 16;
const LOSS_BTN_PX = 36;
const LOSS_GAP = 12;
const LOSS_BTN_GAP = 10;
const LOSS_PAD_X = 28;
const LOSS_PAD_Y = 22;
const LOSS_CARD_MIN_W = 280;
const LOSS_INTRO_SECS = 0.42;

type LossHit = HudHitBox & { action: PlayHudLossAction };

/** Centered out-of-hearts card: kicker, floor score, detail, Retry (+ Home). */
export class FailPanel {
  readonly layer = new Group();
  private readonly ctx: HudContext;
  private readonly fx: HudFx;
  private readonly btnRow = new Group();
  private readonly cardRow = new Group();
  private card: Mesh | null = null;
  private kickerPlate: StartLabel | null = null;
  private scorePlate: StartLabel | null = null;
  private detailPlate: StartLabel | null = null;
  private retryBtn: OutlineButton | null = null;
  private leaveBtn: OutlineButton | null = null;
  private isOpen = false;
  private introT = 1;
  private floor = 1;
  private total = 1;
  private seconds = 0;
  private showLeave = false;
  private hits: LossHit[] = [];

  constructor(ctx: HudContext, fx: HudFx) {
    this.ctx = ctx;
    this.fx = fx;
    this.layer.visible = false;
    this.layer.add(this.cardRow, this.btnRow);
  }

  get open(): boolean {
    return this.isOpen;
  }

  /** Open with loss stats (restarts the intro) or close with `null`. */
  setLoss(loss: PlayHudLoss | null): void {
    this.isOpen = loss !== null;
    if (loss) {
      this.floor = Math.max(1, Math.round(loss.floor));
      this.total = Math.max(1, Math.round(loss.total));
      this.seconds = Math.max(0, loss.seconds);
      this.showLeave = loss.showLeave;
      this.introT = 0;
    } else {
      this.hits = [];
      this.introT = 1;
      this.resetIntroScales();
    }
  }

  tick(dt: number, reduceMotion: boolean): void {
    if (!this.isOpen) return;
    if (this.introT < 1) {
      this.introT = reduceMotion
        ? 1
        : Math.min(1, this.introT + dt / LOSS_INTRO_SECS);
      this.applyIntro(this.introT);
    }
    if (reduceMotion || this.introT < 1) return;
    if (this.btnRow.visible) {
      const bob = Math.sin(performance.now() * 0.0032) * this.ctx.designScale() * 1.1;
      this.btnRow.position.y = (this.btnRow.userData.baseY as number ?? 0) + bob;
    }
  }

  hitTest(clientX: number, clientY: number): PlayHudLossAction | null {
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

  applyIntro(t: number): void {
    const items = this.introItems();
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || !item.visible) continue;
      const local = clamp01((t - i * 0.06) / 0.7);
      const a = easeOutBack(local);
      item.scale.setScalar(Math.max(0.001, a));
    }
  }

  reapplyIntro(): void {
    if (this.introT < 1) this.applyIntro(this.introT);
  }

  spawnShards(): void {
    const ctx = this.ctx;
    const fx = this.fx;
    const u = ctx.designScale();
    const life = GATE_SHATTER_LIFE;
    const panel = tokenHex("--panel-fill", "#121212");
    const seam = tokenHex("--seam", "#ffbc61");
    const ink = tokenHex("--ink", "#ffffff");
    if (this.card) {
      const size = Math.max(this.card.scale.x, this.card.scale.y) * 0.35;
      const origin = fx.originOf(this.cardRow);
      fx.spawnShards(origin.x, origin.y, origin.z, size, 18, life, true, [
        panel,
        panel,
        0x2a2a2a,
        0x000000,
      ]);
    }
    const kickerH = LOSS_KICKER_PX * u;
    if (this.kickerPlate) {
      fx.shatterPlate(
        this.kickerPlate.root,
        this.kickerPlate.width,
        kickerH,
        [0xaaaaaa, 0x888888, 0x222222],
        life,
      );
    }
    const scoreH = LOSS_SCORE_PX * u;
    if (this.scorePlate) {
      fx.shatterPlate(
        this.scorePlate.root,
        this.scorePlate.width,
        scoreH,
        [ink, ink, 0xf0f0f0, 0x222222],
        life,
      );
    }
    const detailH = LOSS_DETAIL_PX * u;
    if (this.detailPlate) {
      fx.shatterPlate(
        this.detailPlate.root,
        this.detailPlate.width,
        detailH,
        [ink, 0xe8e8e8, 0x1a1a1a],
        life,
      );
    }
    const btnH = LOSS_BTN_PX * u;
    if (this.retryBtn) {
      fx.shatterPlate(
        this.retryBtn.root,
        this.retryBtn.width,
        btnH,
        [seam, seam, ink, panel],
        life,
      );
    }
    if (this.leaveBtn?.root.visible) {
      fx.shatterPlate(
        this.leaveBtn.root,
        this.leaveBtn.width,
        btnH,
        [0xffffff, 0xcccccc, panel, 0x222222],
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
    const gap = LOSS_GAP * u;
    const padX = LOSS_PAD_X * u;
    const padY = LOSS_PAD_Y * u;

    const kicker = "OUT OF HEARTS.";
    const kickerH = LOSS_KICKER_PX * u;
    const kickerFill = tokenColor("--ink-faint", "rgba(255,255,255,0.45)");
    if (!this.kickerPlate) {
      this.kickerPlate = new StartLabel(kicker, kickerFill, kickerH, false);
      this.layer.add(this.kickerPlate.root);
    } else {
      this.kickerPlate.set(kicker, kickerFill, kickerH);
    }

    const score = String(this.floor);
    const scoreH = LOSS_SCORE_PX * u;
    const ink = tokenColor("--ink", "#ffffff");
    if (!this.scorePlate) {
      this.scorePlate = new StartLabel(score, ink, scoreH, true);
      this.layer.add(this.scorePlate.root);
    } else {
      this.scorePlate.set(score, ink, scoreH);
    }

    const detail = this.total > 1
      ? `Floor ${this.floor} of ${this.total} · ${formatTime(this.seconds)}`
      : formatTime(this.seconds);
    const detailH = LOSS_DETAIL_PX * u;
    if (!this.detailPlate) {
      this.detailPlate = new StartLabel(detail, ink, detailH, false);
      this.layer.add(this.detailPlate.root);
    } else {
      this.detailPlate.set(detail, ink, detailH);
    }

    const btnH = LOSS_BTN_PX * u;
    const seam = tokenColor("--seam", "#ffbc61");
    const panelFill = tokenColor("--panel-fill", "#121212");
    const glassBorder = tokenColor("--glass-border", "rgba(255,255,255,0.28)");
    if (!this.retryBtn) {
      this.retryBtn = new OutlineButton("Retry", seam, ink, panelFill, btnH);
      this.btnRow.add(this.retryBtn.root);
    } else {
      this.retryBtn.set("Retry", seam, ink, panelFill, btnH);
    }
    if (this.showLeave) {
      if (!this.leaveBtn) {
        this.leaveBtn = new OutlineButton("Home", glassBorder, ink, panelFill, btnH);
        this.btnRow.add(this.leaveBtn.root);
      } else {
        this.leaveBtn.set("Home", glassBorder, ink, panelFill, btnH);
      }
      this.leaveBtn.root.visible = true;
    } else if (this.leaveBtn) {
      this.leaveBtn.root.visible = false;
    }

    const btnGap = LOSS_BTN_GAP * u;
    const retryW = this.retryBtn.width;
    const leaveW = this.showLeave && this.leaveBtn ? this.leaveBtn.width : 0;
    const btnsW = this.showLeave
      ? retryW + btnGap + leaveW
      : retryW;

    const contentW = Math.max(
      this.kickerPlate.width,
      this.scorePlate.width,
      this.detailPlate.width,
      btnsW,
      LOSS_CARD_MIN_W * u,
    );
    const cardW = contentW + padX * 2;
    const kickerAfter = gap * 0.55;
    const scoreAfter = gap * 0.55;
    const detailAfter = gap * 1.15;
    const innerH = kickerH + kickerAfter + scoreH + scoreAfter + detailH + detailAfter + btnH;
    const cardH = innerH + padY * 2;

    if (!this.card) {
      const mat = new MeshBasicMaterial({
        color: panelFill,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        toneMapped: false,
      });
      this.card = new Mesh(new PlaneGeometry(1, 1), mat);
      this.card.renderOrder = -1;
      this.cardRow.add(this.card);
    } else if (this.card.material instanceof MeshBasicMaterial) {
      this.card.material.color.set(panelFill);
      this.card.material.opacity = 0.94;
    }
    this.card.scale.set(cardW, cardH, 1);

    // Sit low over the fail meadow, matching the old DOM overlay placement.
    const stackTop = viewH * 0.28 + cardH * 0.5 - padY;
    let y = stackTop;
    const placeKicker = stackTop - kickerH * 0.5;
    y = placeKicker - kickerH * 0.5 - kickerAfter;
    const placeScore = y - scoreH * 0.5;
    y = placeScore - scoreH * 0.5 - scoreAfter;
    const placeDetail = y - detailH * 0.5;
    y = placeDetail - detailH * 0.5 - detailAfter;
    const placeBtn = y - btnH * 0.5;

    this.kickerPlate.root.rotation.x = -0.06;
    this.kickerPlate.root.position.set(cx, placeKicker, 2);
    this.scorePlate.root.rotation.x = -0.08;
    this.scorePlate.root.position.set(cx, placeScore, 2.2);
    this.detailPlate.root.rotation.x = -0.06;
    this.detailPlate.root.position.set(cx, placeDetail, 2);

    this.btnRow.visible = true;
    this.btnRow.userData.baseY = placeBtn;
    this.btnRow.position.set(cx, placeBtn, 4);
    this.btnRow.rotation.x = -0.08;
    const hits: LossHit[] = [];
    const bufY = ctx.bufferH - (placeBtn + btnH * 0.5) / s;
    if (this.showLeave && this.leaveBtn) {
      const span = retryW + btnGap + leaveW;
      const retryX = -span * 0.5 + retryW * 0.5;
      const leaveX = span * 0.5 - leaveW * 0.5;
      this.retryBtn.root.position.set(retryX, 0, 0);
      this.retryBtn.root.rotation.x = -0.1;
      this.leaveBtn.root.position.set(leaveX, 0, 0);
      this.leaveBtn.root.rotation.x = -0.1;
      hits.push({
        action: "retry",
        x: (cx + retryX - retryW * 0.5) / s,
        y: bufY,
        w: retryW / s,
        h: btnH / s,
      });
      hits.push({
        action: "leave",
        x: (cx + leaveX - leaveW * 0.5) / s,
        y: bufY,
        w: leaveW / s,
        h: btnH / s,
      });
    } else {
      this.retryBtn.root.position.set(0, 0, 0);
      this.retryBtn.root.rotation.x = -0.1;
      hits.push({
        action: "retry",
        x: (cx - retryW * 0.5) / s,
        y: bufY,
        w: retryW / s,
        h: btnH / s,
      });
    }
    this.hits = hits;

    const cardCy = (placeKicker + kickerH * 0.5 + placeBtn - btnH * 0.5) * 0.5;
    this.cardRow.position.set(cx, cardCy, 0.5);
  }

  private introItems(): (Group | null | undefined)[] {
    return [
      this.cardRow,
      this.kickerPlate?.root,
      this.scorePlate?.root,
      this.detailPlate?.root,
      this.btnRow,
    ];
  }

  private resetIntroScales(): void {
    for (const item of this.introItems()) {
      if (item) item.scale.setScalar(1);
    }
  }
}
