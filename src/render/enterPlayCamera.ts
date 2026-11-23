import { Vector3, type Group, type PerspectiveCamera, type Scene } from "three";
import { clamp } from "../core/math.ts";
import { easeInOutCubic, easeInOutQuint } from "./easing.ts";
import { EnterPlayCurtains } from "./enterPlayCurtains.ts";
import {
  ENTER_FREE_SECS,
  ENTER_FREE_SWAP,
  ENTER_PLAY_CURTAIN,
  ENTER_PLAY_FAR,
  ENTER_PLAY_SECS,
  ENTER_PLAY_SKY_ZOOM_DOOR,
  ENTER_PLAY_SKY_ZOOM_PLAY,
  ENTER_PLAY_SWAP,
  HOME_TOWER_H,
} from "./homeEnterConstants.ts";
import type { VoidSky } from "./voidSky.ts";

export type EnterPlayKind = "tower" | "free";

export interface EnterPlayState {
  kind: EnterPlayKind;
  t: number;
  swapped: boolean;
  crossed: boolean;
  fromFov: number;
  toFov: number;
  /** Play sky active once curtains cover the cut. */
  playSky: boolean;
}

/** The slice of MazeWorld the enter-play camera needs. */
export interface EnterPlayHost {
  readonly camera: PerspectiveCamera;
  readonly scene: Scene;
  readonly voidSky: VoidSky;
  /** Play-orbit eye/look for the current tower (includes board rise offset). */
  computePlayCamera(outEye: Vector3, outLook: Vector3): void;
  /** Summit door (tower) or meadow trapdoor (free). */
  doorRoot(kind: EnterPlayKind): Group | null;
  /** World Y of the meadow floor. */
  meadowY(): number;
  homeOrbit(): number;
  /** Free-enter: warm sky + calm the home ocean (0 storm → 1 tropical). */
  setHomeTropicalMood(t: number): void;
}

function enterSecs(kind: EnterPlayKind): number {
  return kind === "free" ? ENTER_FREE_SECS : ENTER_PLAY_SECS;
}

function enterSwap(kind: EnterPlayKind): number {
  return kind === "free" ? ENTER_FREE_SWAP : ENTER_PLAY_SWAP;
}

/**
 * Owns the home → play camera beat: door approach / free-play hatch swing,
 * post-swap dolly from a distant orbit, lens + sky zoom, and the curtains.
 * World-side effects (lighting, board, lightning) stay in MazeWorld.
 */
export class EnterPlayController {
  state: EnterPlayState | null = null;

  /** Current camera pose written by `place()` (also used as scratch by MazeWorld). */
  readonly eye = new Vector3();
  readonly look = new Vector3();
  /** Door-facing axis; also screen-up for the top-down hatch shot. */
  readonly doorOut = new Vector3();

  private readonly fromEye = new Vector3();
  private readonly fromLook = new Vector3();
  private readonly toEye = new Vector3();
  private readonly toLook = new Vector3();
  private readonly doorEye = new Vector3();
  private readonly doorLook = new Vector3();
  private readonly highEye = new Vector3();
  private readonly doorPos = new Vector3();
  private readonly upWorld = new Vector3(0, 1, 0);
  /** 0 = Y-up, 1 = hatch-aligned screen-up — eased to avoid the nadir roll snap. */
  private freeUpBlend = 0;
  private readonly curtains: EnterPlayCurtains;
  private readonly host: EnterPlayHost;

  constructor(host: EnterPlayHost) {
    this.host = host;
    this.curtains = new EnterPlayCurtains(host.camera, host.scene);
  }

  begin(
    kind: EnterPlayKind,
    fromEye: Vector3,
    fromLook: Vector3,
    fromFov: number,
    toFov: number,
  ): void {
    this.fromEye.copy(fromEye);
    this.fromLook.copy(fromLook);
    this.freeUpBlend = 0;
    this.state = { kind, t: 0, swapped: false, crossed: false, fromFov, toFov, playSky: false };
  }

  needsSwap(): boolean {
    const ep = this.state;
    if (!ep || ep.swapped) return false;
    return ep.t >= enterSwap(ep.kind);
  }

  /** Advance progress and part curtains post-cut. Returns true once t reaches 1. */
  advance(dt: number): boolean {
    const ep = this.state;
    if (!ep) return true;
    ep.t = Math.min(1, ep.t + dt / enterSecs(ep.kind));
    if (ep.crossed) {
      const swap = enterSwap(ep.kind);
      // Curtains part quickly so the distant board is readable, then the zoom owns the beat.
      const zoomU = (ep.t - swap) / Math.max(1e-4, 1 - swap);
      this.curtains.sync(clamp(zoomU / ENTER_PLAY_CURTAIN, 0, 1));
    }
    return ep.t >= 1;
  }

