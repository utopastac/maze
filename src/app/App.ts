import { STORY, layoutTower } from "../core/layout.ts";
import { copyText, forgetLevel, hasLevelHash, levelFromHash, rememberLevel } from "../core/share.ts";
import { cloneTower, generateTower, type Tower } from "../core/tower.ts";
import { PlaySettings } from "../core/playSettings.ts";
import { initPhysics, Simulation } from "../core/simulation.ts";
import { TiltController } from "../core/tilt.ts";
import { MAX_PIXEL_RATIO, createRenderer } from "../render/createRenderer.ts";
import { MazeWorld } from "../render/MazeWorld.ts";
import { LevelEditor } from "../ui/editor.ts";
import { Hud } from "../ui/hud.ts";
import { Overlay } from "../ui/overlay.ts";
import { SettingsPanel } from "../ui/settingsPanel.ts";
import type { WebGLRenderer } from "three";

const FIRST_SEED = 11;

type Phase = "play" | "falling" | "won";

export class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly sheet: HTMLElement;
  private readonly settings = new PlaySettings();
  private readonly tilt = new TiltController(this.settings);
  private readonly hud: Hud;
  private readonly overlay: Overlay;
  private readonly panel: SettingsPanel;
  private readonly editor: LevelEditor;
  private tower: Tower | null = null;
  private authored: Tower | null = null;
  private shareNote = false;
  private shareTimer = 0;
  private floorAt = 1;
  private floorCount = 1;
  private readonly keys = new Set<string>();
  private renderer: WebGLRenderer | null = null;
  private view: MazeWorld | null = null;
  private sim: Simulation | null = null;
  private phase: Phase = "play";
  private seconds = 0;
  private drops = 0;
  private running = false;
  private last = 0;
  private fallTimer = 0;
  private dragPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private dragging = false;
  private motion = false;
  private sheetOpen = false;
  private calibrateMotion = false;
  private motionOrigin: { beta: number; gamma: number } | null = null;
  private seed = FIRST_SEED;

  constructor(
    canvas: HTMLCanvasElement,
    chrome: HTMLElement,
    overlay: HTMLElement,
    sheet: HTMLElement,
    editor: HTMLElement,
  ) {
    this.canvas = canvas;
    this.sheet = sheet;
    this.panel = new SettingsPanel(sheet, this.settings, {
      onClose: () => this.closeSettings(),
    });
    this.panel.mount();
    this.settings.subscribe(() => {
      this.sim?.apply(this.settings);
      this.view?.applyCamera();
    });
    this.editor = new LevelEditor(editor, {
      onPlay: (tower) => this.playEdited(tower),
      onClose: () => this.finishEditing(),
      onShare: (tower) => this.publish(tower),
    });
    this.hud = new Hud(chrome, {
      onLevel: () => this.level(),
      onReset: () => this.resetBall(),
      onNew: () => this.newMaze(),
      onMotion: () => this.toggleMotion(),
      onSettings: () => this.toggleSettings(),
      onEdit: () => this.openEditor(),
      onShare: () => {
        if (!this.authored) return;
        void this.publish(this.authored).then((result) => this.noteShare(result));
      },
    });
    this.overlay = new Overlay(overlay, {
      onAgain: () => this.newMaze(),
    });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("deviceorientation", this.onOrientation);
  }

  async start(): Promise<void> {
    await initPhysics();
    this.renderer = createRenderer(this.canvas);
    this.view = new MazeWorld();
    this.view.bind(this.renderer);
    this.view.useSettings(this.settings);
    const shared = levelFromHash(location.hash);
    if (shared) this.mountTower(shared, true);
    else {
      const broken = hasLevelHash(location.hash);
      this.mount(this.seed);
      if (broken) this.hud.setNote("That link didn't load");
    }
    this.resize();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private mount(seed: number): void {
    this.mountTower(generateTower(seed, 7, 7, 3), false);
  }

  private mountTower(tower: Tower, shared: boolean): void {
    const view = this.view;
    if (!view) return;
    this.clearFall();
    this.sim?.dispose();
    this.tower = tower;
    this.authored = cloneTower(tower);
    this.floorAt = 1;
    this.floorCount = tower.floors.length;
    const layout = layoutTower(tower);
    this.sim = new Simulation(layout, this.settings);
    view.setTower(layout);
    this.phase = "play";
    this.seconds = 0;
    this.drops = 0;
    this.running = false;
    this.tilt.snap();
    this.overlay.hide();
    this.hud.showHint();
    this.clearShareNote();
    this.hud.setNote("");
    this.hud.setStats(0, 0);
    this.hud.setFloor(this.floorAt, this.floorCount);
    if (shared) {
      if (!rememberLevel(this.authored)) {
        forgetLevel();
        this.hud.setNote("Too big to share");
      }
    } else forgetLevel();
    view.update(0, this.sim.pose());
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const sim = this.sim;
    const view = this.view;
    const renderer = this.renderer;
    if (!sim || !view || !renderer) return;

    if (this.editor.isOpen()) {
      view.update(now / 1000, sim.pose());
      renderer.render(view.scene, view.camera);
      requestAnimationFrame(this.frame);
      return;
    }

    if (this.phase !== "won") {
      const beforePitch = this.tilt.targetPitch;
      const beforeRoll = this.tilt.targetRoll;
      this.tilt.applyKeys(dt, this.keys);
      if (this.tilt.targetPitch !== beforePitch || this.tilt.targetRoll !== beforeRoll) {
        this.noteActivity();
      }
      this.tilt.smooth(dt);
    }

    const event = sim.update(dt, this.tilt.pitch, this.tilt.roll);
    if (this.phase === "play" && event === "fell") this.drop();
    else if (this.phase === "play" && event === "goal") this.win();
    else if (this.phase === "play" && event === "descend") this.beginDescend();

    if (this.running && this.phase !== "won") this.seconds += dt;
    this.hud.setStats(this.seconds, this.drops);
    const tiltLimit = Math.max(this.settings.tiltRad, 0.001);
    this.hud.setTilt(this.tilt.roll / tiltLimit, this.tilt.pitch / tiltLimit);

    view.update(now / 1000, sim.pose());
    renderer.render(view.scene, view.camera);
    requestAnimationFrame(this.frame);
  };

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer?.setSize(width, height, false);
    this.view?.resize(width, height);
  }

  private beginDescend(): void {
    const sim = this.sim;
    const view = this.view;
    if (!sim || !view || !this.tower) return;
    view.crumbleTop();
    sim.dropTop();
    sim.shift(STORY);
    view.rebase(STORY);
    this.tower = { floors: this.tower.floors.slice(1) };
    this.floorAt += 1;
    this.hud.setFloor(this.floorAt, this.floorCount);
    this.clearShareNote();
    this.hud.setNote("");
  }

  private drop(): void {
    this.phase = "falling";
    this.drops += 1;
    this.sim?.hold();
    this.clearShareNote();
    this.hud.setNote("Dropped");
    this.clearFall();
    this.fallTimer = window.setTimeout(() => {
      this.fallTimer = 0;
      if (this.phase !== "falling") return;
      this.sim?.resetBall();
      this.phase = "play";
      this.hud.setNote("");
    }, 460);
  }

  private win(): void {
    this.phase = "won";
    this.clearShareNote();
    this.running = false;
    this.dragging = false;
    this.dragPointer = null;
    this.overlay.showWin(this.seconds, this.drops);
    this.hud.hideHint();
    this.closeSettings();
  }

  private resetBall(): void {
    this.clearFall();
    this.sim?.resetBall();
    this.clearShareNote();
    this.hud.setNote("");
    if (this.phase === "won") this.overlay.hide();
    if (this.phase !== "play") this.phase = "play";
  }

  private newMaze(): void {
    this.seed = Math.floor(Math.random() * 0x7fffffff);
    this.mount(this.seed);
    this.resize();
  }

  private level(): void {
    this.tilt.level();
    this.calibrateMotion = true;
  }

  private openEditor(): void {
    if (!this.authored || this.editor.isOpen()) return;
    this.closeSettings();
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.editor.open(this.authored);
    this.hud.setEditSelected(true);
    this.hud.hideHint();
  }

  private playEdited(tower: Tower): void {
    this.finishEditing();
    this.mountTower(tower, true);
    this.resize();
  }

  private finishEditing(): void {
    this.hud.setEditSelected(false);
    if (!this.running && this.phase === "play") this.hud.showHint();
  }

  private toggleSettings(): void {
    if (this.sheetOpen) this.closeSettings();
    else this.openSettings();
  }

  private openSettings(): void {
    this.sheetOpen = true;
    this.panel.refresh();
    this.sheet.hidden = false;
    this.hud.setSettingsSelected(true);
    this.hud.hideHint();
  }

  private closeSettings(): void {
    if (!this.sheetOpen && this.sheet.hidden) return;
    this.sheetOpen = false;
    this.sheet.hidden = true;
    this.hud.setSettingsSelected(false);
    if (!this.running && this.phase === "play") this.hud.showHint();
  }

  private publish(tower: Tower): Promise<boolean | null> {
    const url = rememberLevel(tower);
    if (!url) return Promise.resolve(null);
    return copyText(url);
  }

  private noteShare(result: boolean | null): void {
    if (result === null) this.showShareNote("Too big to share");
    else if (result) this.showShareNote("Link copied");
    else this.showShareNote("Couldn't copy. The address bar has the link.");
  }

  private showShareNote(message: string): void {
    this.clearShareNote();
    this.shareNote = true;
    this.hud.setNote(message);
    this.shareTimer = window.setTimeout(() => {
      this.shareTimer = 0;
      if (!this.shareNote) return;
      this.shareNote = false;
      this.hud.setNote("");
    }, 1600);
  }

  private clearShareNote(): void {
    const showing = this.shareNote;
    this.shareNote = false;
    if (this.shareTimer !== 0) {
      window.clearTimeout(this.shareTimer);
      this.shareTimer = 0;
    }
    if (showing) this.hud.setNote("");
  }

  private noteActivity(): void {
    if (this.phase !== "play") return;
    this.running = true;
    this.hud.hideHint();
  }

  private toggleMotion(): void {
    if (this.motion) {
      this.motion = false;
      this.hud.setMotionSelected(false);
      return;
    }
    void this.enableMotion();
  }

  private async enableMotion(): Promise<void> {
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
    this.hud.setMotionSelected(true);
  }

  private clearFall(): void {
    if (this.fallTimer === 0) return;
    window.clearTimeout(this.fallTimer);
    this.fallTimer = 0;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.editor.isOpen() || event.button !== 0 || this.phase === "won") return;
    this.dragPointer = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.dragging = true;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointer) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (dx === 0 && dy === 0) return;
    this.tilt.drag(dx, dy);
    this.noteActivity();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointer) return;
    this.dragPointer = null;
    this.dragging = false;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.editor.isOpen()) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (this.sheetOpen) this.closeSettings();
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key.startsWith("Arrow") || event.key === " ") event.preventDefault();
    this.keys.add(key);
    if (event.repeat) return;
    if (key === "r") this.resetBall();
    if (key === "n") this.newMaze();
    if (key === "l" || event.key === " ") this.level();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.dragging = false;
    this.dragPointer = null;
  };

  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (this.editor.isOpen() || !this.motion || this.dragging || this.phase === "won") return;
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
    this.tilt.setAbsolute(-pitch * this.settings.pitchSign(), -roll);
    this.noteActivity();
  };
}
