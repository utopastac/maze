import {
  CAMPAIGN_FLOORS,
  CAMPAIGN_LIVES,
  campaignSizes,
  campaignThemes,
  generateCampaign,
  type Campaign,
} from "../core/campaign.ts";
import {
  deleteCampaignProgress,
  loadCampaignProgress,
  saveCampaignProgress,
  type CampaignProgress,
} from "../core/campaignProgress.ts";
import { STORY, layoutMaze, layoutPlans, layoutTower, type TowerLayout } from "../core/layout.ts";
import { copyText, forgetLevel, hasLevelHash, levelFromHash, rememberLevel } from "../core/share.ts";
import {
  cloneTower,
  coinTotal,
  generateTower,
  levelNameOf,
  MAX_HEARTS_CAP,
  maxHeartsOf,
  type Tower,
} from "../core/tower.ts";
import { PlaySettings, snapPixels } from "../core/playSettings.ts";
import { initPhysics, Simulation } from "../core/simulation.ts";
import { TiltController } from "../core/tilt.ts";
import { applyRendererLook, createRenderer } from "../render/createRenderer.ts";
import { MazeWorld } from "../render/MazeWorld.ts";
import { PlayHud } from "../render/playHud.ts";
import { cloneMaze, resizeMaze } from "../core/maze.ts";
import { DEFAULT_FLOOR_THEME } from "../core/theme.ts";
import { LevelEditor, type EditorMode } from "../ui/editor.ts";
import { Hud } from "../ui/hud.ts";
import { LevelSelect } from "../ui/levelSelect.ts";
import { Overlay } from "../ui/overlay.ts";
import { SavedLevelsPanel } from "../ui/savedLevels.ts";
import { SettingsPanel } from "../ui/settingsPanel.ts";
import { TowerIntro } from "../ui/towerIntro.ts";
import { TowerPause } from "../ui/towerPause.ts";
import type { WebGLRenderer } from "three";

const FIRST_SEED = 11;
const LEVEL_SELECT_SEED = FIRST_SEED;
const TILT_KEYS = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"];
const CAMERA_KEYS = new Set(["q", "e", "z", "c", "-", "_", "=", "+"]);
const ZOOM_SPEED = 0.45;

type Phase = "play" | "falling" | "escaping" | "failing" | "won" | "lost";
type Mode = "free" | "campaign";