  /**
   * Door has filled the frame: start from a pulled-back play orbit so the board
   * reads far away before we dolly in. Call after the play tower is mounted.
   */
  positionRevealCamera(): void {
    const ep = this.state;
    if (!ep) return;
    const { camera } = this.host;
    this.host.computePlayCamera(this.toEye, this.toLook);
    // Pull the eye back along the play orbit so curtains open onto a distant board.
    this.fromLook.copy(this.toLook);
    this.doorOut.subVectors(this.toEye, this.toLook);
    this.fromEye.copy(this.toLook).addScaledVector(this.doorOut, ENTER_PLAY_FAR);
    ep.fromFov = Math.min(72, ep.toFov + 14);
    this.eye.copy(this.fromEye);
    this.look.copy(this.fromLook);
    camera.up.set(0, 1, 0);
    camera.position.copy(this.eye);
    camera.lookAt(this.look);
    this.applyLens(ep.fromFov);
  }

  showCurtains(): void {
    this.curtains.ensure();
    this.curtains.sync(0);
  }

  /** Drop transition state, curtains, sky zoom, and camera roll. */
  release(): void {
    this.state = null;
    this.freeUpBlend = 0;
    this.curtains.dispose();
    this.host.voidSky.setZoom(1);
    this.host.setHomeTropicalMood(0);
    this.host.camera.up.set(0, 1, 0);
  }

