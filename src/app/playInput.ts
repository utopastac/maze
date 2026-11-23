import { actionHeld, isCameraKey, normalizeKey } from "../core/keybinds.ts";
import type { PlaySettings } from "../core/playSettings.ts";
import type { TiltController } from "../core/tilt.ts";
import type { MazeWorld } from "../render/MazeWorld.ts";

const ZOOM_SPEED = 0.45;

export type PlayInputPhase = "play" | "falling" | "escaping" | "failing" | "won" | "lost";

/** What PlayInput needs from the app — keeps input free of an App import. */
export type PlayInputHost = {
  /** Any menu/panel that should swallow keyboard input (keys only handle Escape). */
  isMenuBlocking(): boolean;
  /** Menu screens / intro that should swallow pointer input. */
  isPointerBlocked(): boolean;
  /** Editor, level picker, saved levels, or pause is open. */
  isModalOpen(): boolean;
  /** Home or tower intro is open (orientation gate). */
  isHomeOrIntroOpen(): boolean;
  /** Title home with the live 3D backdrop — meadow-style camera glance. */
  isHomeCamera(): boolean;
  /** Escape pressed while a menu is blocking. */
  onMenuEscape(): void;
  phase(): PlayInputPhase;
  isBrowsingWins(): boolean;
  isAwaitingStart(): boolean;
  canPause(): boolean;
  hitTestStart(x: number, y: number): boolean;
  hitTestResult(x: number, y: number): "primary" | "leave" | null;
  isResultOpen(): boolean;
  setCanvasCursor(cursor: string): void;
  onPressStart(): void;
  onPressResult(action: "primary" | "leave"): void;
  onTiltActivity(): void;
  onKeysChanged(): void;
  onOpenPause(): void;
  onGoHome(): void;
  onCloseWinGallery(): void;
  onCycleWinScene(dir: -1 | 1): void;
  onResetBall(): void;
  onNewMaze(): void;
};

export type PlayInputDeps = {
  canvas: HTMLCanvasElement;
  settings: PlaySettings;
  tilt: TiltController;
  view: () => MazeWorld | null;
  host: PlayInputHost;
};

export class PlayInput {
  readonly keys = new Set<string>();
  /** Set when input should pull the camera back behind the board next frame. */
  recallCamera = false;
  private readonly canvas: HTMLCanvasElement;
  private readonly settings: PlaySettings;
  private readonly tilt: TiltController;
  private readonly view: () => MazeWorld | null;
  private readonly host: PlayInputHost;
  private dragPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private dragging = false;
  private motion = false;
  private calibrateMotion = false;
  private motionOrigin: { beta: number; gamma: number } | null = null;

  constructor(deps: PlayInputDeps) {
    this.canvas = deps.canvas;
    this.settings = deps.settings;
    this.tilt = deps.tilt;
    this.view = deps.view;
    this.host = deps.host;
  }

  attach(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("deviceorientation", this.onOrientation);
  }

  clearKeys(): void {
    this.keys.clear();
    this.host.onKeysChanged();
  }

  cancelDrag(): void {
    this.dragging = false;
    this.dragPointer = null;
  }

  /** Drop every held key and any in-progress drag. */
  releaseAll(): void {
    this.cancelDrag();
    this.clearKeys();
  }

  /** Re-level the board and recalibrate the device-motion zero point. */
  level(): void {
    this.tilt.level();
    this.calibrateMotion = true;
    this.recallCamera = true;
  }

  toggleMotion(): void {
    if (this.motion) {
      this.motion = false;
      return;
    }
    void this.enableMotion();
  }

