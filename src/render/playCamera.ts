import { Quaternion, Vector3, type Object3D } from "three";
import { MEADOW_DROP, type TowerLayout } from "../core/layout.ts";
import { clamp } from "../core/math.ts";
import { SETTING_SPECS, type PlaySettings } from "../core/playSettings.ts";
import { easeInOutCubic, easeOutCubic, wrapDegrees } from "./easing.ts";
import { HOME_TOWER_H } from "./homeEnterConstants.ts";

const ANGLE_SPEC = SETTING_SPECS.find((spec) => spec.key === "angle");
export const PLAY_ANGLE_MIN = ANGLE_SPEC?.min ?? 22;
export const PLAY_ANGLE_MAX = ANGLE_SPEC?.max ?? 80;
export const MEADOW_GLANCE_PITCH_MIN = -28;
export const MEADOW_GLANCE_PITCH_MAX = 88;
export const MEADOW_CAM_SECS = 1.25;
export const MEADOW_EYE_MIN = 0.55;

export function playAngleFromSettings(settings: PlaySettings | null): number {
  return settings?.values.angle ?? 46.5;
}

export function playOrbitFromSettings(settings: PlaySettings | null): number {
  return settings?.values.orbit ?? 0;
}

export function shownPlayAngle(settings: PlaySettings | null, glanceDAngle: number): number {
  return playAngleFromSettings(settings) + glanceDAngle;
}

export function shownPlayOrbit(settings: PlaySettings | null, glanceDOrbit: number): number {
  return wrapDegrees(playOrbitFromSettings(settings) + glanceDOrbit);
}

export interface PlayOrbitCameraInput {
  tower: TowerLayout | null;
  focusY: number;
  board: Object3D;
  lowest: number;
  escaped: boolean;
  aspect: number;
  settings: PlaySettings | null;
  angleDeg: number;
  orbitDeg: number;
  fovDeg: number;
  fallbackEye: Vector3;
}

/** Play-orbit eye/look for the current tower (includes board rise offset). */
export function computePlayOrbitCamera(
  outEye: Vector3,
  outLook: Vector3,
  input: PlayOrbitCameraInput,
): void {
  const tower = input.tower;
  if (!tower) {
    outEye.copy(input.fallbackEye);
    outLook.set(0, input.focusY, 0);
    return;
  }
  const low = input.escaped ? 0 : input.lowest;
  const span = Math.max(tower.width, tower.depth) + Math.abs(low) * 0.28;
  const zoom = input.settings?.values.zoom ?? 1;
  const angle = (input.angleDeg * Math.PI) / 180;
  const orbit = (input.orbitDeg * Math.PI) / 180;
  const fov = (input.fovDeg * Math.PI) / 180;
  const half = Math.tan(fov / 2);
  const fill = 1.22;
  const distForHeight = (span * fill) / (2 * half);
  const distForWidth = (span * fill) / (2 * half * Math.max(input.aspect, 0.6));
  const fitted = Math.max(distForHeight, distForWidth) * 1.22;
  const radius = (fitted * Math.hypot(0.74, 0.7)) / Math.max(zoom, 0.2);
  const horizontal = radius * Math.cos(angle);
  outLook.set(0, input.focusY, 0).applyQuaternion(input.board.quaternion);
  const aim = span * 0.04;
  outLook.x += aim * Math.sin(orbit);
  outLook.z += aim * Math.cos(orbit);
  outLook.add(input.board.position);
  outEye.set(
    outLook.x + horizontal * Math.sin(orbit),
    outLook.y + radius * Math.sin(angle),
    outLook.z + horizontal * Math.cos(orbit),
  );
}

/** Orbit / pitch glance offsets applied on top of settings while playing or on home/meadow. */
export class PlayCameraGlance {
  glanceDAngle = 0;
  glanceDOrbit = 0;
  private glanceReturn = false;

  rest(): void {
    this.glanceDAngle = 0;
    this.glanceDOrbit = 0;
    this.glanceReturn = false;
  }