export class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly playHud: PlayHud;
  private readonly sheet: HTMLElement;
  private readonly settings = new PlaySettings();
  private readonly tilt = new TiltController(this.settings);
  private readonly hud: Hud;
  private readonly overlay: Overlay;
  private readonly pause: TowerPause;
  private readonly intro: TowerIntro;
  private readonly panel: SettingsPanel;
  private readonly editor: LevelEditor;
  private readonly picker: LevelSelect;
  private readonly library: SavedLevelsPanel;
  private pauseNote = "";
  private pauseNoteTimer = 0;
  private tower: Tower | null = null;
  private authored: Tower | null = null;
  private mode: Mode = "free";
  private campaign: Campaign | null = null;
  private campaignSaveId: string | null = null;
  private pickerCampaign: Campaign | null = null;
  private lives = CAMPAIGN_LIVES;
  private livesEnabled = false;
  private coinsGot = 0;
  private coinsMax = 0;
  private shareNote = false;
  private shareTimer = 0;
  private floorAt = 1;
  private floorCount = 1;
  private floorCaption: string | null = null;
  private titleCaption = "Untitled";
  private readonly keys = new Set<string>();
  private renderer: WebGLRenderer | null = null;
  private view: MazeWorld | null = null;
  private sim: Simulation | null = null;
  private phase: Phase = "play";
  private seconds = 0;
  private drops = 0;
  private running = false;
  private awaitingStart = false;
  private last = 0;
  private fallTimer = 0;
  private dragPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private dragging = false;
  private recallCamera = false;
  private motion = false;
  private sheetOpen = false;
  private browsingWins = false;
  private calibrateMotion = false;
  private motionOrigin: { beta: number; gamma: number } | null = null;
  private seed = FIRST_SEED;
  private readonly reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    canvas: HTMLCanvasElement,
    playHudCanvas: HTMLCanvasElement,
    chrome: HTMLElement,
    overlay: HTMLElement,
    pause: HTMLElement,
    intro: HTMLElement,
    sheet: HTMLElement,
    picker: HTMLElement,
    library: HTMLElement,
    editor: HTMLElement,
  ) {
    this.canvas = canvas;
    this.playHud = new PlayHud(playHudCanvas);
    this.sheet = sheet;
    this.panel = new SettingsPanel(sheet, this.settings, {
      onClose: () => this.closeSettings(),
    });
    this.panel.mount();
    this.settings.subscribe(() => {
      this.sim?.apply(this.settings);
      this.view?.applyCamera();
      this.view?.applyPicture();
      this.panel.refresh();
      this.resize();
    });
    this.editor = new LevelEditor(editor, {
      onPlay: (tower) => this.playEdited(tower),
      onClose: () => this.finishEditing(),
      onShare: (tower) => this.publish(tower),
    });
    this.picker = new LevelSelect(picker, {
      onPick: (index) => this.playCampaignFloor(index),
      onClose: () => this.closeLevelSelect(),
    });
    this.library = new SavedLevelsPanel(library, {
      onPick: (tower) => this.playSavedLevel(tower),
      onClose: () => this.closeSavedLevels(),
    });
    this.hud = new Hud(chrome, {
      onLevel: () => this.level(),
      onReset: () => this.resetBall(),
      onNew: () => this.newMaze(),
      onCampaign: () => this.startCampaign(),
      onLevels: () => this.toggleLevelSelect(),
      onSaved: () => this.toggleSavedLevels(),
      onMotion: () => this.toggleMotion(),
      onSettings: () => this.toggleSettings(),
      onEdit: () => this.openEditor("share"),
      onAuthor: () => this.openEditor("campaign"),
      onShare: () => {
        if (!this.authored) return;
        void this.publish(this.authored).then((result) => this.noteShare(result));
      },
      onWins: () => this.toggleWinGallery(),
      onPause: () => this.openTowerPause(),
    });
    this.overlay = new Overlay(overlay, {
      onAgain: () => this.replay(),
      onLeave: () => this.newMaze(),
    });
    this.pause = new TowerPause(pause, {
      onResume: () => this.closeTowerPause(),
      onSave: () => this.saveTowerProgress(false),
      onSaveLeave: () => this.saveTowerProgress(true),
      onClearSave: () => this.clearTowerProgress(),
      onNewRun: () => this.restartCampaignFresh(),
    });
    this.intro = new TowerIntro(intro, {
      onNewGame: () => this.beginCampaignNew(),
      onLoad: (save) => this.beginCampaignLoad(save),
      onClose: () => this.closeTowerIntro(),
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
    this.mode = "free";
    this.campaign = null;
    this.campaignSaveId = null;
    this.hud.setCampaign(false);
    const view = this.view;
    if (!view) return;
    this.tower = tower;
    this.authored = cloneTower(tower);
    this.beginRun(layoutTower(tower), 1, tower.floors.length);
    if (shared) {
      if (!this.authored || !rememberLevel(this.authored)) {
        forgetLevel();
        this.hud.setNote("Too big to share");
      }
    } else forgetLevel();
  }

  private mountCampaign(fromFloor = 1): void {
    const campaign = this.campaign;
    const view = this.view;
    if (!campaign || !view) return;
    this.mode = "campaign";
    this.authored = null;
    const start = Math.min(campaign.floors.length - 1, Math.max(0, fromFloor - 1));
    const count = Math.min(3, campaign.floors.length - start);
    const plans = campaign.floors.slice(start, start + count).map((floor, index) => ({
      maze: floor.maze,
      goal: start + index === campaign.floors.length - 1,
    }));
    this.tower = { floors: plans.map((plan) => plan.maze) };
    this.hud.setCampaign(true);
    this.hud.setLives(this.lives);
    this.beginRun(layoutPlans(plans), start + 1, CAMPAIGN_FLOORS);
    forgetLevel();
  }

  private beginRun(layout: TowerLayout, floorAt: number, floorCount: number): void {
    const view = this.view;
    if (!view) return;
    this.closeTowerPause();
    this.clearFall();
    this.sim?.dispose();
    this.floorAt = floorAt;
    this.floorCount = floorCount;
    this.coinsGot = 0;
    if (this.mode === "campaign") {
      this.livesEnabled = true;
      this.lives = Math.min(MAX_HEARTS_CAP, this.lives);
    } else {
      const max = maxHeartsOf(this.tower ?? { floors: [] });
      this.livesEnabled = max > 0;
      this.lives = Math.min(MAX_HEARTS_CAP, max);
    }
    this.coinsMax = this.tower ? coinTotal(this.tower) : layout.floors.reduce((n, f) => n + f.coins.length, 0);
    this.sim = new Simulation(layout, this.settings);
    view.setTower(layout);
    this.phase = "play";
    this.seconds = 0;
    this.drops = 0;
    this.running = false;
    this.awaitingStart = this.mode !== "campaign";
    this.browsingWins = false;
    this.tilt.snap();
    this.overlay.hide();
    this.hud.setCelebrate(false);
    this.hud.setWinsSelected(false);
    if (this.awaitingStart) this.hud.hideHint();
    else this.hud.showHint();
    this.clearShareNote();
    this.hud.setNote("");
    this.hud.setStats(0, 0);
    this.setTitleCaption();
    this.setFloorCaption(this.floorAt, this.floorCount);
    this.syncCollectHud();
    this.playHud.setVisible(true);
    this.syncPlayHud();
    this.syncStartGate();
    view.update(0, this.sim.pose());
  }

  private syncStartGate(): void {
    if (!this.awaitingStart) {
      this.playHud.setStartGate(null);
      return;
    }
    this.setTitleCaption();
    this.playHud.setStartGate({
      title: this.titleCaption,
      floors: this.floorCount,
      lives: this.livesEnabled ? this.lives : null,
      coins: this.coinsMax,
    });
  }

  private pressStart(): void {
    if (!this.awaitingStart || this.phase !== "play") return;
    this.awaitingStart = false;
    this.playHud.setStartGate(null);
    this.running = true;
    this.sim?.resetBall(false);
    this.canvas.style.cursor = "";
    this.hud.hideHint();
    this.syncPlayHud();
  }

  private startCampaign(): void {
    if (!this.view) return;
    if (this.mode === "campaign" && (this.phase === "play" || this.phase === "falling")) {
      this.openTowerPause();
      return;
    }
    if (this.intro.isOpen()) {
      this.closeTowerIntro();
      return;
    }
    this.openTowerIntro();
  }

  private openTowerIntro(): void {
    if (!this.view || this.intro.isOpen()) return;
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.finishEditing();
    }
    this.closeTowerPause();
    this.closeLevelSelect();
    this.closeSavedLevels();
    this.closeSettings();
    this.closeWinGallery(false);
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.running = false;
    this.hud.hideHint();
    this.intro.show();
  }

  private closeTowerIntro(): void {
    if (!this.intro.isOpen()) return;
    this.intro.hide();
    if (!this.awaitingStart && !this.running && this.phase === "play") this.hud.showHint();
  }

  private beginCampaignNew(): void {
    this.closeTowerIntro();
    this.campaignSaveId = null;
    this.lives = CAMPAIGN_LIVES;
    this.seconds = 0;
    this.drops = 0;
    this.campaign = generateCampaign(Math.floor(Math.random() * 0x7fffffff));
    this.mountCampaign(1);
    this.resize();
  }

  private beginCampaignLoad(save: CampaignProgress): void {
    this.closeTowerIntro();
    const fresh = loadCampaignProgress(save.id) ?? save;
    this.resumeCampaign(fresh);
  }

  private resumeCampaign(saved: CampaignProgress): void {
    this.campaignSaveId = saved.id;
    this.lives = Math.max(1, saved.lives);
    this.campaign = generateCampaign(saved.seed);
    this.mountCampaign(saved.floor);
    this.seconds = saved.seconds;
    this.drops = saved.drops;
    this.hud.setStats(this.seconds, this.drops);
    this.syncPlayHud();
    this.resize();
  }

  private toggleLevelSelect(): void {
    if (this.picker.isOpen()) this.closeLevelSelect();
    else this.openLevelSelect();
  }

  private openLevelSelect(): void {
    if (!this.view || this.picker.isOpen()) return;
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.finishEditing();
    }
    this.closeTowerPause();
    this.closeTowerIntro();
    this.closeSavedLevels();
    this.closeSettings();
    this.closeWinGallery(false);
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.running = false;
    this.pickerCampaign = this.campaign ?? this.pickerCampaign ?? generateCampaign(LEVEL_SELECT_SEED);
    this.picker.show(this.pickerCampaign);
    this.hud.setLevelsSelected(true);
    this.hud.hideHint();
  }

  private closeLevelSelect(): void {
    if (!this.picker.isOpen()) return;
    this.picker.hide();
    this.hud.setLevelsSelected(false);
    if (!this.awaitingStart && !this.running && this.phase === "play") this.hud.showHint();
  }

  private toggleSavedLevels(): void {
    if (this.library.isOpen()) this.closeSavedLevels();
    else this.openSavedLevels();
  }

  private openSavedLevels(): void {
    if (!this.view || this.library.isOpen()) return;
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.finishEditing();
    }
    this.closeTowerPause();
    this.closeTowerIntro();
    this.closeLevelSelect();
    this.closeSettings();
    this.closeWinGallery(false);
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.running = false;
    this.library.show();
    this.hud.setSavedSelected(true);
    this.hud.hideHint();
  }

  private closeSavedLevels(): void {
    if (!this.library.isOpen()) return;
    this.library.hide();
    this.hud.setSavedSelected(false);
    if (!this.awaitingStart && !this.running && this.phase === "play") this.hud.showHint();
  }

  private playSavedLevel(tower: Tower): void {
    this.closeSavedLevels();
    this.mountTower(cloneTower(tower), false);
    this.resize();
  }

  private playCampaignFloor(index: number): void {
    const campaign = this.pickerCampaign ?? this.campaign;
    const floor = campaign?.floors[index];
    const view = this.view;
    if (!campaign || !floor || !view) return;
    this.closeLevelSelect();
    const maze = cloneMaze(floor.maze);
    if (maze.hatch) {
      maze.goal = { ...maze.hatch };
      maze.hatch = null;
    }
    this.mode = "free";
    this.campaign = null;
    this.campaignSaveId = null;
    this.hud.setCampaign(false);
    this.tower = { floors: [maze] };
    this.authored = cloneTower(this.tower);
    this.beginRun(layoutPlans([{ maze, goal: true }]), 1, 1);
    this.floorCaption = `FLOOR ${index + 1}`;
    this.hud.setFloorName(`Floor ${index + 1}`);
    this.syncPlayHud();
    forgetLevel();
    this.resize();
  }

  private toggleWinGallery(): void {
    if (this.browsingWins) this.closeWinGallery();
    else this.openWinGallery();
  }

  private openWinGallery(): void {
    const view = this.view;
    if (!view || this.mode === "campaign") return;
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.finishEditing();
    }
    this.closeTowerPause();
    this.closeTowerIntro();
    this.closeLevelSelect();
    this.closeSavedLevels();
    this.closeSettings();
    this.clearFall();
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.running = false;
    this.browsingWins = true;
    this.phase = "won";
    this.tilt.level();
    this.tilt.snap();
    this.sim?.hold();
    this.overlay.hide();
    this.hud.setCelebrate(true);
    this.hud.setWinsSelected(true);
    this.hud.hideHint();
    this.playHud.setVisible(false);
    this.clearShareNote();
    view.enterWinGallery();
    this.noteWinGallery();
  }

  private closeWinGallery(remount = true): void {
    if (!this.browsingWins) return;
    this.browsingWins = false;
    this.hud.setWinsSelected(false);
    if (!remount) return;
    if (this.authored) {
      this.mountTower(cloneTower(this.authored), hasLevelHash(location.hash));
      this.resize();
      return;
    }
    this.mount(this.seed);
    this.resize();
  }

  private noteWinGallery(): void {
    const status = this.view?.winGalleryStatus();
    if (!status) return;
    const name = status.name.charAt(0).toUpperCase() + status.name.slice(1);
    this.hud.setNote(`${name} · ${status.index + 1}/${status.count} · [ ]`);
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const sim = this.sim;
    const view = this.view;
    const renderer = this.renderer;
    if (!sim || !view || !renderer) return;

    if (this.editor.isOpen() || this.pause.isOpen() || this.intro.isOpen()) {
      view.update(now / 1000, sim.pose());
      renderer.render(view.scene, view.camera);
      this.playHud.update(dt, this.reduceMotion);
      requestAnimationFrame(this.frame);
      return;
    }

    if (this.awaitingStart) {
      this.tilt.level();
      this.tilt.smooth(dt);
      this.recallCamera = false;
      this.driveCamera(dt, false);
      sim.hold();
      this.hud.setStats(this.seconds, this.drops);
      this.hud.setTilt(0, 0);
      view.update(now / 1000, sim.pose());
      renderer.render(view.scene, view.camera);
      this.playHud.update(dt, this.reduceMotion);
      requestAnimationFrame(this.frame);
      return;
    }

    let tilting = false;
    if (
      this.phase === "play"
      || this.phase === "falling"
      || this.phase === "escaping"
      || this.phase === "failing"
    ) {
      if (this.phase !== "escaping" && this.phase !== "failing") {
        const beforePitch = this.tilt.targetPitch;
        const beforeRoll = this.tilt.targetRoll;
        this.tilt.applyKeys(dt, this.keys);
        if (this.tilt.targetPitch !== beforePitch || this.tilt.targetRoll !== beforeRoll) {
          this.noteActivity();
        }
        tilting = TILT_KEYS.some((key) => this.keys.has(key)) || this.recallCamera;
      }
      this.tilt.smooth(dt);
    }
    this.recallCamera = false;
    this.driveCamera(dt, tilting);

    const pitch = this.phase === "won" || this.phase === "lost" ? 0 : this.tilt.pitch;
    const roll = this.phase === "won" || this.phase === "lost" ? 0 : this.tilt.roll;
    const event = sim.update(dt, pitch, roll);
    const pickedHearts = sim.takeHearts();
    const pickedCoins = sim.takeCoins();
    const pickedStars = sim.takeStars();
    const pickedWings = sim.takeWings();
    if (this.phase === "play" && pickedHearts.length > 0) this.pickHearts(pickedHearts);
    if (this.phase === "play" && pickedCoins.length > 0) this.pickCoins(pickedCoins);
    if (this.phase === "play" && pickedStars.length > 0) this.pickStars(pickedStars);
    if (this.phase === "play" && pickedWings.length > 0) this.pickWings(pickedWings);
    if (this.phase === "play" && event === "fell") this.drop();
    else if (this.phase === "play" && event === "escape") this.beginEscape();
    else if ((this.phase === "play" || this.phase === "escaping") && event === "goal") this.win();
    else if (this.phase === "failing" && event === "fail") this.finishLose();
    else if (this.phase === "play" && event === "descend") this.beginDescend();

    if (this.running && this.phase !== "won" && this.phase !== "lost") this.seconds += dt;
    this.hud.setStats(this.seconds, this.drops);
    this.syncPlayHud();
    const tiltLimit = Math.max(this.settings.tiltRad, 0.001);
    this.hud.setTilt(this.tilt.roll / tiltLimit, this.tilt.pitch / tiltLimit);

    view.update(now / 1000, sim.pose());
    renderer.render(view.scene, view.camera);
    this.playHud.update(dt, this.reduceMotion);
    requestAnimationFrame(this.frame);
  };

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const renderer = this.renderer;
    if (this.settings.normalLook) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer?.setPixelRatio(dpr);
      renderer?.setSize(width, height, false);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.canvas.dataset.look = "normal";
      this.view?.resize(width, height);
    } else {
      const scale = snapPixels(this.settings.values.pixels);
      const bufferW = Math.max(1, Math.floor(width / scale));
      const bufferH = Math.max(1, Math.floor(height / scale));
      renderer?.setPixelRatio(1);
      renderer?.setSize(bufferW, bufferH, false);
      // Fill the viewport even when floor(size/scale)*scale undershoots by a few CSS pixels.
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.canvas.dataset.look = "pixel";
      this.view?.resize(width, height);
    }
    if (renderer) applyRendererLook(renderer, this.settings.normalLook);
    this.playHud.resize(width, height, this.settings.values.uiPixels, this.settings.normalLook);
  }

  private beginDescend(): void {
    const sim = this.sim;
    const view = this.view;
    if (!sim || !view || !this.tower) return;
    this.tilt.level();
    this.tilt.snap();
    this.dragging = false;
    this.dragPointer = null;
    view.crumbleTop();
    view.shatterRoof();
    sim.dropTop();
    sim.shift(STORY);
    view.rebase(STORY);
    this.tower = { floors: this.tower.floors.slice(1) };
    this.floorAt += 1;
    this.setFloorCaption(this.floorAt, this.floorCount);
    this.syncPlayHud();
    if (this.mode === "campaign") this.extendCampaign();
    this.clearShareNote();
    this.hud.setNote("");
  }

  private beginEscape(): void {
    const sim = this.sim;
    const view = this.view;
    if (!sim || !view) return;
    this.phase = "escaping";
    this.tilt.level();
    this.tilt.snap();
    this.dragging = false;
    this.dragPointer = null;
    view.shatterEscape();
    sim.beginEscape();
    this.clearShareNote();
    this.hud.setNote("");
    this.hud.hideHint();
  }

  private extendCampaign(): void {
    const campaign = this.campaign;
    const sim = this.sim;
    const view = this.view;
    if (!campaign || !sim || !view) return;
    const index = this.floorAt + 1;
    const floor = campaign.floors[index];
    if (floor) {
      const layout = layoutMaze(floor.maze, index === campaign.floors.length - 1, true);
      sim.appendFloor(layout);
      view.appendFloor(layout);
      this.coinsMax += floor.maze.coins.length;
      this.syncCollectHud();
    }
  }

  private pickHearts(cells: string[]): void {
    for (const cell of cells) this.view?.collectHeart(cell);
    for (let i = 0; i < cells.length; i += 1) this.playHud.shout("1-UP!", "#e2586c");
    if (!this.livesEnabled) return;
    this.lives = Math.min(MAX_HEARTS_CAP, this.lives + cells.length);
    this.hud.setLives(this.lives, true);
    this.syncPlayHud({ pulseLives: true });
  }

  private pickCoins(cells: string[]): void {
    this.coinsGot += cells.length;
    for (const cell of cells) this.view?.collectCoin(cell);
    for (let i = 0; i < cells.length; i += 1) this.playHud.shout("COIN!", "#f0c43a");
    this.syncCollectHud(true);
  }

  private pickStars(cells: string[]): void {
    for (const cell of cells) this.view?.collectStar(cell);
    for (let i = 0; i < cells.length; i += 1) this.playHud.shout("STAR!", "#ffe14a");
  }

  private pickWings(cells: string[]): void {
    for (const cell of cells) this.view?.collectWings(cell);
    for (let i = 0; i < cells.length; i += 1) this.playHud.shout("WINGS!", "#5ec8ff");
  }

  private syncCollectHud(pulseCoins = false): void {
    this.hud.setHearts(0, 0);
    if (this.livesEnabled) this.hud.setLives(this.lives);
    else this.hud.clearLives();
    this.hud.setCoins(this.coinsGot, this.coinsMax, pulseCoins && this.coinsMax > 0);
    this.syncPlayHud({ pulseCoins });
  }

  private setTitleCaption(): void {
    this.titleCaption = this.mode === "campaign"
      ? "Campaign"
      : levelNameOf(this.authored ?? this.tower ?? { floors: [] });
    this.hud.setTitle(this.titleCaption);
  }

  private setFloorCaption(current: number, total: number): void {
    const shown = this.mode === "campaign" ? CAMPAIGN_FLOORS : total;
    this.hud.setFloor(current, shown);
    this.floorCaption = shown > 1 ? `FLOOR ${current}/${shown}` : null;
  }

  private syncPlayHud(opts: { pulseLives?: boolean; pulseCoins?: boolean } = {}): void {
    const floorText = this.mode === "campaign"
      ? `FLOOR ${this.floorAt}/${CAMPAIGN_FLOORS}`
      : this.floorCaption;
    this.playHud.setStats({
      seconds: this.seconds,
      lives: this.livesEnabled ? this.lives : null,
      coinsGot: this.coinsGot,
      coinsMax: this.coinsMax,
      titleText: "",
      floorText,
      pulseLives: opts.pulseLives === true,
      pulseCoins: opts.pulseCoins === true,
    });
  }

  private drop(): void {
    this.drops += 1;
    if (this.livesEnabled) {
      this.lives -= 1;
      this.hud.setLives(this.lives);
      this.syncPlayHud({ pulseLives: true });
      if (this.lives <= 0) {
        this.beginFail();
        return;
      }
    }
    this.phase = "falling";
    this.sim?.hold();
    this.clearShareNote();
    this.hud.setNote("Dropped");
    this.clearFall();
    this.fallTimer = window.setTimeout(() => {
      this.fallTimer = 0;
      if (this.phase !== "falling") return;
      this.sim?.resetBall(false);
      this.view?.restorePowerUps();
      this.phase = "play";
      this.hud.setNote("");
    }, 460);
  }

  private beginFail(): void {
    const sim = this.sim;
    const view = this.view;
    if (!sim || !view) return;
    this.closeTowerPause();
    this.phase = "failing";
    this.tilt.level();
    this.tilt.snap();
    this.dragging = false;
    this.dragPointer = null;
    view.shatterFail();
    sim.beginFail();
    this.clearShareNote();
    this.hud.setNote("");
    this.hud.hideHint();
    this.hud.setCelebrate(true);
    // Keep the play HUD up for the center heart drop-in + shatter debris.
    window.setTimeout(() => {
      if (this.phase === "failing" || this.phase === "lost") {
        this.playHud.setVisible(false);
      }
    }, 1400);
    this.closeSettings();
  }

  private win(): void {
    this.closeTowerPause();
    if (this.mode === "campaign") this.forgetActiveCampaignSave();
    this.phase = "won";
    this.clearShareNote();
    this.running = false;
    this.dragging = false;
    this.dragPointer = null;
    this.tilt.level();
    this.tilt.snap();
    this.sim?.hold();
    this.hud.hideHint();
    this.hud.setCelebrate(true);
    this.playHud.setVisible(false);
    this.closeSettings();
    this.clearFall();
    this.fallTimer = window.setTimeout(() => {
      this.fallTimer = 0;
      if (this.phase !== "won") return;
      if (this.mode === "campaign") this.overlay.showCampaignWin(this.seconds, this.drops, this.lives);
      else this.overlay.showWin(this.seconds, this.drops);
    }, 1100);
  }

  private finishLose(): void {
    this.closeTowerPause();
    if (this.mode === "campaign") this.forgetActiveCampaignSave();
    this.phase = "lost";
    this.clearShareNote();
    this.running = false;
    this.dragging = false;
    this.dragPointer = null;
    this.tilt.level();
    this.tilt.snap();
    this.sim?.hold();
    this.hud.hideHint();
    this.hud.setCelebrate(true);
    this.playHud.setVisible(false);
    this.closeSettings();
    this.clearFall();
    this.fallTimer = window.setTimeout(() => {
      this.fallTimer = 0;
      if (this.phase !== "lost") return;
      this.overlay.showLoss(this.floorAt, this.floorCount, this.seconds, this.mode === "campaign");
    }, 1100);
  }

  private openTowerPause(): void {
    if (!this.campaign || this.mode !== "campaign") return;
    if (this.phase !== "play" && this.phase !== "falling") return;
    if (this.pause.isOpen()) return;
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.finishEditing();
    }
    this.closeLevelSelect();
    this.closeSavedLevels();
    this.closeSettings();
    this.closeTowerIntro();
    this.closeWinGallery(false);
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.running = false;
    this.tilt.level();
    this.tilt.snap();
    this.hud.hideHint();
    this.pause.show(this.towerPauseStats());
  }

  private closeTowerPause(): void {
    if (!this.pause.isOpen()) return;
    this.clearPauseNote();
    this.pause.hide();
    if (!this.awaitingStart && !this.running && this.phase === "play") this.hud.showHint();
  }

  private towerPauseStats(note = this.pauseNote) {
    const campaign = this.campaign;
    const maze = campaign?.floors[this.floorAt - 1]?.maze ?? null;
    return {
      floor: this.floorAt,
      total: this.mode === "campaign" ? CAMPAIGN_FLOORS : this.floorCount,
      lives: this.lives,
      seconds: this.seconds,
      drops: this.drops,
      sizes: campaign ? campaignSizes(campaign) : [],
      themes: campaign ? campaignThemes(campaign) : [],
      maze,
      showGoal: this.floorAt >= (this.mode === "campaign" ? CAMPAIGN_FLOORS : this.floorCount),
      landing: this.floorAt > 1,
      hasSave: this.campaignSaveId !== null
        && loadCampaignProgress(this.campaignSaveId) !== null,
      note,
    };
  }

  private saveTowerProgress(leave: boolean): void {
    const campaign = this.campaign;
    if (!campaign || this.mode !== "campaign") return;
    const saved = saveCampaignProgress({
      id: this.campaignSaveId ?? undefined,
      seed: campaign.seed,
      floor: this.floorAt,
      lives: this.lives,
      seconds: this.seconds,
      drops: this.drops,
    });
    if (!saved) {
      this.setPauseNote("Couldn’t save");
      return;
    }
    this.campaignSaveId = saved.id;
    if (leave) {
      this.closeTowerPause();
      this.campaignSaveId = null;
      this.newMaze();
      return;
    }
    this.setPauseNote("Saved on this device");
    this.pause.update(this.towerPauseStats());
  }

  private clearTowerProgress(): void {
    this.forgetActiveCampaignSave();
    this.setPauseNote("Save cleared");
    this.pause.update(this.towerPauseStats());
  }

  private forgetActiveCampaignSave(): void {
    if (this.campaignSaveId) deleteCampaignProgress(this.campaignSaveId);
    this.campaignSaveId = null;
  }

  private restartCampaignFresh(): void {
    this.closeTowerPause();
    this.campaignSaveId = null;
    this.lives = CAMPAIGN_LIVES;
    this.seconds = 0;
    this.drops = 0;
    this.campaign = generateCampaign(Math.floor(Math.random() * 0x7fffffff));
    this.mountCampaign(1);
    this.resize();
  }

  private setPauseNote(note: string): void {
    this.pauseNote = note;
    if (this.pauseNoteTimer !== 0) window.clearTimeout(this.pauseNoteTimer);
    this.pauseNoteTimer = window.setTimeout(() => {
      this.pauseNoteTimer = 0;
      this.pauseNote = "";
      if (this.pause.isOpen()) this.pause.update(this.towerPauseStats(""));
    }, 1600);
  }

  private clearPauseNote(): void {
    this.pauseNote = "";
    if (this.pauseNoteTimer === 0) return;
    window.clearTimeout(this.pauseNoteTimer);
    this.pauseNoteTimer = 0;
  }

  private resetBall(): void {
    if (this.phase === "lost" || this.phase === "failing") return;
    if (this.browsingWins) {
      this.closeWinGallery();
      return;
    }
    this.clearFall();
    this.sim?.resetBall();
    this.view?.restorePowerUps();
    this.clearShareNote();
    this.hud.setNote("");
    if (this.phase === "won") {
      this.overlay.hide();
      this.hud.setCelebrate(false);
      this.playHud.setVisible(true);
      this.syncPlayHud();
    }
    if (this.phase !== "play") this.phase = "play";
  }

  private replay(): void {
    this.closeWinGallery(false);
    if (this.mode === "campaign" && this.campaign) {
      this.lives = CAMPAIGN_LIVES;
      this.campaign = generateCampaign(this.campaign.seed);
      this.mountCampaign();
      this.resize();
      return;
    }
    if (this.authored) {
      this.mountTower(cloneTower(this.authored), hasLevelHash(location.hash));
      this.resize();
      return;
    }
    this.mount(this.seed);
    this.resize();
  }

  private newMaze(): void {
    this.closeTowerPause();
    this.closeTowerIntro();
    this.closeWinGallery(false);
    this.seed = Math.floor(Math.random() * 0x7fffffff);
    this.mount(this.seed);
    this.resize();
  }

  private level(): void {
    this.tilt.level();
    this.calibrateMotion = true;
    this.recallCamera = true;
  }

  private openEditor(mode: EditorMode): void {
    if (this.editor.isOpen()) return;
    if (mode === "share" && !this.authored) return;
    this.closeTowerPause();
    this.closeTowerIntro();
    this.closeLevelSelect();
    this.closeSavedLevels();
    this.closeSettings();
    this.closeWinGallery();
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.view?.restCamera();
    const tower = mode === "campaign"
      ? (this.authored ? cloneTower(this.authored) : blankAuthorTower())
      : cloneTower(this.authored!);
    this.editor.open(tower, mode);
    this.hud.setEditSelected(mode === "share");
    this.hud.setAuthorSelected(mode === "campaign");
    this.hud.hideHint();
  }

  private playEdited(tower: Tower): void {
    const mode = this.editor.modeOf();
    this.finishEditing();
    this.mountTower(tower, mode === "share");
    this.resize();
  }

  private finishEditing(): void {
    this.hud.setEditSelected(false);
    this.hud.setAuthorSelected(false);
    if (!this.awaitingStart && !this.running && this.phase === "play") this.hud.showHint();
  }

  private toggleSettings(): void {
    if (this.sheetOpen) this.closeSettings();
    else this.openSettings();
  }

  private openSettings(): void {
    this.closeTowerPause();
    this.closeTowerIntro();
    this.closeLevelSelect();
    this.closeSavedLevels();
    this.closeWinGallery();
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
    if (!this.awaitingStart && !this.running && this.phase === "play") this.hud.showHint();
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
    if (this.phase !== "play" || this.awaitingStart) return;
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
    if (
      this.editor.isOpen()
      || this.picker.isOpen()
      || this.library.isOpen()
      || this.pause.isOpen()
      || this.intro.isOpen()
      || event.button !== 0
      || this.phase === "escaping"
      || this.phase === "failing"
    ) return;
    if (this.awaitingStart) {
      if (this.playHud.hitTestStart(event.clientX, event.clientY)) this.pressStart();
      return;
    }
    this.dragPointer = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.dragging = true;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.awaitingStart) {
      this.canvas.style.cursor = this.playHud.hitTestStart(event.clientX, event.clientY)
        ? "pointer"
        : "default";
      return;
    }
    if (event.pointerId !== this.dragPointer) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (dx === 0 && dy === 0) return;
    if (this.phase === "won" || this.phase === "lost") {
      this.view?.nudgeCamera(-dy * 0.16, -dx * 0.28);
      return;
    }
    this.tilt.drag(dx, dy);
    this.recallCamera = true;
    this.noteActivity();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointer) return;
    this.dragPointer = null;
    this.dragging = false;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (
      this.editor.isOpen()
      || this.picker.isOpen()
      || this.library.isOpen()
      || this.pause.isOpen()
      || this.intro.isOpen()
    ) {
      if (event.key.toLowerCase() === "escape") {
        if (this.pause.isOpen()) this.closeTowerPause();
        else if (this.intro.isOpen()) this.closeTowerIntro();
        else if (this.picker.isOpen()) this.closeLevelSelect();
        else if (this.library.isOpen()) this.closeSavedLevels();
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (this.browsingWins) this.closeWinGallery();
      else if (this.sheetOpen) this.closeSettings();
      else if (this.mode === "campaign" && (this.phase === "play" || this.phase === "falling")) {
        this.openTowerPause();
      }
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key.startsWith("Arrow") || event.key === " ") event.preventDefault();
    if (this.awaitingStart) {
      if (!event.repeat && (key === "enter" || event.key === " ")) this.pressStart();
      return;
    }
    const chord = event.metaKey || event.ctrlKey || event.altKey;
    if (!(chord && CAMERA_KEYS.has(key))) this.keys.add(key);
    this.hud.setHeld(this.keys);
    if (event.repeat) return;
    if (key === "r") this.resetBall();
    if (key === "n") this.newMaze();
    if (key === "l" || event.key === " ") this.level();
    if (
      (this.phase === "escaping" || this.phase === "won")
      && (key === "t" || key === "]" || key === "[")
    ) {
      this.view?.cycleWinScene(key === "[" ? -1 : 1);
      if (this.browsingWins) this.noteWinGallery();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
    this.hud.setHeld(this.keys);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.dragging = false;
    this.dragPointer = null;
  };

  private driveCamera(dt: number, tilting: boolean): void {
    const view = this.view;
    if (!view) return;
    if (this.phase === "won" || this.phase === "lost") {
      let dAngle = 0;
      let dOrbit = 0;
      if (this.keys.has("q") || this.keys.has("arrowdown") || this.keys.has("s")) dAngle -= 28 * dt;
      if (this.keys.has("e") || this.keys.has("arrowup") || this.keys.has("w")) dAngle += 28 * dt;
      if (this.keys.has("z") || this.keys.has("arrowleft") || this.keys.has("a")) dOrbit -= 80 * dt;
      if (this.keys.has("c") || this.keys.has("arrowright") || this.keys.has("d")) dOrbit += 80 * dt;
      if (dAngle !== 0 || dOrbit !== 0) view.nudgeCamera(dAngle, dOrbit);
    } else if (tilting) {
      view.recallCamera();
    } else {
      let dAngle = 0;
      let dOrbit = 0;
      if (this.keys.has("q")) dAngle -= 28 * dt;
      if (this.keys.has("e")) dAngle += 28 * dt;
      if (this.keys.has("z")) dOrbit -= 80 * dt;
      if (this.keys.has("c")) dOrbit += 80 * dt;
      if (dAngle !== 0 || dOrbit !== 0) view.nudgeCamera(dAngle, dOrbit);
    }
    let dZoom = 0;
    if (this.keys.has("=") || this.keys.has("+")) dZoom += ZOOM_SPEED * dt;
    if (this.keys.has("-") || this.keys.has("_")) dZoom -= ZOOM_SPEED * dt;
    if (dZoom !== 0) this.settings.set("zoom", this.settings.values.zoom + dZoom);
    view.stepCamera(dt);
  };

  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (
      this.editor.isOpen()
      || this.picker.isOpen()
      || this.library.isOpen()
      || this.pause.isOpen()
      || this.intro.isOpen()
      || this.awaitingStart
      || !this.motion
      || this.dragging
      || this.phase === "won"
      || this.phase === "lost"
      || this.phase === "escaping"
      || this.phase === "failing"
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
    this.noteActivity();
  };
}

function blankAuthorTower(): Tower {
  return {
    floors: [
      resizeMaze(
        {
          cols: 1,
          rows: 1,
          walls: [[0]],
          holes: [],
          tiles: [],
          hearts: [],
          coins: [],
          stars: [],
          wings: [],
          start: { c: 0, r: 0 },
          goal: { c: 0, r: 0 },
          hatch: null,
          theme: DEFAULT_FLOOR_THEME,
        },
        7,
        7,
      ),
    ],
  };
}
