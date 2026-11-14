import RAPIER from "@dimforge/rapier3d-compat";
import {
  BALL_R,
  CELL,
  FRAME_GUARD,
  GOAL_REACH,
  PIT_WELL,
  SPAWN_Y,
  WALL,
  isSolid,
  type MazeLayout,
  type PieceKind,
  type TowerLayout,
} from "./layout.ts";
import { DIRECTION_VECTOR } from "./maze.ts";
import { conjugate, quatFromTilt, rotateVec, type Quat, type Vec3 } from "./math.ts";
import type { PlaySettings } from "./playSettings.ts";

const STEP = 1 / 90;
const MAX_STEPS = 5;
const FALL_Y = -0.08;
const VOID_Y = -(PIT_WELL + BALL_R);
const GOAL_SPEED = 1.7;
const HATCH_REACH = (CELL - WALL) * 0.46;
const TILE_Y = BALL_R + 0.26;
const BOOST_ACCEL = 34;
const STICK_LIFT = 0.035;
const STICK_SINK = 0.02;
const CRUMBLE_HOLD = 0.7;
const SWITCH_SPEED = 1.15;
const ICE_DAMP = 0.08;

type WarpExit = { key: string; x: number; z: number };

type Surface = {
  collider: RAPIER.Collider;
  kind: PieceKind;
  floor: number;
  cell?: string;
  gate?: string;
};

export interface CrumbleView {
  cell: string;
  progress: number;
  gone: boolean;
}

export interface Pose {
  board: Quat;
  ballPosition: Vec3;
  ballRotation: Quat;
  crumbles: CrumbleView[];
  gates: string[];
}

export type SimEvent = "none" | "fell" | "goal" | "descend";

let ready: Promise<void> | null = null;

export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

export class Simulation {
  private readonly world: RAPIER.World;
  private readonly board: RAPIER.RigidBody;
  private readonly ball: RAPIER.RigidBody;
  private layout: MazeLayout;
  private readonly levels: MazeLayout[];
  private readonly story: number;
  private active = 0;
  private fallingThrough = false;
  private sentDescend = false;
  private fallShield = 0;
  private readonly boardRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly ballPos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly ballRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly lin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly surfaces: Surface[] = [];
  private readonly ballCollider: RAPIER.Collider;
  private acc = 0;
  private appliedPitch = 0;
  private appliedRoll = 0;
  private goalTime = 0;
  private maxSpeed = 6.2;
  private readonly cols: number;
  private readonly rows: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly boostDir = new Map<string, { x: number; z: number }>();
  private readonly warpTo = new Map<string, WarpExit>();
  private readonly holes = new Set<string>();
  private readonly ice = new Set<string>();
  private readonly crumbles = new Set<string>();
  private readonly crumbleTime = new Map<string, number>();
  private readonly crumbleGone = new Set<string>();
  private readonly switches = new Map<string, string>();
  private readonly openGates = new Set<string>();
  private damping = 0.55;
  private onIce = false;
  private warpGrace = "";
  private boosting = false;
  private dropping = false;
  private dropSettled = false;
  private dropReported = false;
  private dropX = 0;
  private dropZ = 0;
  private dropY = 0;
  private dropVy = 0;
  private aimX = 0;
  private aimZ = 0;

