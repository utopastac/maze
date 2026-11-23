import type { Campaign } from "../core/campaign.ts";
import type { AppRoute } from "../core/route.ts";
import type { Tower } from "../core/tower.ts";
import type { PlayHud, PlayHudHomeAction } from "../render/playHud.ts";
import type { LevelEditor, EditorMode } from "../ui/editor.ts";
import type { Home } from "../ui/home.ts";
import type { Hud } from "../ui/hud.ts";
import type { LevelSelect } from "../ui/levelSelect.ts";
import type { SavedLevelsPanel } from "../ui/savedLevels.ts";
import type { SettingsPanel } from "../ui/settingsPanel.ts";
import type { TowerIntro } from "../ui/towerIntro.ts";
import type { TowerPause } from "../ui/towerPause.ts";
import { setShellScreen, type ShellScreen } from "./appRouting.ts";

/** DOM / HUD panels the shell opens and closes. */
export type ShellMenuViews = {
  shell: HTMLElement;
  playHudCanvas: HTMLCanvasElement;
  home: Home;
  intro: TowerIntro;
  pause: TowerPause;
  settings: SettingsPanel;
  editor: LevelEditor;
  picker: LevelSelect;
  library: SavedLevelsPanel;
  hud: Hud;
  playHud: PlayHud;
};

/**
 * Play / world side effects menus need but do not own.
 * Keeps ShellMenus free of Simulation / MazeWorld imports.
 */
export type ShellMenuHost = {
  routeKind: () => AppRoute["kind"];
  awaitingStart: () => boolean;
  running: () => boolean;
  phaseIsPlay: () => boolean;
  canPause: () => boolean;
  practiceFromTower: () => boolean;
  setPracticeFromTower: (value: boolean) => void;
  settingsOverlay: () => boolean;
  setSettingsOverlay: (value: boolean) => void;
  goHome: () => void;
  setRoute: (route: AppRoute, replace?: boolean) => void;
  parkWorld: () => void;
  freezeForPause: () => void;
  pauseStats: () => Parameters<TowerPause["show"]>[0];
  closeWinGallery: (remount?: boolean) => void;
  releaseInput: () => void;
  stopRunning: () => void;
  restCamera: () => void;
  isHomeBackdrop: () => boolean;
  shouldLeaveHomeBackdrop: () => boolean;
  setHomeView: (view: "menu" | "tower") => void;
  enterHomeBackdrop: () => void;
  leaveHomeBackdrop: () => void;
  clearPlayReturn: () => void;
  authoredTower: () => Tower | null;
  blankAuthorTower: () => Tower;
  cloneAuthored: () => Tower;
  ensureAuthored: () => void;
  pickerCampaign: () => Campaign | null;
  setPickerCampaign: (campaign: Campaign) => void;
  sessionCampaign: () => Campaign | null;
  generatePickerCampaign: () => Campaign;
  settingsReturnTarget: () => AppRoute;
  hasLiveSim: () => boolean;
  reopenPauseAfterSettings: () => void;
  finishEditingExtras: (returnHome: boolean) => void;
  /** After pause UI hides — clear notes / resume run. */
  onPauseClosed: () => void;
};

/**
 * Owns menu open/close choreography so App stays on play session + routing.
 * Concurrent agents: edit this file for DOM shell flows; leave App for sim/frame.
 */
export class ShellMenus {
  private readonly views: ShellMenuViews;
  private readonly host: ShellMenuHost;

  constructor(views: ShellMenuViews, host: ShellMenuHost) {
    this.views = views;
    this.host = host;
  }

  setShellScreen(kind: ShellScreen): void {
    setShellScreen(this.views.shell, kind);
  }

  leaveMenuScreens(shatterHome = false): void {
    this.closeHome(shatterHome);
    this.closeTowerIntro(false);
    this.hideSettingsOverlay();
    this.closeSettingsScreen(false);
    this.closeSavedLevels(false);
    this.hideEditor();
  }

  closeAllMenus(showHint: boolean): void {
    this.closePause();
    this.closeTowerIntro(false);
    this.closeLevelSelect(false);
    this.closeSavedLevels(false);
    this.hideSettingsOverlay();
    this.closeSettingsScreen(false);
    this.host.closeWinGallery(false);
    this.hideEditor();
    if (
      showHint
      && !this.host.awaitingStart()
      && !this.host.running()
      && this.host.phaseIsPlay()
    ) {
      this.views.hud.showHint();
    }
  }

  private hideEditor(): void {
    if (!this.views.editor.isOpen()) return;
    this.views.editor.hide();
    this.views.hud.setEditSelected(false);
    this.views.hud.setAuthorSelected(false);
  }

