import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { snapPixels } from "../../core/playSettings.ts";
import { HudContext, createHudAssets } from "./context.ts";
import { HudFx } from "./fx.ts";
import { HomeMenu } from "./homeMenu.ts";
import { PlayStats } from "./playStats.ts";
import { ResultPanel } from "./resultPanel.ts";
import { StartGate } from "./startGate.ts";
import type {
  PlayHudHomeAction,
  PlayHudHomeMenuMode,
  PlayHudResult,
  PlayHudResultAction,
  PlayHudStartGate,
  PlayHudStats,
} from "./types.ts";

/**
 * Mario 64–style play stats: 3D heart/coin meshes + Arial Black text plates
 * on their own WebGL canvas (UI pixels only).
 *
 * Thin facade: owns the renderer/scene/view state and delegates to
 * {@link HomeMenu}, {@link StartGate}, {@link ResultPanel}, {@link PlayStats},
 * and {@link HudFx}.
 */
export class PlayHud {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly ctx: HudContext;
  private readonly fx: HudFx;
  private readonly stats: PlayStats;
  private readonly startGate: StartGate;
  private readonly result: ResultPanel;
  private readonly home: HomeMenu;
  /** Hide corner play chrome while a home → play camera enter is running. */
  private suppressPlayChrome = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      stencil: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);

    this.camera = new PerspectiveCamera(28, 1, 0.1, 500);
    this.camera.position.set(0, 0, 120);

    this.ctx = new HudContext(canvas, this.camera, createHudAssets());
    this.fx = new HudFx(this.ctx);
    this.stats = new PlayStats(this.ctx);
    this.startGate = new StartGate(this.ctx, this.fx);
    this.result = new ResultPanel(this.ctx, this.fx);
    this.home = new HomeMenu(this.ctx, this.fx);

    this.scene.add(new AmbientLight("#ffffff", 0.55));
    const key = new DirectionalLight("#fff6ea", 1.45);
    key.position.set(-4, 6, 10);
    const fill = new DirectionalLight("#9eb7ff", 0.45);
    fill.position.set(5, -2, 6);
    const rim = new DirectionalLight("#ffffff", 0.25);
    rim.position.set(0, 2, -4);
    this.scene.add(
      key,
      fill,
      rim,
      this.stats.root,
      this.fx.shoutLayer,
      this.fx.shatterLayer,
    );
    this.scene.add(this.startGate.layer, this.result.layer, this.home.layer);
    this.canvas.hidden = true;
  }

  /** Keep corner HUD / start gate off during the enter-play camera beat. */
  setSuppressPlayChrome(on: boolean): void {
    if (this.suppressPlayChrome === on) return;
    this.suppressPlayChrome = on;
    this.syncOverlayVisibility();
  }

  /** Comic collect shout — same Arial Black plates as the timer. */
  shout(text: string, color: string): void {
    this.fx.shout(text, color);
  }

  setVisible(on: boolean): void {
    const ctx = this.ctx;
    if (ctx.shown === on) return;
    ctx.shown = on;
    this.canvas.hidden = !on;
    this.syncOverlayVisibility();
    if (on) {
      ctx.layoutDirty = true;
      this.paint(true);
    } else {
      this.fx.clear();
      this.renderer.clear();
    }
  }

  /** Centered level briefing + Start — free-play only. */
  setStartGate(gate: PlayHudStartGate | null): void {
    const ctx = this.ctx;
    const open = gate !== null;
    if (!open && !this.startGate.open) return;
    if (open && this.home.open) this.setHomeMenu(false);
    if (open && this.result.open) this.setResult(null);
    this.startGate.setGate(gate);
    this.syncOverlayVisibility();
    ctx.layoutDirty = true;
    if (ctx.shown) this.paint(true);
    if (open && ctx.shown) this.startGate.applyIntro(0);
  }

  /** Win / loss result stack on the 3D HUD layer. */
  setResult(kind: PlayHudResult | null): void {
    const ctx = this.ctx;
    const open = kind !== null;
    if (!open && !this.result.open) return;
    if (open && this.home.open) this.setHomeMenu(false);
    if (open && this.startGate.open) this.setStartGate(null);
    this.result.setResult(kind);
    this.syncOverlayVisibility();
    ctx.layoutDirty = true;
    if (ctx.shown) this.paint(true);
    if (open && ctx.shown) this.result.applyIntro(0);
  }

  /** Full-screen title menu on the 3D HUD layer. */
  setHomeMenu(open: boolean): void {
    const ctx = this.ctx;
    if (open === this.home.open) {
      if (open) {
        ctx.layoutDirty = true;
        if (ctx.shown) this.paint(true);
      }
      return;
    }
    if (open && this.startGate.open) this.setStartGate(null);
    if (open && this.result.open) this.setResult(null);
    this.home.setOpenState(open);
    this.syncOverlayVisibility();
    ctx.layoutDirty = true;
    if (ctx.shown) this.paint(true);
    if (open && ctx.shown && this.home.intro) this.home.applyIntro(0);
  }

  /** Main title list vs. in-world Tower New/Load submenu. */
  setHomeMenuMode(mode: PlayHudHomeMenuMode): void {
    if (!this.home.setMode(mode)) return;
    this.ctx.layoutDirty = true;
    if (this.ctx.shown) this.paint(true);
  }

  homeMenuModeOf(): PlayHudHomeMenuMode {
    return this.home.menuMode;
  }

  /** Blow apart the start briefing, then hand off to the play HUD. */
  shatterStartGate(): void {
    if (!this.startGate.open) return;
    if (this.ctx.shown && this.ctx.bufferW >= 2) this.startGate.spawnShards();
    this.setStartGate(null);
  }

  /** Blow apart the win/loss stack before again / retry / leave. */
  shatterResult(): void {
    if (!this.result.open) return;
    if (this.ctx.shown && this.ctx.bufferW >= 2) this.result.spawnShards();
    this.setResult(null);
  }

  /** Blow apart the home menu before leaving for a destination. */
  shatterHomeMenu(): void {
    if (!this.home.open) return;
    if (this.ctx.shown && this.ctx.bufferW >= 2) this.home.spawnShards();
    this.setHomeMenu(false);
  }

  isStartGateOpen(): boolean {
    return this.startGate.open;
  }

  isResultOpen(): boolean {
    return this.result.open;
  }

  isHomeMenuOpen(): boolean {
    return this.home.open;
  }

  /** Hit-test the Start button in CSS client coordinates. */
  hitTestStart(clientX: number, clientY: number): boolean {
    return this.startGate.hitTest(clientX, clientY);
  }

  /** Hit-test the result primary / Quit CTAs. */
  hitTestResult(clientX: number, clientY: number): PlayHudResultAction | null {
    return this.result.hitTest(clientX, clientY);
  }

  /** Hit-test a home menu CTA in CSS client coordinates. */
  hitTestHome(clientX: number, clientY: number): PlayHudHomeAction | null {
    return this.home.hitTest(clientX, clientY);
  }

  /** Soft hover scale on the pointed home CTA. */
  setHomeHover(action: PlayHudHomeAction | null): void {
    this.home.setHover(action);
  }

  setStats(stats: PlayHudStats): void {
    const lost = this.stats.setStats(stats);
    if (!lost) return;
    for (let i = lost.to; i < lost.from; i += 1) {
      this.fx.shatterHeartIcon(this.stats.heartIcon(i));
    }
    this.fx.burstCenterHeart();
  }

  /**
   * Size the HUD from UI pixels only — never game Pixels.
   * Raising UI pixels lowers buffer resolution (chunkier glyphs) while
   * designScale() keeps on-screen element size stable.
   * With normal look, keep the same layout grid but supersample to device resolution.
   */
  resize(width: number, height: number, uiPixels: number, normalLook = false): void {
    const ctx = this.ctx;
    const scale = snapPixels(uiPixels);
    const bufferW = Math.max(1, Math.floor(width / scale));
    const bufferH = Math.max(1, Math.floor(height / scale));
    const sizeChanged = ctx.bufferW !== bufferW || ctx.bufferH !== bufferH;
    const scaleChanged = ctx.uiScale !== scale;
    const lookChanged = ctx.normalLook !== normalLook;
    ctx.bufferW = bufferW;
    ctx.bufferH = bufferH;
    ctx.uiScale = scale;
    ctx.normalLook = normalLook;
    const dpr = normalLook ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    // Chunk-sized drawing buffer; pixel ratio only supersamples in normal look.
    this.renderer.setPixelRatio(normalLook ? scale * dpr : 1);
    this.renderer.setSize(bufferW, bufferH, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.dataset.look = normalLook ? "normal" : "pixel";
    this.camera.aspect = bufferW / bufferH;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
    if (lookChanged) this.applyLookFilters();
    if (sizeChanged || scaleChanged || lookChanged) ctx.layoutDirty = true;
    if (ctx.shown) this.paint(true);
  }

  update(dt: number, reduceMotion: boolean): void {
    if (!this.ctx.shown) return;
    this.stats.tick(dt, reduceMotion, !this.startGate.open && !this.result.open);
    this.startGate.tick(dt, reduceMotion);
    this.result.tick(dt, reduceMotion);
    this.home.tick(dt, reduceMotion);
    this.fx.tick(dt, reduceMotion);
    this.paint(false);
  }

  private syncOverlayVisibility(): void {
    const on = this.ctx.shown;
    const overlay = this.startGate.open || this.home.open || this.result.open;
    const playChrome = on && !overlay && !this.suppressPlayChrome;
    this.stats.root.visible = playChrome;
    this.startGate.layer.visible = on && this.startGate.open && !this.suppressPlayChrome;
    this.result.layer.visible = on && this.result.open;
    this.home.layer.visible = on && this.home.open;
    this.fx.shoutLayer.visible = playChrome;
    this.fx.shatterLayer.visible = on;
  }

  private applyLookFilters(): void {
    const soft = this.ctx.normalLook;
    this.stats.applyLook(soft);
    this.result.applyLook(soft);
    this.fx.applyLook(soft);
  }

  private fitCamera(): void {
    const vFov = (this.camera.fov * Math.PI) / 180;
    const dist = 120;
    const viewH = 2 * Math.tan(vFov / 2) * dist;
    this.ctx.viewScale = viewH / Math.max(1, this.ctx.bufferH);
    const viewW = viewH * this.camera.aspect;
    this.camera.position.set(viewW * 0.5, viewH * 0.5, dist);
    this.camera.lookAt(viewW * 0.5, viewH * 0.5, 0);
  }

  private paint(force: boolean): void {
    const ctx = this.ctx;
    if (!ctx.shown) return;
    if (ctx.layoutDirty || force) {
      if (this.home.open) {
        this.home.layout();
        this.home.reapplyIntro();
      } else if (this.result.open) {
        this.result.layout();
        this.result.reapplyIntro();
      } else if (this.startGate.open) {
        this.startGate.layout();
        this.startGate.reapplyIntro();
      } else {
        this.stats.layout();
      }
      ctx.layoutDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