  /** Pose the camera for the current `state` (door approach, hatch swing, or post-cut dolly). */
  place(): void {
    const ep = this.state;
    if (!ep) return;
    const { camera } = this.host;
    this.placeTransition(ep, this.host.homeOrbit(), ep.toFov);

    camera.position.copy(this.eye);
    if (ep.kind === "free" && !ep.crossed && this.doorOut.lengthSq() > 1e-6) {
      // Ease screen-up from world Y into hatch-aligned −Z — no binary roll snap.
      const b = easeInOutCubic(this.freeUpBlend);
      camera.up.copy(this.upWorld).lerp(this.doorOut, b).normalize();
    } else {
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(this.look);
  }

  /**
   * Approach the closed enter door until it fills the frame; after the cut,
   * dolly from a distant play orbit into the settled play camera.
   */
  private placeTransition(ep: EnterPlayState, orbit: number, playFov: number): void {
    const { voidSky } = this.host;
    const swap = enterSwap(ep.kind);
    if (ep.crossed) {
      const u = (ep.t - swap) / Math.max(1e-4, 1 - swap);
      const a = easeInOutCubic(clamp(u, 0, 1));
      this.host.computePlayCamera(this.toEye, this.toLook);
      this.eye.lerpVectors(this.fromEye, this.toEye, a);
      this.look.lerpVectors(this.fromLook, this.toLook, a);
      const fov = ep.fromFov + (playFov - ep.fromFov) * a;
      this.applyLens(fov);
      // Gradient eases in slower than the board dolly so scale reads as parallax.
      const skyA = easeInOutCubic(clamp(u, 0, 1));
      voidSky.setZoom(
        ENTER_PLAY_SKY_ZOOM_DOOR + (ENTER_PLAY_SKY_ZOOM_PLAY - ENTER_PLAY_SKY_ZOOM_DOOR) * skyA,
      );
      return;
    }

    const door = this.host.doorRoot(ep.kind);
    const meadowY = this.host.meadowY();

    if (ep.kind === "free") {
      this.placeFreeTrap(ep, door, meadowY, orbit, swap);
      return;
    }

    // Summit chamber is fixed on the tower — stop outside so the doors fill the frame.
    const faceYaw = door ? Number(door.userData.doorYaw ?? door.rotation.y) : orbit;
    this.doorOut.set(Math.sin(faceYaw), 0, Math.cos(faceYaw));
    const openingW = door ? Number(door.userData.doorOpeningW ?? 0.5) : 0.5;
    const openingH = door ? Number(door.userData.doorOpeningH ?? 0.55) : 0.55;
    if (door) {
      door.getWorldPosition(this.doorPos);
      // Root sits on the tip center — push out to the door leaves, not into the room.
      this.doorPos.addScaledVector(this.doorOut, Number(door.userData.doorFaceZ ?? 0));
      this.doorPos.y += Number(door.userData.doorCenterY ?? 0.22);
    } else {
      this.doorPos.set(this.doorOut.x * 0.2, meadowY + HOME_TOWER_H + 0.4, this.doorOut.z * 0.2);
    }

    const a = easeInOutCubic(Math.min(1, ep.t / swap));
    // Tighter lens so the closed doors can own the frame without crossing the threshold.
    const targetFov = 52;
    const doorFov = ep.fromFov + (targetFov - ep.fromFov) * a;
    // Stand-off from the final FOV so the stop point does not drift mid-approach.
    const half = (targetFov * Math.PI) / 360;
    const aspect = Math.max(this.host.camera.aspect, 0.6);
    const distH = (openingH * 0.5) / Math.max(1e-4, Math.tan(half));
    const distW = (openingW * 0.5) / Math.max(1e-4, Math.tan(half) * aspect);
    // Slightly under-fill height so door leaves + frame read; never go inside.
    const standOff = Math.max(distH, distW, openingH * 0.85) * 0.94;

    this.doorLook.copy(this.doorPos);
    this.doorEye.copy(this.doorPos).addScaledVector(this.doorOut, standOff);

    this.eye.lerpVectors(this.fromEye, this.doorEye, a);
    this.look.lerpVectors(this.fromLook, this.doorLook, a);
    this.applyLens(doorFov);
    voidSky.setZoom(1 + (ENTER_PLAY_SKY_ZOOM_DOOR - 1) * a);
  }

  /**
   * From the live home pose: skim low toward the islet so palms read, then arc
   * up above the hatch and dive in — no early sky lift.
   */
  private placeFreeTrap(
    ep: EnterPlayState,
    door: Group | null,
    meadowY: number,
    orbit: number,
    swap: number,
  ): void {
    const { doorPos, doorEye, doorLook, highEye, toEye, toLook, fromEye, fromLook } = this;
    if (door) {
      door.getWorldPosition(doorPos);
      doorPos.y += Number(door.userData.doorCenterY ?? 0.04);
    } else {
      doorPos.set(Math.sin(orbit) * 1.6, meadowY + 0.04, Math.cos(orbit) * 1.6);
    }
    // Close overhead pose — last beat before the curtain cut.
    doorLook.set(doorPos.x, doorPos.y - 0.04, doorPos.z);
    doorEye.set(doorPos.x, doorPos.y + 0.85, doorPos.z);
    // High sky pose — apex of the rise (never overshoot above this, then drop).
    highEye.set(doorPos.x, doorPos.y + HOME_TOWER_H * 0.7, doorPos.z);
    // Low island reveal — still approaching across the water, palms in frame.
    const backX = fromEye.x - doorPos.x;
    const backZ = fromEye.z - doorPos.z;
    const backLen = Math.hypot(backX, backZ) || 1;
    const skimDist = Math.min(HOME_TOWER_H * 0.38, backLen * 0.28);
    toEye.set(
      doorPos.x + (backX / backLen) * skimDist,
      meadowY + 1.25,
      doorPos.z + (backZ / backLen) * skimDist,
    );
    toLook.set(doorPos.x, meadowY + 0.55, doorPos.z);
    // Screen-up aligns with world -Z so the axis-aligned hatch reads square.
    this.doorOut.set(0, 0, -1);

    const a = clamp(ep.t / swap, 0, 1);
    // More time in approach: long low skim → short arc → dive.
    const riseEnd = 0.72;
    const skimEnd = 0.58; // of the rise segment — stay low past halfway
    const fovSkim = Math.min(58, Math.max(ep.fromFov, 42) + 6);
    const fovHigh = Math.min(66, Math.max(ep.fromFov, 52) + 10);
    const fovDive = 48;
    // Warm sky/sea as we near the islet, then hold through the dive.
    this.host.setHomeTropicalMood(easeInOutCubic(Math.min(1, a / (riseEnd * skimEnd))));

    if (a < riseEnd) {
      const u = a / riseEnd;
      if (u < skimEnd) {
        const t = easeInOutCubic(u / skimEnd);
        this.eye.lerpVectors(fromEye, toEye, t);
        this.look.lerpVectors(fromLook, toLook, t);
        this.freeUpBlend = 0;
        this.applyLens(ep.fromFov + (fovSkim - ep.fromFov) * t);
        this.host.voidSky.setZoom(1 + (ENTER_PLAY_SKY_ZOOM_DOOR - 1) * t * 0.2);
        return;
      }

      const arc = easeInOutQuint((u - skimEnd) / Math.max(1e-4, 1 - skimEnd));
      this.eye.lerpVectors(toEye, highEye, arc);
      this.look.lerpVectors(toLook, doorLook, arc);
      // Start rolling screen-up only once we leave the skim.
      this.freeUpBlend = easeInOutCubic(clamp((arc - 0.35) / 0.65, 0, 1));
      this.applyLens(fovSkim + (fovHigh - fovSkim) * arc);
      this.host.voidSky.setZoom(1 + (ENTER_PLAY_SKY_ZOOM_DOOR - 1) * (0.2 + 0.35 * arc));
      return;
    }

    const dive = easeInOutQuint((a - riseEnd) / Math.max(1e-4, 1 - riseEnd));
    this.eye.lerpVectors(highEye, doorEye, dive);
    this.look.copy(doorLook);
    this.freeUpBlend = 1;
    this.applyLens(fovHigh + (fovDive - fovHigh) * dive);
    this.host.voidSky.setZoom(
      1 + (ENTER_PLAY_SKY_ZOOM_DOOR - 1) * (0.55 + 0.45 * dive),
    );
  }

  private applyLens(fov: number): void {
    const { camera } = this.host;
    const next = clamp(fov, 18, 95);
    if (Math.abs(camera.fov - next) < 0.05) return;
    camera.fov = next;
    camera.updateProjectionMatrix();
  }
}