  openHome(): void {
    this.closeAllMenus(false);
    this.closeTowerIntro(false);
    this.host.parkWorld();
    // Hash sync is App's job via replaceHash before/after; shell only paints.
    this.setShellScreen("home");
    this.views.home.show();
    this.views.home.setMode("main");
    if (this.host.isHomeBackdrop()) this.host.setHomeView("menu");
    else this.host.enterHomeBackdrop();
    this.views.playHud.setVisible(true);
    this.views.playHud.setHomeMenu(false);
    this.views.playHudCanvas.style.cursor = "";
  }

  closeHome(_shatter = false): void {
    if (!this.views.home.isOpen()) return;
    this.closeTowerLoadModal();
    this.views.playHud.setHomeMenu(false);
    this.views.home.hide();
    this.views.playHud.setHomeHover(null);
    this.views.playHudCanvas.style.cursor = "";
    if (this.host.shouldLeaveHomeBackdrop()) this.host.leaveHomeBackdrop();
  }

  pickHome(action: PlayHudHomeAction): boolean {
    if (!this.views.home.isOpen()) return false;
    switch (action) {
      case "tower":
        this.host.setRoute({ kind: "tower" });
        break;
      case "towerBack":
        this.host.goHome();
        break;
      case "play":
        this.host.setRoute({ kind: "play" });
        break;
      case "create":
        this.closeHome();
        this.host.setRoute({ kind: "create" });
        break;
      case "saved":
        this.closeHome();
        this.host.setRoute({ kind: "saved" });
        break;
      case "settings":
        this.closeHome();
        this.host.setRoute({ kind: "settings" });
        break;
      default:
        return false;
    }
    return true;
  }

  openTowerScreen(): void {
    this.closeAllMenus(false);
    this.closeTowerLoadModal();
    if (!this.views.home.isOpen() || !this.host.isHomeBackdrop()) {
      this.host.parkWorld();
      this.views.home.show();
      this.host.enterHomeBackdrop();
    }
    this.setShellScreen("home");
    this.views.home.setMode("tower");
    this.host.setHomeView("tower");
    this.views.playHud.setVisible(true);
    this.views.playHud.setHomeMenu(false);
    this.views.playHudCanvas.style.cursor = "";
  }

  closeTowerIntro(returnHome = true): void {
    if (!this.views.intro.isOpen()) return;
    const wasModal = this.views.intro.isModal();
    this.views.intro.hide();
    if (wasModal) return;
    if (returnHome && this.host.routeKind() === "tower") {
      this.host.goHome();
    }
  }

  openTowerLoadModal(): void {
    this.views.intro.showLoadModal();
  }

  closeTowerLoadModal(): void {
    if (!this.views.intro.isModal()) return;
    this.views.intro.hide();
  }

  openPracticeSelect(): void {
    this.host.setPracticeFromTower(true);
    this.closeTowerIntro(false);
    this.openLevelSelect();
  }

  openLevelSelect(): void {
    if (this.views.picker.isOpen()) return;
    this.hideEditor();
    this.closeHome();
    this.closePause();
    if (!this.host.practiceFromTower()) this.closeTowerIntro(false);
    this.closeSavedLevels(false);
    this.closeSettingsScreen(false);
    this.host.closeWinGallery(false);
    this.host.releaseInput();
    this.host.stopRunning();
    const campaign = this.host.sessionCampaign()
      ?? this.host.pickerCampaign()
      ?? this.host.generatePickerCampaign();
    this.host.setPickerCampaign(campaign);
    this.views.picker.show(campaign, { practice: this.host.practiceFromTower() });
    this.views.hud.hideHint();
  }

  closeLevelSelect(restore = true): void {
    if (!this.views.picker.isOpen()) return;
    this.views.picker.hide();
    if (!restore) {
      this.host.setPracticeFromTower(false);
      return;
    }
    if (this.host.practiceFromTower()) {
      this.host.setPracticeFromTower(false);
      this.host.setRoute({ kind: "tower" }, true);
      return;
    }
    if (
      !this.views.home.isOpen()
      && !this.host.awaitingStart()
      && !this.host.running()
      && this.host.phaseIsPlay()
    ) {
      this.views.hud.showHint();
    }
  }

  openSavedScreen(): void {
    this.closeAllMenus(false);
    this.closeHome();
    this.host.parkWorld();
    this.host.clearPlayReturn();
    this.views.playHud.setVisible(false);
    this.setShellScreen("saved");
    this.views.library.show();
  }

  closeSavedLevels(returnHome = true): void {
    if (!this.views.library.isOpen()) return;
    this.views.library.hide();
    if (returnHome && this.host.routeKind() === "saved") {
      this.host.goHome();
    }
  }

  openCreateScreen(): void {
    this.closeAllMenus(false);
    this.closeHome();
    this.host.parkWorld();
    this.host.clearPlayReturn();
    this.views.playHud.setVisible(false);
    this.setShellScreen("create");
    this.host.ensureAuthored();
    this.views.editor.open(this.host.cloneAuthored(), "share");
    this.views.hud.setEditSelected(true);
    this.views.hud.setAuthorSelected(false);
  }

