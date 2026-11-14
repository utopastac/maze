import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PMREMGenerator,
  PerspectiveCamera,
  PointLight,
  Scene,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
  type Quaternion,
  type WebGLRenderer,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BALL_R, type MazeLayout, type Piece, type PieceKind, type TowerLayout } from "../core/layout.ts";
import { DIRECTION_VECTOR, SWITCH_COLOR_COUNT, WARP_COLOR_COUNT } from "../core/maze.ts";
import type { PlaySettings } from "../core/playSettings.ts";
import type { Pose } from "../core/simulation.ts";

const SHELL_ALPHA = 0.18;

export class MazeWorld {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly board = new Group();
  private readonly ball: Mesh;
  private readonly key: DirectionalLight;
  private readonly goalLight: PointLight;
  private readonly materials: Record<PieceKind, Material>;
  private readonly goalRingMat: MeshStandardMaterial;
  private readonly goalDiscMat: MeshStandardMaterial;
  private readonly startRingMat: MeshStandardMaterial;
  private readonly boostMarkMat: MeshStandardMaterial;
  private readonly warpMats: MeshStandardMaterial[];
  private readonly iceMarkMat: MeshStandardMaterial;
  private readonly crumbleMarkMat: MeshStandardMaterial;
  private readonly switchMats: MeshStandardMaterial[];
  private readonly gateMeshes: Mesh[] = [];
  private readonly crumbleMeshes: Mesh[] = [];
  private readonly arrowGeometry: BufferGeometry;
  private readonly warpSpins: Group[] = [];
  private readonly debris: Debris[] = [];
  private readonly floorGroups: (Group | null)[] = [];
  private readonly frames: (Mesh | null)[] = [];
  private readonly glassFrame: MeshStandardMaterial;
  private goalRing: Mesh | null = null;
  private goalAnchor: { x: number; z: number; group: Group } | null = null;
  private tower: TowerLayout | null = null;
  private settings: PlaySettings | null = null;
  private aspect = 1;
  private focusY = 0;
  private lastTime = 0;
  private readonly reduceMotion: boolean;

