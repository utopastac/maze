import {
  CAMPAIGN_FLOORS,
  CAMPAIGN_LIVES,
  campaignSizes,
  campaignThemes,
  generateCampaign,
  type Campaign,
} from "../core/campaign.ts";
import {
  AUTOSAVE_ID,
  clearCampaignAutosave,
  deleteCampaignProgress,
  loadCampaignProgress,
  saveCampaignAutosave,
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
import {
  isMenuScreen,
  parseRoute,
  routeHash,
  routesEqual,
  type AppRoute,
} from "../core/route.ts";
import { initPhysics, Simulation } from "../core/simulation.ts";
import { TiltController } from "../core/tilt.ts";
import { applyRendererLook, createRenderer } from "../render/createRenderer.ts";
import { MazeWorld } from "../render/MazeWorld.ts";
import { PlayHud, type PlayHudHomeAction } from "../render/playHud.ts";
import { cloneMaze, resizeMaze } from "../core/maze.ts";
import { DEFAULT_FLOOR_THEME } from "../core/theme.ts";
import { LevelEditor, type EditorMode } from "../ui/editor.ts";
import { Home } from "../ui/home.ts";
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
  private readonly playHudCanvas: HTMLCanvasElement;
  private readonly playHud: PlayHud;
  private readonly shell: HTMLElement;
  private readonly settings = new PlaySettings();
  private readonly tilt = new TiltController(this.settings);
  private readonly hud: Hud;
  private readonly overlay: Overlay;
  private readonly pause: TowerPause;
  private readonly home: Home;
  private readonly intro: TowerIntro;
  private readonly panel: SettingsPanel;
  private readonly editor: LevelEditor;
  private readonly picker: LevelSelect;
  private readonly library: SavedLevelsPanel;
  private route: AppRoute = { kind: "home" };
  private settingsReturn: AppRoute = { kind: "home" };
  /** Mid-play settings: cover the run without parking/disposing it. */
  private settingsOverlay = false;
  /** After playtest / quit, return here instead of home. */
  private playReturn: AppRoute | null = null;
  private syncingHash = false;
  private practiceFromTower = false;
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
    home: HTMLElement,
    intro: HTMLElement,
    sheet: HTMLElement,
    picker: HTMLElement,
    library: HTMLElement,
    editor: HTMLElement,
  ) {
    this.canvas = canvas;
    this.playHudCanvas = playHudCanvas;
    this.playHud = new PlayHud(playHudCanvas);
    this.shell = document.querySelector<HTMLElement>("#app") ?? document.body;
    this.panel = new SettingsPanel(sheet, this.settings, {
      onSave: () => this.leaveSettings(),
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
      onHome: () => this.goHome(),
      onLevel: () => this.level(),
      onReset: () => this.resetBall(),
      onNew: () => this.newMaze(),
      onCampaign: () => this.startCampaign(),
      onLevels: () => this.toggleLevelSelect(),
      onSaved: () => this.toggleSavedLevels(),
      onMotion: () => this.toggleMotion(),
      onSettings: () => this.toggleSettings(),
      onEdit: () => {
        if (this.authored) this.setRoute({ kind: "create" });
      },
      onAuthor: () => this.openEditor("campaign"),
      onShare: () => {
        if (!this.authored) return;
        void this.publish(this.authored).then((result) => this.noteShare(result));
      },
      onWins: () => this.toggleWinGallery(),
      onWinScene: (index) => this.jumpWinScene(index),
      onPause: () => this.openPause(),
    });
    this.overlay = new Overlay(overlay, {
      onAgain: () => this.replay(),
      onLeave: () => this.goHome(),
    });
    this.pause = new TowerPause(pause, {
      onResume: () => this.closePause(),
      onSettings: () => this.openSettingsFromPause(),
      onQuit: () => this.quitFromPause(),
      onSave: () => this.saveTowerProgress(false),
      onSaveLeave: () => this.saveTowerProgress(true),
      onClearSave: () => this.clearTowerProgress(),
      onNewRun: () => this.restartCampaignFresh(),
    });
    this.home = new Home(home, {
      onPick: (action) => this.pickHome(action),
    });
    this.intro = new TowerIntro(intro, {
      onNewGame: () => this.beginCampaignNew(),
      onLoad: (save) => this.beginCampaignLoad(save),
      onPractice: () => this.openPracticeSelect(),
      onBack: () => this.goHome(),
    });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.playHudCanvas.addEventListener("pointerdown", this.onHomePointerDown);
    this.playHudCanvas.addEventListener("pointermove", this.onHomePointerMove);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("deviceorientation", this.onOrientation);
    window.addEventListener("hashchange", this.onHashChange);
  }

  async start(): Promise<void> {
    await initPhysics();
    this.renderer = createRenderer(this.canvas);
    this.view = new MazeWorld();
    this.view.useSettings(this.settings);
    const route = parseRoute(location.hash);
    if (route.kind === "level") {
      const shared = levelFromHash(location.hash);
      if (shared) {
        this.mountTower(shared, true);
        this.route = { kind: "level" };
        this.setShellScreen("level");
      } else {
        this.hud.setNote("That link didn't load");
        this.setRoute({ kind: "home" }, true);
      }
    } else {
      this.applyRoute(route, true);
    }
    this.resize();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private onHashChange = (): void => {
    if (this.syncingHash) return;
    this.applyRoute(parseRoute(location.hash), true);
  };

  private setRoute(route: AppRoute, replace = false): void {
    if (route.kind === "settings" && this.route.kind !== "settings") {
      this.rememberSettingsReturn();
    }
    if (routesEqual(this.route, route) && this.routeMatchesHash(route)) {
      this.applyRoute(route, true);
      return;
    }
    this.route = route;
    const next = routeHash(route);
    if (location.hash !== next) {
      this.syncingHash = true;
      if (replace) history.replaceState(null, "", next);
      else history.pushState(null, "", next);
      this.syncingHash = false;
    }
    this.applyRoute(route, true);
  }

  private rememberSettingsReturn(): void {
    if (this.route.kind === "settings") return;
    // Shared-level hash is cleared when parking; land on free play instead.
    this.settingsReturn = this.route.kind === "level"
      ? { kind: "play" }
      : { kind: this.route.kind };
  }

  private leaveSettings(): void {
    if (this.settingsOverlay) {
      this.hideSettingsOverlay();
      this.playHud.setVisible(this.sim !== null);
      if (this.canPause()) this.openPause();
      return;
    }
    const dest = this.settingsReturn.kind === "settings"
      ? { kind: "home" as const }
      : this.settingsReturn;
    this.closeSettingsScreen(false);
    this.setRoute(dest);
  }

  private routeMatchesHash(route: AppRoute): boolean {
    if (route.kind === "level") return hasLevelHash(location.hash);
    return parseRoute(location.hash).kind === route.kind;
  }

  private applyRoute(route: AppRoute, fromHash: boolean): void {
    if (!this.view) return;
    if (route.kind === "settings" && this.route.kind !== "settings") {
      this.rememberSettingsReturn();
    }
    this.route = route;
    this.practiceFromTower = false;
    this.setShellScreen(route.kind);

    if (route.kind === "level") {
      this.leaveMenuScreens();
      this.closeAllMenus(false);
      const shared = levelFromHash(location.hash);
      if (shared) {
        this.mountTower(shared, true);
        this.resize();
      } else if (fromHash) {
        this.hud.setNote("That link didn't load");
        this.setRoute({ kind: "home" }, true);
      }
      return;
    }

    if (route.kind === "home") {
      this.openHome();
      return;
    }

    if (route.kind === "tower") {
      this.openTowerScreen();
      return;
    }

    if (route.kind === "settings") {
      this.openSettingsScreen();
      return;
    }

    if (route.kind === "create") {
      this.openCreateScreen();
      return;
    }

    if (route.kind === "saved") {
      this.openSavedScreen();
      return;
    }

    this.leaveMenuScreens();

    if (route.kind === "play") {
      this.closeAllMenus(false);
      this.playReturn = null;
      this.seed = Math.floor(Math.random() * 0x7fffffff);
      this.mount(this.seed);
      this.resize();
      return;
    }
  }

  private setShellScreen(kind: AppRoute["kind"] | "play"): void {
    this.shell.dataset.screen = kind;
  }

  private leaveMenuScreens(shatterHome = false): void {
    this.closeHome(shatterHome);
    this.closeTowerIntro(false);
    this.hideSettingsOverlay();
    this.closeSettingsScreen(false);
    this.closeSavedLevels(false);
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.hud.setEditSelected(false);
      this.hud.setAuthorSelected(false);
    }
  }

  private closeAllMenus(showHint: boolean): void {
    this.closePause();
    this.closeTowerIntro(false);
    this.closeLevelSelect(false);
    this.closeSavedLevels(false);
    this.hideSettingsOverlay();
    this.closeSettingsScreen(false);
    this.closeWinGallery(false);
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.hud.setEditSelected(false);
      this.hud.setAuthorSelected(false);
    }
    if (showHint && !this.awaitingStart && !this.running && this.phase === "play") {
      this.hud.showHint();
    }
  }

  private goHome(): void {
    this.setRoute({ kind: "home" });
  }

  /** Park the live maze — menu screens do not sit on top of play. */
  private parkWorld(): void {
    this.overlay.hide();
    forgetLevel();
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.running = false;
    this.awaitingStart = false;
    this.browsingWins = false;
    this.playHud.setStartGate(null);
    this.hud.hideHint();
    this.hud.setCelebrate(false);
    this.hud.setWinsSelected(false);
    this.mode = "free";
    this.campaign = null;
    this.campaignSaveId = null;
    this.hud.setCampaign(false);
    this.sim?.dispose();
    this.sim = null;
    this.tower = null;
    this.phase = "play";
    this.canvas.style.cursor = "";
    if (!this.home.isOpen()) this.view?.leaveHomeBackdrop();
  }

  private openHome(): void {
    this.closeAllMenus(false);
    this.closeTowerIntro(false);
    this.parkWorld();
    if (location.hash !== "#home") {
      this.syncingHash = true;
      history.replaceState(null, "", "#home");
      this.syncingHash = false;
    }
    this.setShellScreen("home");
    this.home.show();
    this.view?.enterHomeBackdrop();
    this.playHud.setVisible(true);
    this.playHud.setHomeMenu(true);
    this.playHudCanvas.style.cursor = "default";
  }

  private closeHome(shatter = false): void {
    if (!this.home.isOpen()) return;
    if (shatter && this.playHud.isHomeMenuOpen()) this.playHud.shatterHomeMenu();
    else this.playHud.setHomeMenu(false);
    this.home.hide();
    this.playHud.setHomeHover(null);
    this.playHudCanvas.style.cursor = "";
    if (this.route.kind !== "home") this.view?.leaveHomeBackdrop();
  }

  private pickHome(action: PlayHudHomeAction): void {
    if (!this.home.isOpen()) return;
    this.closeHome(true);
    switch (action) {
      case "tower":
        this.setRoute({ kind: "tower" });
        break;
      case "play":
        this.setRoute({ kind: "play" });
        break;
      case "create":
        this.setRoute({ kind: "create" });
        break;
      case "saved":
        this.setRoute({ kind: "saved" });
        break;
      case "settings":
        this.setRoute({ kind: "settings" });
        break;
    }
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
    this.closePause();
    this.hideSettingsOverlay();
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
    this.hud.setWinGallery(false);
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
    this.playHud.shatterStartGate();
    this.running = true;
    this.sim?.resetBall(false);
    this.canvas.style.cursor = "";
    this.hud.hideHint();
    this.syncPlayHud();
  }

  private startCampaign(): void {
    if (!this.view) return;
    if (this.canPause()) {
      this.openPause();
      return;
    }
    if (this.intro.isOpen() || this.route.kind === "tower") {
      this.goHome();
      return;
    }
    this.setRoute({ kind: "tower" });
  }

  private openTowerScreen(): void {
    this.closeAllMenus(false);
    this.closeHome(false);
    this.parkWorld();
    this.playHud.setVisible(false);
    this.setShellScreen("tower");
    this.intro.show();
  }

  private closeTowerIntro(returnHome = true): void {
    if (!this.intro.isOpen()) return;
    this.intro.hide();
    if (returnHome && this.route.kind === "tower") {
      this.goHome();
    }
  }

  private beginCampaignNew(): void {
    this.closeTowerIntro(false);
    this.playReturn = null;
    this.campaignSaveId = null;
    this.lives = CAMPAIGN_LIVES;
    this.seconds = 0;
    this.drops = 0;
    this.campaign = generateCampaign(Math.floor(Math.random() * 0x7fffffff));
    this.mountCampaign(1);
    this.markPlaying();
    this.resize();
  }

  private beginCampaignLoad(save: CampaignProgress): void {
    this.closeTowerIntro(false);
    const fresh = loadCampaignProgress(save.id) ?? save;
    this.resumeCampaign(fresh);
  }

  private resumeCampaign(saved: CampaignProgress): void {
    this.playReturn = null;
    this.campaignSaveId = saved.id;
    this.lives = Math.max(1, saved.lives);
    this.campaign = generateCampaign(saved.seed);
    this.mountCampaign(saved.floor);
    this.seconds = saved.seconds;
    this.drops = saved.drops;
    this.hud.setStats(this.seconds, this.drops);
    this.syncPlayHud();
    this.markPlaying();
    this.resize();
  }

  private markPlaying(shared = false): void {
    if (shared || hasLevelHash(location.hash)) {
      this.route = { kind: "level" };
      this.setShellScreen("level");
      return;
    }
    this.route = { kind: "play" };
    this.setShellScreen("play");
    const next = routeHash({ kind: "play" });
    if (location.hash === next) return;
    this.syncingHash = true;
    history.replaceState(null, "", next);
    this.syncingHash = false;
  }

  private toggleLevelSelect(): void {
    if (this.picker.isOpen()) this.closeLevelSelect();
    else this.openLevelSelect();
  }

  private openPracticeSelect(): void {
    this.practiceFromTower = true;
    this.closeTowerIntro(false);
    this.openLevelSelect();
  }

  private openLevelSelect(): void {
    if (!this.view || this.picker.isOpen()) return;
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.hud.setEditSelected(false);
      this.hud.setAuthorSelected(false);
    }
    this.closeHome();
    this.closePause();
    if (!this.practiceFromTower) this.closeTowerIntro(false);
    this.closeSavedLevels(false);
    this.closeSettingsScreen(false);
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

  private closeLevelSelect(restore = true): void {
    if (!this.picker.isOpen()) return;
    this.picker.hide();
    this.hud.setLevelsSelected(false);
    if (!restore) {
      this.practiceFromTower = false;
      return;
    }
    if (this.practiceFromTower) {
      this.practiceFromTower = false;
      this.setRoute({ kind: "tower" }, true);
      return;
    }
    if (!this.home.isOpen() && !this.awaitingStart && !this.running && this.phase === "play") {
      this.hud.showHint();
    }
  }

  private toggleSavedLevels(): void {
    if (this.library.isOpen() || this.route.kind === "saved") this.goHome();
    else this.setRoute({ kind: "saved" });
  }

  private openSavedScreen(): void {
    this.closeAllMenus(false);
    this.closeHome(false);
    this.parkWorld();
    this.playReturn = null;
    this.playHud.setVisible(false);
    this.setShellScreen("saved");
    this.library.show();
    this.hud.setSavedSelected(true);
  }

  private closeSavedLevels(returnHome = true): void {
    if (!this.library.isOpen()) return;
    this.library.hide();
    this.hud.setSavedSelected(false);
    if (returnHome && this.route.kind === "saved") {
      this.goHome();
    }
  }

  private playSavedLevel(tower: Tower): void {
    this.closeSavedLevels(false);
    this.playReturn = null;
    this.mountTower(cloneTower(tower), false);
    this.markPlaying();
    this.resize();
  }

  private openCreateScreen(): void {
    this.closeAllMenus(false);
    this.closeHome(false);
    this.parkWorld();
    this.playReturn = null;
    this.playHud.setVisible(false);
    this.setShellScreen("create");
    if (!this.authored) this.authored = blankAuthorTower();
    this.editor.open(cloneTower(this.authored), "share");
    this.hud.setEditSelected(true);
    this.hud.setAuthorSelected(false);
  }

  private playCampaignFloor(index: number): void {
    const campaign = this.pickerCampaign ?? this.campaign;
    const floor = campaign?.floors[index];
    const view = this.view;
    if (!campaign || !floor || !view) return;
    this.practiceFromTower = false;
    this.closeLevelSelect(false);
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
    this.markPlaying();
    this.resize();
  }

  private toggleWinGallery(): void {
    if (this.browsingWins) this.closeWinGallery();
    else this.openWinGallery();
  }

  private openWinGallery(): void {
    const view = this.view;
    if (!view || this.mode === "campaign") return;
    if (this.home.isOpen()) this.closeHome(true);
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.finishEditing(false);
    }
    this.closePause();
    this.closeTowerIntro(false);
    this.closeLevelSelect(false);
    this.closeSavedLevels(false);
    this.closeSettingsScreen(false);
    this.clearFall();
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.running = false;
    this.awaitingStart = false;
    this.playHud.setStartGate(null);
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
    this.playHud.setHomeMenu(false);
    this.clearShareNote();
    view.enterWinGallery();
    this.noteWinGallery();
  }

  private closeWinGallery(remount = true): void {
    if (!this.browsingWins) return;
    this.browsingWins = false;
    this.hud.setWinsSelected(false);
    this.hud.setWinGallery(false);
    if (!remount) return;
    if (this.authored) {
      this.mountTower(cloneTower(this.authored), hasLevelHash(location.hash));
      this.resize();
      return;
    }
    this.mount(this.seed);
    this.resize();
  }

  private jumpWinScene(index: number): void {
    if (!this.browsingWins) return;
    this.view?.setWinScene(index);
    this.noteWinGallery();
  }

  private noteWinGallery(): void {
    const status = this.view?.winGalleryStatus();
    if (!status) return;
    this.hud.setNote("");
    const scenes = this.view?.winGalleryScenes() ?? [];
    this.hud.setWinGallery(true, scenes, status.index);
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const view = this.view;
    const renderer = this.renderer;

    if (this.home.isOpen()) {
      if (view?.isHomeBackdrop() && renderer) {
        view.updateHome(now / 1000);
        renderer.render(view.scene, view.camera);
      }
      this.playHud.update(dt, this.reduceMotion);
      requestAnimationFrame(this.frame);
      return;
    }

    if (
      isMenuScreen(this.route)
      || this.intro.isOpen()
      || this.panel.isOpen()
      || this.settingsOverlay
    ) {
      this.playHud.update(dt, this.reduceMotion);
      requestAnimationFrame(this.frame);
      return;
    }

    const sim = this.sim;
    if (!sim || !view || !renderer) {
      requestAnimationFrame(this.frame);
      return;
    }

    if (this.editor.isOpen() || this.pause.isOpen()) {
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
    if (this.mode === "campaign") {
      this.extendCampaign();
      this.autosaveTowerProgress();
    }
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
    this.closePause();
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
    this.closeSettingsScreen(false);
  }

  private win(): void {
    this.closePause();
    if (this.mode === "campaign") this.endCampaignRunSaves();
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
    this.closeSettingsScreen(false);
    this.clearFall();
    this.fallTimer = window.setTimeout(() => {
      this.fallTimer = 0;
      if (this.phase !== "won") return;
      if (this.mode === "campaign") this.overlay.showCampaignWin(this.seconds, this.drops, this.lives);
      else this.overlay.showWin(this.seconds, this.drops);
    }, 1100);
  }

  private finishLose(): void {
    this.closePause();
    if (this.mode === "campaign") this.endCampaignRunSaves();
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
    this.closeSettingsScreen(false);
    this.clearFall();
    this.fallTimer = window.setTimeout(() => {
      this.fallTimer = 0;
      if (this.phase !== "lost") return;
      this.overlay.showLoss(this.floorAt, this.floorCount, this.seconds, this.mode === "campaign");
    }, 1100);
  }

  private canPause(): boolean {
    if (!this.sim || this.awaitingStart) return false;
    if (this.route.kind !== "play" && this.route.kind !== "level") return false;
    return this.phase === "play" || this.phase === "falling";
  }

  private freezeForPause(): void {
    this.dragging = false;
    this.dragPointer = null;
    this.keys.clear();
    this.hud.setHeld(this.keys);
    this.running = false;
    this.tilt.level();
    this.tilt.snap();
    this.hud.hideHint();
  }

  private openPause(): void {
    if (!this.canPause()) return;
    if (this.pause.isOpen()) return;
    if (this.editor.isOpen()) {
      this.editor.hide();
      this.finishEditing(false);
    }
    this.closeLevelSelect(false);
    this.closeSavedLevels(false);
    this.hideSettingsOverlay();
    this.closeTowerIntro(false);
    this.closeWinGallery(false);
    this.freezeForPause();
    this.pause.show(this.towerPauseStats());
  }

  private closePause(): void {
    if (!this.pause.isOpen()) return;
    this.clearPauseNote();
    this.pause.hide();
    if (this.awaitingStart) return;
    if (this.phase === "play" || this.phase === "falling") {
      this.running = true;
      this.hud.hideHint();
    }
  }

  private quitFromPause(): void {
    this.closePause();
    const dest = this.playReturn ?? (this.mode === "campaign"
      ? { kind: "tower" as const }
      : { kind: "home" as const });
    this.playReturn = null;
    this.setRoute(dest);
  }

  private towerPauseStats(note = this.pauseNote) {
    const campaign = this.campaign;
    const maze = this.mode === "campaign"
      ? (campaign?.floors[this.floorAt - 1]?.maze ?? null)
      : (this.tower?.floors[0] ?? null);
    return {
      mode: this.mode === "campaign" ? "campaign" as const : "free" as const,
      floor: this.floorAt,
      total: this.mode === "campaign" ? CAMPAIGN_FLOORS : this.floorCount,
      lives: this.lives,
      seconds: this.seconds,
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
    // Keep manual saves off the reserved autosave id so the slot stays distinct.
    const manualId = this.campaignSaveId && this.campaignSaveId !== AUTOSAVE_ID
      ? this.campaignSaveId
      : undefined;
    const saved = saveCampaignProgress({
      id: manualId,
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
    this.autosaveTowerProgress();
    if (leave) {
      this.closePause();
      this.campaignSaveId = null;
      this.playReturn = null;
      this.setRoute({ kind: "tower" });
      return;
    }
    this.setPauseNote("Saved on this device");
    this.pause.update(this.towerPauseStats());
  }

  private autosaveTowerProgress(): void {
    const campaign = this.campaign;
    if (!campaign || this.mode !== "campaign") return;
    const saved = saveCampaignAutosave({
      seed: campaign.seed,
      floor: this.floorAt,
      lives: this.lives,
      seconds: this.seconds,
      drops: this.drops,
    });
    if (!saved) return;
    if (!this.campaignSaveId) this.campaignSaveId = saved.id;
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

  private endCampaignRunSaves(): void {
    this.forgetActiveCampaignSave();
    clearCampaignAutosave();
  }

  private restartCampaignFresh(): void {
    this.closePause();
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
    this.closePause();
    this.closeTowerIntro(false);
    this.closeHome();
    this.closeWinGallery(false);
    this.seed = Math.floor(Math.random() * 0x7fffffff);
    this.mount(this.seed);
    this.markPlaying();
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
    this.closeHome();
    this.closePause();
    this.closeTowerIntro(false);
    this.closeLevelSelect(false);
    this.closeSavedLevels(false);
    this.closeSettingsScreen(false);
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
    this.playHud.setVisible(false);
  }

  private playEdited(tower: Tower): void {
    const fromCreate = this.route.kind === "create";
    const mode = this.editor.modeOf();
    this.authored = cloneTower(tower);
    this.finishEditing(false);
    this.playReturn = fromCreate || mode === "share" ? { kind: "create" } : null;
    const shared = mode === "share" && !fromCreate;
    this.mountTower(tower, shared);
    this.markPlaying(shared);
    this.resize();
  }

  private finishEditing(returnHome = true): void {
    if (this.editor.isOpen()) this.editor.hide();
    this.hud.setEditSelected(false);
    this.hud.setAuthorSelected(false);
    this.playHud.setVisible(true);
    if (returnHome && this.route.kind === "create") {
      this.goHome();
      return;
    }
    if (!this.home.isOpen() && !this.awaitingStart && !this.running && this.phase === "play") {
      this.hud.showHint();
    }
  }

  private toggleSettings(): void {
    if (this.panel.isOpen() || this.route.kind === "settings" || this.settingsOverlay) {
      this.leaveSettings();
      return;
    }
    if (this.canPause() || this.pause.isOpen()) {
      this.openSettingsFromPause();
      return;
    }
    this.setRoute({ kind: "settings" });
  }

  /** Full settings destination from menus — parks the world. */
  private openSettingsScreen(): void {
    this.settingsOverlay = false;
    delete this.shell.dataset.settings;
    this.closeAllMenus(false);
    this.closeHome(false);
    this.parkWorld();
    this.playReturn = null;
    this.playHud.setVisible(false);
    this.setShellScreen("settings");
    this.hud.setSettingsSelected(true);
    this.panel.show();
  }

  /** Settings over a live paused run — does not dispose the maze. */
  private openSettingsFromPause(): void {
    if (!this.sim && !this.pause.isOpen()) {
      this.setRoute({ kind: "settings" });
      return;
    }
    if (this.pause.isOpen()) this.pause.hide();
    else if (this.canPause()) this.freezeForPause();
    else {
      this.setRoute({ kind: "settings" });
      return;
    }
    this.settingsOverlay = true;
    this.shell.dataset.settings = "overlay";
    this.closeLevelSelect(false);
    this.closeWinGallery(false);
    this.playHud.setVisible(false);
    this.hud.setSettingsSelected(true);
    this.panel.show();
  }

  private hideSettingsOverlay(): void {
    const wasOverlay = this.settingsOverlay;
    this.settingsOverlay = false;
    delete this.shell.dataset.settings;
    if (!wasOverlay) return;
    if (this.panel.isOpen()) this.panel.hide();
    this.hud.setSettingsSelected(false);
  }

  private closeSettingsScreen(returnToPrevious = true): void {
    if (this.settingsOverlay) {
      if (returnToPrevious) this.leaveSettings();
      else this.hideSettingsOverlay();
      return;
    }
    if (!this.panel.isOpen()) return;
    this.panel.hide();
    this.hud.setSettingsSelected(false);
    if (returnToPrevious && this.route.kind === "settings") {
      this.leaveSettings();
    }
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

  private onHomePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.home.isOpen()) return;
    const action = this.playHud.hitTestHome(event.clientX, event.clientY);
    if (action) this.pickHome(action);
  };

  private onHomePointerMove = (event: PointerEvent): void => {
    if (!this.home.isOpen()) return;
    const action = this.playHud.hitTestHome(event.clientX, event.clientY);
    this.playHud.setHomeHover(action);
    this.playHudCanvas.style.cursor = action ? "pointer" : "default";
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (isMenuScreen(this.route) || this.home.isOpen() || this.intro.isOpen()) return;
    if (
      this.editor.isOpen()
      || this.picker.isOpen()
      || this.library.isOpen()
      || this.pause.isOpen()
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
    if (isMenuScreen(this.route) || this.home.isOpen() || this.intro.isOpen()) return;
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
      this.home.isOpen()
      || this.editor.isOpen()
      || this.picker.isOpen()
      || this.library.isOpen()
      || this.pause.isOpen()
      || this.intro.isOpen()
      || this.panel.isOpen()
      || this.settingsOverlay
    ) {
      if (event.key.toLowerCase() === "escape") {
        // Nested first: settings → pause → other menus → home destinations.
        if (this.panel.isOpen() || this.settingsOverlay) this.leaveSettings();
        else if (this.pause.isOpen()) this.closePause();
        else if (this.picker.isOpen()) this.closeLevelSelect();
        else if (this.library.isOpen()) this.closeSavedLevels();
        else if (this.editor.isOpen()) this.finishEditing();
        else if (this.intro.isOpen()) this.closeTowerIntro();
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (this.browsingWins) this.closeWinGallery();
      else if (this.canPause()) this.openPause();
      else this.goHome();
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key.startsWith("Arrow") || event.key === " ") event.preventDefault();
    if (
      !event.repeat
      && (this.browsingWins || this.phase === "escaping" || this.phase === "won")
      && (key === "t" || key === "]" || key === "[")
    ) {
      this.view?.cycleWinScene(key === "[" ? -1 : 1);
      if (this.browsingWins) this.noteWinGallery();
      return;
    }
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
      this.home.isOpen()
      || this.editor.isOpen()
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