  openEditor(mode: EditorMode): boolean {
    if (this.views.editor.isOpen()) return false;
    if (mode === "share" && !this.host.authoredTower()) return false;
    this.closeHome();
    this.closePause();
    this.closeTowerIntro(false);
    this.closeLevelSelect(false);
    this.closeSavedLevels(false);
    this.closeSettingsScreen(false);
    this.host.closeWinGallery();
    this.host.releaseInput();
    this.host.restCamera();
    const tower = mode === "campaign"
      ? (this.host.authoredTower() ? this.host.cloneAuthored() : this.host.blankAuthorTower())
      : this.host.cloneAuthored();
    this.views.editor.open(tower, mode);
    this.views.hud.setEditSelected(mode === "share");
    this.views.hud.setAuthorSelected(mode === "campaign");
    this.views.hud.hideHint();
    this.views.playHud.setVisible(false);
    return true;
  }

  finishEditing(returnHome = true): void {
    if (this.views.editor.isOpen()) this.views.editor.hide();
    this.views.hud.setEditSelected(false);
    this.views.hud.setAuthorSelected(false);
    this.views.playHud.setVisible(true);
    this.host.finishEditingExtras(returnHome);
  }

  openPause(): boolean {
    if (!this.host.canPause()) return false;
    if (this.views.pause.isOpen()) return false;
    if (this.views.editor.isOpen()) {
      this.views.editor.hide();
      this.finishEditing(false);
    }
    this.closeLevelSelect(false);
    this.closeSavedLevels(false);
    this.hideSettingsOverlay();
    this.closeTowerIntro(false);
    this.host.closeWinGallery(false);
    this.host.freezeForPause();
    this.views.pause.show(this.host.pauseStats());
    return true;
  }

  closePause(): void {
    if (!this.views.pause.isOpen()) return;
    this.views.pause.hide();
    this.host.onPauseClosed();
  }

  leaveSettings(): void {
    if (this.host.settingsOverlay()) {
      this.hideSettingsOverlay();
      this.views.playHud.setVisible(this.host.hasLiveSim());
      this.host.reopenPauseAfterSettings();
      return;
    }
    const dest = this.host.settingsReturnTarget();
    this.closeSettingsScreen(false);
    this.host.setRoute(dest);
  }

  toggleSettings(): void {
    if (
      this.views.settings.isOpen()
      || this.host.routeKind() === "settings"
      || this.host.settingsOverlay()
    ) {
      this.leaveSettings();
      return;
    }
    if (this.host.canPause() || this.views.pause.isOpen()) {
      this.openSettingsFromPause();
      return;
    }
    this.host.setRoute({ kind: "settings" });
  }

  openSettingsScreen(): void {
    this.host.setSettingsOverlay(false);
    delete this.views.shell.dataset.settings;
    this.closeAllMenus(false);
    this.closeHome();
    this.host.parkWorld();
    this.host.clearPlayReturn();
    this.views.playHud.setVisible(false);
    this.setShellScreen("settings");
    this.views.hud.setSettingsSelected(true);
    this.views.settings.show();
  }

  openSettingsFromPause(): void {
    if (!this.host.hasLiveSim() && !this.views.pause.isOpen()) {
      this.host.setRoute({ kind: "settings" });
      return;
    }
    if (this.views.pause.isOpen()) this.views.pause.hide();
    else if (this.host.canPause()) this.host.freezeForPause();
    else {
      this.host.setRoute({ kind: "settings" });
      return;
    }
    this.host.setSettingsOverlay(true);
    this.views.shell.dataset.settings = "overlay";
    this.closeLevelSelect(false);
    this.host.closeWinGallery(false);
    this.views.playHud.setVisible(false);
    this.views.hud.setSettingsSelected(true);
    this.views.settings.show();
  }

  hideSettingsOverlay(): void {
    const wasOverlay = this.host.settingsOverlay();
    this.host.setSettingsOverlay(false);
    delete this.views.shell.dataset.settings;
    if (!wasOverlay) return;
    if (this.views.settings.isOpen()) this.views.settings.hide();
    this.views.hud.setSettingsSelected(false);
  }

  closeSettingsScreen(returnToPrevious = true): void {
    if (this.host.settingsOverlay()) {
      if (returnToPrevious) this.leaveSettings();
      else this.hideSettingsOverlay();
      return;
    }
    if (!this.views.settings.isOpen()) return;
    this.views.settings.hide();
    this.views.hud.setSettingsSelected(false);
    if (returnToPrevious && this.host.routeKind() === "settings") {
      this.leaveSettings();
    }
  }
}