  constructor() {
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.camera = new PerspectiveCamera(30, 1, 0.1, 140);
    this.scene.background = new Color(token("--maze-void"));
    this.scene.add(this.board);

    this.materials = {
      floor: metal(token("--maze-floor"), 0.78, 0.42, 0.55),
      boost: new MeshStandardMaterial({
        color: token("--maze-boost"),
        emissive: token("--maze-boost"),
        emissiveIntensity: 0.22,
        metalness: 0.78,
        roughness: 0.28,
        envMapIntensity: 0.7,
      }),
      warp: new MeshStandardMaterial({
        color: token("--maze-warp"),
        emissive: token("--maze-warp"),
        emissiveIntensity: 0.2,
        metalness: 0.7,
        roughness: 0.36,
        envMapIntensity: 0.6,
      }),
      ice: new MeshStandardMaterial({
        color: token("--maze-ice"),
        emissive: token("--maze-ice-mark"),
        emissiveIntensity: 0.08,
        metalness: 0.92,
        roughness: 0.08,
        envMapIntensity: 1,
      }),
      crumble: new MeshStandardMaterial({
        color: token("--maze-crumble"),
        emissive: token("--maze-crumble-mark"),
        emissiveIntensity: 0.08,
        metalness: 0.35,
        roughness: 0.72,
        envMapIntensity: 0.4,
      }),
      switch: new MeshStandardMaterial({
        color: token("--maze-switch"),
        emissive: token("--maze-switch-0"),
        emissiveIntensity: 0.12,
        metalness: 0.62,
        roughness: 0.4,
        envMapIntensity: 0.55,
      }),
      start: metal(token("--maze-start"), 0.62, 0.4, 0.6),
      goal: new MeshStandardMaterial({
        color: token("--maze-goal-floor"),
        emissive: token("--maze-goal"),
        emissiveIntensity: 0.28,
        metalness: 0.55,
        roughness: 0.4,
      }),
      wall: metal(token("--maze-wall"), 0.7, 0.36, 0.75),
      grout: new MeshStandardMaterial({
        color: token("--maze-grout"),
        metalness: 0.02,
        roughness: 0.94,
        envMapIntensity: 0.15,
      }),
      frame: metal(token("--maze-frame"), 0.9, 0.24, 1),
      pit: new MeshStandardMaterial({
        color: token("--maze-pit"),
        metalness: 0.12,
        roughness: 0.96,
        side: DoubleSide,
      }),
      lip: new MeshStandardMaterial({
        color: token("--maze-lip"),
        emissive: token("--maze-lip"),
        emissiveIntensity: 0.9,
        metalness: 0.3,
        roughness: 0.42,
        toneMapped: false,
      }),
      hatch: new MeshStandardMaterial({
        color: token("--maze-hatch"),
        emissive: token("--maze-hatch"),
        emissiveIntensity: 0.85,
        metalness: 0.25,
        roughness: 0.38,
        toneMapped: false,
      }),
    };
    this.glassFrame = (this.materials.frame as MeshStandardMaterial).clone();
    this.glassFrame.transparent = true;
    this.glassFrame.opacity = SHELL_ALPHA;
    this.glassFrame.depthWrite = false;
    this.glassFrame.roughness = 0.12;
    this.glassFrame.metalness = 0.15;
    this.glassFrame.envMapIntensity = 0.85;

    this.goalRingMat = new MeshStandardMaterial({
      color: token("--maze-goal"),
      emissive: token("--maze-goal"),
      emissiveIntensity: 0.85,
      metalness: 0.15,
      roughness: 0.35,
      toneMapped: false,
    });
    this.goalDiscMat = new MeshStandardMaterial({
      color: token("--maze-goal"),
      emissive: token("--maze-goal"),
      emissiveIntensity: 0.35,
      metalness: 0.1,
      roughness: 0.5,
      side: DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.startRingMat = new MeshStandardMaterial({
      color: token("--maze-start-mark"),
      emissive: token("--maze-start-mark"),
      emissiveIntensity: 0.28,
      metalness: 0.2,
      roughness: 0.4,
      toneMapped: false,
    });
    this.boostMarkMat = glow(token("--maze-boost-mark"));
    this.warpMats = Array.from({ length: WARP_COLOR_COUNT }, (_, index) => glow(token(`--maze-warp-${index}`)));
    this.iceMarkMat = glow(token("--maze-ice-mark"));
    this.crumbleMarkMat = glow(token("--maze-crumble-mark"));
    this.switchMats = Array.from({ length: SWITCH_COLOR_COUNT }, (_, index) => glow(token(`--maze-switch-${index}`)));
    this.arrowGeometry = arrowGeometry();

    const hemi = new HemisphereLight(token("--maze-sky"), token("--maze-floor"), 0.72);
    const ambient = new AmbientLight("#ffffff", 0.1);
    this.key = new DirectionalLight("#fff6ea", 3.6);
    this.key.position.set(4.4, 12.8, 6.2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.04;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 40;
    const fill = new DirectionalLight(token("--maze-sky"), 0.65);
    fill.position.set(-7.5, 5.5, -3.5);
    const rim = new DirectionalLight("#ffffff", 0.4);
    rim.position.set(-2.5, 7, -9);
    this.scene.add(hemi, ambient, this.key, this.key.target, fill, rim);

    this.goalLight = new PointLight(token("--maze-goal"), 18, 4.2, 2);
    this.board.add(this.goalLight);

    this.ball = new Mesh(
      new SphereGeometry(BALL_R, 48, 32),
      new MeshPhysicalMaterial({
        color: token("--maze-ball"),
        metalness: 1,
        roughness: 0.16,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.15,
      }),
    );
    this.ball.castShadow = true;
    const mark = new Mesh(
      new SphereGeometry(BALL_R * 0.22, 16, 12),
      new MeshStandardMaterial({
        color: token("--maze-mark"),
        emissive: token("--maze-mark"),
        emissiveIntensity: 0.55,
        metalness: 0.35,
        roughness: 0.32,
        toneMapped: false,
      }),
    );
    mark.position.copy(new Vector3(0.16, 0.86, 0.22).normalize().multiplyScalar(BALL_R * 0.9));
    this.ball.add(mark);
    this.scene.add(this.ball);
  }

  bind(renderer: WebGLRenderer): void {
    const pmrem = new PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    this.scene.environmentIntensity = 0.58;
    env.dispose();
    pmrem.dispose();
  }

  setTower(layout: TowerLayout): void {
    this.tower = layout;
    this.board.add(this.goalLight);
    this.clearDebris();
    this.clearGenerated();
    this.floorGroups.length = 0;
    this.frames.length = 0;
    this.focusY = 0;
    this.goalAnchor = null;
    const last = layout.floors.length - 1;
    layout.floors.forEach((floor, index) => {
      const group = new Group();
      group.position.y = -index * layout.story;
      group.userData.generated = true;
      group.userData.pieces = floor.pieces;
      group.userData.hatch = floor.hatch;
      this.frames[index] = this.addPieces(group, floor.pieces);
      this.addMarkers(group, floor, index === last);
      this.addTileMarks(group, floor);
      this.board.add(group);
      this.floorGroups.push(group);
      if (index === last) this.goalAnchor = { x: floor.goal.x, z: floor.goal.z, group };
    });
    this.placeGoalLight();
    this.fit();
    this.syncShell(0, true);
  }

  crumbleTop(): void {
    let index = -1;
    let top = -Infinity;
    this.floorGroups.forEach((group, i) => {
      if (!group || group.position.y <= top) return;
      top = group.position.y;
      index = i;
    });
    const group = index >= 0 ? this.floorGroups[index] : null;
    if (!group) return;
    if (!this.reduceMotion) {
      const pieces = group.userData.pieces as Piece[] | undefined;
      const hatch = group.userData.hatch as { x: number; z: number } | null;
      this.board.updateWorldMatrix(true, true);
      if (pieces) {
        for (const piece of pieces) {
          if (piece.kind === "pit" || piece.kind === "lip" || piece.kind === "grout") continue;
          this.spawnDebris(piece, group.position.y, this.board.quaternion, hatch);
        }
      }
    }
    this.board.remove(group);
    group.traverse((child) => this.disposeGenerated(child));
    this.floorGroups[index] = null;
    this.frames[index] = null;
    this.pruneSpins();
  }

  rebase(dy: number): void {
    const up = new Vector3(0, dy, 0).applyQuaternion(this.board.quaternion);
    for (const group of this.floorGroups) {
      if (group) group.position.y += dy;
    }
    for (const bit of this.debris) bit.mesh.position.add(up);
    this.focusY += dy;
    this.placeGoalLight();
    this.placeCamera();
  }

  resize(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  useSettings(settings: PlaySettings): void {
    this.settings = settings;
    this.applyCamera();
  }

  applyCamera(): void {
    const field = this.settings?.values.field ?? 30;
    if (this.camera.fov !== field) {
      this.camera.fov = field;
      this.camera.updateProjectionMatrix();
    }
    this.fit();
  }

  update(time: number, pose: Pose): void {
    this.board.quaternion.set(pose.board.x, pose.board.y, pose.board.z, pose.board.w);
    this.ball.position.set(pose.ballPosition.x, pose.ballPosition.y, pose.ballPosition.z);
    this.ball.quaternion.set(pose.ballRotation.x, pose.ballRotation.y, pose.ballRotation.z, pose.ballRotation.w);
    const dt = Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    this.tickDebris(dt);
    this.tickAim(dt);
    this.syncShell(dt, this.reduceMotion);
    this.placeGoalLight();
    this.placeCamera();
    this.syncTiles(pose, time);
    if (this.reduceMotion) return;
    if (this.goalRing) {
      const wave = Math.sin(time * 2.2);
      this.goalRing.scale.setScalar(1 + wave * 0.03);
      this.goalRingMat.emissiveIntensity = 0.75 + wave * 0.25;
    }
    this.boostMarkMat.emissiveIntensity = 0.55 + Math.sin(time * 4.5) * 0.28;
    this.iceMarkMat.emissiveIntensity = 0.35 + Math.sin(time * 1.6) * 0.12;
    for (const [index, mat] of this.warpMats.entries()) {
      mat.emissiveIntensity = 0.55 + Math.sin(time * 2.2 + index * 0.7) * 0.25;
    }
    for (const spin of this.warpSpins) spin.rotation.y = time * 0.65;
  }

  private addPieces(parent: Group, pieces: Piece[]): Mesh | null {
    const groups = new Map<PieceKind, BufferGeometry[]>();
    for (const piece of pieces) {
      if (piece.gate || piece.kind === "crumble") {
        this.addLoose(parent, piece);
        continue;
      }
      const geo = new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
      geo.translate(piece.x, piece.y, piece.z);
      const list = groups.get(piece.kind) ?? [];
      list.push(geo);
      groups.set(piece.kind, list);
    }
    let frame: Mesh | null = null;
    for (const [kind, geos] of groups) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos);
      if (!merged) continue;
      if (geos.length > 1) {
        for (const geo of geos) geo.dispose();
      }
      const mesh = new Mesh(merged, this.materials[kind]);
      mesh.castShadow = kind === "wall" || kind === "frame";
      mesh.receiveShadow =
        kind === "floor" ||
        kind === "start" ||
        kind === "goal" ||
        kind === "boost" ||
        kind === "warp" ||
        kind === "ice" ||
        kind === "crumble" ||
        kind === "switch" ||
        kind === "grout";
      if (kind === "frame") frame = mesh;
      parent.add(mesh);
    }
    return frame;
  }

  private syncShell(dt: number, snap: boolean): void {
    const mesh = this.frames[this.currentFloor()] ?? null;
    if (mesh && mesh.material !== this.glassFrame) {
      mesh.material = this.glassFrame;
      mesh.castShadow = false;
      mesh.renderOrder = 2;
      this.glassFrame.opacity = snap ? SHELL_ALPHA : 1;
    }
    const blend = snap ? 1 : 1 - Math.exp(-8 * dt);
    this.glassFrame.opacity += (SHELL_ALPHA - this.glassFrame.opacity) * blend;
    this.glassFrame.depthWrite = this.glassFrame.opacity > 0.85;
  }

  private currentFloor(): number {
    let index = -1;
    let top = -Infinity;
    this.floorGroups.forEach((group, i) => {
      if (!group || group.position.y <= top) return;
      top = group.position.y;
      index = i;
    });
    return index;
  }

  private addMarkers(parent: Group, layout: MazeLayout, showGoal: boolean): void {
    const start = new Mesh(new TorusGeometry(0.26, 0.012, 10, 40), this.startRingMat);
    start.rotation.x = Math.PI / 2;
    start.position.set(layout.start.x, 0.03, layout.start.z);
    parent.add(start);
    if (!showGoal) return;

    const disc = new Mesh(new CircleGeometry(0.4, 40), this.goalDiscMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(layout.goal.x, 0.012, layout.goal.z);
    disc.receiveShadow = true;

    const ring = new Mesh(new TorusGeometry(0.34, 0.018, 12, 48), this.goalRingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(layout.goal.x, 0.045, layout.goal.z);
    this.goalRing = ring;
    parent.add(disc, ring);
  }

  private fit(): void {
    this.placeCamera();
  }

  private placeCamera(): void {
    if (!this.tower) return;
    const low = this.lowest();
    const span = Math.max(this.tower.width, this.tower.depth) + Math.abs(low) * 0.28;
    const zoom = this.settings?.values.zoom ?? 1;
    const angle = ((this.settings?.values.angle ?? 46.5) * Math.PI) / 180;
    const orbit = ((this.settings?.values.orbit ?? 0) * Math.PI) / 180;
    const fov = (this.camera.fov * Math.PI) / 180;
    const half = Math.tan(fov / 2);
    const fill = 1.22;
    const distForHeight = (span * fill) / (2 * half);
    const distForWidth = (span * fill) / (2 * half * Math.max(this.aspect, 0.6));
    const fitted = Math.max(distForHeight, distForWidth) * 1.22;
    const radius = (fitted * Math.hypot(0.74, 0.7)) / Math.max(zoom, 0.2);
    const horizontal = radius * Math.cos(angle);
    const look = new Vector3(0, this.focusY, 0).applyQuaternion(this.board.quaternion);
    const aim = span * 0.04;
    look.x += aim * Math.sin(orbit);
    look.z += aim * Math.cos(orbit);
    this.camera.position.set(
      look.x + horizontal * Math.sin(orbit),
      look.y + radius * Math.sin(angle),
      look.z + horizontal * Math.cos(orbit),
    );
    this.camera.lookAt(look);

    const range = span * 0.78 + Math.abs(low) * 0.2;
    const shadow = this.key.shadow.camera as OrthographicCamera;
    shadow.left = -range;
    shadow.right = range;
    shadow.top = range;
    shadow.bottom = -range;
    shadow.updateProjectionMatrix();
    this.key.target.position.copy(look);
  }

  private addTileMarks(parent: Group, layout: MazeLayout): void {
    for (const boost of layout.boosts) {
      const group = new Group();
      const dir = DIRECTION_VECTOR[boost.dir];
      group.position.set(boost.x, 0.03, boost.z);
      group.rotation.y = Math.atan2(-dir.x, -dir.z);
      for (const z of [0.18, -0.16]) {
        const arrow = new Mesh(this.arrowGeometry, this.boostMarkMat);
        arrow.position.z = z;
        arrow.renderOrder = 2;
        group.add(arrow);
      }
      parent.add(group);
    }

    for (const warp of layout.warps) {
      const mat = this.warpMats[warp.pair % WARP_COLOR_COUNT];
      if (!mat) continue;
      const spin = new Group();
      spin.position.set(warp.x, 0, warp.z);
      const ring = new Mesh(new TorusGeometry(0.32, 0.018, 10, 48), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.034;
      ring.renderOrder = 2;
      const disc = new Mesh(new CircleGeometry(0.11, 28), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.022;
      disc.renderOrder = 2;
      spin.add(ring, disc);
      if (!warp.open) this.warpSpins.push(spin);
      parent.add(spin);
    }

    for (const ice of layout.ices) {
      const group = new Group();
      group.position.set(ice.x, 0.02, ice.z);
      group.rotation.y = 0.55;
      for (const z of [-0.14, 0, 0.14]) {
        const streak = new Mesh(new BoxGeometry(0.46, 0.01, 0.02), this.iceMarkMat);
        streak.position.z = z;
        streak.renderOrder = 2;
        group.add(streak);
      }
      parent.add(group);
    }

    for (const plate of layout.switches) {
      const mat = this.switchMats[plate.tone % SWITCH_COLOR_COUNT];
      if (!mat) continue;
      const group = new Group();
      group.position.set(plate.x, 0, plate.z);
      const slab = new Mesh(new BoxGeometry(0.34, 0.016, 0.34), mat);
      slab.position.y = 0.02;
      slab.renderOrder = 2;
      const core = new Mesh(new BoxGeometry(0.12, 0.02, 0.12), mat);
      core.position.y = 0.032;
      core.renderOrder = 2;
      group.add(slab, core);
      parent.add(group);
    }
  }

  private addLoose(parent: Group, piece: Piece): void {
    const geo = new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
    const shared = this.materials[piece.kind];
    const material = piece.kind === "crumble" && shared instanceof MeshStandardMaterial ? shared.clone() : shared;
    const mesh = new Mesh(geo, material);
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.castShadow = piece.kind === "wall";
    mesh.receiveShadow = piece.kind === "crumble";
    mesh.userData.restX = piece.x;
    mesh.userData.restY = piece.y;
    if (piece.kind === "crumble") {
      mesh.userData.owned = true;
      mesh.userData.cell = piece.cell ?? "";
      const crackA = new Mesh(new BoxGeometry(0.5, 0.012, 0.018), this.crumbleMarkMat);
      crackA.position.y = piece.hy + 0.008;
      crackA.rotation.y = 0.7;
      const crackB = new Mesh(new BoxGeometry(0.34, 0.012, 0.018), this.crumbleMarkMat);
      crackB.position.y = piece.hy + 0.01;
      crackB.rotation.y = -0.85;
      mesh.add(crackA, crackB);
      this.crumbleMeshes.push(mesh);
    }
    if (piece.gate) {
      mesh.userData.gate = piece.gate;
      const tone = piece.tone ?? 0;
      const mat = this.switchMats[tone % SWITCH_COLOR_COUNT];
      if (mat) {
        const mark = new Mesh(new BoxGeometry(0.14, 0.14, 0.14), mat);
        mark.position.y = 0.22;
        mesh.add(mark);
      }
      this.gateMeshes.push(mesh);
    }
    parent.add(mesh);
  }

  private syncTiles(pose: Pose, time: number): void {
    const open = new Set(pose.gates);
    for (let i = this.gateMeshes.length - 1; i >= 0; i -= 1) {
      const mesh = this.gateMeshes[i];
      if (!mesh?.parent) {
        this.gateMeshes.splice(i, 1);
        continue;
      }
      const rest = mesh.userData.restY as number;
      const target = open.has(mesh.userData.gate as string) ? rest - 0.86 : rest;
      const blend = this.reduceMotion ? 1 : 0.22;
      mesh.position.y += (target - mesh.position.y) * blend;
    }

    const crumble = new Map(pose.crumbles.map((item) => [item.cell, item]));
    for (let i = this.crumbleMeshes.length - 1; i >= 0; i -= 1) {
      const mesh = this.crumbleMeshes[i];
      if (!mesh?.parent) {
        this.crumbleMeshes.splice(i, 1);
        continue;
      }
      const info = crumble.get(mesh.userData.cell as string);
      const restX = mesh.userData.restX as number;
      const restY = mesh.userData.restY as number;
      const mat = mesh.material instanceof MeshStandardMaterial ? mesh.material : null;
      if (!info?.gone) {
        mesh.visible = true;
        const progress = info?.progress ?? 0;
        mesh.position.y += (restY - mesh.position.y) * 0.4;
        mesh.position.x = restX + (this.reduceMotion ? 0 : Math.sin(time * 28) * 0.012 * progress);
        if (mat) mat.emissiveIntensity = 0.08 + progress * 0.85;
      } else {
        mesh.position.x = restX;
        const target = restY - 0.62;
        mesh.position.y += (target - mesh.position.y) * (this.reduceMotion ? 1 : 0.16);
        if (mat) mat.emissiveIntensity = 0.04;
        if (mesh.position.y < restY - 0.45) mesh.visible = false;
      }
    }
  }

  private disposeGenerated(child: object): void {
    if (!(child instanceof Mesh) || child.geometry === this.arrowGeometry) return;
    child.geometry.dispose();
    if (child.userData.owned === true && child.material instanceof MeshStandardMaterial) child.material.dispose();
  }

  private clearGenerated(): void {
    const gone = this.board.children.filter((child) => child.userData.generated === true);
    for (const obj of gone) {
      this.board.remove(obj);
      obj.traverse((child) => this.disposeGenerated(child));
    }
    this.goalRing = null;
    this.warpSpins.length = 0;
    this.gateMeshes.length = 0;
    this.crumbleMeshes.length = 0;
  }

  private spawnDebris(piece: Piece, floorY: number, boardQuat: Quaternion, hatch: { x: number; z: number } | null): void {
    const source = this.materials[piece.kind];
    if (!(source instanceof MeshStandardMaterial)) return;
    const geo = new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
    const mat = source.clone();
    mat.transparent = true;
    mat.opacity = 1;
    const mesh = new Mesh(geo, mat);
    const local = new Vector3(piece.x, piece.y + floorY, piece.z);
    mesh.position.copy(local.applyQuaternion(boardQuat));
    mesh.quaternion.copy(boardQuat);
    const hx = hatch?.x ?? 0;
    const hz = hatch?.z ?? 0;
    let dx = piece.x - hx;
    let dz = piece.z - hz;
    const dist = Math.hypot(dx, dz);
    const len = dist || 1;
    dx /= len;
    dz /= len;
    const speed = 1.15 + Math.random() * 1.45;
    const vel = new Vector3(dx * speed, 0.4 + Math.random() * 1.05, dz * speed).applyQuaternion(boardQuat);
    const spin = new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    this.scene.add(mesh);
    this.debris.push({ mesh, vel, spin, delay: Math.min(0.48, dist * 0.06), age: 0, life: 1.15 });
  }

  private tickDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const bit = this.debris[i];
      if (!bit) continue;
      bit.age += dt;
      const elapsed = bit.age - bit.delay;
      if (elapsed < 0) continue;
      bit.vel.y -= 18 * dt;
      bit.mesh.position.addScaledVector(bit.vel, dt);
      bit.mesh.rotateX(bit.spin.x * dt);
      bit.mesh.rotateY(bit.spin.y * dt);
      bit.mesh.rotateZ(bit.spin.z * dt);
      const fade = elapsed < 0.28 ? 1 : Math.max(0, 1 - (elapsed - 0.28) / 0.7);
      if (bit.mesh.material instanceof MeshStandardMaterial) bit.mesh.material.opacity = fade;
      if (elapsed <= bit.life) continue;
      this.scene.remove(bit.mesh);
      bit.mesh.geometry.dispose();
      if (bit.mesh.material instanceof MeshStandardMaterial) bit.mesh.material.dispose();
      this.debris.splice(i, 1);
    }
  }

  private tickAim(dt: number): void {
    const inv = this.board.quaternion.clone().invert();
    const localY = this.ball.position.clone().applyQuaternion(inv).y;
    const floor = this.lowest();
    const rest = floor * 0.28;
    const target = Math.min(rest, Math.max(localY, floor));
    const blend = this.reduceMotion ? 1 : 1 - Math.exp(-7 * dt);
    this.focusY += (target - this.focusY) * blend;
  }

  private lowest(): number {
    let low = 0;
    for (const group of this.floorGroups) {
      if (group) low = Math.min(low, group.position.y);
    }
    return low;
  }

  private placeGoalLight(): void {
    const anchor = this.goalAnchor;
    if (!anchor) return;
    this.goalLight.position.set(anchor.x, anchor.group.position.y + 0.62, anchor.z);
  }

  private pruneSpins(): void {
    for (let i = this.warpSpins.length - 1; i >= 0; i -= 1) {
      if (!this.warpSpins[i]?.parent) this.warpSpins.splice(i, 1);
    }
  }

  private clearDebris(): void {
    for (const bit of this.debris) {
      this.scene.remove(bit.mesh);
      bit.mesh.geometry.dispose();
      if (bit.mesh.material instanceof MeshStandardMaterial) bit.mesh.material.dispose();
    }
    this.debris.length = 0;
  }
}

interface Debris {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
  delay: number;
  age: number;
  life: number;
}

function arrowGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0.14);
  shape.lineTo(0.1, 0.01);
  shape.lineTo(0.04, 0.01);
  shape.lineTo(0.04, -0.14);
  shape.lineTo(-0.04, -0.14);
  shape.lineTo(-0.04, 0.01);
  shape.lineTo(-0.1, 0.01);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
  geo.translate(0, 0, -0.0125);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function glow(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.7,
    metalness: 0.25,
    roughness: 0.32,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

function token(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value.length === 0) throw new Error(`Missing CSS token ${name}`);
  return value;
}

function metal(color: string, metalness: number, roughness: number, envMapIntensity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, metalness, roughness, envMapIntensity });
}
