import { Group, Mesh } from "three";
import { formatTime } from "../../core/format.ts";
import { MAX_HEARTS_CAP } from "../../core/tower.ts";
import { makeHeartIcon } from "../collectibleMeshes.ts";
import type { HudContext } from "./context.ts";
import { TextPlate } from "./plates.ts";
import type { PlayHudStats } from "./types.ts";
import { tokenColor } from "./util.ts";

const PAD_X = 10;
const PAD_Y = 20;
const ROW = 24;
const TITLE_FLOOR_GAP = 12;
const ICON = 14;
const TIMER_PX = 28;
const TITLE_PX = 26;
const FLOOR_PX = 26;
/** Show individual coin meshes up to this many; beyond that, one coin + count. */
const MAX_COIN_ICONS = 5;
const PULSE_SECS = 0.35;

/** In-play corner chrome: title, floor, timer, hearts, and coins. */
export class PlayStats {
  /** Parent of every row; the facade toggles its visibility. */
  readonly root = new Group();
  private readonly ctx: HudContext;
  private readonly heartsRow = new Group();
  private readonly coinsRow = new Group();
  private readonly timerRow = new Group();
  private readonly titleRow = new Group();
  private readonly floorRow = new Group();
  private readonly heartIcons: Group[] = [];
  private readonly coinMeshes: Mesh[] = [];
  private coinCountPlate: TextPlate | null = null;
  private timerPlate: TextPlate | null = null;
  private titlePlate: TextPlate | null = null;
  private floorPlate: TextPlate | null = null;
  private lives: number | null = null;
  private coinsGot = 0;
  private coinsMax = 0;
  private seconds: number | null = 0;
  private timerText = "";
  private titleText = "";
  private titleDrawn = "";
  private floorText: string | null = null;
  private floorDrawn = "";
  private pulseHeart = 0;
  private pulseCoin = 0;

  constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.root.add(this.titleRow, this.floorRow, this.heartsRow, this.coinsRow, this.timerRow);
  }

  /** The heart icon at a slot (for shatter fx), if it exists. */
  heartIcon(index: number): Group | undefined {
    return this.heartIcons[index];
  }

  /**
   * Apply new stats. Returns the range of heart slots lost (`from` exclusive of
   * `to`, i.e. slots `to..from-1`) so the facade can shatter them.
   */
  setStats(stats: PlayHudStats): { from: number; to: number } | null {
    const ctx = this.ctx;
    const prevLives = this.lives;
    const livesChanged = prevLives !== stats.lives;
    const coinsChanged = this.coinsGot !== stats.coinsGot || this.coinsMax !== stats.coinsMax;
    const titleChanged = this.titleText !== stats.titleText;
    const floorChanged = this.floorText !== stats.floorText;
    const timeChanged = this.seconds !== stats.seconds;
    const timerVisibilityChanged = (this.seconds === null) !== (stats.seconds === null);
    let lost: { from: number; to: number } | null = null;
    if (
      ctx.shown
      && prevLives !== null
      && stats.lives !== null
      && stats.lives < prevLives
    ) {
      lost = {
        from: Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(prevLives))),
        to: Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(stats.lives))),
      };
    }
    this.seconds = stats.seconds;
    this.lives = stats.lives;
    this.coinsGot = stats.coinsGot;
    this.coinsMax = stats.coinsMax;
    this.titleText = stats.titleText;
    this.floorText = stats.floorText;
    if (stats.pulseLives) this.pulseHeart = PULSE_SECS;
    if (stats.pulseCoins && stats.coinsMax > 0) this.pulseCoin = PULSE_SECS;
    if (livesChanged || coinsChanged || titleChanged || floorChanged || timerVisibilityChanged) {
      ctx.layoutDirty = true;
    }
    if (timeChanged) this.syncTimer();
    return lost;
  }

  /** Match plate glyph filtering to the current look. */
  applyLook(soft: boolean): void {
    this.timerPlate?.setSoft(soft);
    this.titlePlate?.setSoft(soft);
    this.floorPlate?.setSoft(soft);
    this.coinCountPlate?.setSoft(soft);
  }

  /** Per-frame pulses and icon spin. `spin` is off while the start gate owns the spin. */
  tick(dt: number, reduceMotion: boolean, spin: boolean): void {
    this.pulseHeart = Math.max(0, this.pulseHeart - dt);
    this.pulseCoin = Math.max(0, this.pulseCoin - dt);
    if (!reduceMotion && spin) {
      for (const mesh of this.coinMeshes) {
        if (!mesh.visible || mesh.material !== this.ctx.assets.coinMat) continue;
        mesh.rotation.y += dt * 3.6;
      }
      for (const heart of this.heartIcons) {
        if (!heart.visible) continue;
        heart.rotation.y = 0.2 + Math.sin(performance.now() * 0.0024 + heart.id) * 0.35;
      }
    }
    this.heartsRow.scale.setScalar(pulseScale(this.pulseHeart));
    this.coinsRow.scale.setScalar(pulseScale(this.pulseCoin));
  }

  /** Rebuild all plates and re-lay the rows. */
  layout(): void {
    this.syncTitle(true);
    this.syncFloor(true);
    this.syncTimer(true);
    this.layoutRows();
  }

  private layoutRows(): void {
    const ctx = this.ctx;
    const u = ctx.designScale();
    const viewW = ctx.bufferW * ctx.viewScale;
    const viewH = ctx.bufferH * ctx.viewScale;
    const padX = PAD_X * u;
    const padY = viewH - PAD_Y * u;
    const row = ROW * u;
    const icon = ICON * u;
    let y = padY;

    const showTitle = this.titleText.length > 0;
    const showFloor = this.floorText !== null && this.floorText.length > 0;
    this.titleRow.visible = showTitle;
    this.titleRow.position.set(padX, y, 0);

    let floorX = padX;
    if (showTitle && this.titlePlate) {
      floorX = padX + this.titlePlate.width + TITLE_FLOOR_GAP * u;
    }
    this.floorRow.visible = showFloor;
    this.floorRow.position.set(floorX, y, 0);

    if (showTitle || showFloor) y -= row * 1.05;
    const showTimer = this.seconds !== null;
    this.timerRow.visible = showTimer;
    if (showTimer) this.timerRow.position.set(padX, y, 0);

    this.syncCoins(viewW * 0.5, padY, icon);
    this.syncHearts(viewW - padX, padY, icon);
  }

  private syncTitle(force = false): void {
    const text = this.titleText;
    if (!force && text === this.titleDrawn) return;
    this.titleDrawn = text;
    if (!text) {
      this.titleRow.visible = false;
      return;
    }
    const height = this.ctx.designScale() * TITLE_PX;
    if (!this.titlePlate) {
      this.titlePlate = new TextPlate(text, "#ffffff", height);
      this.titlePlate.setSoft(this.ctx.normalLook);
      this.titleRow.add(this.titlePlate.root);
    } else {
      this.titlePlate.set(text, "#ffffff", height);
    }
    this.titlePlate.root.position.set(this.titlePlate.width * 0.5, 0, 0);
    this.titlePlate.root.rotation.x = -0.1;
    this.titlePlate.root.rotation.y = 0.08;
  }

  private syncFloor(force = false): void {
    const text = this.floorText ?? "";
    if (!force && text === this.floorDrawn) return;
    this.floorDrawn = text;
    if (!text) {
      this.floorRow.visible = false;
      return;
    }
    const height = this.ctx.designScale() * FLOOR_PX;
    if (!this.floorPlate) {
      this.floorPlate = new TextPlate(text, "#ffffff", height, false);
      this.floorRow.add(this.floorPlate.root);
    } else {
      this.floorPlate.set(text, "#ffffff", height);
    }
    this.floorPlate.setSoft(this.ctx.normalLook);
    this.floorRow.visible = true;
    this.floorPlate.root.position.set(this.floorPlate.width * 0.5, 0, 0);
    this.floorPlate.root.rotation.x = -0.1;
    this.floorPlate.root.rotation.y = 0.08;
  }

  private syncHearts(rightX: number, y: number, icon: number): void {
    const a = this.ctx.assets;
    const count = this.lives === null
      ? 0
      : Math.max(0, Math.min(MAX_HEARTS_CAP, Math.round(this.lives)));
    this.heartsRow.visible = count > 0;
    this.heartsRow.position.set(rightX, y, 0);
    const gap = icon * 1.3;
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
      // Right-align: last heart sits on the anchor, earlier ones extend left.
      iconGroup.position.set(-(count - 1 - i) * gap - icon * 0.55, 0, 0);
      iconGroup.rotation.x = -0.18;
    }
  }

  private syncCoins(centerX: number, y: number, icon: number): void {
    const a = this.ctx.assets;
    const total = Math.max(0, Math.round(this.coinsMax));
    const got = Math.max(0, Math.min(total, Math.round(this.coinsGot)));
    this.coinsRow.visible = total > 0;
    this.coinsRow.position.set(centerX, y, 0);
    if (total <= 0) {
      if (this.coinCountPlate) this.coinCountPlate.root.visible = false;
      return;
    }
    const compact = total > MAX_COIN_ICONS;
    const shown = compact ? 1 : total;
    const gap = icon * 1.25;
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
      const filled = compact || i < got;
      mesh.geometry = a.coinGeo;
      mesh.material = filled ? a.coinMat : a.emptyCoinMat;
      mesh.scale.setScalar(icon);
      mesh.rotation.x = -0.2;
      if (!filled) mesh.rotation.y = 0.35;
      if (!compact) {
        mesh.position.set((i - (shown - 1) * 0.5) * gap, 0, 0);
      }
    }
    if (compact) {
      const fill = tokenColor("--maze-coin", "#f0c43a");
      const countH = icon * 1.35;
      const label = `${got}/${total}`;
      if (!this.coinCountPlate) {
        this.coinCountPlate = new TextPlate(label, fill, countH);
        this.coinCountPlate.setSoft(this.ctx.normalLook);
        this.coinsRow.add(this.coinCountPlate.root);
      } else {
        this.coinCountPlate.set(label, fill, countH);
      }
      this.coinCountPlate.setSoft(this.ctx.normalLook);
      const countW = this.coinCountPlate.width;
      const pairGap = icon * 0.4;
      const span = icon + pairGap + countW;
      const coin = this.coinMeshes[0];
      if (coin) coin.position.set(-span * 0.5 + icon * 0.5, 0, 0);
      this.coinCountPlate.root.visible = true;
      this.coinCountPlate.root.position.set(-span * 0.5 + icon + pairGap + countW * 0.5, 0, 0);
      this.coinCountPlate.root.rotation.x = -0.1;
      this.coinCountPlate.root.rotation.y = 0.08;
    } else if (this.coinCountPlate) {
      this.coinCountPlate.root.visible = false;
    }
  }

  private syncTimer(force = false): void {
    if (this.seconds === null) {
      this.timerText = "";
      this.timerRow.visible = false;
      return;
    }
    const text = formatTime(this.seconds);
    if (!force && text === this.timerText) return;
    this.timerText = text;
    const height = this.ctx.designScale() * TIMER_PX;
    if (!this.timerPlate) {
      this.timerPlate = new TextPlate(text, "#ffffff", height);
      this.timerPlate.setSoft(this.ctx.normalLook);
      this.timerRow.add(this.timerPlate.root);
    } else {
      this.timerPlate.set(text, "#ffffff", height);
    }
    this.timerPlate.root.position.set(this.timerPlate.width * 0.5, 0, 0);
    this.timerPlate.root.rotation.x = -0.1;
    this.timerPlate.root.rotation.y = 0.08;
  }
}

function pulseScale(remain: number): number {
  if (remain <= 0) return 1;
  const t = 1 - remain / PULSE_SECS;
  return 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.22;
}
