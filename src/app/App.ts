import {
  CAMPAIGN_FLOORS,
  CAMPAIGN_LIVES,
  campaignSizes,
  campaignThemes,
  generateCampaign,
  type Campaign,
} from "../core/campaign.ts";
import type { CampaignProgress } from "../core/campaignProgress.ts";
import { blankAuthorTower } from "../core/blankTower.ts";
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
import { anyTiltHeld } from "../core/keybinds.ts";
import { PlaySettings, snapPixels } from "../core/playSettings.ts";
import {
  isMenuScreen,
  parseRoute,
  routeHash,
  routesEqual,
  type AppRoute,
} from "../core/route.ts";
import { initPhysics, Simulation, type Pose } from "../core/simulation.ts";
import { TiltController } from "../core/tilt.ts";
import { applyRendererLook, createRenderer } from "../render/createRenderer.ts";
import { MazeWorld, type EnterPlayKind } from "../render/MazeWorld.ts";
import { PlayHud, type PlayHudHomeAction } from "../render/playHud.ts";
import { cloneMaze } from "../core/maze.ts";
import { saveLevel } from "../core/savedLevels.ts";
import { DEFAULT_FLOOR_THEME, parseFloorTheme } from "../core/theme.ts";
import { LevelEditor, type EditorMode } from "../ui/editor.ts";
import { Home } from "../ui/home.ts";
import { Hud } from "../ui/hud.ts";
import { LevelSelect } from "../ui/levelSelect.ts";
import { Overlay } from "../ui/overlay.ts";
import { SavedLevelsPanel } from "../ui/savedLevels.ts";
import { SettingsPanel } from "../ui/settingsPanel.ts";
import { TowerIntro } from "../ui/towerIntro.ts";
import { TowerPause } from "../ui/towerPause.ts";
import { Toast } from "../ui/toast.ts";
import type { WebGLRenderer } from "three";
import { CampaignSession, type CampaignRunState } from "./campaignSession.ts";
import { PlayInput, type PlayInputHost } from "./playInput.ts";

const FIRST_SEED = 11;
const LEVEL_SELECT_SEED = FIRST_SEED;