  async enableMotion(): Promise<void> {
    const ctor = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof ctor.requestPermission === "function") {
      try {
        const result = await ctor.requestPermission();
        if (result !== "granted") return;
      } catch {
        return;
      }
    }
    this.motion = true;
    this.calibrateMotion = true;
  }

  driveCamera(dt: number, tilting: boolean): void {
    const view = this.view();
    if (!view) return;
    const binds = this.settings.keybinds;
    const meadowGlance =
      this.host.isHomeCamera()
      || this.host.phase() === "won"
      || this.host.phase() === "lost";
    if (meadowGlance) {
      let dAngle = 0;
      let dOrbit = 0;
      if (
        actionHeld(binds, "angleDown", this.keys)
        || actionHeld(binds, "tiltDown", this.keys)
      ) dAngle -= 28 * dt;
      if (
        actionHeld(binds, "angleUp", this.keys)
        || actionHeld(binds, "tiltUp", this.keys)
      ) dAngle += 28 * dt;
      if (
        actionHeld(binds, "orbitLeft", this.keys)
        || actionHeld(binds, "tiltLeft", this.keys)
      ) dOrbit -= 80 * dt;
      if (
        actionHeld(binds, "orbitRight", this.keys)
        || actionHeld(binds, "tiltRight", this.keys)
      ) dOrbit += 80 * dt;
      if (dAngle !== 0 || dOrbit !== 0) view.nudgeCamera(dAngle, dOrbit);
    } else if (tilting) {
      view.recallCamera();
    } else {
      let dAngle = 0;
      let dOrbit = 0;
      if (actionHeld(binds, "angleDown", this.keys)) dAngle -= 28 * dt;
      if (actionHeld(binds, "angleUp", this.keys)) dAngle += 28 * dt;
      if (actionHeld(binds, "orbitLeft", this.keys)) dOrbit -= 80 * dt;
      if (actionHeld(binds, "orbitRight", this.keys)) dOrbit += 80 * dt;
      if (dAngle !== 0 || dOrbit !== 0) view.nudgeCamera(dAngle, dOrbit);
    }
    let dZoom = 0;
    if (actionHeld(binds, "zoomIn", this.keys)) dZoom += ZOOM_SPEED * dt;
    if (actionHeld(binds, "zoomOut", this.keys)) dZoom -= ZOOM_SPEED * dt;
    if (dZoom !== 0) this.settings.set("zoom", this.settings.values.zoom + dZoom);
    view.stepCamera(dt);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (this.host.isPointerBlocked()) return;
    const phase = this.host.phase();
    if (
      this.host.isModalOpen()
      || phase === "escaping"
      || phase === "failing"
    ) return;
    if (this.host.isAwaitingStart()) {
      if (this.host.hitTestStart(event.clientX, event.clientY)) this.host.onPressStart();
      return;
    }
    if (
      (phase === "lost" || phase === "won")
      && this.host.isResultOpen()
    ) {
      const result = this.host.hitTestResult(event.clientX, event.clientY);
      if (result) {
        this.host.onPressResult(result);
        return;
      }
    }
    this.dragPointer = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.dragging = true;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.host.isPointerBlocked()) return;
    if (this.host.isAwaitingStart()) {
      this.host.setCanvasCursor(
        this.host.hitTestStart(event.clientX, event.clientY) ? "pointer" : "default",
      );
      return;
    }
    if (
      (this.host.phase() === "lost" || this.host.phase() === "won")
      && this.host.isResultOpen()
      && event.pointerId !== this.dragPointer
    ) {
      this.host.setCanvasCursor(
        this.host.hitTestResult(event.clientX, event.clientY) ? "pointer" : "default",
      );
      return;
    }
    if (event.pointerId !== this.dragPointer) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (dx === 0 && dy === 0) return;
    const phase = this.host.phase();
    if (phase === "won" || phase === "lost" || this.host.isHomeCamera()) {
      this.view()?.nudgeCamera(-dy * 0.16, -dx * 0.28);
      return;
    }
    this.tilt.drag(dx, dy);
    this.recallCamera = true;
    this.host.onTiltActivity();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointer) return;
    this.dragPointer = null;
    this.dragging = false;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.host.isMenuBlocking()) {
      if (event.key.toLowerCase() === "escape") {
        this.host.onMenuEscape();
        return;
      }
      // Home keeps Escape for menus but still accepts camera glance keys.
      if (!this.host.isHomeCamera()) return;
      const camKey = normalizeKey(event.key);
      if (!isCameraKey(this.settings.keybinds, camKey)) return;
      if (!(event.metaKey || event.ctrlKey || event.altKey)) this.keys.add(camKey);
      this.host.onKeysChanged();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (this.host.isBrowsingWins()) this.host.onCloseWinGallery();
      else if (this.host.canPause()) this.host.onOpenPause();
      else this.host.onGoHome();
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key.startsWith("Arrow") || event.key === " ") event.preventDefault();
    const normalized = normalizeKey(event.key);
    const phase = this.host.phase();
    if (
      !event.repeat
      && (this.host.isBrowsingWins() || phase === "escaping" || phase === "won")
      && (key === "t" || key === "]" || key === "[")
    ) {
      this.host.onCycleWinScene(key === "[" ? -1 : 1);
      return;
    }
    if (this.host.isAwaitingStart()) {
      if (!event.repeat && (key === "enter" || event.key === " ")) this.host.onPressStart();
      return;
    }
    if (
      (phase === "lost" || phase === "won")
      && this.host.isResultOpen()
    ) {
      if (!event.repeat && (key === "enter" || event.key === " ")) {
        this.host.onPressResult("primary");
      }
      return;
    }
    const chord = event.metaKey || event.ctrlKey || event.altKey;
    if (!(chord && isCameraKey(this.settings.keybinds, normalized))) this.keys.add(normalized);
    this.host.onKeysChanged();
    if (event.repeat) return;
    if (key === "r") this.host.onResetBall();
    if (key === "n") this.host.onNewMaze();
    if (key === "l" || event.key === " ") this.level();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(normalizeKey(event.key));
    this.host.onKeysChanged();
  };

  private onBlur = (): void => {
    this.releaseAll();
  };

  private onOrientation = (event: DeviceOrientationEvent): void => {
    const phase = this.host.phase();
    if (
      this.host.isHomeOrIntroOpen()
      || this.host.isModalOpen()
      || this.host.isAwaitingStart()
      || !this.motion
      || this.dragging
      || phase === "won"
      || phase === "lost"
      || phase === "escaping"
      || phase === "failing"
    ) return;
    if (event.beta === null || event.gamma === null) return;
    if (this.calibrateMotion || !this.motionOrigin) {
      this.motionOrigin = { beta: event.beta, gamma: event.gamma };
      this.calibrateMotion = false;
      this.tilt.level();
      return;
    }
    const deg = Math.PI / 180;
    const gain = (this.settings.tiltRad / (16 * deg)) * this.settings.values.sensitivity;
    const pitch = (event.beta - this.motionOrigin.beta) * deg * gain;
    const roll = (event.gamma - this.motionOrigin.gamma) * deg * gain;
    const beforePitch = this.tilt.targetPitch;
    const beforeRoll = this.tilt.targetRoll;
    this.tilt.setAbsolute(-pitch * this.settings.pitchSign(), -roll);
    if (Math.abs(this.tilt.targetPitch - beforePitch) > 0.01 || Math.abs(this.tilt.targetRoll - beforeRoll) > 0.01) {
      this.recallCamera = true;
    }
    this.host.onTiltActivity();
  };
}