  constructor(layout: TowerLayout, settings: PlaySettings) {
    const first = layout.floors[0];
    if (!first) throw new Error("A tower needs a floor.");
    this.levels = layout.floors;
    this.layout = first;
    this.story = layout.story;
    this.cols = first.cols;
    this.rows = first.rows;
    this.originX = -first.width / 2;
    this.originZ = -first.depth / 2;
    this.indexTiles(first);
    this.world = new RAPIER.World({ x: 0, y: -settings.values.gravity, z: 0 });
    this.world.timestep = STEP;
    this.world.integrationParameters.numSolverIterations = 8;

    this.board = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    for (let floor = 0; floor < layout.floors.length; floor += 1) {
      const level = layout.floors[floor];
      if (!level) continue;
      const drop = -floor * layout.story;
      for (const piece of level.pieces) {
        if (!isSolid(piece.kind)) continue;
        const guard = piece.kind === "frame" ? FRAME_GUARD : 0;
        const desc = RAPIER.ColliderDesc.cuboid(piece.hx, piece.hy + guard / 2, piece.hz)
          .setTranslation(piece.x, piece.y + guard / 2 + drop, piece.z);
        const collider = this.world.createCollider(desc, this.board);
        if (piece.kind === "ice") collider.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
        this.surfaces.push({ collider, kind: piece.kind, floor, cell: piece.cell, gate: piece.gate });
      }
    }

    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(first.start.x, SPAWN_Y, first.start.z)
        .setCcdEnabled(true)
        .setSoftCcdPrediction(0.12)
        .setCanSleep(true),
    );
    this.ballCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_R)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setDensity(1.4),
      this.ball,
    );
    this.apply(settings);
  }

  apply(settings: PlaySettings): void {
    const values = settings.values;
    this.world.gravity = { x: 0, y: -values.gravity, z: 0 };
    this.damping = values.damping;
    this.ball.setLinearDamping(values.damping * (this.onIce ? ICE_DAMP : 1));
    this.ball.setAngularDamping(values.damping * 0.51 * (this.onIce ? 0.25 : 1));
    this.maxSpeed = 3.2 + values.gravity * 0.125;
    this.ballCollider.setFriction(0.45 * values.grip);
    this.ballCollider.setRestitution(0);
    for (const surface of this.surfaces) {
      const material = materialFor(surface.kind, values.grip);
      surface.collider.setFriction(material.friction);
      surface.collider.setRestitution(0);
    }
    this.ball.wakeUp();
  }

  update(dt: number, pitch: number, roll: number): SimEvent {
    if (Math.abs(pitch - this.appliedPitch) > 0.0008 || Math.abs(roll - this.appliedRoll) > 0.0008) {
      this.ball.wakeUp();
    }

    this.acc += Math.min(dt, 0.05);
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.acc -= STEP;
      steps += 1;
    }
    if (steps === 0) return "none";

    const fromPitch = this.appliedPitch;
    const fromRoll = this.appliedRoll;
    let fell = false;
    for (let i = 1; i <= steps; i += 1) {
      const blend = i / steps;
      this.appliedPitch = fromPitch + (pitch - fromPitch) * blend;
      this.appliedRoll = fromRoll + (roll - fromRoll) * blend;
      this.board.setNextKinematicRotation(quatFromTilt(this.appliedPitch, this.appliedRoll));
      this.world.step();
      if (this.dropping) {
        this.advanceDrop();
        if (this.dropSettled && !this.dropReported) {
          this.dropReported = true;
          fell = true;
        }
      } else {
        this.applyTiles();
        this.stick();
        this.limitSpeed();
        this.contain();
        if (this.fallingThrough) this.guideToLanding();
        if (this.fallShield > 0) this.fallShield = Math.max(0, this.fallShield - STEP);
        const local = this.localBall();
        if (local.y < FALL_Y && this.fallShield <= 0 && this.canFall(local)) {
          if (!this.fallingThrough && this.inHatch(local)) this.fallingThrough = true;
          if (!this.fallingThrough) this.beginDrop(local);
        }
      }
    }

    if (this.fallingThrough) return this.trackDescent();
    if (fell) {
      this.goalTime = 0;
      return "fell";
    }
    return this.updateGoal(steps * STEP);
  }

  pose(): Pose {
    this.board.rotation(this.boardRot);
    this.ball.translation(this.ballPos);
    this.ball.rotation(this.ballRot);
    return {
      board: { x: this.boardRot.x, y: this.boardRot.y, z: this.boardRot.z, w: this.boardRot.w },
      ballPosition: { x: this.ballPos.x, y: this.ballPos.y, z: this.ballPos.z },
      ballRotation: { x: this.ballRot.x, y: this.ballRot.y, z: this.ballRot.z, w: this.ballRot.w },
      crumbles: [...this.crumbles].map((cell) => ({
        cell,
        progress: Math.min(1, (this.crumbleTime.get(cell) ?? 0) / CRUMBLE_HOLD),
        gone: this.crumbleGone.has(cell),
      })),
      gates: [...this.openGates],
    };
  }

  hold(): void {
    this.ball.setGravityScale(0, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  resetBall(): void {
    this.board.rotation(this.boardRot);
    const placed = rotateVec(this.boardRot, {
      x: this.layout.start.x,
      y: SPAWN_Y,
      z: this.layout.start.z,
    });
    this.ball.setGravityScale(1, true);
    this.ball.setTranslation(placed, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.goalTime = 0;
    this.warpGrace = "";
    this.boosting = false;
    this.fallingThrough = false;
    this.sentDescend = false;
    this.fallShield = 0;
    this.restoreTiles();
    this.clearDrop();
  }

  dropTop(): void {
    const gone = this.active;
    for (let i = this.surfaces.length - 1; i >= 0; i -= 1) {
      const surface = this.surfaces[i];
      if (!surface || surface.floor !== gone) continue;
      this.world.removeCollider(surface.collider, true);
      this.surfaces.splice(i, 1);
    }
    this.active += 1;
    const next = this.levels[this.active];
    if (next) {
      this.layout = next;
      this.indexTiles(next);
      this.crumbleTime.clear();
      this.crumbleGone.clear();
      this.openGates.clear();
      this.onIce = false;
      this.ball.setLinearDamping(this.damping);
      this.ball.setAngularDamping(this.damping * 0.51);
    }
    this.goalTime = 0;
    this.warpGrace = "";
    this.boosting = false;
    this.fallingThrough = false;
    this.sentDescend = false;
    this.clearDrop();
    this.ball.wakeUp();
  }

  shift(dy: number): void {
    for (const surface of this.surfaces) {
      const at = surface.collider.translationWrtParent();
      if (!at) continue;
      surface.collider.setTranslationWrtParent({ x: at.x, y: at.y + dy, z: at.z });
    }
    this.placeAtStart();
    this.fallShield = 0.4;
  }

  dispose(): void {
    this.world.free();
  }

  private indexTiles(layout: MazeLayout): void {
    this.boostDir.clear();
    this.warpTo.clear();
    this.holes.clear();
    this.ice.clear();
    this.crumbles.clear();
    this.switches.clear();
    for (const boost of layout.boosts) {
      this.boostDir.set(`${boost.c},${boost.r}`, DIRECTION_VECTOR[boost.dir]);
    }
    for (const hole of layout.holes) this.holes.add(hole);
    const grouped = new Map<number, WarpExit[]>();
    for (const warp of layout.warps) {
      const list = grouped.get(warp.pair) ?? [];
      list.push({ key: `${warp.c},${warp.r}`, x: warp.x, z: warp.z });
      grouped.set(warp.pair, list);
    }
    for (const list of grouped.values()) {
      const a = list[0];
      const b = list[1];
      if (!a || !b || list.length !== 2) continue;
      this.warpTo.set(a.key, b);
      this.warpTo.set(b.key, a);
    }
    for (const ice of layout.ices) this.ice.add(`${ice.c},${ice.r}`);
    for (const crumble of layout.crumbles) this.crumbles.add(`${crumble.c},${crumble.r}`);
    for (const plate of layout.switches) {
      if (plate.gate) this.switches.set(`${plate.c},${plate.r}`, plate.gate);
    }
  }

  private applyTiles(): void {
    this.boosting = false;
    if (this.ball.gravityScale() === 0) return;
    let local = this.localBall();
    if (local.y < FALL_Y) return;
    let id = this.cellKeyAt(local);
    if (!id) {
      this.applyIce("", local);
      return;
    }

    const dest = this.warpTo.get(id);
    if (dest && this.warpGrace !== id && local.y < TILE_Y) {
      this.ball.setTranslation(rotateVec(this.boardRot, { x: dest.x, y: local.y, z: dest.z }), true);
      this.warpGrace = dest.key;
      local = this.localBall();
      if (local.y < FALL_Y) return;
      id = this.cellKeyAt(local);
      if (!id) return;
    } else if (this.warpGrace && this.warpGrace !== id) {
      this.warpGrace = "";
    }

    if (local.y < TILE_Y) this.applyBoost(id);
    this.applyIce(id, local);
    this.applyCrumble(id, local);
    this.applySwitch(id, local);
  }

  private stick(): void {
    if (this.fallingThrough || this.ball.gravityScale() === 0) return;
    this.board.rotation(this.boardRot);
    const local = this.localBall();
    if (this.canFall(local)) return;

    const lift = local.y - BALL_R;
    if (lift <= STICK_LIFT && lift >= -STICK_SINK) return;

    const up = rotateVec(this.boardRot, { x: 0, y: 1, z: 0 });
    this.ball.linvel(this.lin);
    const vn = this.lin.x * up.x + this.lin.y * up.y + this.lin.z * up.z;
    this.ball.setTranslation(rotateVec(this.boardRot, { x: local.x, y: BALL_R + 0.012, z: local.z }), true);
    this.ball.setLinvel(
      {
        x: this.lin.x - up.x * vn,
        y: this.lin.y - up.y * vn,
        z: this.lin.z - up.z * vn,
      },
      true,
    );
  }

  private canFall(local: Vec3): boolean {
    if (this.inHatch(local)) return true;
    const id = this.cellKeyAt(local);
    if (!id) return false;
    return this.holes.has(id) || this.crumbleGone.has(id);
  }

  private applyIce(id: string, local: Vec3): void {
    const on = this.ice.has(id) && local.y < TILE_Y && local.y > FALL_Y;
    if (on === this.onIce) return;
    this.onIce = on;
    const grip = on ? ICE_DAMP : 1;
    this.ball.setLinearDamping(this.damping * grip);
    this.ball.setAngularDamping(this.damping * 0.51 * (on ? 0.25 : 1));
  }

  private applyCrumble(id: string, local: Vec3): void {
    const standing = local.y < TILE_Y && local.y > FALL_Y;
    for (const cell of this.crumbles) {
      if (this.crumbleGone.has(cell)) continue;
      if (cell === id && standing) {
        const time = (this.crumbleTime.get(cell) ?? 0) + STEP;
        this.crumbleTime.set(cell, time);
        if (time >= CRUMBLE_HOLD) this.breakCrumble(cell);
      } else {
        this.crumbleTime.delete(cell);
      }
    }
  }

  private breakCrumble(cell: string): void {
    this.crumbleGone.add(cell);
    for (const surface of this.surfaces) {
      if (surface.floor === this.active && surface.cell === cell) surface.collider.setSensor(true);
    }
  }

  private applySwitch(id: string, local: Vec3): void {
    if (local.y >= TILE_Y || local.y <= FALL_Y) return;
    const gate = this.switches.get(id);
    if (!gate || this.openGates.has(gate)) return;
    if (this.tangentSpeed() > SWITCH_SPEED) return;
    this.openGates.add(gate);
    for (const surface of this.surfaces) {
      if (surface.floor === this.active && surface.gate === gate) surface.collider.setSensor(true);
    }
  }

  private restoreTiles(): void {
    for (const surface of this.surfaces) {
      if (surface.floor !== this.active) continue;
      if (surface.cell && this.crumbleGone.has(surface.cell)) surface.collider.setSensor(false);
      if (surface.gate && this.openGates.has(surface.gate)) surface.collider.setSensor(false);
    }
    this.crumbleTime.clear();
    this.crumbleGone.clear();
    this.openGates.clear();
    this.onIce = false;
    this.ball.setLinearDamping(this.damping);
    this.ball.setAngularDamping(this.damping * 0.51);
  }

  private tangentSpeed(): number {
    this.board.rotation(this.boardRot);
    const up = rotateVec(this.boardRot, { x: 0, y: 1, z: 0 });
    this.ball.linvel(this.lin);
    const vn = this.lin.x * up.x + this.lin.y * up.y + this.lin.z * up.z;
    const tx = this.lin.x - up.x * vn;
    const ty = this.lin.y - up.y * vn;
    const tz = this.lin.z - up.z * vn;
    return Math.hypot(tx, ty, tz);
  }

  private applyBoost(id: string): void {
    const dir = this.boostDir.get(id);
    if (!dir) return;
    const world = rotateVec(this.boardRot, { x: dir.x, y: 0, z: dir.z });
    const dv = BOOST_ACCEL * STEP;
    this.ball.linvel(this.lin);
    this.ball.setLinvel(
      {
        x: this.lin.x + world.x * dv,
        y: this.lin.y + world.y * dv,
        z: this.lin.z + world.z * dv,
      },
      true,
    );
    this.boosting = true;
  }

  private cellKeyAt(local: Vec3): string | null {
    const c = Math.floor((local.x - this.originX) / CELL);
    const r = Math.floor((local.z - this.originZ) / CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return `${c},${r}`;
  }

  private limitSpeed(): void {
    this.board.rotation(this.boardRot);
    const up = rotateVec(this.boardRot, { x: 0, y: 1, z: 0 });
    this.ball.linvel(this.lin);
    const vn = this.lin.x * up.x + this.lin.y * up.y + this.lin.z * up.z;
    const tx = this.lin.x - up.x * vn;
    const ty = this.lin.y - up.y * vn;
    const tz = this.lin.z - up.z * vn;
    const speed = Math.hypot(tx, ty, tz);
    const cap = this.boosting ? this.maxSpeed * 1.4 : this.maxSpeed;
    if (speed <= cap) return;
    const scale = cap / speed;
    this.ball.setLinvel(
      {
        x: tx * scale + up.x * vn,
        y: ty * scale + up.y * vn,
        z: tz * scale + up.z * vn,
      },
      true,
    );
  }

  private placeAtStart(): void {
    this.board.rotation(this.boardRot);
    this.ball.setGravityScale(1, true);
    this.ball.setTranslation(
      rotateVec(this.boardRot, {
        x: this.layout.start.x,
        y: SPAWN_Y,
        z: this.layout.start.z,
      }),
      true,
    );
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  private guideToLanding(): void {
    const landing = this.levels[this.active + 1]?.start;
    if (!landing) return;
    const local = this.localBall();
    const blend = 1 - Math.exp(-12 * STEP);
    const x = local.x + (landing.x - local.x) * blend;
    const z = local.z + (landing.z - local.z) * blend;
    this.board.rotation(this.boardRot);
    this.ball.setTranslation(rotateVec(this.boardRot, { x, y: local.y, z }), true);
    const up = rotateVec(this.boardRot, { x: 0, y: 1, z: 0 });
    this.ball.linvel(this.lin);
    const vn = this.lin.x * up.x + this.lin.y * up.y + this.lin.z * up.z;
    this.ball.setLinvel({ x: up.x * vn, y: up.y * vn, z: up.z * vn }, true);
  }

  private beginDrop(local: Vec3): void {
    const center = this.cellCenter(local);
    this.dropping = true;
    this.dropSettled = false;
    this.dropReported = false;
    this.dropX = local.x;
    this.dropZ = local.z;
    this.dropY = local.y;
    this.aimX = center?.x ?? local.x;
    this.aimZ = center?.z ?? local.z;
    this.board.rotation(this.boardRot);
    const up = rotateVec(this.boardRot, { x: 0, y: 1, z: 0 });
    this.ball.linvel(this.lin);
    const vy = this.lin.x * up.x + this.lin.y * up.y + this.lin.z * up.z;
    this.dropVy = Math.min(-0.8, vy);
    this.ballCollider.setSensor(true);
    this.ball.setGravityScale(0, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.wakeUp();
  }

  private advanceDrop(): void {
    if (!this.dropSettled) {
      const gravity = Math.abs(this.world.gravity.y);
      this.dropVy -= gravity * STEP;
      this.dropY += this.dropVy * STEP;
      const blend = 1 - Math.exp(-28 * STEP);
      this.dropX += (this.aimX - this.dropX) * blend;
      this.dropZ += (this.aimZ - this.dropZ) * blend;
      if (this.dropY <= VOID_Y) {
        this.dropY = VOID_Y;
        this.dropVy = 0;
        this.dropSettled = true;
      }
    }
    this.board.rotation(this.boardRot);
    this.ball.setTranslation(
      rotateVec(this.boardRot, { x: this.dropX, y: this.dropY, z: this.dropZ }),
      true,
    );
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  private clearDrop(): void {
    if (this.dropping) this.ball.setGravityScale(1, true);
    this.dropping = false;
    this.dropSettled = false;
    this.dropReported = false;
    this.ballCollider.setSensor(false);
  }

  private cellCenter(local: Vec3): { x: number; z: number } | null {
    const originX = -this.layout.width / 2;
    const originZ = -this.layout.depth / 2;
    const c = Math.floor((local.x - originX) / CELL);
    const r = Math.floor((local.z - originZ) / CELL);
    if (c < 0 || r < 0 || c >= this.layout.cols || r >= this.layout.rows) return null;
    return {
      x: originX + (c + 0.5) * CELL,
      z: originZ + (r + 0.5) * CELL,
    };
  }

  private contain(): void {
    const local = this.localBall();
    const inset = WALL / 2 + BALL_R - 0.02;
    const halfW = this.layout.width / 2;
    const halfD = this.layout.depth / 2;
    const minX = -halfW + inset;
    const maxX = halfW - inset;
    const minZ = -halfD + inset;
    const maxZ = halfD - inset;
    const x = Math.min(maxX, Math.max(minX, local.x));
    const z = Math.min(maxZ, Math.max(minZ, local.z));
    if (x === local.x && z === local.z) return;

    this.ball.linvel(this.lin);
    const vel = rotateVec(conjugate(this.boardRot), this.lin);
    const vx = x > local.x ? Math.max(0, vel.x) : x < local.x ? Math.min(0, vel.x) : vel.x;
    const vz = z > local.z ? Math.max(0, vel.z) : z < local.z ? Math.min(0, vel.z) : vel.z;
    this.ball.setTranslation(rotateVec(this.boardRot, { x, y: local.y, z }), true);
    this.ball.setLinvel(rotateVec(this.boardRot, { x: vx, y: vel.y, z: vz }), true);
  }

  private localBall(): Vec3 {
    this.board.rotation(this.boardRot);
    this.ball.translation(this.ballPos);
    return rotateVec(conjugate(this.boardRot), this.ballPos);
  }

  private inHatch(local: Vec3): boolean {
    const hatch = this.levels[this.active]?.hatch;
    if (!hatch || this.active >= this.levels.length - 1) return false;
    const dx = local.x - hatch.x;
    const dz = local.z - hatch.z;
    return dx * dx + dz * dz < HATCH_REACH * HATCH_REACH;
  }

  private trackDescent(): SimEvent {
    const local = this.localBall();
    const floorY = -this.story + SPAWN_Y;
    const arrived = local.y <= floorY + 0.12;
    const speed = this.verticalSpeed();
    const settled = local.y < -0.7 && Math.abs(speed) < 0.45;
    const missed = local.y < -this.story - 0.7;
    if ((arrived || settled || missed) && !this.sentDescend) {
      this.sentDescend = true;
      return "descend";
    }
    return "none";
  }

  private verticalSpeed(): number {
    this.board.rotation(this.boardRot);
    const up = rotateVec(this.boardRot, { x: 0, y: 1, z: 0 });
    this.ball.linvel(this.lin);
    return this.lin.x * up.x + this.lin.y * up.y + this.lin.z * up.z;
  }

  private updateGoal(dt: number): SimEvent {
    if (this.active !== this.levels.length - 1) return "none";
    const local = this.localBall();
    const dx = local.x - this.layout.goal.x;
    const dz = local.z - this.layout.goal.z;
    const inCup = dx * dx + dz * dz < GOAL_REACH * GOAL_REACH && local.y < BALL_R + 0.2 && local.y > FALL_Y;
    if (!inCup) {
      this.goalTime = 0;
      return "none";
    }
    this.goalTime += dt;
    this.ball.linvel(this.lin);
    const speed = Math.hypot(this.lin.x, this.lin.z);
    const calm = speed < GOAL_SPEED || this.goalTime > 0.75;
    if (this.goalTime > 0.22 && calm) return "goal";
    return "none";
  }
}

function materialFor(kind: PieceKind, grip: number): { friction: number } {
  if (kind === "goal") return { friction: 1.15 * grip };
  if (kind === "wall" || kind === "frame") return { friction: 0.16 * grip };
  if (kind === "boost") return { friction: 0.18 * grip };
  if (kind === "warp") return { friction: 0.55 * grip };
  if (kind === "ice") return { friction: 0.02 };
  if (kind === "crumble") return { friction: 0.9 * grip };
  if (kind === "switch") return { friction: 1.05 * grip };
  return { friction: 0.84 * grip };
}