/** Idle pose for browsing victory scenes when no play sim is mounted (e.g. from home). */
const GALLERY_POSE: Pose = {
  board: { x: 0, y: 0, z: 0, w: 1 },
  ballPosition: { x: 0, y: 0, z: 0 },
  ballRotation: { x: 0, y: 0, z: 0, w: 1 },
  ballScale: 1,
  starPower: 0,
  hoverPower: 0,
  ghostPower: 0,
  fallingThrough: false,
  crumbles: [],
  gates: [],
  oneWays: [],
  smashed: [],
};

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
  private readonly toast: Toast;
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
  private readonly session = new CampaignSession();
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
  private readonly input: PlayInput;
  private renderer: WebGLRenderer | null = null;
  private view: MazeWorld | null = null;
  private sim: Simulation | null = null;
  private phase: Phase = "play";
  private seconds = 0;
  private drops = 0;
  private running = false;
  private awaitingStart = false;
  /** Home → play camera handoff (summit door or free-play floor trapdoor → curtains). */
  private enteringPlay: {
    kind: EnterPlayKind;
    floor?: number;
    save?: CampaignProgress;
  } | null = null;
  private last = 0;
  private fallTimer = 0;
  private browsingWins = false;
  /** Close the gallery back to the title screen instead of remounting a maze. */
  private winsFromHome = false;
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
    toast: HTMLElement,
  ) {
    this.canvas = canvas;
    this.input = new PlayInput({
      canvas,
      settings: this.settings,
      tilt: this.tilt,
      view: () => this.view,
      host: this.inputHost(),
    });
    this.playHudCanvas = playHudCanvas;
    this.playHud = new PlayHud(playHudCanvas);
    this.shell = document.querySelector<HTMLElement>("#app") ?? document.body;
    this.toast = new Toast(toast);
    this.panel = new SettingsPanel(sheet, this.settings, {
      onSave: () => this.leaveSettings(),
    });
    this.panel.mount();
    this.settings.subscribe(() => {
      this.sim?.apply(this.settings);
      this.view?.applyCamera();
      this.view?.applyPicture();
      this.panel.refresh();
      this.hud.setKeybinds(this.settings.keybinds);
      this.hud.setHeld(this.input.keys);
      this.resize();
    });
    this.editor = new LevelEditor(editor, {
      onPlay: (tower) => this.playEdited(tower),
      onClose: () => this.finishEditing(),
      onShare: async (tower) => {
        const result = await this.publish(tower);
        this.noteShare(result);
        return result;
      },
      onToast: (message) => this.toast.show(message),
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
      onSettings: () => this.toggleSettings(),
      onEdit: () => {
        if (this.authored) this.setRoute({ kind: "create" });
      },
      onAuthor: () => this.openEditor("campaign"),
      onWins: () => this.toggleWinGallery(),
      onWinScene: (index) => this.jumpWinScene(index),
      onPause: () => this.openPause(),
    });
    this.hud.setKeybinds(this.settings.keybinds);
    this.overlay = new Overlay(overlay, {
      onAgain: () => this.replay(),
      onLeave: () => this.goHome(),
    });
    this.pause = new TowerPause(pause, {
      onResume: () => this.closePause(),
      onQuit: () => this.quitFromPause(),
      onSave: () => this.saveTowerProgress(false),
      onSaveLeave: () => this.saveTowerProgress(true),
      onClearSave: () => this.clearTowerProgress(),
      onNewRun: () => this.restartCampaignFresh(),
      onRemix: () => this.remixFromPause(),
      onSaveLevel: () => this.saveLevelFromPause(),
    });
    this.home = new Home(home, {
      onPick: (action) => this.pickHome(action),
    });
    this.intro = new TowerIntro(intro, {
      onNewGame: () => this.beginCampaignNew(),
      onLoad: (save) => this.beginCampaignLoad(save),
      onPractice: () => this.openPracticeSelect(),
      onBack: () => {
        if (this.intro.isModal()) this.closeTowerLoadModal();
        else this.goHome();
      },
    });
    this.input.attach();
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.playHudCanvas.addEventListener("pointerdown", this.onHomePointerDown);
    this.playHudCanvas.addEventListener("pointermove", this.onHomePointerMove);
    window.addEventListener("resize", () => this.resize());
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
      // Stay on the home shell so the storm viewport + HUD stay visible.
      this.setShellScreen("home");
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

    const leavingHome = this.home.isOpen();
    if (route.kind === "play" && this.view?.isHomeBackdrop()) {
      this.seed = Math.floor(Math.random() * 0x7fffffff);
      if (this.view.beginEnterPlay("free")) {
        this.enteringPlay = { kind: "free" };
        this.playHud.setSuppressPlayChrome(true);
      }
    }

    this.leaveMenuScreens(leavingHome && route.kind === "play");

    if (route.kind === "play") {
      this.closeAllMenus(false);
      this.playReturn = null;
      if (this.enteringPlay?.kind === "free") {
        this.setShellScreen("play");
        this.resize();
        return;
      }
      if (!leavingHome || !this.view?.isHomeBackdrop()) {
        this.seed = Math.floor(Math.random() * 0x7fffffff);
      }
      this.view?.leaveHomeBackdrop();
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
    this.input.releaseAll();
    this.running = false;
    this.awaitingStart = false;
    this.enteringPlay = null;
    this.browsingWins = false;
    this.winsFromHome = false;
    this.playHud.setSuppressPlayChrome(false);
    this.playHud.setStartGate(null);
    this.hud.hideHint();
    this.hud.setCelebrate(false);
    this.hud.setWinsSelected(false);
    this.hud.setWinGallery(false);
    this.mode = "free";
    this.session.reset();
    this.hud.setCampaign(false);
    this.hud.setPauseAvailable(false);
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
    this.home.setMode("main");
    if (this.view?.isHomeBackdrop()) this.view.setHomeView("menu");
    else this.view?.enterHomeBackdrop();
    this.playHud.setVisible(true);
    this.playHud.setHomeMenuMode("main");
    this.playHud.setHomeMenu(true);
    this.playHudCanvas.style.cursor = "default";
  }

  private closeHome(shatter = false): void {
    if (!this.home.isOpen()) return;
    this.closeTowerLoadModal();
    if (shatter && this.playHud.isHomeMenuOpen()) this.playHud.shatterHomeMenu();
    else this.playHud.setHomeMenu(false);
    this.home.hide();
    this.playHud.setHomeHover(null);
    this.playHudCanvas.style.cursor = "";
    if (
      this.route.kind !== "home"
      && this.route.kind !== "tower"
      && !this.enteringPlay
    ) {
      this.view?.leaveHomeBackdrop();
    }
  }

  private pickHome(action: PlayHudHomeAction): void {
    if (!this.home.isOpen()) return;
    switch (action) {
      case "tower":
        this.setRoute({ kind: "tower" });
        break;
      case "towerNew":
        this.beginCampaignNew();
        break;
      case "towerLoad":
        this.openTowerLoadModal();
        break;
      case "towerPractice":
        this.openPracticeSelect();
        break;
      case "towerBack":
        this.goHome();
        break;
      case "play":
        this.setRoute({ kind: "play" });
        break;
      case "create":
        this.closeHome(true);
        this.setRoute({ kind: "create" });
        break;
      case "saved":
        this.closeHome(true);
        this.setRoute({ kind: "saved" });
        break;
      case "settings":
        this.closeHome(true);
        this.setRoute({ kind: "settings" });
        break;
    }
  }

  private mount(seed: number): void {
    this.mountTower(generateTower(seed, 7, 7, 3), false);
  }

  private mountTower(tower: Tower, shared: boolean): void {
    this.mode = "free";
    this.session.reset();
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
    const campaign = this.session.campaign;
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
    view.setTower(layout, { fromEnterPlay: Boolean(this.enteringPlay) });
    this.phase = "play";
    this.seconds = 0;
    this.drops = 0;
    this.running = false;
    this.awaitingStart = true;
    this.browsingWins = false;
    this.tilt.snap();
    this.overlay.hide();
    this.hud.setCelebrate(false);
    this.hud.setWinsSelected(false);
    this.hud.setWinGallery(false);
    this.hud.hideHint();
    this.clearShareNote();
    this.hud.setNote("");
    this.hud.setStats(0, 0);
    this.setTitleCaption();
    this.setFloorCaption(this.floorAt, this.floorCount);
    this.syncCollectHud();
    this.playHud.setVisible(true);
    this.syncPlayHud();
    this.hud.setPauseAvailable(true);
    if (this.enteringPlay) {
      this.playHud.setSuppressPlayChrome(true);
      this.playHud.setStartGate(null);
    } else {
      this.playHud.setSuppressPlayChrome(false);
      this.syncStartGate();
    }
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
    if (!this.awaitingStart || this.phase !== "play" || this.enteringPlay) return;
    this.awaitingStart = false;
    this.playHud.shatterStartGate();
    this.running = true;
    this.sim?.resetBall(false);
    this.canvas.style.cursor = "";
    this.hud.hideHint();
    this.syncPlayHud();
  }

  private swapEnterPlay(): void {
    const view = this.view;
    const enter = this.enteringPlay;
    if (!view || !enter || !view.enterPlayNeedsSwap()) return;
    if (enter.kind === "tower") {
      if (!this.session.campaign) return;
      const saved = enter.save;
      this.mountCampaign(saved?.floor ?? enter.floor ?? 1);
      if (saved) {
        this.seconds = saved.seconds;
        this.drops = saved.drops;
        this.hud.setStats(this.seconds, this.drops);
        this.syncPlayHud();
      }
    } else {
      this.mount(this.seed);
    }
    view.notifyEnterPlaySwapped();
  }

  private openTowerScreen(): void {
    this.closeAllMenus(false);
    this.closeTowerLoadModal();
    if (!this.home.isOpen() || !this.view?.isHomeBackdrop()) {
      this.parkWorld();
      this.home.show();
      this.view?.enterHomeBackdrop();
    }
    // Keep the storm viewport/HUD visible — Tower is an in-world camera beat.
    this.setShellScreen("home");
    this.home.setMode("tower");
    this.view?.setHomeView("tower");
    this.playHud.setVisible(true);
    // Mode before open so the Mazespire hero intro does not flash.
    this.playHud.setHomeMenuMode("tower");
    this.playHud.setHomeMenu(true);
    this.playHudCanvas.style.cursor = "default";
  }

  private closeTowerIntro(returnHome = true): void {
    if (!this.intro.isOpen()) return;
    const wasModal = this.intro.isModal();
    this.intro.hide();
    if (wasModal) return;
    if (returnHome && this.route.kind === "tower") {
      this.goHome();
    }
  }

  private openTowerLoadModal(): void {
    this.intro.showLoadModal();
  }

  private closeTowerLoadModal(): void {
    if (!this.intro.isModal()) return;
    this.intro.hide();
  }

  private beginCampaignNew(): void {
    this.closeTowerLoadModal();
    this.closeHome(true);
    this.playReturn = null;
    this.lives = CAMPAIGN_LIVES;
    this.seconds = 0;
    this.drops = 0;
    this.session.beginNew();
    if (this.view?.isHomeBackdrop() && this.view.beginEnterPlay("tower")) {
      this.enteringPlay = { kind: "tower", floor: 1 };
      this.playHud.setSuppressPlayChrome(true);
      this.markPlaying();
      this.resize();
      return;
    }
    this.view?.leaveHomeBackdrop();
    this.mountCampaign(1);
    this.markPlaying();
    this.resize();
  }

  private beginCampaignLoad(save: CampaignProgress): void {
    this.closeTowerLoadModal();
    this.closeHome(true);
    const fresh = this.session.fresh(save);
    if (this.view?.isHomeBackdrop() && this.view.beginEnterPlay("tower")) {
      this.enteringPlay = { kind: "tower", floor: fresh.floor, save: fresh };
      this.playHud.setSuppressPlayChrome(true);
      this.playReturn = null;
      this.lives = this.session.load(fresh);
      this.markPlaying();
      this.resize();
      return;
    }
    this.view?.leaveHomeBackdrop();
    this.resumeCampaign(fresh);
  }

  private resumeCampaign(saved: CampaignProgress): void {
    this.playReturn = null;
    this.lives = this.session.load(saved);
    this.mountCampaign(saved.floor);
    this.seconds = saved.seconds;
    this.drops = saved.drops;
    this.hud.setStats(this.seconds, this.drops);
    this.syncPlayHud();
    this.markPlaying();
    this.resize();
  }

  private markPlaying(shared = false): void {
    this.hud.setPauseAvailable(true);
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
    this.input.releaseAll();
    this.running = false;
    this.pickerCampaign = this.session.campaign ?? this.pickerCampaign ?? generateCampaign(LEVEL_SELECT_SEED);
    this.picker.show(this.pickerCampaign, { practice: this.practiceFromTower });
    this.hud.hideHint();
  }

  private closeLevelSelect(restore = true): void {
    if (!this.picker.isOpen()) return;
    this.picker.hide();
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

  private openSavedScreen(): void {
    this.closeAllMenus(false);
    this.closeHome(false);
    this.parkWorld();
    this.playReturn = null;
    this.playHud.setVisible(false);
    this.setShellScreen("saved");
    this.library.show();
  }

  private closeSavedLevels(returnHome = true): void {
    if (!this.library.isOpen()) return;
    this.library.hide();
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
    const campaign = this.pickerCampaign ?? this.session.campaign;
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
    this.session.reset();
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
    this.winsFromHome =
      this.home.isOpen()
      || this.route.kind === "home"
      || view.isHomeBackdrop();
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
    this.input.releaseAll();
    this.running = false;
    this.awaitingStart = false;
    this.playHud.setStartGate(null);
    // Leave the home shell so the gallery panel and viewport can paint.
    this.setShellScreen("play");
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
    const backHome = this.winsFromHome;
    this.winsFromHome = false;
    this.hud.setWinsSelected(false);
    this.hud.setWinGallery(false);
    this.hud.setCelebrate(false);
    if (!remount) return;
    if (backHome) {
      this.goHome();
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

    if (this.enteringPlay && view && renderer) {
      if (view.enterPlayNeedsSwap() && !this.sim) this.swapEnterPlay();
      const done = view.tickEnterPlay(dt, now / 1000);
      if (this.sim) {
        this.tilt.level();
        this.tilt.smooth(dt);
        this.sim.hold();
        view.update(now / 1000, this.sim.pose());
      }
      renderer.render(view.scene, view.camera);
      this.playHud.update(dt, this.reduceMotion);
      if (done) {
        this.enteringPlay = null;
        this.playHud.setSuppressPlayChrome(false);
        this.syncPlayHud();
        if (this.awaitingStart) this.syncStartGate();
      }
      requestAnimationFrame(this.frame);
      return;
    }

    if (this.home.isOpen()) {
      if (view?.isHomeBackdrop() && renderer) {
        view.updateHome(now / 1000);
        renderer.render(view.scene, view.camera);
      }
      this.playHud.update(dt, this.reduceMotion);
      requestAnimationFrame(this.frame);
      return;
    }

    if (this.browsingWins && view && renderer) {
      this.tilt.level();
      this.tilt.smooth(dt);
      this.input.driveCamera(dt, false);
      view.update(now / 1000, this.sim?.pose() ?? GALLERY_POSE);
      renderer.render(view.scene, view.camera);
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
      this.input.recallCamera = false;
      this.input.driveCamera(dt, false);
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
        this.tilt.applyKeys(dt, this.input.keys);
        if (this.tilt.targetPitch !== beforePitch || this.tilt.targetRoll !== beforeRoll) {
          this.noteActivity();
        }
        tilting = anyTiltHeld(this.settings.keybinds, this.input.keys) || this.input.recallCamera;
      }
      this.tilt.smooth(dt);
    }
    this.input.recallCamera = false;
    this.input.driveCamera(dt, tilting);

    const pitch = this.phase === "won" || this.phase === "lost" ? 0 : this.tilt.pitch;
    const roll = this.phase === "won" || this.phase === "lost" ? 0 : this.tilt.roll;
    const event = sim.update(dt, pitch, roll);
    const pickedHearts = sim.takeHearts();
    const pickedCoins = sim.takeCoins();
    const pickedStars = sim.takeStars();
    const pickedWings = sim.takeWings();
    const pickedGhosts = sim.takeGhosts();
    if (this.phase === "play" && pickedHearts.length > 0) this.pickHearts(pickedHearts);
    if (this.phase === "play" && pickedCoins.length > 0) this.pickCoins(pickedCoins);
    if (this.phase === "play" && pickedStars.length > 0) this.pickStars(pickedStars);
    if (this.phase === "play" && pickedWings.length > 0) this.pickWings(pickedWings);
    if (this.phase === "play" && pickedGhosts.length > 0) this.pickGhosts(pickedGhosts);
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
    this.input.cancelDrag();
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
    this.input.cancelDrag();
    view.shatterEscape();
    sim.beginEscape();
    this.clearShareNote();
    this.hud.setNote("");
    this.hud.hideHint();
  }

  private extendCampaign(): void {
    const campaign = this.session.campaign;
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

  private pickGhosts(cells: string[]): void {
    for (const cell of cells) this.view?.collectGhosts(cell);
    for (let i = 0; i < cells.length; i += 1) this.playHud.shout("GHOST!", "#b9a3ff");
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
    this.input.cancelDrag();
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
    if (this.mode === "campaign") this.session.endRun();
    this.phase = "won";
    this.clearShareNote();
    this.running = false;
    this.input.cancelDrag();
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
    if (this.mode === "campaign") this.session.endRun();
    this.phase = "lost";
    this.clearShareNote();
    this.running = false;
    this.input.cancelDrag();
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
    if (!this.sim) return false;
    if (this.route.kind !== "play" && this.route.kind !== "level") return false;
    return this.phase === "play" || this.phase === "falling";
  }

  private freezeForPause(): void {
    this.input.releaseAll();
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
    const campaign = this.session.campaign;
    const tower = this.tower;
    const campaignMode = this.mode === "campaign";
    const maze = campaignMode
      ? (campaign?.floors[this.floorAt - 1]?.maze ?? null)
      : (tower?.floors[this.floorAt - 1] ?? tower?.floors[0] ?? null);
    const sizes = campaignMode
      ? (campaign ? campaignSizes(campaign) : [])
      : (tower?.floors.map((floor) => floor.cols) ?? []);
    const themes = campaignMode
      ? (campaign ? campaignThemes(campaign) : [])
      : (tower?.floors.map((floor) => parseFloorTheme(floor.theme ?? DEFAULT_FLOOR_THEME)) ?? []);
    return {
      mode: campaignMode ? "campaign" as const : "free" as const,
      floor: this.floorAt,
      total: campaignMode ? CAMPAIGN_FLOORS : this.floorCount,
      lives: this.lives,
      seconds: this.seconds,
      sizes,
      themes,
      maze,
      showGoal: this.floorAt >= (campaignMode ? CAMPAIGN_FLOORS : this.floorCount),
      landing: this.floorAt > 1,
      hasSave: this.session.hasSave(),
      note,
    };
  }

  private remixFromPause(): void {
    if (this.mode !== "free" || !this.authored) return;
    this.closePause();
    this.setRoute({ kind: "create" });
  }

  private saveLevelFromPause(): void {
    if (this.mode !== "free" || !this.authored) return;
    const saved = saveLevel(this.authored);
    if (!saved) {
      this.toast.show("Couldn’t save");
      return;
    }
    this.toast.show(`Saved “${saved.name}”`);
    this.pause.update(this.towerPauseStats());
  }

  private runState(): CampaignRunState {
    return { floor: this.floorAt, lives: this.lives, seconds: this.seconds, drops: this.drops };
  }

  private saveTowerProgress(leave: boolean): void {
    if (!this.session.campaign || this.mode !== "campaign") return;
    if (!this.session.saveManual(this.runState())) {
      this.toast.show("Couldn’t save");
      return;
    }
    this.autosaveTowerProgress();
    this.toast.show("Saved on this device");
    if (leave) {
      this.closePause();
      this.session.detachSave();
      this.playReturn = null;
      this.setRoute({ kind: "tower" });
      return;
    }
    this.pause.update(this.towerPauseStats());
  }

  private autosaveTowerProgress(): void {
    if (this.mode !== "campaign") return;
    this.session.autosave(this.runState());
  }

  private clearTowerProgress(): void {
    this.session.forgetActive();
    this.setPauseNote("Save cleared");
    this.pause.update(this.towerPauseStats());
  }

  private restartCampaignFresh(): void {
    this.closePause();
    this.lives = CAMPAIGN_LIVES;
    this.seconds = 0;
    this.drops = 0;
    this.session.beginNew();
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
    if (this.mode === "campaign" && this.session.campaign) {
      this.lives = CAMPAIGN_LIVES;
      this.session.replay();
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
    this.input.releaseAll();
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

  private inputHost(): PlayInputHost {
    return {
      isMenuBlocking: () => (
        this.home.isOpen()
        || this.editor.isOpen()
        || this.picker.isOpen()
        || this.library.isOpen()
        || this.pause.isOpen()
        || this.intro.isOpen()
        || this.panel.isOpen()
        || this.settingsOverlay
      ),
      isPointerBlocked: () => (
        (!this.browsingWins && isMenuScreen(this.route))
        || this.home.isOpen()
        || this.intro.isOpen()
      ),
      isModalOpen: () => (
        this.editor.isOpen()
        || this.picker.isOpen()
        || this.library.isOpen()
        || this.pause.isOpen()
      ),
      isHomeOrIntroOpen: () => this.home.isOpen() || this.intro.isOpen(),
      onMenuEscape: () => {
        // Nested first: settings → pause → load modal → tower submenu → other menus.
        if (this.panel.isOpen() || this.settingsOverlay) this.leaveSettings();
        else if (this.pause.isOpen()) {
          if (!this.pause.dismissConfirm()) this.closePause();
        }
        else if (this.picker.isOpen()) this.closeLevelSelect();
        else if (this.library.isOpen()) this.closeSavedLevels();
        else if (this.editor.isOpen()) this.finishEditing();
        else if (this.intro.isModal()) this.closeTowerLoadModal();
        else if (this.intro.isOpen()) this.closeTowerIntro();
        else if (this.home.isOpen() && this.playHud.homeMenuModeOf() === "tower") this.goHome();
      },
      phase: () => this.phase,
      isBrowsingWins: () => this.browsingWins,
      isAwaitingStart: () => this.awaitingStart,
      canPause: () => this.canPause(),
      hitTestStart: (x, y) => this.playHud.hitTestStart(x, y),
      setCanvasCursor: (cursor) => {
        this.canvas.style.cursor = cursor;
      },
      onPressStart: () => this.pressStart(),
      onTiltActivity: () => this.noteActivity(),
      onKeysChanged: () => this.hud.setHeld(this.input.keys),
      onOpenPause: () => this.openPause(),
      onGoHome: () => this.goHome(),
      onCloseWinGallery: () => this.closeWinGallery(),
      onCycleWinScene: (dir) => {
        this.view?.cycleWinScene(dir);
        if (this.browsingWins) this.noteWinGallery();
      },
      onResetBall: () => this.resetBall(),
      onNewMaze: () => this.newMaze(),
    };
  }

  private noteActivity(): void {
    if (this.phase !== "play" || this.awaitingStart) return;
    this.running = true;
    this.hud.hideHint();
  }

  private clearFall(): void {
    if (this.fallTimer === 0) return;
    window.clearTimeout(this.fallTimer);
    this.fallTimer = 0;
  }

  private onHomePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.home.isOpen() || this.intro.isOpen()) return;
    const action = this.playHud.hitTestHome(event.clientX, event.clientY);
    if (action) this.pickHome(action);
  };

  private onHomePointerMove = (event: PointerEvent): void => {
    if (!this.home.isOpen() || this.intro.isOpen()) return;
    const action = this.playHud.hitTestHome(event.clientX, event.clientY);
    this.playHud.setHomeHover(action);
    this.playHudCanvas.style.cursor = action ? "pointer" : "default";
  };
}