  meadowUpDown(): { up: number; down: number } {
    const up = clamp(this.glanceDAngle / MEADOW_GLANCE_PITCH_MAX, 0, 1);
    const down = clamp(-this.glanceDAngle / Math.abs(MEADOW_GLANCE_PITCH_MIN), 0, 1);
    return { up, down };
  }

  nudgeMeadow(dAngle: number, dOrbit: number): void {
    if (dAngle === 0 && dOrbit === 0) return;
    this.glanceDAngle = clamp(
      this.glanceDAngle + dAngle,
      MEADOW_GLANCE_PITCH_MIN,
      MEADOW_GLANCE_PITCH_MAX,
    );
    this.glanceDOrbit = wrapDegrees(this.glanceDOrbit + dOrbit);
    this.glanceReturn = false;
    if (Math.abs(this.glanceDAngle) < 0.05 && Math.abs(this.glanceDOrbit) < 0.05) this.rest();
  }

  nudgePlay(dAngle: number, dOrbit: number, playAngle: number): void {
    if (dAngle === 0 && dOrbit === 0) return;
    const nextAngle = clamp(playAngle + this.glanceDAngle + dAngle, PLAY_ANGLE_MIN, PLAY_ANGLE_MAX);
    this.glanceDAngle = nextAngle - playAngle;
    this.glanceDOrbit = wrapDegrees(this.glanceDOrbit + dOrbit);
    this.glanceReturn = false;
    if (Math.abs(this.glanceDAngle) < 0.05 && Math.abs(this.glanceDOrbit) < 0.05) this.rest();
  }

  recall(reduceMotion: boolean): void {
    if (this.glanceDAngle === 0 && this.glanceDOrbit === 0) return;
    if (reduceMotion) {
      this.rest();
      return;
    }
    this.glanceReturn = true;
  }

  step(dt: number): void {
    if (!this.glanceReturn) return;
    if (Math.abs(this.glanceDAngle) < 0.12 && Math.abs(this.glanceDOrbit) < 0.12) {
      this.rest();
      return;
    }
    const k = 1 - Math.exp(-4.5 * dt);
    this.glanceDAngle += (0 - this.glanceDAngle) * k;
    this.glanceDOrbit = wrapDegrees(this.glanceDOrbit + (0 - this.glanceDOrbit) * k);
  }
}

export interface HomeBackdropCameraScratch {
  homeViewEye: Vector3;
  homeViewLook: Vector3;
  meadowCamEye: Vector3;
  meadowCamLook: Vector3;
}

export function placeHomeBackdropCamera(
  outEye: Vector3,
  outLook: Vector3,
  scratch: HomeBackdropCameraScratch,
  opts: {
    tower: TowerLayout;
    meadowY: number;
    homeOrbit: number;
    glance: PlayCameraGlance;
    homeView: "menu" | "tower";
    homeViewBlend: number;
    homeViewFromEye: Vector3;
    homeViewFromLook: Vector3;
    boardQuat: Quaternion;
  },
): void {
  const orbit = opts.homeOrbit + (opts.glance.glanceDOrbit * Math.PI) / 180;
  const { up, down } = opts.glance.meadowUpDown();

  if (opts.homeView === "tower") {
    const lookY = opts.meadowY + HOME_TOWER_H * (1.02 + up * 0.03 - down * 0.03);
    const eyeY = opts.meadowY + HOME_TOWER_H * (1.14 + up * 0.08 - down * 0.05);
    const dist = HOME_TOWER_H * (0.28 + up * 0.08 - down * 0.03);
    const rightX = Math.cos(orbit);
    const rightZ = -Math.sin(orbit);
    const lookOff = HOME_TOWER_H * 0.16;
    const side = HOME_TOWER_H * 0.04;
    scratch.homeViewLook.set(rightX * lookOff, lookY, rightZ * lookOff);
    scratch.homeViewEye.set(
      Math.sin(orbit) * dist + rightX * side,
      eyeY,
      Math.cos(orbit) * dist + rightZ * side,
    );
  } else {
    const lookY = opts.meadowY + HOME_TOWER_H * (0.34 + up * 0.14 - down * 0.08);
    const eyeY = opts.meadowY + 0.85 + down * 0.35 + up * 0.55;
    const dist = HOME_TOWER_H * (0.72 + up * 0.3 - down * 0.06);
    scratch.homeViewLook.set(0, lookY, 0);
    scratch.homeViewEye.set(Math.sin(orbit) * dist, eyeY, Math.cos(orbit) * dist);
    scratch.homeViewEye.y = Math.max(scratch.homeViewEye.y, opts.meadowY + 0.55);
  }

  scratch.homeViewEye.applyQuaternion(opts.boardQuat);
  scratch.homeViewLook.applyQuaternion(opts.boardQuat);

  const t = easeInOutCubic(opts.homeViewBlend);
  if (t < 1) {
    outEye.lerpVectors(opts.homeViewFromEye, scratch.homeViewEye, t);
    outLook.lerpVectors(opts.homeViewFromLook, scratch.homeViewLook, t);
  } else {
    outEye.copy(scratch.homeViewEye);
    outLook.copy(scratch.homeViewLook);
  }
}

