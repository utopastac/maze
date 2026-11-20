import { Vector3, type Group, type PerspectiveCamera, type Scene } from "three";
import { clamp } from "../core/math.ts";
import { easeInOutCubic } from "./easing.ts";
import { EnterPlayCurtains } from "./enterPlayCurtains.ts";
import {
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
  private readonly pushEye = new Vector3();
  private readonly pushLook = new Vector3();
  private readonly doorPos = new Vector3();
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
    this.state = { kind, t: 0, swapped: false, crossed: false, fromFov, toFov, playSky: false };
  }

  needsSwap(): boolean {
    const ep = this.state;
    if (!ep || ep.swapped) return false;
    return ep.t >= ENTER_PLAY_SWAP;
  }

  /** Advance progress and part curtains post-cut. Returns true once t reaches 1. */
  advance(dt: number): boolean {
    const ep = this.state;
    if (!ep) return true;
    ep.t = Math.min(1, ep.t + dt / ENTER_PLAY_SECS);
    if (ep.crossed) {
      // Curtains part quickly so the distant board is readable, then the zoom owns the beat.
      const zoomU = (ep.t - ENTER_PLAY_SWAP) / Math.max(1e-4, 1 - ENTER_PLAY_SWAP);
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
    this.curtains.dispose();
    this.host.voidSky.setZoom(1);
  }

  /** Pose the camera for the current `state` (door approach, hatch swing, or post-cut dolly). */
  place(): void {
    const ep = this.state;
    if (!ep) return;
    const { camera } = this.host;
    this.placeTransition(ep, this.host.homeOrbit(), ep.toFov);

    camera.position.copy(this.eye);
    const down = this.eye.y - this.look.y;
    const side = Math.hypot(this.eye.x - this.look.x, this.eye.z - this.look.z);
    const topDown =
      ep.kind === "free"
      && !ep.crossed
      && down > 0.2
      && side < down * 0.08
      && this.doorOut.lengthSq() > 1e-6;
    if (topDown) {
      // Pin eye over the hatch and use a horizontal up so lookAt stays nadir.
      this.eye.x = this.look.x;
      this.eye.z = this.look.z;
      camera.position.copy(this.eye);
      camera.up.copy(this.doorOut);
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
    if (ep.crossed) {
      const u = (ep.t - ENTER_PLAY_SWAP) / Math.max(1e-4, 1 - ENTER_PLAY_SWAP);
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
      this.placeFreeTrap(ep, door, meadowY, orbit);
      return;
    }

    // Summit chamber is fixed on the tower — approach along its door-facing axis.
    const faceYaw = door ? Number(door.userData.doorYaw ?? door.rotation.y) : orbit;
    this.doorOut.set(Math.sin(faceYaw), 0, Math.cos(faceYaw));
    if (door) {
      door.getWorldPosition(this.doorPos);
      this.doorPos.y += Number(door.userData.doorCenterY ?? 0.22);
    } else {
      this.doorPos.set(this.doorOut.x * 0.2, meadowY + HOME_TOWER_H + 0.4, this.doorOut.z * 0.2);
    }
    this.doorEye.copy(this.doorPos).addScaledVector(this.doorOut, 0.2);
    this.doorEye.y += 0.02;
    this.doorLook.copy(this.doorPos).addScaledVector(this.doorOut, -0.02);

    const a = easeInOutCubic(Math.min(1, ep.t / ENTER_PLAY_SWAP));
    this.eye.lerpVectors(this.fromEye, this.doorEye, a);
    this.look.lerpVectors(this.fromLook, this.doorLook, a);
    // Widen so the door eats the frame by the cut.
    const doorFov = ep.fromFov + (72 - ep.fromFov) * (0.55 * a);
    this.applyLens(doorFov);
    voidSky.setZoom(1 + (ENTER_PLAY_SKY_ZOOM_DOOR - 1) * a);
  }

  /**
   * Swing around the storm tower on an outside arc, then settle dead-center
   * above the hatch looking straight down.
   */
  private placeFreeTrap(
    ep: EnterPlayState,
    door: Group | null,
    meadowY: number,
    orbit: number,
  ): void {
    const { doorPos, doorEye, doorLook, fromEye, fromLook } = this;
    if (door) {
      door.getWorldPosition(doorPos);
      doorPos.y += Number(door.userData.doorCenterY ?? 0.04);
    } else {
      doorPos.set(Math.sin(orbit) * 1.6, meadowY + 0.04, Math.cos(orbit) * 1.6);
    }
    // Final pose: dead-center above the hatch, looking straight down the -Y axis.
    doorLook.set(doorPos.x, doorPos.y - 0.04, doorPos.z);
    doorEye.set(doorPos.x, doorPos.y + 0.62, doorPos.z);
    // Screen-up aligns with world -Z so the axis-aligned hatch reads square.
    this.doorOut.set(0, 0, -1);

    const a = easeInOutCubic(Math.min(1, ep.t / ENTER_PLAY_SWAP));
    // Exact home pose as bezier start — polar remapping of look snapped away from
    // the tower-centered home aim on the first frame (resize → placeCamera at t=0).
    const fromYaw = Math.atan2(fromEye.x, fromEye.z);
    const hatchYaw = Math.atan2(doorPos.x, doorPos.z);
    let delta = hatchYaw - fromYaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const fromR = Math.hypot(fromEye.x, fromEye.z);
    const hatchR = Math.hypot(doorPos.x, doorPos.z);
    const clearR = Math.max(
      Number(door?.userData.clearRadius ?? 2.8),
      Math.min(fromR, hatchR) * 0.92,
    );
    const midR = Math.max(fromR, hatchR, clearR) * 1.18;
    const midYaw = fromYaw + delta * 0.5;
    const midY = fromEye.y * 0.55 + doorEye.y * 0.45 + clearR * 0.08;
    const midLookY = meadowY + Math.max(0.9, clearR * 0.18);
    const midLookR = Math.max(clearR * 1.05, (fromR + hatchR) * 0.45);

    const omt = 1 - a;
    const b0 = omt * omt;
    const b1 = 2 * omt * a;
    const b2 = a * a;
    // Cartesian quadratic: a=0 is exactly fromEye/fromLook (no polar snap).
    this.pushEye.set(
      fromEye.x * b0 + Math.sin(midYaw) * midR * b1 + doorEye.x * b2,
      fromEye.y * b0 + midY * b1 + doorEye.y * b2,
      fromEye.z * b0 + Math.cos(midYaw) * midR * b1 + doorEye.z * b2,
    );
    this.pushLook.set(
      fromLook.x * b0 + Math.sin(midYaw) * midLookR * b1 + doorLook.x * b2,
      fromLook.y * b0 + midLookY * b1 + doorLook.y * b2,
      fromLook.z * b0 + Math.cos(midYaw) * midLookR * b1 + doorLook.z * b2,
    );
    // Finish overhead early so the last beat is a settled top-down hold.
    const lock = a >= 0.88 ? 1 : easeInOutCubic(clamp((a - 0.3) / 0.58, 0, 1));
    this.eye.lerpVectors(this.pushEye, doorEye, lock);
    this.look.lerpVectors(this.pushLook, doorLook, lock);
    if (lock >= 1) {
      this.eye.copy(doorEye);
      this.look.copy(doorLook);
    }

    const doorFov = ep.fromFov + (58 - ep.fromFov) * (0.7 * a);
    this.applyLens(doorFov);
    this.host.voidSky.setZoom(1 + (ENTER_PLAY_SKY_ZOOM_DOOR - 1) * a);
  }

  private applyLens(fov: number): void {
    const { camera } = this.host;
    const next = clamp(fov, 18, 95);
    if (Math.abs(camera.fov - next) < 0.05) return;
    camera.fov = next;
    camera.updateProjectionMatrix();
  }
}