export interface MeadowWinCameraScratch {
  meadowCamEye: Vector3;
  meadowCamLook: Vector3;
  meadowCamLookBlend: Vector3;
}

export function placeMeadowWinCamera(
  outEye: Vector3,
  outLook: Vector3,
  scratch: MeadowWinCameraScratch,
  opts: {
    tower: TowerLayout;
    meadowY: number;
    glance: PlayCameraGlance;
    meadowCamT: number;
    meadowCamFromPos: Vector3;
    meadowCamFromLook: Vector3;
    boardQuat: Quaternion;
    spanMult: number;
  },
): void {
  const span = Math.max(opts.tower.width, opts.tower.depth) * opts.spanMult;
  const orbit = (opts.glance.glanceDOrbit * Math.PI) / 180;
  const lookY = opts.meadowY + Math.max(1.1, span * 0.09);
  const lookZ = -span * 0.22;
  scratch.meadowCamLook.set(0, lookY, lookZ);

  const { up, down } = opts.glance.meadowUpDown();
  const baseElev = (18 * Math.PI) / 180;
  const elev = baseElev + up * ((18 * Math.PI) / 180) - down * ((16 * Math.PI) / 180);
  const dist = span * (1.35 + up * 1.1 - down * 0.2);
  const floorGap = opts.meadowY + MEADOW_EYE_MIN - lookY;
  const minElev = floorGap >= dist
    ? Math.PI / 2
    : floorGap <= -dist
      ? -Math.PI / 2
      : Math.asin(floorGap / dist);
  const safeElev = Math.max(elev, minElev + 0.02);
  const cosE = Math.cos(safeElev);
  const sinE = Math.sin(safeElev);
  scratch.meadowCamEye.set(
    Math.sin(orbit) * cosE * dist,
    lookY + sinE * dist,
    lookZ + Math.cos(orbit) * cosE * dist,
  );
  scratch.meadowCamEye.y = Math.max(scratch.meadowCamEye.y, opts.meadowY + MEADOW_EYE_MIN);
  scratch.meadowCamEye.applyQuaternion(opts.boardQuat);
  scratch.meadowCamLook.applyQuaternion(opts.boardQuat);

  const t = easeOutCubic(opts.meadowCamT);
  outEye.lerpVectors(opts.meadowCamFromPos, scratch.meadowCamEye, t);
  scratch.meadowCamLookBlend.lerpVectors(opts.meadowCamFromLook, scratch.meadowCamLook, t);
  outLook.copy(scratch.meadowCamLookBlend);
}

/** World Y of the meadow floor when the meadow group is absent. */
export function defaultMeadowY(): number {
  return -MEADOW_DROP;
}