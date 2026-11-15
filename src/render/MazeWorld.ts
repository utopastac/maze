import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Quaternion,
  type Texture,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BALL_R, MEADOW_DROP, STORY, type MazeLayout, type Piece, type PieceKind, type TowerLayout } from "../core/layout.ts";
import { clamp } from "../core/math.ts";
import { DIRECTION_VECTOR, SWITCH_COLOR_COUNT, WARP_COLOR_COUNT } from "../core/maze.ts";
import { SETTING_SPECS, type PlaySettings } from "../core/playSettings.ts";
import type { Pose } from "../core/simulation.ts";
import { DEFAULT_FLOOR_THEME, type FloorThemeId } from "../core/theme.ts";
import { makeThemeSurfaces, type ThemeSurfaces } from "./themeMaterials.ts";

const SHELL_ALPHA = 0.18;
const ANGLE_SPEC = SETTING_SPECS.find((spec) => spec.key === "angle");
const ANGLE_MIN = ANGLE_SPEC?.min ?? 22;
const ANGLE_MAX = ANGLE_SPEC?.max ?? 80;

export class MazeWorld {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly board = new Group();
  private readonly ball: Mesh;
  private readonly key: DirectionalLight;
  private readonly goalLight: PointLight;
  private readonly materials: Record<PieceKind, MeshToonMaterial>;
  private readonly themeSurfaces: Map<FloorThemeId, ThemeSurfaces>;
  private readonly goalRingMat: MeshToonMaterial;
  private readonly startRingMat: MeshToonMaterial;
  private readonly groundMats: Record<string, MeshToonMaterial>;
  private readonly floorMats: Record<WinSceneKind, MeshToonMaterial>;
  private readonly streamMat: MeshToonMaterial;
  private readonly streamDeepMat: MeshToonMaterial;
  private readonly lavaMat: MeshToonMaterial;
  private readonly lavaDeepMat: MeshToonMaterial;
  private readonly lavaMidMat: MeshToonMaterial;
  private readonly lavaBrightMat: MeshToonMaterial;
  private readonly lavaCoolMat: MeshToonMaterial;
  private readonly oceanMat: MeshToonMaterial;
  private readonly oceanDeepMat: MeshToonMaterial;
  private readonly cactusMat: MeshToonMaterial;
  private readonly cactusLitMat: MeshToonMaterial;
  private readonly palmMat: MeshToonMaterial;
  private readonly palmLitMat: MeshToonMaterial;
  private readonly treeMats: TreeMats;
  private readonly flowerMats: MeshToonMaterial[];
  private readonly animalMats: AnimalMats;
  private readonly boostMarkMat: MeshToonMaterial;
  private readonly warpMats: MeshToonMaterial[];
  private readonly iceMarkMat: MeshToonMaterial;
  private readonly switchMats: MeshToonMaterial[];
  private readonly gateMeshes: Mesh[] = [];
  private readonly crumbleMeshes: Mesh[] = [];
  private readonly arrowGeometry: BufferGeometry;
  private readonly heartGeometry: BufferGeometry;
  private readonly heartMat: MeshToonMaterial;
  private readonly hearts: HeartBit[] = [];
  private readonly warpSpins: Group[] = [];
  private readonly debris: Debris[] = [];
  private readonly floorGroups: (Group | null)[] = [];
  private readonly frames: (Mesh | null)[] = [];
  private goalRing: Mesh | null = null;
  private goalAnchor: { x: number; z: number; group: Group } | null = null;
  private meadow: Group | null = null;
  private meadowFlowers: Mesh[] = [];
  private meadowAnimals: AnimalBit[] = [];
  private meadowFlames: Mesh[] = [];
  private meadowDisco: { mesh: Mesh; phase: number; row: number; col: number }[] = [];
  private meadowDiscoBall: Group | null = null;
  private readonly discoMats: MeshToonMaterial[];
  private meadowLight: PointLight | null = null;
  private escaped = false;
  private winSceneIndex = 0;
  private tower: TowerLayout | null = null;
  private settings: PlaySettings | null = null;
  private aspect = 1;
  private focusY = 0;
  private lastTime = 0;
  private story = STORY;
  private raised = 0;
  private glanceDAngle = 0;
  private glanceDOrbit = 0;
  private glanceReturn = false;
  private readonly reduceMotion: boolean;

  constructor() {
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.camera = new PerspectiveCamera(30, 1, 0.1, 140);
    this.scene.background = new Color(token("--maze-void"));
    this.scene.add(this.board);

    this.materials = {
      floor: toon(token("--maze-floor")),
      boost: toon(token("--maze-boost"), token("--maze-boost"), 0.16),
      warp: toon(token("--maze-warp"), token("--maze-warp"), 0.14),
      ice: toon(token("--maze-ice"), token("--maze-ice-mark"), 0.1),
      crumble: makeCrumbleMat(),
      switch: toon(token("--maze-switch"), token("--maze-switch-0"), 0.12),
      start: toon(token("--maze-start")),
      goal: toon(token("--maze-goal-floor"), token("--maze-goal"), 0.24),
      wall: toon(token("--maze-wall")),
      grout: toon(token("--maze-grout")),
      frame: toon(token("--maze-frame")),
      pit: toon(token("--maze-pit")),
      lip: toon(token("--maze-lip"), token("--maze-lip"), 0.9),
      hatch: toon(token("--maze-hatch"), token("--maze-hatch"), 0.85),
      exit: toon(token("--maze-goal"), token("--maze-goal"), 0.9),
    };
    this.materials.pit.side = DoubleSide;
    this.materials.lip.toneMapped = false;
    this.materials.hatch.toneMapped = false;
    this.materials.exit.toneMapped = false;
    this.themeSurfaces = makeThemeSurfaces(ramp);

    this.goalRingMat = glow(token("--maze-goal"));
    this.goalRingMat.emissiveIntensity = 0.85;
    this.groundMats = {
      grass: toon(token("--maze-grass")),
      grassDark: toon(token("--maze-grass-dark")),
      sand: toon(token("--maze-sand")),
      sandDark: toon(token("--maze-sand-dark")),
      snow: toon(token("--maze-snow")),
      snowShade: toon(token("--maze-snow-shade")),
      dune: toon(token("--maze-dune")),
      duneDark: toon(token("--maze-dune-dark")),
      lavender: toon(token("--maze-lavender")),
      lavenderDark: toon(token("--maze-lavender-dark")),
      seabed: toon(token("--maze-seabed")),
      seabedDark: toon(token("--maze-seabed-dark")),
      seabedLit: toon(token("--maze-seabed-lit")),
      seabedSand: toon(token("--maze-seabed-sand")),
      pavement: toon(token("--maze-pavement")),
      pavementDark: toon(token("--maze-pavement-dark")),
      cobble: toon(token("--maze-cobble")),
      cobbleDark: toon(token("--maze-cobble-dark")),
      coral: toon(token("--maze-coral")),
      coralLit: toon(token("--maze-coral-lit")),
      anemone: toon(token("--maze-anemone")),
      seaweed: toon(token("--maze-seaweed")),
      building: toon(token("--maze-building")),
      buildingLit: toon(token("--maze-building-lit")),
      buildingBrick: toon(token("--maze-building-brick")),
      buildingGlass: toon(token("--maze-building-glass")),
      awning: toon(token("--maze-awning")),
      lamp: glow(token("--maze-lamp")),
      window: glow(token("--maze-window")),
      roof: toon(token("--maze-roof")),
      plaster: toon(token("--maze-plaster")),
      wreck: toon(token("--maze-wreck")),
      wreckDark: toon(token("--maze-wreck-dark")),
      fire: glow(token("--maze-fire")),
      fireCore: glow(token("--maze-fire-core")),
      ember: toon(token("--maze-ember")),
      basalt: toon(token("--maze-basalt")),
      basaltDark: toon(token("--maze-basalt-dark")),
      ash: toon(token("--maze-ash")),
      lavaGlow: glow(token("--maze-lava-glow")),
      moonDust: toon(token("--maze-moon-dust")),
      moonDustDark: toon(token("--maze-moon-dust-dark")),
      moonRock: toon(token("--maze-moon-rock")),
      venusGround: toon(token("--maze-venus-ground")),
      venusGroundDark: toon(token("--maze-venus-ground-dark")),
      venusRock: toon(token("--maze-venus-rock")),
      sulfur: toon(token("--maze-sulfur")),
      sulfurGlow: glow(token("--maze-sulfur-glow")),
      moss: toon(token("--maze-moss")),
      mossLit: toon(token("--maze-moss-lit")),
      mushroom: toon(token("--maze-mushroom")),
      mushroomCap: toon(token("--maze-mushroom-cap")),
      mushroomSpot: toon(token("--maze-mushroom-spot")),
      canopy: toon(token("--maze-canopy")),
      canopyLit: toon(token("--maze-canopy-lit")),
      canopyBright: toon(token("--maze-canopy-bright")),
      vine: toon(token("--maze-vine")),
      bromeliad: toon(token("--maze-bromeliad")),
      orchid: toon(token("--maze-orchid")),
      space: toon(token("--maze-space")),
      spaceDark: toon(token("--maze-space-dark")),
      star: glow(token("--maze-star")),
      auroraGreen: glow(token("--maze-aurora-green")),
      auroraTeal: glow(token("--maze-aurora-teal")),
      auroraViolet: glow(token("--maze-aurora-violet")),
      auroraPink: glow(token("--maze-aurora-pink")),
      auroraBlue: glow(token("--maze-aurora-blue")),
      discoFloor: toon(token("--maze-disco-floor")),
      discoFloorDark: toon(token("--maze-disco-floor-dark")),
    };
    this.discoMats = Array.from({ length: 8 }, (_, index) => glow(token(`--maze-disco-${index}`)));
    for (const mat of this.discoMats) mat.emissiveIntensity = 0.95;
    this.groundMats.window.emissiveIntensity = 0.7;
    this.groundMats.lamp.emissiveIntensity = 0.85;
    this.groundMats.fire.emissiveIntensity = 0.95;
    this.groundMats.fireCore.emissiveIntensity = 1.1;
    this.groundMats.lavaGlow.emissiveIntensity = 1.05;
    this.groundMats.sulfurGlow.emissiveIntensity = 0.85;
    this.groundMats.star.emissiveIntensity = 0.95;
    this.groundMats.auroraGreen.emissiveIntensity = 0.9;
    this.groundMats.auroraTeal.emissiveIntensity = 0.85;
    this.groundMats.auroraViolet.emissiveIntensity = 0.9;
    this.groundMats.auroraPink.emissiveIntensity = 0.85;
    this.groundMats.auroraBlue.emissiveIntensity = 0.8;
    this.streamMat = toon(token("--maze-stream"), token("--maze-stream"), 0.2);
    this.streamDeepMat = toon(token("--maze-stream-deep"), token("--maze-stream"), 0.12);
    this.lavaMat = toon(token("--maze-lava"), token("--maze-lava-glow"), 0.55);
    this.lavaDeepMat = toon(token("--maze-lava-deep"), token("--maze-lava"), 0.35);
    this.lavaMidMat = toon(token("--maze-lava-mid"), token("--maze-lava"), 0.45);
    this.lavaBrightMat = toon(token("--maze-lava-bright"), token("--maze-lava-glow"), 0.7);
    this.lavaCoolMat = toon(token("--maze-lava-cool"), token("--maze-lava-deep"), 0.2);
    this.oceanMat = toon(token("--maze-ocean"), token("--maze-ocean"), 0.18);
    this.oceanDeepMat = toon(token("--maze-ocean-deep"), token("--maze-stream"), 0.1);
    this.cactusMat = toon(token("--maze-cactus"));
    this.cactusLitMat = toon(token("--maze-cactus-lit"));
    this.palmMat = toon(token("--maze-palm"));
    this.palmLitMat = toon(token("--maze-palm-lit"));
    this.treeMats = {
      trunk: toon(token("--maze-trunk")),
      trunkPale: toon(token("--maze-trunk-pale")),
      leaf: toon(token("--maze-leaf")),
      leafLit: toon(token("--maze-leaf-lit")),
      pine: toon(token("--maze-pine")),
      pineLit: toon(token("--maze-pine-lit")),
      autumn: toon(token("--maze-autumn")),
      autumnLit: toon(token("--maze-autumn-lit")),
    };
    this.flowerMats = [
      glow(token("--maze-flower-0")),
      glow(token("--maze-flower-1")),
      glow(token("--maze-flower-2")),
      glow(token("--maze-flower-3")),
    ];
    for (const mat of this.flowerMats) mat.emissiveIntensity = 0.45;
    this.animalMats = {
      cow: toon(token("--maze-cow")),
      cowSpot: toon(token("--maze-cow-spot")),
      sheep: toon(token("--maze-sheep")),
      sheepFace: toon(token("--maze-sheep-face")),
      dog: toon(token("--maze-dog")),
      dogEar: toon(token("--maze-dog-ear")),
      horse: toon(token("--maze-horse")),
      horseMane: toon(token("--maze-horse-mane")),
      crab: toon(token("--maze-crab")),
      seagull: toon(token("--maze-seagull")),
      seagullWing: toon(token("--maze-seagull-wing")),
      turtle: toon(token("--maze-turtle")),
      turtleShell: toon(token("--maze-turtle-shell")),
      seal: toon(token("--maze-seal")),
      penguin: toon(token("--maze-penguin")),
      penguinBelly: toon(token("--maze-penguin-belly")),
      bear: toon(token("--maze-bear")),
      fox: toon(token("--maze-fox")),
      foxTip: toon(token("--maze-fox-tip")),
      hare: toon(token("--maze-hare")),
      camel: toon(token("--maze-camel")),
      lizard: toon(token("--maze-lizard")),
      snake: toon(token("--maze-snake")),
      scorpion: toon(token("--maze-scorpion")),
      chicken: toon(token("--maze-chicken")),
      chickenComb: toon(token("--maze-chicken-comb")),
      pig: toon(token("--maze-pig")),
      goat: toon(token("--maze-goat")),
      rabbit: toon(token("--maze-rabbit")),
      deer: toon(token("--maze-deer")),
      owl: toon(token("--maze-owl")),
      raccoon: toon(token("--maze-raccoon")),
      fish: toon(token("--maze-fish")),
      fishFin: toon(token("--maze-fish-fin")),
      octopus: toon(token("--maze-octopus")),
      seahorse: toon(token("--maze-seahorse")),
      ray: toon(token("--maze-ray")),
      shark: toon(token("--maze-shark")),
      sharkBelly: toon(token("--maze-shark-belly")),
      whale: toon(token("--maze-whale")),
      whaleBelly: toon(token("--maze-whale-belly")),
      jelly: toon(token("--maze-jelly"), token("--maze-jelly-glow"), 0.35),
      jellyGlow: glow(token("--maze-jelly-glow")),
      pigeon: toon(token("--maze-pigeon")),
      cat: toon(token("--maze-cat")),
      rat: toon(token("--maze-rat")),
      parrot: toon(token("--maze-parrot")),
      parrotWing: toon(token("--maze-parrot-wing")),
      parrotTail: toon(token("--maze-parrot-tail")),
      frog: toon(token("--maze-frog")),
      frogBelly: toon(token("--maze-frog-belly")),
      toucan: toon(token("--maze-toucan")),
      toucanBeak: toon(token("--maze-toucan-beak")),
      toucanChest: toon(token("--maze-toucan-chest")),
      monkey: toon(token("--maze-monkey")),
      monkeyFace: toon(token("--maze-monkey-face")),
    };
    this.animalMats.jellyGlow.emissiveIntensity = 0.7;
    this.floorMats = makeFloorMats();
    this.startRingMat = glow(token("--maze-start-mark"));
    this.startRingMat.emissiveIntensity = 0.28;
    this.boostMarkMat = glow(token("--maze-boost-mark"));
    this.warpMats = Array.from({ length: WARP_COLOR_COUNT }, (_, index) => glow(token(`--maze-warp-${index}`)));
    this.iceMarkMat = glow(token("--maze-ice-mark"));
    this.switchMats = Array.from({ length: SWITCH_COLOR_COUNT }, (_, index) => glow(token(`--maze-switch-${index}`)));
    this.arrowGeometry = arrowGeometry();
    this.heartGeometry = heartGeometry();
    this.heartMat = glow(token("--maze-heart"));
    this.heartMat.emissiveIntensity = 0.8;

    const hemi = new HemisphereLight(token("--maze-sky"), token("--maze-floor"), 0.7);
    const ambient = new AmbientLight("#ffffff", 0.28);
    this.key = new DirectionalLight("#fff6ea", 1.45);
    this.key.position.set(4.4, 12.8, 6.2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(512, 512);
    this.key.shadow.bias = -0.001;
    this.key.shadow.normalBias = 0.06;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 40;
    const fill = new DirectionalLight(token("--maze-sky"), 0.32);
    fill.position.set(-7.5, 5.5, -3.5);
    const rim = new DirectionalLight("#ffffff", 0.18);
    rim.position.set(-2.5, 7, -9);
    this.scene.add(hemi, ambient, this.key, this.key.target, fill, rim);

    this.goalLight = new PointLight(token("--maze-goal"), 3.2, 4.2, 2);
    this.board.add(this.goalLight);

    this.ball = new Mesh(facet(new SphereGeometry(BALL_R, 8, 6)), toon(token("--maze-ball")));
    this.ball.castShadow = true;
    const bandMat = new MeshBasicMaterial({ color: token("--maze-mark"), toneMapped: false });
    const bandGeo = new TorusGeometry(BALL_R * 0.98, BALL_R * 0.04, 5, 20);
    const bandA = new Mesh(bandGeo, bandMat);
    const bandB = new Mesh(bandGeo, bandMat);
    bandB.rotation.x = Math.PI / 2;
    this.ball.add(bandA, bandB);
    this.scene.add(this.ball);
  }

  setTower(layout: TowerLayout): void {
    this.tower = layout;
    this.story = layout.story;
    this.raised = 0;
    this.escaped = false;
    this.scene.background = new Color(token("--maze-void"));
    this.board.add(this.goalLight);
    this.clearDebris();
    this.clearMeadow();
    this.clearGenerated();
    this.floorGroups.length = 0;
    this.frames.length = 0;
    this.focusY = 0;
    this.goalAnchor = null;
    layout.floors.forEach((floor, index) => {
      const group = this.makeFloor(floor, -index * layout.story);
      this.frames[index] = this.addPieces(group, floor.pieces, floor.theme);
      this.addMarkers(group, floor, floor.finale);
      this.addTileMarks(group, floor);
      this.addHearts(group, floor);
      this.board.add(group);
      this.floorGroups.push(group);
      if (floor.finale) this.goalAnchor = { x: floor.goal.x, z: floor.goal.z, group };
    });
    this.placeGoalLight();
    this.fit();
    this.syncShell(0, true);
  }

  crumbleTop(): void {
    this.shatterFloor(this.topFloorIndex(), null);
  }

  shatterEscape(): void {
    const index = this.topFloorIndex();
    const group = index >= 0 ? this.floorGroups[index] : null;
    const blast = group
      ? (group.userData.exit as { x: number; z: number } | null) ??
        (group.userData.hatch as { x: number; z: number } | null)
      : null;
    this.shatterFloor(index, blast);
    this.escaped = true;
    this.goalAnchor = null;
    this.goalRing = null;
    this.goalLight.visible = false;
    this.winSceneIndex = Math.floor(Math.random() * WIN_SCENES.length);
    this.applyWinScene(this.winSceneIndex);
  }

  cycleWinScene(step = 1): boolean {
    if (!this.escaped) return false;
    const count = WIN_SCENES.length;
    this.winSceneIndex = ((this.winSceneIndex + step) % count + count) % count;
    this.applyWinScene(this.winSceneIndex);
    return true;
  }

  private applyWinScene(index: number): void {
    const scene = WIN_SCENES[index] ?? "pasture";
    this.buildWinScene(scene);
    this.scene.background = new Color(token(WIN_SKY[scene]));
  }

  rebase(dy: number): void {
    this.raised += dy;
    const up = new Vector3(0, dy, 0).applyQuaternion(this.board.quaternion);
    for (const group of this.floorGroups) {
      if (group) group.position.y += dy;
    }
    if (this.meadow) this.meadow.position.y += dy;
    for (const bit of this.debris) bit.mesh.position.add(up);
    this.focusY += dy;
    this.placeGoalLight();
    this.placeCamera();
  }

  appendFloor(layout: MazeLayout): void {
    const tower = this.tower;
    if (!tower) return;
    const index = this.floorGroups.length;
    const group = this.makeFloor(layout, -index * this.story + this.raised);
    this.frames[index] = this.addPieces(group, layout.pieces, layout.theme);
    this.addMarkers(group, layout, layout.finale);
    this.addTileMarks(group, layout);
    this.addHearts(group, layout);
    this.board.add(group);
    this.floorGroups.push(group);
    if (layout.finale) this.goalAnchor = { x: layout.goal.x, z: layout.goal.z, group };
    tower.width = Math.max(tower.width, layout.width);
    tower.depth = Math.max(tower.depth, layout.depth);
    this.placeGoalLight();
    this.fit();
  }

  collectHeart(cell: string): void {
    const group = this.floorGroups[this.currentFloor()];
    for (let i = this.hearts.length - 1; i >= 0; i -= 1) {
      const heart = this.hearts[i];
      if (!heart || heart.taken || heart.cell !== cell || heart.group !== group) continue;
      if (this.reduceMotion) {
        this.dropHeart(heart);
        this.hearts.splice(i, 1);
        continue;
      }
      heart.taken = true;
      heart.age = 0;
      if (heart.mesh.material instanceof MeshToonMaterial) {
        const mat = heart.mesh.material.clone();
        mat.transparent = true;
        heart.mesh.material = mat;
        heart.mesh.userData.owned = true;
      }
    }
  }

  resize(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  useSettings(settings: PlaySettings): void {
    this.settings = settings;
    this.applyPicture();
    this.applyCamera();
  }

  applyPicture(): void {
    const steps = this.settings?.values.shade ?? 3;
    if (Math.abs(steps - paintedSteps) < 0.001) return;
    paintRamp(ramp, steps);
  }

  applyCamera(): void {
    this.restCamera();
    const field = this.settings?.values.field ?? 30;
    if (this.camera.fov !== field) {
      this.camera.fov = field;
      this.camera.updateProjectionMatrix();
    }
    this.fit();
  }

  nudgeCamera(dAngle: number, dOrbit: number): void {
    if (dAngle === 0 && dOrbit === 0) return;
    const playAngle = this.playAngle();
    const nextAngle = clamp(playAngle + this.glanceDAngle + dAngle, ANGLE_MIN, ANGLE_MAX);
    this.glanceDAngle = nextAngle - playAngle;
    this.glanceDOrbit = wrapDegrees(this.glanceDOrbit + dOrbit);
    this.glanceReturn = false;
    if (Math.abs(this.glanceDAngle) < 0.05 && Math.abs(this.glanceDOrbit) < 0.05) this.restCamera();
  }

  recallCamera(): void {
    if (this.glanceDAngle === 0 && this.glanceDOrbit === 0) return;
    if (this.reduceMotion) {
      this.restCamera();
      return;
    }
    this.glanceReturn = true;
  }

  stepCamera(dt: number): void {
    if (!this.glanceReturn) return;
    if (Math.abs(this.glanceDAngle) < 0.12 && Math.abs(this.glanceDOrbit) < 0.12) {
      this.restCamera();
      return;
    }
    const k = 1 - Math.exp(-4.5 * dt);
    this.glanceDAngle += (0 - this.glanceDAngle) * k;
    this.glanceDOrbit = wrapDegrees(this.glanceDOrbit + (0 - this.glanceDOrbit) * k);
  }

  restCamera(): void {
    this.glanceDAngle = 0;
    this.glanceDOrbit = 0;
    this.glanceReturn = false;
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
    this.tickHearts(time, dt);
    if (this.reduceMotion) return;
    if (this.goalRing) {
      const wave = Math.sin(time * 2.2);
      this.goalRing.scale.setScalar(1 + wave * 0.03);
      this.goalRingMat.emissiveIntensity = 0.75 + wave * 0.25;
    }
    if (this.escaped) {
      for (const [index, flower] of this.meadowFlowers.entries()) {
        const baseY = typeof flower.userData.baseY === "number"
          ? flower.userData.baseY
          : flower.position.y;
        flower.userData.baseY = baseY;
        flower.position.y = baseY + Math.sin(time * 1.8 + index * 0.7) * 0.012;
        if (flower.userData.spin !== false) {
          flower.rotation.y = time * 0.35 + index;
        }
      }
      for (const [index, animal] of this.meadowAnimals.entries()) {
        const hop = Math.abs(Math.sin(time * 4.2 + index * 1.1));
        const bob = animal.baseY > 0.2 ? hop * 0.12 : hop * 0.2;
        animal.group.position.y = animal.baseY + bob;
        const s = animal.scale;
        animal.group.scale.setScalar(s);
        animal.group.rotation.y = animal.facing + Math.sin(time * 0.7 + index * 1.3) * 0.08;
      }
      for (const [index, flame] of this.meadowFlames.entries()) {
        if (flame.userData.flickerScale !== false) {
          const flicker = 0.85 + Math.sin(time * 14 + index * 2.1) * 0.2;
          flame.scale.set(flicker, 0.9 + Math.sin(time * 11 + index) * 0.35, flicker);
        }
        if (flame.material instanceof MeshToonMaterial) {
          flame.material.emissiveIntensity = 0.75 + Math.sin(time * 16 + index) * 0.35;
        }
      }
      if (this.meadowLight) {
        this.meadowLight.intensity = 2.4 + Math.sin(time * 12) * 0.6;
      }
      if (this.meadowDisco.length > 0 && this.discoMats.length > 0) {
        const beat = Math.floor(time * 5.5);
        for (const tile of this.meadowDisco) {
          const wave = beat + tile.row * 2 + tile.col + Math.floor(tile.phase);
          const mat = this.discoMats[((wave % this.discoMats.length) + this.discoMats.length) % this.discoMats.length];
          if (mat) tile.mesh.material = mat;
          const pulse = 0.55 + Math.abs(Math.sin(time * 8 + tile.phase)) * 0.55;
          tile.mesh.scale.set(1, pulse, 1);
          tile.mesh.position.y = 0.03 + pulse * 0.04;
        }
        if (this.meadowLight) {
          const glowMat = this.discoMats[beat % this.discoMats.length];
          if (glowMat) {
            this.meadowLight.color.set(glowMat.emissive);
            this.meadowLight.intensity = 3.2 + Math.sin(time * 14) * 1.2;
          }
        }
      }
      if (this.meadowDiscoBall) {
        this.meadowDiscoBall.rotation.y = time * 1.8;
        this.meadowDiscoBall.position.y = 2.1 + Math.sin(time * 2.2) * 0.08;
      }
    }
    this.boostMarkMat.emissiveIntensity = 0.55 + Math.sin(time * 4.5) * 0.28;
    this.iceMarkMat.emissiveIntensity = 0.35 + Math.sin(time * 1.6) * 0.12;
    for (const [index, mat] of this.warpMats.entries()) {
      mat.emissiveIntensity = 0.55 + Math.sin(time * 2.2 + index * 0.7) * 0.25;
    }
    for (const spin of this.warpSpins) spin.rotation.y = time * 0.65;
  }

  private makeFloor(layout: MazeLayout, y: number): Group {
    const group = new Group();
    group.position.y = y;
    group.userData.generated = true;
    group.userData.pieces = layout.pieces;
    group.userData.hatch = layout.hatch;
    group.userData.exit = layout.finale ? layout.goal : null;
    return group;
  }

  private topFloorIndex(): number {
    let index = -1;
    let top = -Infinity;
    this.floorGroups.forEach((group, i) => {
      if (!group || group.position.y <= top) return;
      top = group.position.y;
      index = i;
    });
    return index;
  }

  private shatterFloor(index: number, blast: { x: number; z: number } | null): void {
    const group = index >= 0 ? this.floorGroups[index] : null;
    if (!group) return;
    if (!this.reduceMotion) {
      const pieces = group.userData.pieces as Piece[] | undefined;
      const hatch =
        blast ??
        (group.userData.hatch as { x: number; z: number } | null) ??
        (group.userData.exit as { x: number; z: number } | null);
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

  private addHearts(parent: Group, layout: MazeLayout): void {
    for (const heart of layout.hearts) {
      const mesh = new Mesh(this.heartGeometry, this.heartMat);
      mesh.position.set(heart.x, 0.38, heart.z);
      mesh.castShadow = true;
      mesh.renderOrder = 2;
      parent.add(mesh);
      this.hearts.push({
        mesh,
        cell: `${heart.c},${heart.r}`,
        group: parent,
        taken: false,
        age: 0,
        baseY: 0.38,
      });
    }
  }

  private tickHearts(time: number, dt: number): void {
    for (let i = this.hearts.length - 1; i >= 0; i -= 1) {
      const heart = this.hearts[i];
      if (!heart) continue;
      if (!heart.mesh.parent) {
        this.hearts.splice(i, 1);
        continue;
      }
      if (!heart.taken) {
        if (this.reduceMotion) continue;
        heart.mesh.rotation.y = time * 1.7;
        heart.mesh.position.y = heart.baseY + Math.sin(time * 2.4 + heart.mesh.position.x) * 0.03;
        continue;
      }
      heart.age += dt;
      const rise = Math.min(1, heart.age / 0.28);
      heart.mesh.position.y = heart.baseY + rise * 0.42;
      heart.mesh.scale.setScalar(1 + rise * 0.35);
      heart.mesh.rotation.y += dt * 4;
      const mat = heart.mesh.material;
      if (mat instanceof MeshToonMaterial) mat.opacity = 1 - rise;
      if (rise < 1) continue;
      this.dropHeart(heart);
      this.hearts.splice(i, 1);
    }
  }

  private dropHeart(heart: HeartBit): void {
    heart.group.remove(heart.mesh);
    if (heart.mesh.userData.owned === true && heart.mesh.material instanceof MeshToonMaterial) {
      heart.mesh.material.dispose();
    }
  }

  private addPieces(parent: Group, pieces: Piece[], theme: FloorThemeId): Mesh | null {
    const surfaces = this.themeSurfaces.get(theme);
    const groups = new Map<PieceKind, BufferGeometry[]>();
    for (const piece of pieces) {
      if (piece.gate || piece.kind === "crumble") {
        this.addLoose(parent, piece, theme);
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
      const mesh = new Mesh(merged, this.surfaceMaterial(kind, surfaces));
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
      if (kind === "frame") {
        frame = mesh;
        mesh.userData.theme = theme;
      }
      parent.add(mesh);
    }
    return frame;
  }

  private surfaceMaterial(kind: PieceKind, surfaces: ThemeSurfaces | undefined): MeshToonMaterial {
    if (surfaces) {
      if (kind === "floor") return surfaces.floor;
      if (kind === "start") return surfaces.start;
      if (kind === "wall") return surfaces.wall;
      if (kind === "grout") return surfaces.grout;
      if (kind === "frame") return surfaces.frame;
    }
    return this.materials[kind];
  }

  private syncShell(dt: number, snap: boolean): void {
    const current = this.currentFloor();
    let glass: MeshToonMaterial | null = null;
    for (let index = 0; index < this.frames.length; index += 1) {
      const mesh = this.frames[index];
      if (!mesh) continue;
      const theme = (mesh.userData.theme as FloorThemeId | undefined) ?? DEFAULT_FLOOR_THEME;
      const surfaces = this.themeSurfaces.get(theme);
      if (!surfaces) continue;
      if (index === current) {
        if (mesh.material !== surfaces.glass) {
          mesh.material = surfaces.glass;
          mesh.castShadow = false;
          mesh.renderOrder = 2;
          surfaces.glass.opacity = snap ? SHELL_ALPHA : 1;
        }
        glass = surfaces.glass;
        continue;
      }
      if (mesh.material !== surfaces.frame) {
        mesh.material = surfaces.frame;
        mesh.castShadow = true;
        mesh.renderOrder = 0;
      }
    }
    if (!glass) return;
    const blend = snap ? 1 : 1 - Math.exp(-8 * dt);
    glass.opacity += (SHELL_ALPHA - glass.opacity) * blend;
    glass.depthWrite = glass.opacity > 0.85;
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
    const start = new Mesh(facet(new TorusGeometry(0.26, 0.04, 4, 8)), this.startRingMat);
    start.rotation.x = Math.PI / 2;
    start.position.set(layout.start.x, 0.03, layout.start.z);
    parent.add(start);
    if (!showGoal) return;

    const ring = new Mesh(facet(new TorusGeometry(0.34, 0.045, 4, 8)), this.goalRingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(layout.goal.x, 0.045, layout.goal.z);
    this.goalRing = ring;
    parent.add(ring);
  }

  private buildWinScene(kind: WinSceneKind): void {
    this.clearMeadow();
    const tower = this.tower;
    if (!tower) return;
    const span = Math.max(tower.width, tower.depth) * 2.8;
    const group = new Group();
    group.position.y = -MEADOW_DROP;
    group.visible = true;
    group.userData.generated = true;
    this.addGround(group, span, kind);
    if (kind === "pasture") {
      const stream = meadowStream(span);
      this.addRibbon(group, stream, this.streamDeepMat, this.streamMat);
      this.addMixedTrees(group, span, stream);
      this.addScatter(group, span, stream, this.groundMats.grassDark, true);
    } else if (kind === "beach") {
      this.addShore(group, span);
      this.addPalms(group, span);
      this.addScatter(group, span, null, this.groundMats.sandDark, false);
    } else if (kind === "snow") {
      this.addPineGrove(group, span);
      this.addDrifts(group, span);
    } else if (kind === "desert") {
      this.addCacti(group, span);
      this.addRocks(group, span);
    } else if (kind === "orchard") {
      this.addOrchardRows(group, span);
      this.addScatter(group, span, null, this.groundMats.grassDark, true);
    } else if (kind === "twilight") {
      this.addTwilightTrees(group, span);
      this.addScatter(group, span, null, this.groundMats.lavenderDark, true);
    } else if (kind === "underwater") {
      this.addReef(group, span);
      this.addSeaweed(group, span);
      this.addShipwreck(group, span);
    } else if (kind === "city") {
      this.addCityBlocks(group, span);
    } else if (kind === "village") {
      this.addVillage(group, span);
      this.addBonfire(group);
    } else if (kind === "lava") {
      const river = meadowStream(span);
      this.addLavaRiver(group, river);
      this.addLavaField(group, span, river);
    } else if (kind === "moon") {
      this.addMoonscape(group, span);
    } else if (kind === "venus") {
      this.addVenusField(group, span);
    } else if (kind === "forest") {
      const brook = meadowStream(span);
      this.addRibbon(group, brook, this.streamDeepMat, this.streamMat);
      this.addFunForest(group, span, brook);
    } else if (kind === "rainforest") {
      const river = meadowStream(span);
      this.addRibbon(group, river, this.streamDeepMat, this.streamMat);
      this.addRainforest(group, span, river);
    } else if (kind === "aurora") {
      this.addAuroraSpace(group, span);
    } else {
      this.addDiscoFloor(group, span);
    }
    const riverScene = kind === "pasture" || kind === "lava" || kind === "forest" || kind === "rainforest";
    this.addAnimals(group, span, kind, riverScene ? meadowStream(span) : null);
    this.board.add(group);
    this.meadow = group;
  }

  private addGround(parent: Group, span: number, kind: WinSceneKind): void {
    const sideMats: Record<WinSceneKind, MeshToonMaterial> = {
      pasture: this.groundMats.grassDark,
      beach: this.groundMats.sandDark,
      snow: this.groundMats.snowShade,
      desert: this.groundMats.duneDark,
      orchard: this.groundMats.grassDark,
      twilight: this.groundMats.lavenderDark,
      underwater: this.groundMats.seabedDark,
      city: this.groundMats.pavementDark,
      village: this.groundMats.cobbleDark,
      lava: this.groundMats.basaltDark,
      moon: this.groundMats.moonDustDark,
      venus: this.groundMats.venusGroundDark,
      forest: this.groundMats.moss,
      rainforest: this.groundMats.canopy,
      aurora: this.groundMats.spaceDark,
      disco: this.groundMats.discoFloorDark,
    };
    const pad = new Mesh(new BoxGeometry(span, 0.22, span), sideMats[kind]);
    pad.position.y = -0.11;
    parent.add(pad);

    const floorMat = this.floorMats[kind];
    const tiles = Math.max(4, Math.round(span / 2.4));
    if (floorMat.map) {
      floorMat.map.repeat.set(tiles, tiles);
      floorMat.map.needsUpdate = true;
    }
    const carpet = new Mesh(new PlaneGeometry(span, span), floorMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.01;
    parent.add(carpet);
    this.addFloorDetail(parent, span, kind);
  }

  private addFloorDetail(parent: Group, span: number, kind: WinSceneKind): void {
    if (kind === "moon") this.addMoonCraters(parent, span);
    else if (kind === "underwater") this.addSeabedFloor(parent, span);
  }

  private addMoonCraters(parent: Group, span: number): void {
    const craters = [
      { x: 0.2, z: -0.14, r: 0.2 },
      { x: -0.26, z: 0.18, r: 0.14 },
      { x: 0.08, z: 0.26, r: 0.1 },
    ];
    for (const [index, crater] of craters.entries()) {
      const x = crater.x * span;
      const z = crater.z * span;
      const rim = flatDisc(crater.r * span * 1.12, this.groundMats.moonRock);
      rim.position.set(x, 0.04 + index * 0.002, z);
      parent.add(rim);
      const bowl = flatDisc(crater.r * span, this.groundMats.moonDustDark);
      bowl.position.set(x, 0.05 + index * 0.002, z);
      parent.add(bowl);
      const floor = flatDisc(crater.r * span * 0.55, this.groundMats.moonDust);
      floor.position.set(x, 0.06 + index * 0.002, z);
      parent.add(floor);
    }
  }

  private addSeabedFloor(parent: Group, span: number): void {
    const accents = [
      { x: 0.22, z: -0.18, r: 0.1, mat: this.groundMats.seabedSand },
      { x: -0.26, z: 0.16, r: 0.09, mat: this.groundMats.coral },
      { x: 0.12, z: 0.24, r: 0.08, mat: this.groundMats.anemone },
      { x: -0.18, z: -0.24, r: 0.09, mat: this.groundMats.coralLit },
      { x: 0.3, z: 0.06, r: 0.07, mat: this.groundMats.seabedSand },
    ];
    for (const [index, patch] of accents.entries()) {
      const disc = flatDisc(patch.r * span, patch.mat);
      disc.position.set(patch.x * span, 0.05 + index * 0.002, patch.z * span);
      parent.add(disc);
    }
  }

  private addLavaField(parent: Group, span: number, river: CatmullRomCurve3): void {
    const rim = span * 0.34;
    for (let i = 0; i < 9; i += 1) {
      const a = i * 2.2;
      const x = Math.cos(a) * rim * 0.85;
      const z = Math.sin(a) * rim * 0.7;
      if (nearStream(x, z, river, 0.7)) continue;
      const rock = new Mesh(
        new BoxGeometry(0.28 + (i % 3) * 0.1, 0.22 + (i % 2) * 0.12, 0.24 + (i % 4) * 0.06),
        i % 2 === 0 ? this.groundMats.basaltDark : this.groundMats.ash,
      );
      rock.position.set(x, 0.12, z);
      parent.add(rock);
    }
    const cone = new Group();
    cone.position.set(span * 0.22, 0, -span * 0.18);
    voxel(cone, this.groundMats.basalt, 0.55, 0.35, 0.55, 0, 0.35, 0);
    voxel(cone, this.groundMats.basaltDark, 0.38, 0.28, 0.38, 0, 0.78, 0);
    voxel(cone, this.groundMats.basalt, 0.22, 0.18, 0.22, 0, 1.1, 0);
    voxel(cone, this.groundMats.lavaGlow, 0.12, 0.08, 0.12, 0, 1.28, 0);
    parent.add(cone);
    this.meadowFlames.push(cone.children[cone.children.length - 1] as Mesh);

    for (let i = 0; i < 7; i += 1) {
      const a = i * 1.9 + 0.4;
      const x = Math.cos(a) * rim * 0.55;
      const z = Math.sin(a) * rim * 0.5;
      if (nearStream(x, z, river, 0.55)) continue;
      const crack = new Mesh(new BoxGeometry(0.18 + (i % 3) * 0.08, 0.04, 0.06), this.groundMats.lavaGlow);
      crack.position.set(x, 0.04, z);
      crack.rotation.y = a;
      crack.userData.flickerScale = false;
      parent.add(crack);
      this.meadowFlames.push(crack);
    }

    const light = new PointLight(token("--maze-lava"), 3.2, 12, 2);
    light.position.set(0, 1.2, 0);
    parent.add(light);
    this.meadowLight = light;
  }

  private addMoonscape(parent: Group, span: number): void {
    const rim = span * 0.36;
    for (let i = 0; i < 10; i += 1) {
      const a = i * 1.7 + 0.3;
      const boulder = new Mesh(
        new BoxGeometry(0.16 + (i % 4) * 0.06, 0.12 + (i % 3) * 0.05, 0.14 + (i % 2) * 0.05),
        i % 2 === 0 ? this.groundMats.moonRock : this.groundMats.moonDustDark,
      );
      boulder.position.set(Math.cos(a) * rim * 0.9, 0.08, Math.sin(a) * rim * 0.75);
      parent.add(boulder);
    }
    const lander = new Group();
    lander.position.set(-span * 0.12, 0, span * 0.08);
    voxel(lander, this.groundMats.moonDust, 0.18, 0.08, 0.18, 0, 0.22, 0);
    voxel(lander, this.groundMats.moonRock, 0.1, 0.14, 0.1, 0, 0.4, 0);
    voxel(lander, this.groundMats.buildingLit, 0.06, 0.04, 0.06, 0, 0.56, 0);
    for (const [x, z] of [[0.2, 0.2], [0.2, -0.2], [-0.2, 0.2], [-0.2, -0.2]] as const) {
      voxel(lander, this.groundMats.moonRock, 0.02, 0.16, 0.02, x, 0.16, z);
      voxel(lander, this.groundMats.moonDustDark, 0.05, 0.02, 0.05, x, 0.02, z);
    }
    parent.add(lander);

    const flag = new Group();
    flag.position.set(span * 0.08, 0, -span * 0.1);
    voxel(flag, this.groundMats.moonRock, 0.02, 0.35, 0.02, 0, 0.35, 0);
    voxel(flag, this.groundMats.fire, 0.14, 0.08, 0.02, 0.14, 0.58, 0);
    parent.add(flag);
  }

  private addVenusField(parent: Group, span: number): void {
    const rim = span * 0.36;
    for (let i = 0; i < 7; i += 1) {
      const a = i * 2.15;
      const ridge = new Mesh(
        new BoxGeometry(0.55 + (i % 3) * 0.2, 0.28 + (i % 2) * 0.16, 0.22 + (i % 4) * 0.06),
        i % 2 === 0 ? this.groundMats.venusRock : this.groundMats.venusGroundDark,
      );
      ridge.position.set(Math.cos(a) * rim * 0.8, 0.16, Math.sin(a) * rim * 0.7);
      ridge.rotation.y = a * 0.4;
      parent.add(ridge);
    }
    for (let i = 0; i < 8; i += 1) {
      const a = i * 1.85 + 0.5;
      const vent = new Group();
      vent.position.set(Math.cos(a) * rim * 0.55, 0, Math.sin(a) * rim * 0.5);
      voxel(vent, this.groundMats.venusRock, 0.1, 0.08, 0.1, 0, 0.1, 0);
      voxel(vent, this.groundMats.sulfur, 0.06, 0.1, 0.06, 0, 0.24, 0);
      voxel(vent, this.groundMats.sulfurGlow, 0.04, 0.12, 0.04, 0, 0.4, 0);
      parent.add(vent);
      const plume = vent.children[vent.children.length - 1] as Mesh;
      plume.userData.flickerScale = false;
      this.meadowFlames.push(plume);
    }
    const light = new PointLight(token("--maze-sulfur-glow"), 2.4, 10, 2);
    light.position.set(0, 1.0, 0);
    parent.add(light);
    this.meadowLight = light;
  }

  private addReef(parent: Group, span: number): void {
    const rim = span * 0.34;
    for (let i = 0; i < 14; i += 1) {
      const a = i * 2.05;
      const coral = new Group();
      const palette = [
        this.groundMats.coral,
        this.groundMats.coralLit,
        this.groundMats.anemone,
        this.groundMats.seabedLit,
      ];
      const mat = palette[i % palette.length]!;
      voxel(coral, mat, 0.06, 0.16 + (i % 3) * 0.05, 0.06, 0, 0.2, 0);
      voxel(coral, mat, 0.05, 0.1, 0.05, 0.1, 0.28, 0.04);
      voxel(coral, mat, 0.05, 0.1, 0.05, -0.08, 0.26, -0.05);
      if (i % 3 === 0) {
        voxel(coral, this.groundMats.coralLit, 0.08, 0.05, 0.08, 0, 0.38, 0);
      }
      coral.position.set(Math.cos(a) * rim, 0, Math.sin(a) * rim * 0.85);
      parent.add(coral);
    }
  }

  private addSeaweed(parent: Group, span: number): void {
    const rim = span * 0.38;
    for (let i = 0; i < 20; i += 1) {
      const a = i * 1.7 + 0.4;
      const weed = new Mesh(
        new BoxGeometry(0.05, 0.4 + (i % 4) * 0.1, 0.05),
        this.groundMats.seaweed,
      );
      weed.position.set(Math.cos(a) * rim * 0.9, 0.24, Math.sin(a) * rim * 0.75);
      weed.userData.baseY = weed.position.y;
      weed.userData.spin = false;
      parent.add(weed);
      this.meadowFlowers.push(weed);
    }
  }

  private addShipwreck(parent: Group, span: number): void {
    const wreck = new Group();
    wreck.position.set(-span * 0.12, 0.12, span * 0.08);
    wreck.rotation.z = 0.35;
    wreck.rotation.y = -0.55;
    voxel(wreck, this.groundMats.wreck, 0.7, 0.18, 0.28, 0, 0.2, 0);
    voxel(wreck, this.groundMats.wreckDark, 0.55, 0.08, 0.22, 0.05, 0.38, 0);
    voxel(wreck, this.groundMats.wreck, 0.08, 0.55, 0.08, -0.35, 0.55, 0);
    voxel(wreck, this.groundMats.wreckDark, 0.06, 0.28, 0.06, -0.35, 0.95, 0.12);
    voxel(wreck, this.groundMats.wreck, 0.22, 0.05, 0.05, -0.2, 0.85, 0);
    voxel(wreck, this.groundMats.wreckDark, 0.12, 0.12, 0.04, 0.45, 0.22, 0.2);
    voxel(wreck, this.groundMats.wreck, 0.1, 0.08, 0.16, 0.55, 0.1, -0.05);
    parent.add(wreck);
  }

  private addCityBlocks(parent: Group, span: number): void {
    const unit = span * 0.12;
    const street = new Mesh(new BoxGeometry(unit * 1.4, 0.05, span * 0.92), this.groundMats.pavementDark);
    street.position.set(0, 0.02, 0);
    const cross = new Mesh(new BoxGeometry(span * 0.92, 0.05, unit * 1.4), this.groundMats.pavementDark);
    cross.position.set(0, 0.025, 0);
    parent.add(street, cross);

    const sidewalkA = new Mesh(new BoxGeometry(unit * 0.35, 0.06, span * 0.7), this.groundMats.pavement);
    sidewalkA.position.set(-unit * 1.05, 0.04, 0);
    const sidewalkB = sidewalkA.clone();
    sidewalkB.position.x = unit * 1.05;
    parent.add(sidewalkA, sidewalkB);

    const towers: {
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      style: "glass" | "brick" | "stone";
      stepped?: boolean;
    }[] = [
      { x: -2.4, z: 2.0, w: 1.7, d: 1.5, h: 2.4, style: "brick" },
      { x: -0.7, z: 2.2, w: 1.3, d: 1.3, h: 3.2, style: "glass", stepped: true },
      { x: 1.9, z: 1.9, w: 1.8, d: 1.5, h: 1.9, style: "stone" },
      { x: -2.2, z: -1.9, w: 1.6, d: 1.4, h: 2.7, style: "glass" },
      { x: 0.2, z: -2.2, w: 1.5, d: 1.5, h: 3.6, style: "stone", stepped: true },
      { x: 2.3, z: -1.7, w: 1.5, d: 1.3, h: 2.1, style: "brick" },
      { x: 2.4, z: 0.2, w: 1.2, d: 1.2, h: 2.9, style: "glass" },
      { x: -2.5, z: 0.1, w: 1.3, d: 1.2, h: 1.7, style: "brick" },
    ];

    for (const tower of towers) {
      parent.add(this.makeCityTower(tower.x * unit, tower.z * unit, tower.w * unit, tower.d * unit, tower.h, tower.style, tower.stepped === true));
    }

    for (const [x, z] of [[-1.1, 1.1], [1.1, 1.1], [-1.1, -1.1], [1.1, -1.1]] as const) {
      parent.add(makeStreetLamp(x * unit, z * unit, this.groundMats.buildingLit, this.groundMats.lamp));
    }
  }

  private makeCityTower(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    style: "glass" | "brick" | "stone",
    stepped: boolean,
  ): Group {
    const tower = new Group();
    tower.position.set(x, 0, z);
    const bodyMat =
      style === "glass"
        ? this.groundMats.buildingGlass
        : style === "brick"
          ? this.groundMats.buildingBrick
          : this.groundMats.building;
    const podium = new Mesh(new BoxGeometry(w * 1.12, 0.28, d * 1.12), this.groundMats.buildingLit);
    podium.position.y = 0.14;
    const body = new Mesh(new BoxGeometry(w, h, d), bodyMat);
    body.position.y = 0.28 + h / 2;
    tower.add(podium, body);

    if (style !== "glass") {
      const awning = new Mesh(new BoxGeometry(w * 0.7, 0.06, 0.18), this.groundMats.awning);
      awning.position.set(0, 0.42, d * 0.55);
      tower.add(awning);
      const door = new Mesh(new BoxGeometry(0.18, 0.28, 0.06), this.groundMats.wreckDark);
      door.position.set(0, 0.28, d * 0.56);
      tower.add(door);
    }

    const floors = Math.max(3, Math.floor(h / 0.38));
    const cols = Math.max(2, Math.floor(w / 0.28));
    for (let row = 0; row < floors; row += 1) {
      const wy = 0.55 + row * (h * 0.75) / Math.max(1, floors - 1);
      for (let col = 0; col < cols; col += 1) {
        const wx = -w * 0.35 + (col / Math.max(1, cols - 1)) * w * 0.7;
        const front = new Mesh(new BoxGeometry(0.1, 0.1, 0.04), this.groundMats.window);
        front.position.set(wx, wy, d * 0.51);
        const back = front.clone();
        back.position.z = -d * 0.51;
        tower.add(front, back);
      }
      if (row % 2 === 0) {
        for (let col = 0; col < cols; col += 1) {
          const wz = -d * 0.35 + (col / Math.max(1, cols - 1)) * d * 0.7;
          const side = new Mesh(new BoxGeometry(0.04, 0.1, 0.1), this.groundMats.window);
          side.position.set(w * 0.51, wy, wz);
          tower.add(side);
        }
      }
    }

    if (stepped) {
      const mid = new Mesh(new BoxGeometry(w * 0.72, h * 0.28, d * 0.72), bodyMat);
      mid.position.y = 0.28 + h + h * 0.14;
      const top = new Mesh(new BoxGeometry(w * 0.45, h * 0.22, d * 0.45), this.groundMats.buildingLit);
      top.position.y = mid.position.y + h * 0.22;
      tower.add(mid, top);
      const mast = new Mesh(new BoxGeometry(0.06, 0.35, 0.06), this.groundMats.buildingLit);
      mast.position.y = top.position.y + 0.28;
      tower.add(mast);
    } else {
      const cap = new Mesh(new BoxGeometry(w * 1.06, 0.12, d * 1.06), this.groundMats.buildingLit);
      cap.position.y = 0.28 + h + 0.06;
      tower.add(cap);
      if (style === "brick") {
        const tank = new Mesh(new BoxGeometry(0.28, 0.2, 0.28), this.groundMats.pavementDark);
        tank.position.set(w * 0.15, cap.position.y + 0.16, -d * 0.1);
        tower.add(tank);
      }
    }
    return tower;
  }

  private addVillage(parent: Group, span: number): void {
    const rim = span * 0.34;
    const houses = [
      { x: -0.75, z: 0.35, s: 1.1 },
      { x: -0.25, z: 0.55, s: 0.95 },
      { x: 0.55, z: 0.4, s: 1.2 },
      { x: -0.55, z: -0.5, s: 1.0 },
      { x: 0.35, z: -0.55, s: 1.15 },
    ];
    for (const house of houses) {
      parent.add(makeCottage(house.x * rim, house.z * rim, house.s, {
        plaster: this.groundMats.plaster,
        roof: this.groundMats.roof,
        trunk: this.treeMats.trunk,
        window: this.groundMats.window,
      }));
    }
    parent.add(makeTree("oak", rim * 0.8, rim * -0.15, 1.3, this.treeMats));
    parent.add(makeTree("pine", rim * -0.85, rim * -0.2, 1.5, this.treeMats));
  }

  private addBonfire(parent: Group): void {
    const pit = new Mesh(new BoxGeometry(0.55, 0.08, 0.55), this.groundMats.cobbleDark);
    pit.position.set(0, 0.04, 0);
    parent.add(pit);
    for (const [x, z] of [[-0.16, 0.1], [0.14, 0.12], [-0.08, -0.14], [0.12, -0.1]] as const) {
      const log = new Mesh(new BoxGeometry(0.28, 0.08, 0.08), this.treeMats.trunk);
      log.position.set(x, 0.1, z);
      log.rotation.y = x + z;
      parent.add(log);
    }
    const core = new Mesh(new BoxGeometry(0.16, 0.28, 0.16), this.groundMats.fireCore);
    core.position.set(0, 0.28, 0);
    const flameA = new Mesh(new BoxGeometry(0.2, 0.34, 0.12), this.groundMats.fire);
    flameA.position.set(0.04, 0.36, 0.02);
    const flameB = new Mesh(new BoxGeometry(0.12, 0.28, 0.18), this.groundMats.fire);
    flameB.position.set(-0.05, 0.34, -0.03);
    const ember = new Mesh(new BoxGeometry(0.22, 0.08, 0.22), this.groundMats.ember);
    ember.position.set(0, 0.16, 0);
    parent.add(core, flameA, flameB, ember);
    this.meadowFlames.push(core, flameA, flameB);
    const light = new PointLight(token("--maze-fire"), 2.6, 8, 2);
    light.position.set(0, 0.7, 0);
    parent.add(light);
    this.meadowLight = light;
  }

  private addAnimals(
    parent: Group,
    span: number,
    scene: WinSceneKind,
    stream: CatmullRomCurve3 | null,
  ): void {
    const rim = span * 0.32;
    const kinds = SCENE_ANIMALS[scene];
    const places = [
      { x: -rim * 0.7, z: rim * 0.55, facing: 0.6 },
      { x: rim * 0.65, z: rim * 0.35, facing: -0.9 },
      { x: rim * 0.15, z: -rim * 0.7, facing: 2.4 },
      { x: -rim * 0.35, z: -rim * 0.45, facing: -2.1 },
    ];
    for (const [index, place] of places.entries()) {
      const kind = kinds[index];
      if (!kind) continue;
      if (stream && nearStream(place.x, place.z, stream, 0.7)) {
        place.z += place.z >= 0 ? 1.1 : -1.1;
      }
      const animal = makeAnimal(kind, this.animalMats);
      const floatY = scene === "aurora" ? 0.55 + index * 0.22 : swimHeight(kind);
      const scale = animalScale(kind);
      animal.scale = scale;
      animal.baseY = floatY;
      animal.group.scale.setScalar(scale);
      animal.group.position.set(place.x, floatY, place.z);
      animal.group.rotation.y = place.facing;
      animal.facing = place.facing;
      parent.add(animal.group);
      this.meadowAnimals.push(animal);
    }
  }

  private addRibbon(
    parent: Group,
    stream: CatmullRomCurve3,
    bedMat: MeshToonMaterial,
    waterMat: MeshToonMaterial,
  ): void {
    const bed = new Mesh(new TubeGeometry(stream, 72, 0.38, 8, false), bedMat);
    bed.position.y = -0.02;
    bed.scale.y = 0.22;
    const water = new Mesh(new TubeGeometry(stream, 72, 0.3, 8, false), waterMat);
    water.position.y = 0.03;
    water.scale.y = 0.18;
    parent.add(bed, water);
  }

  private addDiscoFloor(parent: Group, span: number): void {
    const cols = 10;
    const rows = 10;
    const tile = span / cols;
    const origin = -span * 0.5 + tile * 0.5;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const mat = this.discoMats[(row + col) % this.discoMats.length]!;
        const cell = new Mesh(new BoxGeometry(tile * 0.92, 0.08, tile * 0.92), mat);
        cell.position.set(origin + col * tile, 0.05, origin + row * tile);
        parent.add(cell);
        this.meadowDisco.push({
          mesh: cell,
          phase: row * 0.55 + col * 0.35,
          row,
          col,
        });
      }
    }

    const ball = new Group();
    ball.position.set(0, 2.1, 0);
    voxel(ball, this.groundMats.buildingLit, 0.18, 0.18, 0.18, 0, 0, 0);
    for (let i = 0; i < 8; i += 1) {
      const a = i * (Math.PI / 4);
      voxel(
        ball,
        this.discoMats[i % this.discoMats.length]!,
        0.05,
        0.05,
        0.05,
        Math.cos(a) * 0.22,
        Math.sin(a * 2) * 0.08,
        Math.sin(a) * 0.22,
      );
    }
    parent.add(ball);
    this.meadowDiscoBall = ball;

    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]] as const) {
      const speaker = new Group();
      speaker.position.set(x * span * 0.28, 0, z * span * 0.28);
      voxel(speaker, this.groundMats.spaceDark, 0.18, 0.28, 0.12, 0, 0.3, 0);
      voxel(speaker, this.groundMats.discoFloor, 0.1, 0.1, 0.04, 0, 0.34, 0.12);
      voxel(speaker, this.discoMats[1]!, 0.06, 0.06, 0.02, 0, 0.34, 0.16);
      parent.add(speaker);
    }

    const light = new PointLight(token("--maze-disco-0"), 3.4, 14, 2);
    light.position.set(0, 2.4, 0);
    parent.add(light);
    this.meadowLight = light;
  }

  private addAuroraSpace(parent: Group, span: number): void {
    const auroraMats = [
      this.groundMats.auroraGreen,
      this.groundMats.auroraTeal,
      this.groundMats.auroraViolet,
      this.groundMats.auroraPink,
      this.groundMats.auroraBlue,
    ];
    for (let i = 0; i < 5; i += 1) {
      const offset = (i - 2) * span * 0.08;
      const points: Vector3[] = [];
      for (let t = 0; t <= 12; t += 1) {
        const u = t / 12;
        const x = -span * 0.48 + u * span * 0.96;
        const y = 1.4 + Math.sin(u * Math.PI * 2.2 + i * 0.9) * 0.55 + i * 0.18;
        const z = offset + Math.sin(u * Math.PI * 1.6 + i) * span * 0.12;
        points.push(new Vector3(x, y, z));
      }
      const curve = new CatmullRomCurve3(points);
      const ribbon = new Mesh(
        new TubeGeometry(curve, 48, 0.08 + (i % 3) * 0.03, 6, false),
        auroraMats[i % auroraMats.length]!,
      );
      ribbon.userData.flickerScale = false;
      parent.add(ribbon);
      this.meadowFlames.push(ribbon);
    }

    for (let i = 0; i < 28; i += 1) {
      const a = i * 2.4 + 0.3;
      const dist = (0.15 + ((i * 17) % 100) / 100 * 0.8) * span * 0.45;
      const star = new Mesh(
        new BoxGeometry(0.04 + (i % 3) * 0.02, 0.04 + (i % 2) * 0.02, 0.04),
        this.groundMats.star,
      );
      star.position.set(
        Math.cos(a) * dist,
        0.8 + ((i * 13) % 100) / 100 * 2.2,
        Math.sin(a) * dist * 0.85,
      );
      star.userData.flickerScale = false;
      parent.add(star);
      this.meadowFlames.push(star);
    }

    const rim = span * 0.38;
    for (let i = 0; i < 7; i += 1) {
      const a = i * 2.15;
      const rock = new Mesh(
        new BoxGeometry(0.28 + (i % 3) * 0.14, 0.16 + (i % 2) * 0.1, 0.22 + (i % 4) * 0.08),
        i % 2 === 0 ? this.groundMats.spaceDark : this.groundMats.moonRock,
      );
      rock.position.set(Math.cos(a) * rim * 0.85, 0.12 + (i % 3) * 0.08, Math.sin(a) * rim * 0.75);
      rock.rotation.y = a * 0.4;
      parent.add(rock);
    }

    const padGlow = new Mesh(
      new CircleGeometry(span * 0.18, 20),
      this.groundMats.auroraViolet,
    );
    padGlow.rotation.x = -Math.PI / 2;
    padGlow.position.y = 0.04;
    padGlow.userData.flickerScale = false;
    parent.add(padGlow);
    this.meadowFlames.push(padGlow);

    const light = new PointLight(token("--maze-aurora-green"), 2.8, 14, 2);
    light.position.set(0, 2.2, 0);
    parent.add(light);
    this.meadowLight = light;
  }

  private addLavaRiver(parent: Group, river: CatmullRomCurve3): void {
    const crust = new Mesh(new TubeGeometry(river, 80, 0.72, 10, false), this.lavaCoolMat);
    crust.position.y = -0.03;
    crust.scale.y = 0.28;
    const deep = new Mesh(new TubeGeometry(river, 80, 0.58, 10, false), this.lavaDeepMat);
    deep.position.y = 0.0;
    deep.scale.y = 0.24;
    const mid = new Mesh(new TubeGeometry(river, 80, 0.46, 10, false), this.lavaMidMat);
    mid.position.y = 0.03;
    mid.scale.y = 0.2;
    const flow = new Mesh(new TubeGeometry(river, 80, 0.34, 10, false), this.lavaMat);
    flow.position.y = 0.055;
    flow.scale.y = 0.16;
    const bright = new Mesh(new TubeGeometry(river, 80, 0.2, 8, false), this.lavaBrightMat);
    bright.position.y = 0.08;
    bright.scale.y = 0.12;
    parent.add(crust, deep, mid, flow, bright);
    this.meadowFlames.push(bright);
    bright.userData.flickerScale = false;

    const probe = new Vector3();
    for (let i = 0; i < 10; i += 1) {
      river.getPoint((i + 0.5) / 10, probe);
      const blob = new Mesh(
        new BoxGeometry(0.22 + (i % 3) * 0.08, 0.05, 0.14 + (i % 2) * 0.06),
        i % 2 === 0 ? this.groundMats.lavaGlow : this.lavaBrightMat,
      );
      blob.position.set(probe.x + ((i % 2) * 0.12 - 0.06), 0.1, probe.z);
      blob.rotation.y = i * 0.7;
      blob.userData.flickerScale = false;
      parent.add(blob);
      this.meadowFlames.push(blob);
    }
  }

  private addShore(parent: Group, span: number): void {
    const ocean = new Mesh(new BoxGeometry(span * 1.05, 0.14, span * 0.42), this.oceanDeepMat);
    ocean.position.set(0, -0.06, span * 0.32);
    const foam = new Mesh(new BoxGeometry(span * 1.02, 0.08, span * 0.28), this.oceanMat);
    foam.position.set(0, 0.01, span * 0.22);
    parent.add(ocean, foam);
  }

  private addRainforest(parent: Group, span: number, river: CatmullRomCurve3): void {
    const rim = span * 0.46;
    const kinds: TreeKind[] = ["oak", "pine", "willow", "oak", "birch", "autumn", "pine", "willow"];
    for (let i = 0; i < 34; i += 1) {
      const a = i * 2.05 + 0.15;
      const dist = rim * (0.42 + (i % 6) * 0.09);
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist * 0.9;
      if (nearStream(x, z, river, 0.8)) continue;
      const scale = 1.35 + (i % 5) * 0.2 + (i % 3) * 0.1;
      parent.add(makeTree(kinds[i % kinds.length]!, x, z, scale, this.treeMats));
    }
    for (let i = 0; i < 10; i += 1) {
      const a = i * 1.85 + 0.4;
      const x = Math.cos(a) * rim * 0.72;
      const z = Math.sin(a) * rim * 0.68;
      if (nearStream(x, z, river, 0.75)) continue;
      parent.add(makePalm(x, z, 1.35 + (i % 4) * 0.15, this.treeMats.trunk, this.palmMat, this.palmLitMat));
    }
    for (let i = 0; i < 8; i += 1) {
      const a = i * 1.4 + 0.2;
      const x = Math.cos(a) * rim * 0.22;
      const z = Math.sin(a) * rim * 0.2;
      if (nearStream(x, z, river, 0.65)) continue;
      parent.add(makeTree(i % 2 === 0 ? "willow" : "oak", x, z, 1.05 + (i % 3) * 0.12, this.treeMats));
    }

    for (let i = 0; i < 14; i += 1) {
      const a = i * 2.2;
      const x = Math.cos(a) * rim * 0.55;
      const z = Math.sin(a) * rim * 0.5;
      if (nearStream(x, z, river, 0.7)) continue;
      const canopy = new Group();
      const mats = [this.groundMats.canopy, this.groundMats.canopyLit, this.groundMats.canopyBright];
      voxel(canopy, mats[i % 3]!, 0.22, 0.12, 0.22, 0, 1.5, 0);
      voxel(canopy, mats[(i + 1) % 3]!, 0.16, 0.1, 0.16, 0.14, 1.65, 0.08);
      voxel(canopy, mats[(i + 2) % 3]!, 0.14, 0.1, 0.14, -0.12, 1.6, -0.06);
      canopy.position.set(x, 0, z);
      parent.add(canopy);
    }

    for (let i = 0; i < 12; i += 1) {
      const a = i * 1.75 + 0.6;
      const x = Math.cos(a) * rim * 0.48;
      const z = Math.sin(a) * rim * 0.44;
      if (nearStream(x, z, river, 0.65)) continue;
      const vine = new Mesh(
        new BoxGeometry(0.04, 0.7 + (i % 4) * 0.15, 0.04),
        this.groundMats.vine,
      );
      vine.position.set(x, 0.45, z);
      parent.add(vine);
      this.meadowFlowers.push(vine);
      vine.userData.baseY = vine.position.y;
      vine.userData.spin = false;
      const bloom = new Mesh(
        new BoxGeometry(0.08, 0.08, 0.08),
        i % 2 === 0 ? this.groundMats.bromeliad : this.groundMats.orchid,
      );
      bloom.position.set(x + 0.06, 0.55 + (i % 3) * 0.12, z);
      parent.add(bloom);
      this.meadowFlowers.push(bloom);
      bloom.userData.baseY = bloom.position.y;
    }

    for (let i = 0; i < 10; i += 1) {
      const a = i * 2.05 + 0.9;
      const x = Math.cos(a) * rim * 0.36;
      const z = Math.sin(a) * rim * 0.32;
      if (nearStream(x, z, river, 0.6)) continue;
      parent.add(makeMushroomPatch(x, z, 0.7 + (i % 3) * 0.15, {
        stem: this.groundMats.mushroom,
        cap: i % 3 === 0 ? this.groundMats.orchid : i % 3 === 1 ? this.groundMats.bromeliad : this.groundMats.canopyBright,
        spot: this.groundMats.mushroomSpot,
      }));
    }

    this.addScatter(parent, span, river, this.groundMats.canopy, true);
  }

  private addFunForest(parent: Group, span: number, stream: CatmullRomCurve3): void {
    const rim = span * 0.44;
    const kinds: TreeKind[] = ["oak", "pine", "birch", "willow", "autumn", "pine", "oak", "birch"];
    for (let i = 0; i < 22; i += 1) {
      const a = i * 2.35 + 0.2;
      const dist = rim * (0.55 + (i % 5) * 0.09);
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist * 0.92;
      if (nearStream(x, z, stream, 0.85)) continue;
      const kind = kinds[i % kinds.length]!;
      const scale = 1.25 + (i % 4) * 0.22 + (i % 3) * 0.08;
      parent.add(makeTree(kind, x, z, scale, this.treeMats));
    }
    for (let i = 0; i < 6; i += 1) {
      const a = i * 1.15 + 0.5;
      const x = Math.cos(a) * rim * 0.28;
      const z = Math.sin(a) * rim * 0.24;
      if (nearStream(x, z, stream, 0.7)) continue;
      parent.add(makeTree(i % 2 === 0 ? "birch" : "oak", x, z, 0.95 + (i % 3) * 0.1, this.treeMats));
    }

    for (let i = 0; i < 8; i += 1) {
      const a = i * 2.1 + 0.7;
      const x = Math.cos(a) * rim * 0.48;
      const z = Math.sin(a) * rim * 0.42;
      if (nearStream(x, z, stream, 0.65)) continue;
      parent.add(makeMushroomPatch(x, z, 0.85 + (i % 3) * 0.2, {
        stem: this.groundMats.mushroom,
        cap: i % 2 === 0 ? this.groundMats.mushroomCap : this.groundMats.coral,
        spot: this.groundMats.mushroomSpot,
      }));
    }

    for (let i = 0; i < 5; i += 1) {
      const a = i * 1.7;
      const x = Math.cos(a) * rim * 0.62;
      const z = Math.sin(a) * rim * 0.55;
      if (nearStream(x, z, stream, 0.7)) continue;
      const log = new Mesh(
        new BoxGeometry(0.55 + (i % 3) * 0.12, 0.12, 0.14),
        this.treeMats.trunk,
      );
      log.position.set(x, 0.08, z);
      log.rotation.y = a + 0.4;
      parent.add(log);
      const moss = new Mesh(new BoxGeometry(0.2, 0.04, 0.1), this.groundMats.mossLit);
      moss.position.set(x + 0.08, 0.16, z);
      parent.add(moss);
    }

    for (let i = 0; i < 12; i += 1) {
      const a = i * 1.9 + 0.3;
      const bush = new Group();
      voxel(bush, this.groundMats.moss, 0.12, 0.1, 0.12, 0, 0.12, 0);
      voxel(bush, this.groundMats.mossLit, 0.1, 0.08, 0.1, 0.08, 0.18, 0.04);
      voxel(bush, this.treeMats.leaf, 0.08, 0.08, 0.08, -0.06, 0.2, -0.04);
      bush.position.set(Math.cos(a) * rim * 0.38, 0, Math.sin(a) * rim * 0.34);
      if (!nearStream(bush.position.x, bush.position.z, stream, 0.6)) parent.add(bush);
    }

    this.addScatter(parent, span, stream, this.groundMats.moss, true);
  }

  private addMixedTrees(parent: Group, span: number, stream: CatmullRomCurve3): void {
    const rim = span * 0.42;
    const spots: { kind: TreeKind; x: number; z: number; scale: number }[] = [
      { kind: "oak", x: -rim * 0.88, z: rim * 0.18, scale: 1.45 },
      { kind: "pine", x: -rim * 0.62, z: -rim * 0.72, scale: 1.7 },
      { kind: "pine", x: rim * 0.78, z: -rim * 0.58, scale: 1.9 },
      { kind: "birch", x: rim * 0.92, z: rim * 0.4, scale: 1.35 },
      { kind: "willow", x: rim * 0.22, z: rim * 0.88, scale: 1.25 },
      { kind: "oak", x: -rim * 0.2, z: rim * 0.78, scale: 1.6 },
      { kind: "autumn", x: -rim * 0.78, z: rim * 0.62, scale: 1.3 },
      { kind: "pine", x: rim * 0.55, z: rim * 0.7, scale: 1.55 },
      { kind: "birch", x: -rim * 0.4, z: -rim * 0.85, scale: 1.2 },
      { kind: "autumn", x: rim * 0.35, z: -rim * 0.82, scale: 1.4 },
    ];
    for (const spot of spots) {
      if (nearStream(spot.x, spot.z, stream, 0.9)) continue;
      parent.add(makeTree(spot.kind, spot.x, spot.z, spot.scale, this.treeMats));
    }
  }

  private addPineGrove(parent: Group, span: number): void {
    const rim = span * 0.4;
    const spots = [
      [-0.85, 0.2, 1.8], [-0.55, -0.7, 2.1], [0.75, -0.5, 1.9],
      [0.9, 0.35, 1.6], [0.15, 0.8, 2.0], [-0.2, 0.7, 1.7],
      [0.45, 0.65, 1.85], [-0.7, 0.55, 1.55],
    ] as const;
    for (const [nx, nz, scale] of spots) {
      parent.add(makeTree("pine", rim * nx, rim * nz, scale, this.treeMats));
    }
  }

  private addTwilightTrees(parent: Group, span: number): void {
    const rim = span * 0.4;
    const spots: { kind: TreeKind; x: number; z: number; scale: number }[] = [
      { kind: "oak", x: -rim * 0.8, z: rim * 0.25, scale: 1.7 },
      { kind: "willow", x: rim * 0.7, z: -rim * 0.4, scale: 1.5 },
      { kind: "oak", x: rim * 0.85, z: rim * 0.5, scale: 1.8 },
      { kind: "birch", x: -rim * 0.3, z: -rim * 0.75, scale: 1.4 },
      { kind: "willow", x: -rim * 0.65, z: rim * 0.65, scale: 1.35 },
      { kind: "oak", x: rim * 0.25, z: rim * 0.8, scale: 1.6 },
    ];
    for (const spot of spots) {
      parent.add(makeTree(spot.kind, spot.x, spot.z, spot.scale, this.treeMats));
    }
  }

  private addOrchardRows(parent: Group, span: number): void {
    const cols = 4;
    const rows = 3;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = -span * 0.32 + c * (span * 0.64) / (cols - 1);
        const z = -span * 0.28 + r * (span * 0.5) / (rows - 1);
        const kind: TreeKind = (c + r) % 2 === 0 ? "oak" : "autumn";
        parent.add(makeTree(kind, x, z, 1.15 + ((c + r) % 3) * 0.12, this.treeMats));
      }
    }
  }

  private addPalms(parent: Group, span: number): void {
    const rim = span * 0.38;
    const spots = [
      [-0.8, -0.15, 1.5], [-0.45, -0.55, 1.3], [0.7, -0.35, 1.6],
      [0.85, 0.1, 1.25], [-0.15, -0.7, 1.4],
    ] as const;
    for (const [nx, nz, scale] of spots) {
      parent.add(makePalm(rim * nx, rim * nz, scale, this.treeMats.trunk, this.palmMat, this.palmLitMat));
    }
  }

  private addCacti(parent: Group, span: number): void {
    const rim = span * 0.36;
    const spots = [
      [-0.7, 0.4, 1.2], [0.55, -0.5, 1.5], [-0.2, -0.65, 1.0],
      [0.75, 0.35, 1.35], [-0.55, -0.25, 0.9], [0.15, 0.7, 1.15],
    ] as const;
    for (const [nx, nz, scale] of spots) {
      parent.add(makeCactus(rim * nx, rim * nz, scale, this.cactusMat, this.cactusLitMat));
    }
  }

  private addRocks(parent: Group, span: number): void {
    const mat = this.groundMats.duneDark;
    const rim = span * 0.3;
    for (let i = 0; i < 8; i += 1) {
      const rock = new Mesh(
        new BoxGeometry(0.18 + (i % 3) * 0.08, 0.1 + (i % 2) * 0.08, 0.16 + (i % 4) * 0.05),
        mat,
      );
      const a = i * 2.3;
      rock.position.set(Math.cos(a) * rim * 0.9, 0.06, Math.sin(a) * rim * 0.7);
      parent.add(rock);
    }
  }

  private addDrifts(parent: Group, span: number): void {
    const mat = this.groundMats.snowShade;
    for (let i = 0; i < 6; i += 1) {
      const drift = new Mesh(new BoxGeometry(span * 0.18, 0.1, span * 0.12), mat);
      const a = i * 1.1;
      drift.position.set(Math.cos(a) * span * 0.28, 0.02, Math.sin(a) * span * 0.25);
      parent.add(drift);
    }
  }

  private addScatter(
    parent: Group,
    span: number,
    stream: CatmullRomCurve3 | null,
    stemMat: MeshToonMaterial,
    flowers: boolean,
  ): void {
    const count = Math.round(48 + span * 2.4);
    for (let i = 0; i < count; i += 1) {
      const angle = (i * 2.399) % (Math.PI * 2);
      const radius = (0.12 + ((i * 17) % 100) / 100 * 0.78) * span * 0.46;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (stream && nearStream(x, z, stream, 0.55)) continue;
      if (!flowers) {
        const shell = new Mesh(
          new BoxGeometry(0.08, 0.04, 0.06),
          this.flowerMats[i % this.flowerMats.length],
        );
        shell.position.set(x, 0.04, z);
        parent.add(shell);
        continue;
      }
      const mat = this.flowerMats[i % this.flowerMats.length];
      if (!mat) continue;
      const bloom = new Group();
      const stem = new Mesh(new BoxGeometry(0.03, 0.12, 0.03), stemMat);
      stem.position.y = 0.06;
      const flower = new Mesh(facet(new SphereGeometry(0.07 + (i % 3) * 0.015, 5, 4)), mat);
      flower.position.y = 0.14;
      flower.userData.baseY = 0.14;
      bloom.add(stem, flower);
      bloom.position.set(x, 0, z);
      parent.add(bloom);
      this.meadowFlowers.push(flower);
    }
  }

  private clearMeadow(): void {
    if (this.meadow) {
      this.board.remove(this.meadow);
      this.meadow.traverse((child) => this.disposeGenerated(child));
      this.meadow = null;
    }
    this.meadowFlowers.length = 0;
    this.meadowAnimals.length = 0;
    this.meadowFlames.length = 0;
    this.meadowDisco.length = 0;
    this.meadowDiscoBall = null;
    this.meadowLight = null;
  }

  private fit(): void {
    this.placeCamera();
  }

  private placeCamera(): void {
    if (!this.tower) return;
    const low = this.escaped ? 0 : this.lowest();
    const span = Math.max(this.tower.width, this.tower.depth) + Math.abs(low) * 0.28;
    const zoom = this.settings?.values.zoom ?? 1;
    const angle = (this.shownAngle() * Math.PI) / 180;
    const orbit = (this.shownOrbit() * Math.PI) / 180;
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
      const ring = new Mesh(facet(new TorusGeometry(0.32, 0.045, 4, 8)), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.034;
      ring.renderOrder = 2;
      const disc = new Mesh(new CircleGeometry(0.12, 6), mat);
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
        const streak = new Mesh(new BoxGeometry(0.42, 0.024, 0.06), this.iceMarkMat);
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

  private addLoose(parent: Group, piece: Piece, theme: FloorThemeId = DEFAULT_FLOOR_THEME): void {
    const geo = new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
    const surfaces = this.themeSurfaces.get(theme);
    const shared = this.surfaceMaterial(piece.kind, surfaces);
    const material = piece.kind === "crumble" ? shared.clone() : shared;
    const mesh = new Mesh(geo, material);
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.castShadow = piece.kind === "wall";
    mesh.receiveShadow = false;
    mesh.userData.restX = piece.x;
    mesh.userData.restY = piece.y;
    if (piece.kind === "crumble") {
      mesh.userData.owned = true;
      mesh.userData.cell = piece.cell ?? "";
      material.transparent = true;
      material.opacity = 0;
      material.depthWrite = false;
      const chunkMat = shared.clone();
      mesh.userData.chunkMat = chunkMat;
      const slab = new Mesh(new BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2), chunkMat);
      slab.castShadow = true;
      slab.receiveShadow = true;
      mesh.add(slab);
      mesh.userData.slab = slab;
      mesh.userData.chunks = crumbleChunks(mesh, piece, chunkMat);
      mesh.userData.apart = 0;
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
      mesh.position.x = mesh.userData.restX as number;
      mesh.position.y = mesh.userData.restY as number;
      mesh.visible = true;
      const progress = info?.progress ?? 0;
      const gone = info?.gone === true;
      const apart = mesh.userData.apart as number;
      const target = gone ? 1 : 0;
      const next = this.reduceMotion ? target : apart + (target - apart) * 0.16;
      mesh.userData.apart = next;
      const crack = gone ? 1 : progress;
      const chunkMat = mesh.userData.chunkMat;
      if (chunkMat instanceof MeshToonMaterial) chunkMat.emissiveIntensity = 0.04 + crack * 0.9 * (1 - next);
      const slab = mesh.userData.slab as Mesh | undefined;
      const breaking = crack > 0.12 || gone;
      if (slab) {
        slab.visible = !breaking;
        if (!breaking) {
          slab.position.y = this.reduceMotion ? 0 : Math.sin(time * 22) * 0.006 * crack;
          slab.rotation.y = this.reduceMotion ? 0 : Math.sin(time * 17) * 0.01 * crack;
        }
      }
      const chunks = mesh.userData.chunks as Mesh[];
      for (const chunk of chunks) {
        const dx = chunk.userData.dirX as number;
        const dz = chunk.userData.dirZ as number;
        const tilt = chunk.userData.tilt as number;
        const spread = crack * 0.034 + next * 0.2;
        const sink = crack * crack * 0.07 + next * 1.05;
        chunk.position.x = (chunk.userData.restX as number) + dx * spread;
        chunk.position.z = (chunk.userData.restZ as number) + dz * spread;
        chunk.position.y = -sink;
        const spin = this.reduceMotion ? 0 : (crack * 0.45 + next * 1.8) * tilt;
        chunk.rotation.x = dz * spin * 0.4;
        chunk.rotation.z = -dx * spin * 0.4;
        chunk.rotation.y = this.reduceMotion ? 0 : Math.sin(time * 2.4 + tilt) * next * 0.6;
        chunk.visible = breaking && next < 0.94;
      }
    }
  }

  private disposeGenerated(child: object): void {
    if (!(child instanceof Mesh)) return;
    const shared = child.geometry === this.arrowGeometry || child.geometry === this.heartGeometry;
    if (!shared) child.geometry.dispose();
    if (child.userData.chunkMat instanceof MeshToonMaterial) child.userData.chunkMat.dispose();
    if (child.userData.owned === true && child.material instanceof MeshToonMaterial) child.material.dispose();
  }

  private clearGenerated(): void {
    const gone = this.board.children.filter((child) => child.userData.generated === true);
    for (const obj of gone) {
      this.board.remove(obj);
      obj.traverse((child) => this.disposeGenerated(child));
    }
    this.goalRing = null;
    this.meadow = null;
    this.meadowFlowers.length = 0;
    this.meadowAnimals.length = 0;
    this.meadowFlames.length = 0;
    this.meadowDisco.length = 0;
    this.meadowDiscoBall = null;
    this.meadowLight = null;
    this.hearts.length = 0;
    this.warpSpins.length = 0;
    this.gateMeshes.length = 0;
    this.crumbleMeshes.length = 0;
  }

  private spawnDebris(piece: Piece, floorY: number, boardQuat: Quaternion, hatch: { x: number; z: number } | null): void {
    const source = this.materials[piece.kind];
    if (!(source instanceof MeshToonMaterial)) return;
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
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.opacity = fade;
      if (elapsed <= bit.life) continue;
      this.scene.remove(bit.mesh);
      bit.mesh.geometry.dispose();
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.dispose();
      this.debris.splice(i, 1);
    }
  }

  private tickAim(dt: number): void {
    const inv = this.board.quaternion.clone().invert();
    const localY = this.ball.position.clone().applyQuaternion(inv).y;
    const floor = this.escaped ? (this.meadow?.position.y ?? localY) : this.lowest();
    const rest = this.escaped ? floor : floor * 0.28;
    const target = this.escaped
      ? localY
      : Math.min(rest, Math.max(localY, floor));
    const blend = this.reduceMotion ? 1 : 1 - Math.exp(-7 * dt);
    this.focusY += (target - this.focusY) * blend;
  }

  private playAngle(): number {
    return this.settings?.values.angle ?? 46.5;
  }

  private playOrbit(): number {
    return this.settings?.values.orbit ?? 0;
  }

  private shownAngle(): number {
    return this.playAngle() + this.glanceDAngle;
  }

  private shownOrbit(): number {
    return wrapDegrees(this.playOrbit() + this.glanceDOrbit);
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
    this.goalLight.visible = anchor !== null;
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
      if (bit.mesh.material instanceof MeshToonMaterial) bit.mesh.material.dispose();
    }
    this.debris.length = 0;
  }
}

function wrapDegrees(value: number): number {
  const wrapped = (((value + 180) % 360) + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

interface HeartBit {
  mesh: Mesh;
  cell: string;
  group: Group;
  taken: boolean;
  age: number;
  baseY: number;
}

interface Debris {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
  delay: number;
  age: number;
  life: number;
}

type AnimalKind =
  | "cow"
  | "sheep"
  | "dog"
  | "horse"
  | "crab"
  | "seagull"
  | "turtle"
  | "seal"
  | "penguin"
  | "bear"
  | "fox"
  | "hare"
  | "camel"
  | "lizard"
  | "snake"
  | "scorpion"
  | "chicken"
  | "pig"
  | "goat"
  | "rabbit"
  | "deer"
  | "owl"
  | "raccoon"
  | "fish"
  | "octopus"
  | "seahorse"
  | "ray"
  | "shark"
  | "whale"
  | "jelly"
  | "pigeon"
  | "cat"
  | "rat"
  | "parrot"
  | "frog"
  | "toucan"
  | "monkey";

type WinSceneKind =
  | "pasture"
  | "beach"
  | "snow"
  | "desert"
  | "orchard"
  | "twilight"
  | "underwater"
  | "city"
  | "village"
  | "lava"
  | "moon"
  | "venus"
  | "forest"
  | "rainforest"
  | "aurora"
  | "disco";

const WIN_SCENES: WinSceneKind[] = [
  "pasture",
  "beach",
  "snow",
  "desert",
  "orchard",
  "twilight",
  "underwater",
  "city",
  "village",
  "lava",
  "moon",
  "venus",
  "forest",
  "rainforest",
  "aurora",
  "disco",
];

const WIN_SKY: Record<WinSceneKind, string> = {
  pasture: "--maze-meadow-sky",
  beach: "--maze-beach-sky",
  snow: "--maze-snow-sky",
  desert: "--maze-desert-sky",
  orchard: "--maze-orchard-sky",
  twilight: "--maze-twilight-sky",
  underwater: "--maze-underwater-sky",
  city: "--maze-city-sky",
  village: "--maze-village-sky",
  lava: "--maze-lava-sky",
  moon: "--maze-moon-sky",
  venus: "--maze-venus-sky",
  forest: "--maze-forest-sky",
  rainforest: "--maze-rainforest-sky",
  aurora: "--maze-aurora-sky",
  disco: "--maze-disco-sky",
};

const SCENE_ANIMALS: Record<WinSceneKind, AnimalKind[]> = {
  pasture: ["cow", "sheep", "dog", "horse"],
  beach: ["crab", "seagull", "turtle", "seal"],
  snow: ["penguin", "bear", "fox", "hare"],
  desert: ["camel", "lizard", "snake", "scorpion"],
  orchard: ["chicken", "pig", "goat", "rabbit"],
  twilight: ["deer", "owl", "raccoon", "fox"],
  underwater: ["shark", "whale", "jelly", "fish"],
  city: ["pigeon", "cat", "rat", "dog"],
  village: ["dog", "chicken", "pig", "cat"],
  lava: ["lizard", "snake", "scorpion", "fox"],
  moon: ["cow", "hare", "fox", "owl"],
  venus: ["camel", "lizard", "snake", "scorpion"],
  forest: ["deer", "rabbit", "fox", "owl"],
  rainforest: ["parrot", "frog", "toucan", "monkey"],
  aurora: ["jelly", "owl", "fox", "hare"],
  disco: ["parrot", "cat", "dog", "pigeon"],
};

interface AnimalBit {
  group: Group;
  kind: AnimalKind;
  facing: number;
  baseY: number;
  scale: number;
}

function meadowStream(span: number): CatmullRomCurve3 {
  const edge = span * 0.5 + 0.02;
  const sway = span * 0.5;
  const points: Vector3[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const x = -edge + t * edge * 2;
    const z = Math.sin(t * Math.PI * 1.35 + 0.4) * sway * 0.38
      + Math.sin(t * Math.PI * 2.7) * sway * 0.11;
    points.push(new Vector3(x, 0, z));
  }
  return new CatmullRomCurve3(points);
}

function nearStream(x: number, z: number, stream: CatmullRomCurve3, radius: number): boolean {
  const probe = new Vector3();
  for (let i = 0; i <= 24; i += 1) {
    stream.getPoint(i / 24, probe);
    if (Math.hypot(x - probe.x, z - probe.z) < radius) return true;
  }
  return false;
}

function flatDisc(radius: number, mat: MeshToonMaterial): Mesh {
  const mesh = new Mesh(new CircleGeometry(Math.max(0.05, radius), 16), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

function makeFloorMats(): Record<WinSceneKind, MeshToonMaterial> {
  const kinds = WIN_SCENES;
  const mats = {} as Record<WinSceneKind, MeshToonMaterial>;
  for (const kind of kinds) {
    const map = makeFloorTexture(kind);
    mats[kind] = new MeshToonMaterial({
      color: "#ffffff",
      map,
      gradientMap: ramp,
    });
  }
  return mats;
}

function makeFloorTexture(kind: WinSceneKind): Texture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Floor texture canvas unavailable");
  paintFloor(ctx, size, kind);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function paintFloor(ctx: CanvasRenderingContext2D, size: number, kind: WinSceneKind): void {
  const px = (hex: string, x: number, y: number, w = 1, h = 1): void => {
    ctx.fillStyle = hex;
    ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, w, h);
  };
  const hash = (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const soft = (base: string, tint: string, amount: number): string => mixHex(base, tint, amount);

  if (kind === "pasture" || kind === "orchard") {
    const base = token("--maze-grass");
    const shade = soft(base, token("--maze-grass-dark"), 0.28);
    const lit = soft(base, token("--maze-leaf-lit"), 0.22);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.82) px(shade, x, y);
        else if (n > 0.68) px(lit, x, y);
      }
    }
    return;
  }

  if (kind === "forest") {
    const base = token("--maze-moss");
    const shade = soft(base, token("--maze-grass-dark"), 0.26);
    const lit = soft(base, token("--maze-moss-lit"), 0.28);
    const litter = soft(base, token("--maze-autumn"), 0.18);
    const pine = soft(base, token("--maze-pine"), 0.2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.84) px(shade, x, y);
        else if (n > 0.7) px(lit, x, y);
        if (n > 0.92) px(litter, x, y);
        if (n > 0.96) px(pine, x, y);
      }
    }
    return;
  }

  if (kind === "rainforest") {
    const base = token("--maze-canopy");
    const shade = soft(base, token("--maze-pine"), 0.24);
    const lit = soft(base, token("--maze-canopy-lit"), 0.3);
    const bright = soft(base, token("--maze-canopy-bright"), 0.22);
    const flower = soft(base, token("--maze-bromeliad"), 0.18);
    const orchid = soft(base, token("--maze-orchid"), 0.16);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.82) px(shade, x, y);
        else if (n > 0.66) px(lit, x, y);
        if (n > 0.9) px(bright, x, y);
        if (n > 0.955) px(flower, x, y);
        if (n > 0.98) px(orchid, x, y);
      }
    }
    return;
  }

  if (kind === "aurora") {
    const base = token("--maze-space");
    const shade = soft(base, token("--maze-space-dark"), 0.35);
    const star = soft(base, token("--maze-star"), 0.55);
    const green = soft(base, token("--maze-aurora-green"), 0.22);
    const violet = soft(base, token("--maze-aurora-violet"), 0.2);
    const pink = soft(base, token("--maze-aurora-pink"), 0.16);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.78) px(shade, x, y);
        if (n > 0.93) px(star, x, y);
        if (n > 0.97) px(green, x, y);
        if (hash(x + 5, y + 2) > 0.975) px(violet, x, y);
        if (hash(x + 9, y + 4) > 0.98) px(pink, x, y);
      }
    }
    return;
  }

  if (kind === "disco") {
    const base = token("--maze-disco-floor");
    const shade = soft(base, token("--maze-disco-floor-dark"), 0.4);
    const colors = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => soft(base, token(`--maze-disco-${i}`), 0.35));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (x % 4 === 0 || y % 4 === 0) px(shade, x, y);
        else {
          const c = colors[((x >> 2) + (y >> 2)) % colors.length];
          if (c) px(c, x, y);
        }
      }
    }
    return;
  }

  if (kind === "beach") {
    const base = token("--maze-sand");
    const shade = soft(base, token("--maze-sand-dark"), 0.3);
    const wet = soft(base, token("--maze-ocean-deep"), 0.18);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.78) px(shade, x, y);
        if ((x + y * 2) % 9 === 0 && n > 0.55) px(wet, x, y);
      }
    }
    return;
  }

  if (kind === "snow") {
    const base = token("--maze-snow");
    const shade = soft(base, token("--maze-snow-shade"), 0.32);
    const lit = soft(base, "#ffffff", 0.2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.8) px(shade, x, y);
        else if (n > 0.92) px(lit, x, y);
      }
    }
    return;
  }

  if (kind === "desert") {
    const base = token("--maze-dune");
    const shade = soft(base, token("--maze-dune-dark"), 0.3);
    const lit = soft(base, token("--maze-sand"), 0.28);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const wave = Math.sin((x + y * 0.35) * 0.9);
        if (wave > 0.55) px(lit, x, y);
        if (wave < -0.55) px(shade, x, y);
        if (hash(x, y) > 0.9) px(shade, x, y);
      }
    }
    return;
  }

  if (kind === "twilight") {
    const base = token("--maze-lavender");
    const shade = soft(base, token("--maze-lavender-dark"), 0.3);
    const lit = soft(base, token("--maze-flower-3"), 0.16);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.8) px(shade, x, y);
        if (n > 0.94) px(lit, x, y);
      }
    }
    return;
  }

  if (kind === "underwater") {
    const base = token("--maze-seabed");
    const shade = soft(base, token("--maze-seabed-dark"), 0.28);
    const lit = soft(base, token("--maze-seabed-lit"), 0.3);
    const sand = soft(base, token("--maze-seabed-sand"), 0.22);
    const coral = soft(base, token("--maze-coral"), 0.2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        const ripple = Math.sin(x * 0.8 + y * 0.25);
        if (ripple > 0.55) px(lit, x, y);
        if (ripple < -0.6) px(shade, x, y);
        if (n > 0.88) px(sand, x, y);
        if (n > 0.97) px(coral, x, y);
      }
    }
    return;
  }

  if (kind === "city") {
    const base = token("--maze-pavement");
    const shade = soft(base, token("--maze-pavement-dark"), 0.28);
    const lit = soft(base, token("--maze-building-lit"), 0.14);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (x % 8 === 0 || y % 8 === 0) px(shade, x, y);
        if (hash(x, y) > 0.9) px(shade, x, y);
        if (hash(x + 3, y + 1) > 0.96) px(lit, x, y);
      }
    }
    return;
  }

  if (kind === "village") {
    const base = token("--maze-cobble");
    const shade = soft(base, token("--maze-cobble-dark"), 0.3);
    const lit = soft(base, token("--maze-plaster"), 0.18);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const ox = (y / 4) % 2 === 0 ? 0 : 2;
        px(shade, x + ox, y, 3, 3);
        if (hash(x, y) > 0.7) px(lit, x + ox + 1, y + 1);
      }
    }
    return;
  }

  if (kind === "lava") {
    const base = token("--maze-basalt");
    const shade = soft(base, token("--maze-basalt-dark"), 0.3);
    const ash = soft(base, token("--maze-ash"), 0.26);
    const lava = soft(base, token("--maze-lava"), 0.35);
    const glow = soft(base, token("--maze-lava-glow"), 0.28);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.72) px(shade, x, y);
        if (n > 0.88) px(ash, x, y);
        if (n > 0.94 && (x + y) % 5 === 0) px(lava, x, y);
        if (n > 0.98) px(glow, x, y);
      }
    }
    return;
  }

  if (kind === "moon") {
    const base = token("--maze-moon-dust");
    const shade = soft(base, token("--maze-moon-dust-dark"), 0.3);
    const rock = soft(base, token("--maze-moon-rock"), 0.26);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.78) px(shade, x, y);
        if (n > 0.92) px(rock, x, y);
      }
    }
    for (const [cx, cy, r] of [[10, 12, 4], [22, 20, 3]] as const) {
      for (let y = -r; y <= r; y += 1) {
        for (let x = -r; x <= r; x += 1) {
          const d = Math.hypot(x, y);
          if (d <= r && d > r - 1.2) px(rock, cx + x, cy + y);
          else if (d <= r - 1.2) px(shade, cx + x, cy + y);
        }
      }
    }
    return;
  }

  if (kind === "venus") {
    const base = token("--maze-venus-ground");
    const shade = soft(base, token("--maze-venus-ground-dark"), 0.28);
    const rock = soft(base, token("--maze-venus-rock"), 0.24);
    const sulfur = soft(base, token("--maze-sulfur"), 0.2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = hash(x, y);
        if (n > 0.78) px(shade, x, y);
        if (n > 0.9) px(rock, x, y);
        if (n > 0.96) px(sulfur, x, y);
      }
    }
    return;
  }

  ctx.fillStyle = token("--maze-grass");
  ctx.fillRect(0, 0, size, size);
}

function mixHex(a: string, b: string, t: number): string {
  const ca = new Color(a);
  const cb = new Color(b);
  return `#${ca.lerp(cb, t).getHexString()}`;
}

type TreeKind = "oak" | "pine" | "birch" | "willow" | "autumn";

type TreeMats = {
  trunk: MeshToonMaterial;
  trunkPale: MeshToonMaterial;
  leaf: MeshToonMaterial;
  leafLit: MeshToonMaterial;
  pine: MeshToonMaterial;
  pineLit: MeshToonMaterial;
  autumn: MeshToonMaterial;
  autumnLit: MeshToonMaterial;
};

function makeTree(kind: TreeKind, x: number, z: number, scale: number, mats: TreeMats): Group {
  const tree = new Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  if (kind === "pine") buildPine(tree, mats);
  else if (kind === "birch") buildBirch(tree, mats);
  else if (kind === "willow") buildWillow(tree, mats);
  else if (kind === "autumn") buildAutumn(tree, mats);
  else buildOak(tree, mats);
  return tree;
}

function makePalm(
  x: number,
  z: number,
  scale: number,
  trunk: MeshToonMaterial,
  leaf: MeshToonMaterial,
  lit: MeshToonMaterial,
): Group {
  const tree = new Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  voxel(tree, trunk, 0.07, 0.55, 0.07, 0, 0.55, 0);
  voxel(tree, leaf, 0.34, 0.08, 0.12, 0.2, 1.15, 0);
  voxel(tree, leaf, 0.34, 0.08, 0.12, -0.2, 1.15, 0);
  voxel(tree, lit, 0.12, 0.08, 0.34, 0, 1.15, 0.2);
  voxel(tree, lit, 0.12, 0.08, 0.34, 0, 1.15, -0.2);
  voxel(tree, lit, 0.14, 0.1, 0.14, 0, 1.28, 0);
  return tree;
}

function makeCactus(
  x: number,
  z: number,
  scale: number,
  body: MeshToonMaterial,
  lit: MeshToonMaterial,
): Group {
  const plant = new Group();
  plant.position.set(x, 0, z);
  plant.scale.setScalar(scale);
  voxel(plant, body, 0.1, 0.4, 0.1, 0, 0.4, 0);
  voxel(plant, lit, 0.08, 0.08, 0.22, 0.18, 0.5, 0);
  voxel(plant, lit, 0.08, 0.16, 0.08, 0.28, 0.62, 0);
  voxel(plant, body, 0.08, 0.08, 0.18, -0.16, 0.42, 0);
  voxel(plant, body, 0.08, 0.14, 0.08, -0.26, 0.52, 0);
  return plant;
}

function makeCottage(
  x: number,
  z: number,
  scale: number,
  mats: {
    plaster: MeshToonMaterial;
    roof: MeshToonMaterial;
    trunk: MeshToonMaterial;
    window: MeshToonMaterial;
  },
): Group {
  const house = new Group();
  house.position.set(x, 0, z);
  house.scale.setScalar(scale);
  voxel(house, mats.plaster, 0.28, 0.22, 0.22, 0, 0.28, 0);
  voxel(house, mats.roof, 0.34, 0.12, 0.26, 0, 0.58, 0);
  voxel(house, mats.trunk, 0.06, 0.12, 0.04, 0.18, 0.16, 0.22);
  voxel(house, mats.window, 0.06, 0.06, 0.02, -0.12, 0.3, 0.23);
  voxel(house, mats.window, 0.06, 0.06, 0.02, 0.06, 0.3, 0.23);
  return house;
}

function makeStreetLamp(
  x: number,
  z: number,
  pole: MeshToonMaterial,
  lamp: MeshToonMaterial,
): Group {
  const post = new Group();
  post.position.set(x, 0, z);
  voxel(post, pole, 0.035, 0.45, 0.035, 0, 0.45, 0);
  voxel(post, pole, 0.12, 0.03, 0.03, 0.08, 0.9, 0);
  voxel(post, lamp, 0.06, 0.06, 0.06, 0.16, 0.86, 0);
  return post;
}

function makeMushroomPatch(
  x: number,
  z: number,
  scale: number,
  mats: { stem: MeshToonMaterial; cap: MeshToonMaterial; spot: MeshToonMaterial },
): Group {
  const patch = new Group();
  patch.position.set(x, 0, z);
  patch.scale.setScalar(scale);
  const shrooms = [
    { x: 0, z: 0, s: 1, h: 0.16 },
    { x: 0.14, z: 0.08, s: 0.7, h: 0.12 },
    { x: -0.12, z: 0.1, s: 0.55, h: 0.1 },
    { x: 0.06, z: -0.12, s: 0.6, h: 0.11 },
  ];
  for (const shroom of shrooms) {
    voxel(patch, mats.stem, 0.03 * shroom.s, shroom.h, 0.03 * shroom.s, shroom.x, shroom.h, shroom.z);
    voxel(patch, mats.cap, 0.08 * shroom.s, 0.04 * shroom.s, 0.08 * shroom.s, shroom.x, shroom.h * 2 + 0.02, shroom.z);
    voxel(patch, mats.spot, 0.02 * shroom.s, 0.015 * shroom.s, 0.02 * shroom.s, shroom.x + 0.03 * shroom.s, shroom.h * 2 + 0.05, shroom.z);
  }
  return patch;
}

function swimHeight(kind: AnimalKind): number {
  if (kind === "whale") return 1.15;
  if (kind === "jelly") return 1.45;
  if (kind === "shark") return 0.85;
  if (kind === "fish" || kind === "ray" || kind === "seahorse" || kind === "octopus") return 0.45;
  return 0;
}

function animalScale(kind: AnimalKind): number {
  if (kind === "whale") return 2.15;
  if (kind === "jelly") return 1.7;
  if (kind === "shark") return 1.55;
  return 1;
}

function buildOak(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunk, 0.1, 0.55, 0.1, 0, 0.55, 0);
  voxel(tree, mats.leaf, 0.42, 0.32, 0.42, 0, 1.25, 0);
  voxel(tree, mats.leafLit, 0.28, 0.22, 0.28, 0, 1.55, 0);
  voxel(tree, mats.leafLit, 0.2, 0.18, 0.2, 0.28, 1.2, 0.16);
  voxel(tree, mats.leaf, 0.18, 0.16, 0.18, -0.26, 1.15, -0.14);
}

function buildPine(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunk, 0.07, 0.45, 0.07, 0, 0.45, 0);
  voxel(tree, mats.pine, 0.38, 0.16, 0.38, 0, 1.0, 0);
  voxel(tree, mats.pine, 0.28, 0.16, 0.28, 0, 1.28, 0);
  voxel(tree, mats.pineLit, 0.18, 0.16, 0.18, 0, 1.54, 0);
  voxel(tree, mats.pineLit, 0.1, 0.14, 0.1, 0, 1.78, 0);
}

function buildBirch(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunkPale, 0.06, 0.7, 0.06, 0, 0.7, 0);
  voxel(tree, mats.leafLit, 0.22, 0.18, 0.22, 0, 1.45, 0);
  voxel(tree, mats.leaf, 0.16, 0.14, 0.16, 0.14, 1.55, 0.08);
  voxel(tree, mats.leaf, 0.14, 0.12, 0.14, -0.12, 1.5, -0.1);
  voxel(tree, mats.leafLit, 0.12, 0.12, 0.12, 0.02, 1.7, -0.04);
}

function buildWillow(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunk, 0.09, 0.5, 0.09, 0, 0.5, 0);
  voxel(tree, mats.leaf, 0.48, 0.2, 0.48, 0, 1.15, 0);
  voxel(tree, mats.leafLit, 0.55, 0.12, 0.55, 0, 0.95, 0);
  voxel(tree, mats.leaf, 0.2, 0.28, 0.12, 0.38, 0.85, 0);
  voxel(tree, mats.leaf, 0.2, 0.28, 0.12, -0.38, 0.85, 0);
  voxel(tree, mats.leafLit, 0.12, 0.28, 0.2, 0, 0.85, 0.38);
  voxel(tree, mats.leafLit, 0.12, 0.28, 0.2, 0, 0.85, -0.38);
}

function buildAutumn(tree: Group, mats: TreeMats): void {
  voxel(tree, mats.trunk, 0.09, 0.6, 0.09, 0, 0.6, 0);
  voxel(tree, mats.autumn, 0.36, 0.28, 0.36, 0, 1.3, 0);
  voxel(tree, mats.autumnLit, 0.24, 0.2, 0.24, 0, 1.55, 0);
  voxel(tree, mats.autumnLit, 0.16, 0.14, 0.16, 0.24, 1.25, 0.14);
  voxel(tree, mats.autumn, 0.14, 0.14, 0.14, -0.22, 1.22, -0.12);
}

type AnimalMats = {
  cow: MeshToonMaterial;
  cowSpot: MeshToonMaterial;
  sheep: MeshToonMaterial;
  sheepFace: MeshToonMaterial;
  dog: MeshToonMaterial;
  dogEar: MeshToonMaterial;
  horse: MeshToonMaterial;
  horseMane: MeshToonMaterial;
  crab: MeshToonMaterial;
  seagull: MeshToonMaterial;
  seagullWing: MeshToonMaterial;
  turtle: MeshToonMaterial;
  turtleShell: MeshToonMaterial;
  seal: MeshToonMaterial;
  penguin: MeshToonMaterial;
  penguinBelly: MeshToonMaterial;
  bear: MeshToonMaterial;
  fox: MeshToonMaterial;
  foxTip: MeshToonMaterial;
  hare: MeshToonMaterial;
  camel: MeshToonMaterial;
  lizard: MeshToonMaterial;
  snake: MeshToonMaterial;
  scorpion: MeshToonMaterial;
  chicken: MeshToonMaterial;
  chickenComb: MeshToonMaterial;
  pig: MeshToonMaterial;
  goat: MeshToonMaterial;
  rabbit: MeshToonMaterial;
  deer: MeshToonMaterial;
  owl: MeshToonMaterial;
  raccoon: MeshToonMaterial;
  fish: MeshToonMaterial;
  fishFin: MeshToonMaterial;
  octopus: MeshToonMaterial;
  seahorse: MeshToonMaterial;
  ray: MeshToonMaterial;
  shark: MeshToonMaterial;
  sharkBelly: MeshToonMaterial;
  whale: MeshToonMaterial;
  whaleBelly: MeshToonMaterial;
  jelly: MeshToonMaterial;
  jellyGlow: MeshToonMaterial;
  pigeon: MeshToonMaterial;
  cat: MeshToonMaterial;
  rat: MeshToonMaterial;
  parrot: MeshToonMaterial;
  parrotWing: MeshToonMaterial;
  parrotTail: MeshToonMaterial;
  frog: MeshToonMaterial;
  frogBelly: MeshToonMaterial;
  toucan: MeshToonMaterial;
  toucanBeak: MeshToonMaterial;
  toucanChest: MeshToonMaterial;
  monkey: MeshToonMaterial;
  monkeyFace: MeshToonMaterial;
};

function makeAnimal(kind: AnimalKind, mats: AnimalMats): AnimalBit {
  const group = new Group();
  const build = ANIMAL_BUILDERS[kind];
  build(group, mats);
  return { group, kind, facing: 0, baseY: 0, scale: 1 };
}

const ANIMAL_BUILDERS: Record<AnimalKind, (group: Group, mats: AnimalMats) => void> = {
  cow: buildCow,
  sheep: buildSheep,
  dog: buildDog,
  horse: buildHorse,
  crab: buildCrab,
  seagull: buildSeagull,
  turtle: buildTurtle,
  seal: buildSeal,
  penguin: buildPenguin,
  bear: buildBear,
  fox: buildFox,
  hare: buildHare,
  camel: buildCamel,
  lizard: buildLizard,
  snake: buildSnake,
  scorpion: buildScorpion,
  chicken: buildChicken,
  pig: buildPig,
  goat: buildGoat,
  rabbit: buildRabbit,
  deer: buildDeer,
  owl: buildOwl,
  raccoon: buildRaccoon,
  fish: buildFish,
  octopus: buildOctopus,
  seahorse: buildSeahorse,
  ray: buildRay,
  shark: buildShark,
  whale: buildWhale,
  jelly: buildJelly,
  pigeon: buildPigeon,
  cat: buildCat,
  rat: buildRat,
  parrot: buildParrot,
  frog: buildFrog,
  toucan: buildToucan,
  monkey: buildMonkey,
};

function voxel(
  parent: Group,
  mat: MeshToonMaterial,
  hx: number,
  hy: number,
  hz: number,
  x: number,
  y: number,
  z: number,
): void {
  const mesh = new Mesh(new BoxGeometry(hx * 2, hy * 2, hz * 2), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

function buildCow(group: Group, mats: AnimalMats): void {
  voxel(group, mats.cow, 0.28, 0.16, 0.16, 0, 0.34, 0);
  voxel(group, mats.cowSpot, 0.1, 0.1, 0.17, -0.06, 0.38, 0);
  voxel(group, mats.cow, 0.12, 0.1, 0.1, 0.34, 0.4, 0);
  voxel(group, mats.cowSpot, 0.04, 0.05, 0.11, 0.42, 0.42, 0);
  for (const [x, z] of [[-0.16, 0.1], [-0.16, -0.1], [0.14, 0.1], [0.14, -0.1]] as const) {
    voxel(group, mats.cowSpot, 0.04, 0.14, 0.04, x, 0.14, z);
  }
}

function buildSheep(group: Group, mats: AnimalMats): void {
  voxel(group, mats.sheep, 0.2, 0.16, 0.16, 0, 0.3, 0);
  voxel(group, mats.sheep, 0.14, 0.12, 0.14, 0, 0.42, 0);
  voxel(group, mats.sheepFace, 0.08, 0.07, 0.07, 0.24, 0.3, 0);
  for (const [x, z] of [[-0.1, 0.08], [-0.1, -0.08], [0.08, 0.08], [0.08, -0.08]] as const) {
    voxel(group, mats.sheepFace, 0.03, 0.1, 0.03, x, 0.1, z);
  }
}

function buildDog(group: Group, mats: AnimalMats): void {
  voxel(group, mats.dog, 0.16, 0.1, 0.1, 0, 0.22, 0);
  voxel(group, mats.dog, 0.08, 0.07, 0.07, 0.2, 0.28, 0);
  voxel(group, mats.dogEar, 0.03, 0.06, 0.02, 0.18, 0.36, 0.07);
  voxel(group, mats.dogEar, 0.03, 0.06, 0.02, 0.18, 0.36, -0.07);
  voxel(group, mats.dog, 0.03, 0.03, 0.1, -0.18, 0.24, 0);
  for (const [x, z] of [[-0.08, 0.06], [-0.08, -0.06], [0.08, 0.06], [0.08, -0.06]] as const) {
    voxel(group, mats.dogEar, 0.025, 0.09, 0.025, x, 0.09, z);
  }
}

function buildHorse(group: Group, mats: AnimalMats): void {
  voxel(group, mats.horse, 0.3, 0.14, 0.12, 0, 0.36, 0);
  voxel(group, mats.horse, 0.08, 0.18, 0.08, 0.28, 0.5, 0);
  voxel(group, mats.horse, 0.1, 0.07, 0.07, 0.4, 0.58, 0);
  voxel(group, mats.horseMane, 0.04, 0.14, 0.03, 0.24, 0.58, 0);
  voxel(group, mats.horseMane, 0.03, 0.03, 0.12, -0.3, 0.4, 0);
  for (const [x, z] of [[-0.18, 0.07], [-0.18, -0.07], [0.14, 0.07], [0.14, -0.07]] as const) {
    voxel(group, mats.horseMane, 0.035, 0.16, 0.035, x, 0.16, z);
  }
}

function buildCrab(group: Group, mats: AnimalMats): void {
  voxel(group, mats.crab, 0.16, 0.06, 0.12, 0, 0.12, 0);
  voxel(group, mats.crab, 0.04, 0.04, 0.14, 0.18, 0.12, 0.1);
  voxel(group, mats.crab, 0.04, 0.04, 0.14, 0.18, 0.12, -0.1);
  for (const z of [-0.1, -0.04, 0.04, 0.1] as const) {
    voxel(group, mats.crab, 0.1, 0.02, 0.02, -0.16, 0.08, z);
  }
}

function buildSeagull(group: Group, mats: AnimalMats): void {
  voxel(group, mats.seagull, 0.12, 0.06, 0.08, 0, 0.22, 0);
  voxel(group, mats.seagull, 0.06, 0.05, 0.05, 0.14, 0.26, 0);
  voxel(group, mats.seagullWing, 0.04, 0.02, 0.18, 0, 0.24, 0.16);
  voxel(group, mats.seagullWing, 0.04, 0.02, 0.18, 0, 0.24, -0.16);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.2, 0.24, 0);
  for (const z of [-0.04, 0.04] as const) {
    voxel(group, mats.seagullWing, 0.02, 0.08, 0.02, -0.04, 0.08, z);
  }
}

function buildTurtle(group: Group, mats: AnimalMats): void {
  voxel(group, mats.turtleShell, 0.18, 0.08, 0.14, 0, 0.16, 0);
  voxel(group, mats.turtle, 0.08, 0.05, 0.06, 0.2, 0.12, 0);
  for (const [x, z] of [[-0.1, 0.1], [-0.1, -0.1], [0.08, 0.1], [0.08, -0.1]] as const) {
    voxel(group, mats.turtle, 0.04, 0.03, 0.04, x, 0.06, z);
  }
}

function buildSeal(group: Group, mats: AnimalMats): void {
  voxel(group, mats.seal, 0.26, 0.1, 0.12, 0, 0.16, 0);
  voxel(group, mats.seal, 0.1, 0.08, 0.08, 0.28, 0.2, 0);
  voxel(group, mats.seal, 0.08, 0.03, 0.1, -0.28, 0.12, 0);
  voxel(group, mats.seal, 0.04, 0.06, 0.02, 0.3, 0.28, 0.06);
  voxel(group, mats.seal, 0.04, 0.06, 0.02, 0.3, 0.28, -0.06);
}

function buildPenguin(group: Group, mats: AnimalMats): void {
  voxel(group, mats.penguin, 0.1, 0.18, 0.1, 0, 0.28, 0);
  voxel(group, mats.penguinBelly, 0.07, 0.12, 0.04, 0.06, 0.26, 0);
  voxel(group, mats.penguin, 0.08, 0.07, 0.08, 0, 0.48, 0);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.08, 0.48, 0);
  for (const z of [-0.06, 0.06] as const) {
    voxel(group, mats.penguin, 0.03, 0.04, 0.05, 0, 0.06, z);
  }
}

function buildBear(group: Group, mats: AnimalMats): void {
  voxel(group, mats.bear, 0.22, 0.14, 0.14, 0, 0.28, 0);
  voxel(group, mats.bear, 0.1, 0.1, 0.1, 0.26, 0.34, 0);
  voxel(group, mats.bear, 0.04, 0.04, 0.03, 0.28, 0.44, 0.06);
  voxel(group, mats.bear, 0.04, 0.04, 0.03, 0.28, 0.44, -0.06);
  for (const [x, z] of [[-0.12, 0.08], [-0.12, -0.08], [0.1, 0.08], [0.1, -0.08]] as const) {
    voxel(group, mats.hare, 0.04, 0.1, 0.04, x, 0.1, z);
  }
}

function buildFox(group: Group, mats: AnimalMats): void {
  voxel(group, mats.fox, 0.18, 0.09, 0.09, 0, 0.2, 0);
  voxel(group, mats.fox, 0.08, 0.07, 0.07, 0.2, 0.26, 0);
  voxel(group, mats.fox, 0.03, 0.06, 0.02, 0.18, 0.34, 0.06);
  voxel(group, mats.fox, 0.03, 0.06, 0.02, 0.18, 0.34, -0.06);
  voxel(group, mats.fox, 0.04, 0.04, 0.14, -0.2, 0.22, 0);
  voxel(group, mats.foxTip, 0.03, 0.03, 0.04, -0.3, 0.22, 0);
  for (const [x, z] of [[-0.08, 0.05], [-0.08, -0.05], [0.08, 0.05], [0.08, -0.05]] as const) {
    voxel(group, mats.fox, 0.025, 0.08, 0.025, x, 0.08, z);
  }
}

function buildHare(group: Group, mats: AnimalMats): void {
  voxel(group, mats.hare, 0.12, 0.08, 0.08, 0, 0.18, 0);
  voxel(group, mats.hare, 0.06, 0.06, 0.06, 0.14, 0.22, 0);
  voxel(group, mats.hare, 0.02, 0.1, 0.02, 0.14, 0.34, 0.04);
  voxel(group, mats.hare, 0.02, 0.1, 0.02, 0.14, 0.34, -0.04);
  for (const [x, z] of [[-0.06, 0.04], [-0.06, -0.04], [0.06, 0.04], [0.06, -0.04]] as const) {
    voxel(group, mats.sheepFace, 0.02, 0.07, 0.02, x, 0.07, z);
  }
}

function buildCamel(group: Group, mats: AnimalMats): void {
  voxel(group, mats.camel, 0.28, 0.12, 0.12, 0, 0.36, 0);
  voxel(group, mats.camel, 0.1, 0.12, 0.1, -0.05, 0.52, 0);
  voxel(group, mats.camel, 0.08, 0.16, 0.08, 0.28, 0.48, 0);
  voxel(group, mats.camel, 0.1, 0.07, 0.07, 0.4, 0.58, 0);
  for (const [x, z] of [[-0.16, 0.07], [-0.16, -0.07], [0.14, 0.07], [0.14, -0.07]] as const) {
    voxel(group, mats.horseMane, 0.035, 0.16, 0.035, x, 0.16, z);
  }
}

function buildLizard(group: Group, mats: AnimalMats): void {
  voxel(group, mats.lizard, 0.22, 0.05, 0.08, 0, 0.1, 0);
  voxel(group, mats.lizard, 0.06, 0.04, 0.05, 0.22, 0.12, 0);
  voxel(group, mats.lizard, 0.03, 0.02, 0.12, -0.22, 0.1, 0);
  for (const [x, z] of [[-0.06, 0.1], [-0.06, -0.1], [0.08, 0.1], [0.08, -0.1]] as const) {
    voxel(group, mats.lizard, 0.03, 0.02, 0.06, x, 0.06, z);
  }
}

function buildSnake(group: Group, mats: AnimalMats): void {
  voxel(group, mats.snake, 0.08, 0.05, 0.05, 0.16, 0.08, 0);
  voxel(group, mats.snake, 0.1, 0.05, 0.05, 0.02, 0.08, 0.04);
  voxel(group, mats.snake, 0.1, 0.05, 0.05, -0.12, 0.08, -0.04);
  voxel(group, mats.snake, 0.08, 0.05, 0.05, -0.24, 0.08, 0.04);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.24, 0.1, 0);
}

function buildScorpion(group: Group, mats: AnimalMats): void {
  voxel(group, mats.scorpion, 0.14, 0.05, 0.1, 0, 0.1, 0);
  voxel(group, mats.scorpion, 0.04, 0.1, 0.04, -0.14, 0.18, 0);
  voxel(group, mats.scorpion, 0.03, 0.03, 0.08, -0.14, 0.28, 0);
  voxel(group, mats.crab, 0.08, 0.03, 0.03, 0.16, 0.1, 0.1);
  voxel(group, mats.crab, 0.08, 0.03, 0.03, 0.16, 0.1, -0.1);
  for (const z of [-0.1, -0.04, 0.04, 0.1] as const) {
    voxel(group, mats.scorpion, 0.08, 0.015, 0.015, -0.02, 0.06, z);
  }
}

function buildChicken(group: Group, mats: AnimalMats): void {
  voxel(group, mats.chicken, 0.1, 0.08, 0.08, 0, 0.2, 0);
  voxel(group, mats.chicken, 0.06, 0.05, 0.05, 0.12, 0.26, 0);
  voxel(group, mats.chickenComb, 0.02, 0.04, 0.03, 0.12, 0.34, 0);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.18, 0.24, 0);
  for (const z of [-0.04, 0.04] as const) {
    voxel(group, mats.sheepFace, 0.02, 0.07, 0.02, 0, 0.07, z);
  }
}

function buildPig(group: Group, mats: AnimalMats): void {
  voxel(group, mats.pig, 0.2, 0.12, 0.12, 0, 0.24, 0);
  voxel(group, mats.pig, 0.08, 0.07, 0.08, 0.22, 0.26, 0);
  voxel(group, mats.pig, 0.04, 0.03, 0.04, 0.3, 0.24, 0);
  voxel(group, mats.pig, 0.03, 0.04, 0.02, 0.2, 0.34, 0.06);
  voxel(group, mats.pig, 0.03, 0.04, 0.02, 0.2, 0.34, -0.06);
  for (const [x, z] of [[-0.1, 0.06], [-0.1, -0.06], [0.08, 0.06], [0.08, -0.06]] as const) {
    voxel(group, mats.pig, 0.03, 0.08, 0.03, x, 0.08, z);
  }
}

function buildGoat(group: Group, mats: AnimalMats): void {
  voxel(group, mats.goat, 0.18, 0.1, 0.1, 0, 0.26, 0);
  voxel(group, mats.goat, 0.07, 0.08, 0.07, 0.2, 0.34, 0);
  voxel(group, mats.goat, 0.015, 0.08, 0.015, 0.2, 0.46, 0.04);
  voxel(group, mats.goat, 0.015, 0.08, 0.015, 0.2, 0.46, -0.04);
  for (const [x, z] of [[-0.1, 0.05], [-0.1, -0.05], [0.08, 0.05], [0.08, -0.05]] as const) {
    voxel(group, mats.sheepFace, 0.025, 0.1, 0.025, x, 0.1, z);
  }
}

function buildRabbit(group: Group, mats: AnimalMats): void {
  voxel(group, mats.rabbit, 0.1, 0.08, 0.08, 0, 0.16, 0);
  voxel(group, mats.rabbit, 0.05, 0.05, 0.05, 0.12, 0.2, 0);
  voxel(group, mats.rabbit, 0.015, 0.1, 0.015, 0.12, 0.32, 0.03);
  voxel(group, mats.rabbit, 0.015, 0.1, 0.015, 0.12, 0.32, -0.03);
  for (const [x, z] of [[-0.04, 0.04], [-0.04, -0.04], [0.04, 0.04], [0.04, -0.04]] as const) {
    voxel(group, mats.hare, 0.02, 0.06, 0.02, x, 0.06, z);
  }
}

function buildDeer(group: Group, mats: AnimalMats): void {
  voxel(group, mats.deer, 0.22, 0.12, 0.1, 0, 0.34, 0);
  voxel(group, mats.deer, 0.07, 0.16, 0.07, 0.24, 0.48, 0);
  voxel(group, mats.deer, 0.08, 0.06, 0.06, 0.34, 0.58, 0);
  voxel(group, mats.horseMane, 0.02, 0.1, 0.02, 0.34, 0.7, 0.05);
  voxel(group, mats.horseMane, 0.02, 0.1, 0.02, 0.34, 0.7, -0.05);
  for (const [x, z] of [[-0.12, 0.06], [-0.12, -0.06], [0.1, 0.06], [0.1, -0.06]] as const) {
    voxel(group, mats.deer, 0.03, 0.14, 0.03, x, 0.14, z);
  }
}

function buildOwl(group: Group, mats: AnimalMats): void {
  voxel(group, mats.owl, 0.12, 0.14, 0.1, 0, 0.28, 0);
  voxel(group, mats.owl, 0.1, 0.08, 0.1, 0, 0.44, 0);
  voxel(group, mats.foxTip, 0.03, 0.03, 0.02, 0.08, 0.46, 0.04);
  voxel(group, mats.foxTip, 0.03, 0.03, 0.02, 0.08, 0.46, -0.04);
  voxel(group, mats.crab, 0.03, 0.02, 0.02, 0.12, 0.42, 0);
  for (const z of [-0.05, 0.05] as const) {
    voxel(group, mats.owl, 0.03, 0.06, 0.02, 0, 0.08, z);
  }
}

function buildRaccoon(group: Group, mats: AnimalMats): void {
  voxel(group, mats.raccoon, 0.16, 0.09, 0.1, 0, 0.2, 0);
  voxel(group, mats.raccoon, 0.07, 0.06, 0.07, 0.18, 0.24, 0);
  voxel(group, mats.sheep, 0.08, 0.04, 0.04, 0.18, 0.26, 0);
  voxel(group, mats.raccoon, 0.04, 0.04, 0.12, -0.18, 0.2, 0);
  voxel(group, mats.sheep, 0.03, 0.03, 0.04, -0.26, 0.2, 0);
  for (const [x, z] of [[-0.08, 0.05], [-0.08, -0.05], [0.08, 0.05], [0.08, -0.05]] as const) {
    voxel(group, mats.raccoon, 0.025, 0.08, 0.025, x, 0.08, z);
  }
}

function buildFish(group: Group, mats: AnimalMats): void {
  voxel(group, mats.fish, 0.16, 0.07, 0.06, 0, 0.24, 0);
  voxel(group, mats.fishFin, 0.04, 0.05, 0.02, -0.16, 0.26, 0);
  voxel(group, mats.fishFin, 0.03, 0.02, 0.08, 0, 0.28, 0.08);
  voxel(group, mats.sheep, 0.02, 0.02, 0.02, 0.14, 0.26, 0.03);
}

function buildOctopus(group: Group, mats: AnimalMats): void {
  voxel(group, mats.octopus, 0.14, 0.1, 0.14, 0, 0.24, 0);
  for (const [x, z] of [[0.14, 0.1], [0.14, -0.1], [-0.14, 0.1], [-0.14, -0.1], [0.1, 0.16], [-0.1, -0.16]] as const) {
    voxel(group, mats.octopus, 0.03, 0.12, 0.03, x, 0.12, z);
  }
}

function buildSeahorse(group: Group, mats: AnimalMats): void {
  voxel(group, mats.seahorse, 0.06, 0.16, 0.06, 0, 0.28, 0);
  voxel(group, mats.seahorse, 0.05, 0.05, 0.05, 0.06, 0.42, 0);
  voxel(group, mats.fishFin, 0.02, 0.06, 0.04, -0.06, 0.3, 0);
  voxel(group, mats.seahorse, 0.04, 0.03, 0.03, 0, 0.12, 0.04);
}

function buildRay(group: Group, mats: AnimalMats): void {
  voxel(group, mats.ray, 0.28, 0.04, 0.2, 0, 0.16, 0);
  voxel(group, mats.ray, 0.08, 0.04, 0.06, 0.24, 0.16, 0);
  voxel(group, mats.sheepFace, 0.03, 0.02, 0.08, -0.24, 0.16, 0);
}

function buildShark(group: Group, mats: AnimalMats): void {
  voxel(group, mats.shark, 0.36, 0.12, 0.14, 0, 0.28, 0);
  voxel(group, mats.sharkBelly, 0.3, 0.06, 0.12, 0.02, 0.2, 0);
  voxel(group, mats.shark, 0.12, 0.1, 0.1, 0.4, 0.3, 0);
  voxel(group, mats.shark, 0.04, 0.14, 0.04, -0.05, 0.48, 0);
  voxel(group, mats.shark, 0.1, 0.04, 0.18, -0.05, 0.28, 0.2);
  voxel(group, mats.shark, 0.1, 0.04, 0.18, -0.05, 0.28, -0.2);
  voxel(group, mats.shark, 0.08, 0.1, 0.03, -0.4, 0.3, 0);
  voxel(group, mats.shark, 0.06, 0.04, 0.08, -0.48, 0.24, 0);
  voxel(group, mats.sheep, 0.02, 0.02, 0.02, 0.48, 0.34, 0.05);
}

function buildWhale(group: Group, mats: AnimalMats): void {
  voxel(group, mats.whale, 0.55, 0.22, 0.24, 0, 0.36, 0);
  voxel(group, mats.whaleBelly, 0.48, 0.1, 0.2, 0.04, 0.22, 0);
  voxel(group, mats.whale, 0.18, 0.16, 0.16, 0.58, 0.38, 0);
  voxel(group, mats.whale, 0.08, 0.06, 0.06, 0.72, 0.28, 0);
  voxel(group, mats.whale, 0.12, 0.04, 0.28, -0.1, 0.34, 0.3);
  voxel(group, mats.whale, 0.12, 0.04, 0.28, -0.1, 0.34, -0.3);
  voxel(group, mats.whale, 0.06, 0.16, 0.04, -0.1, 0.58, 0);
  voxel(group, mats.whale, 0.16, 0.14, 0.04, -0.62, 0.4, 0);
  voxel(group, mats.whale, 0.08, 0.06, 0.18, -0.78, 0.36, 0);
  voxel(group, mats.sheep, 0.03, 0.03, 0.03, 0.7, 0.42, 0.08);
  voxel(group, mats.sheep, 0.03, 0.03, 0.03, 0.7, 0.42, -0.08);
}

function buildJelly(group: Group, mats: AnimalMats): void {
  voxel(group, mats.jellyGlow, 0.28, 0.14, 0.28, 0, 0.55, 0);
  voxel(group, mats.jelly, 0.22, 0.1, 0.22, 0, 0.42, 0);
  voxel(group, mats.jellyGlow, 0.16, 0.06, 0.16, 0, 0.64, 0);
  for (const [x, z] of [
    [0.14, 0.1],
    [0.14, -0.1],
    [-0.14, 0.1],
    [-0.14, -0.1],
    [0.05, 0.18],
    [-0.05, -0.18],
    [0.18, 0],
    [-0.18, 0],
  ] as const) {
    voxel(group, mats.jelly, 0.025, 0.28, 0.025, x, 0.18, z);
    voxel(group, mats.jellyGlow, 0.02, 0.08, 0.02, x, -0.02, z);
  }
}

function buildPigeon(group: Group, mats: AnimalMats): void {
  voxel(group, mats.pigeon, 0.1, 0.06, 0.08, 0, 0.2, 0);
  voxel(group, mats.pigeon, 0.05, 0.05, 0.05, 0.12, 0.24, 0);
  voxel(group, mats.seagullWing, 0.03, 0.02, 0.12, 0, 0.22, 0.12);
  voxel(group, mats.seagullWing, 0.03, 0.02, 0.12, 0, 0.22, -0.12);
  for (const z of [-0.03, 0.03] as const) {
    voxel(group, mats.pigeon, 0.015, 0.06, 0.015, 0, 0.06, z);
  }
}

function buildCat(group: Group, mats: AnimalMats): void {
  voxel(group, mats.cat, 0.14, 0.08, 0.09, 0, 0.18, 0);
  voxel(group, mats.cat, 0.07, 0.06, 0.07, 0.16, 0.24, 0);
  voxel(group, mats.cat, 0.025, 0.05, 0.02, 0.14, 0.32, 0.04);
  voxel(group, mats.cat, 0.025, 0.05, 0.02, 0.14, 0.32, -0.04);
  voxel(group, mats.cat, 0.03, 0.03, 0.12, -0.16, 0.2, 0);
  for (const [x, z] of [[-0.06, 0.05], [-0.06, -0.05], [0.06, 0.05], [0.06, -0.05]] as const) {
    voxel(group, mats.cat, 0.02, 0.07, 0.02, x, 0.07, z);
  }
}

function buildRat(group: Group, mats: AnimalMats): void {
  voxel(group, mats.rat, 0.12, 0.06, 0.07, 0, 0.14, 0);
  voxel(group, mats.rat, 0.05, 0.04, 0.05, 0.12, 0.16, 0);
  voxel(group, mats.rat, 0.02, 0.02, 0.14, -0.16, 0.14, 0);
  voxel(group, mats.rat, 0.015, 0.04, 0.015, 0.12, 0.22, 0.03);
  voxel(group, mats.rat, 0.015, 0.04, 0.015, 0.12, 0.22, -0.03);
  for (const [x, z] of [[-0.04, 0.04], [-0.04, -0.04], [0.04, 0.04], [0.04, -0.04]] as const) {
    voxel(group, mats.rat, 0.015, 0.05, 0.015, x, 0.05, z);
  }
}

function buildParrot(group: Group, mats: AnimalMats): void {
  voxel(group, mats.parrot, 0.1, 0.08, 0.08, 0, 0.24, 0);
  voxel(group, mats.parrot, 0.06, 0.06, 0.06, 0.12, 0.3, 0);
  voxel(group, mats.parrotWing, 0.04, 0.03, 0.14, 0, 0.26, 0.12);
  voxel(group, mats.parrotTail, 0.04, 0.03, 0.14, 0, 0.26, -0.12);
  voxel(group, mats.parrotTail, 0.1, 0.03, 0.04, -0.16, 0.22, 0);
  voxel(group, mats.parrotWing, 0.03, 0.02, 0.02, 0.16, 0.28, 0.03);
  for (const z of [-0.03, 0.03] as const) {
    voxel(group, mats.parrot, 0.015, 0.07, 0.015, 0, 0.08, z);
  }
}

function buildFrog(group: Group, mats: AnimalMats): void {
  voxel(group, mats.frog, 0.14, 0.07, 0.1, 0, 0.16, 0);
  voxel(group, mats.frogBelly, 0.1, 0.04, 0.08, 0.02, 0.12, 0);
  voxel(group, mats.frog, 0.06, 0.05, 0.06, 0.14, 0.2, 0);
  voxel(group, mats.frog, 0.03, 0.03, 0.02, 0.12, 0.26, 0.04);
  voxel(group, mats.frog, 0.03, 0.03, 0.02, 0.12, 0.26, -0.04);
  for (const [x, z] of [[-0.08, 0.08], [-0.08, -0.08], [0.08, 0.08], [0.08, -0.08]] as const) {
    voxel(group, mats.frog, 0.03, 0.05, 0.03, x, 0.06, z);
  }
}

function buildToucan(group: Group, mats: AnimalMats): void {
  voxel(group, mats.toucan, 0.12, 0.08, 0.08, 0, 0.24, 0);
  voxel(group, mats.toucanChest, 0.06, 0.05, 0.07, 0.08, 0.2, 0);
  voxel(group, mats.toucan, 0.06, 0.06, 0.06, 0.14, 0.3, 0);
  voxel(group, mats.toucanBeak, 0.12, 0.035, 0.035, 0.28, 0.28, 0);
  voxel(group, mats.seagullWing, 0.03, 0.02, 0.12, 0, 0.26, 0.12);
  voxel(group, mats.seagullWing, 0.03, 0.02, 0.12, 0, 0.26, -0.12);
  for (const z of [-0.03, 0.03] as const) {
    voxel(group, mats.toucan, 0.015, 0.07, 0.015, 0, 0.08, z);
  }
}

function buildMonkey(group: Group, mats: AnimalMats): void {
  voxel(group, mats.monkey, 0.12, 0.1, 0.1, 0, 0.28, 0);
  voxel(group, mats.monkeyFace, 0.07, 0.07, 0.07, 0.14, 0.34, 0);
  voxel(group, mats.monkey, 0.04, 0.05, 0.02, 0.12, 0.42, 0.05);
  voxel(group, mats.monkey, 0.04, 0.05, 0.02, 0.12, 0.42, -0.05);
  voxel(group, mats.monkey, 0.03, 0.03, 0.14, -0.14, 0.26, 0);
  for (const [x, z] of [[-0.06, 0.06], [-0.06, -0.06], [0.06, 0.06], [0.06, -0.06]] as const) {
    voxel(group, mats.monkey, 0.025, 0.1, 0.025, x, 0.1, z);
  }
}

function heartGeometry(): BufferGeometry {
  const shape = new Shape();
  const s = 0.026;
  const x = (value: number) => (value - 12) * s;
  const y = (value: number) => (16 - value) * s;
  shape.moveTo(x(12), y(21));
  shape.bezierCurveTo(x(12), y(21), x(4), y(14), x(4), y(9));
  shape.bezierCurveTo(x(4), y(5.5), x(6.5), y(3), x(9.5), y(3));
  shape.bezierCurveTo(x(11), y(3), x(12), y(4), x(12), y(4));
  shape.bezierCurveTo(x(12), y(4), x(13), y(3), x(14.5), y(3));
  shape.bezierCurveTo(x(17.5), y(3), x(20), y(5.5), x(20), y(9));
  shape.bezierCurveTo(x(20), y(14), x(12), y(21), x(12), y(21));
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function arrowGeometry(): BufferGeometry {
  const shaft = new BoxGeometry(0.08, 0.028, 0.14);
  shaft.translate(0, 0, 0.02);
  const head = new BoxGeometry(0.18, 0.028, 0.08);
  head.translate(0, 0, -0.09);
  const merged = mergeGeometries([shaft, head]);
  shaft.dispose();
  head.dispose();
  if (!merged) throw new Error("Arrow geometry failed");
  return merged;
}

const RAMP_WIDTH = 32;
const ramp = shadeRamp(3);
let paintedSteps = 3;

function shadeRamp(bands: number): DataTexture {
  const tex = new DataTexture(rampBytes(bands), RAMP_WIDTH, 1);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function paintRamp(tex: DataTexture, bands: number): void {
  tex.image.data = rampBytes(bands);
  tex.image.width = RAMP_WIDTH;
  tex.image.height = 1;
  tex.needsUpdate = true;
  paintedSteps = bands;
}

function rampBytes(bands: number): Uint8Array {
  const data = new Uint8Array(RAMP_WIDTH * 4);
  for (let i = 0; i < RAMP_WIDTH; i += 1) {
    const t = i / (RAMP_WIDTH - 1);
    const tone = 72 + Math.round((255 - 72) * quantize(t, bands));
    const offset = i * 4;
    data[offset] = tone;
    data[offset + 1] = tone;
    data[offset + 2] = tone;
    data[offset + 3] = 255;
  }
  return data;
}

function quantize(t: number, bands: number): number {
  const lo = Math.max(2, Math.floor(bands));
  const blend = bands - lo;
  return bandValue(t, lo) + (bandValue(t, lo + 1) - bandValue(t, lo)) * blend;
}

function bandValue(t: number, bands: number): number {
  const span = bands - 1;
  return Math.round(t * span) / span;
}

function makeCrumbleMat(): MeshToonMaterial {
  return new MeshToonMaterial({
    color: "#ffffff",
    map: makeCrumbleTexture(),
    emissive: token("--maze-crumble-mark"),
    emissiveIntensity: 0.03,
    gradientMap: ramp,
  });
}

function makeCrumbleTexture(): Texture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Crumble texture canvas unavailable");
  paintCrumble(ctx, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function paintCrumble(ctx: CanvasRenderingContext2D, size: number): void {
  const base = token("--maze-crumble");
  const shade = mixHex(base, "#000000", 0.22);
  const deep = mixHex(base, "#000000", 0.55);
  const seam = token("--maze-crumble-crack");
  const lit = mixHex(base, "#ffffff", 0.18);
  const grit = mixHex(base, token("--maze-crumble-mark"), 0.14);
  const edge = mixHex(base, "#000000", 0.35);
  const hash = (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const px = (hex: string, x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, 1, 1);
  };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = hash(x, y);
      if (n > 0.82) px(shade, x, y);
      else if (n > 0.68) px(lit, x, y);
      else if (n > 0.58) px(grit, x, y);
    }
  }
  const stroke = (x0: number, y0: number, x1: number, y1: number, color: string, width = 1): void => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      for (let oy = -width; oy <= width; oy += 1) {
        for (let ox = -width; ox <= width; ox += 1) {
          if (Math.abs(ox) + Math.abs(oy) > width) continue;
          px(color, x + ox, y + oy);
        }
      }
    }
  };
  // Irregular piece seams so the intact slab already reads as fractured stone.
  stroke(10, 0, 12, 14, seam, 1);
  stroke(11, 14, 9, 31, seam, 1);
  stroke(21, 0, 19, 16, seam, 1);
  stroke(20, 16, 22, 31, seam, 1);
  stroke(0, 10, 14, 12, seam, 1);
  stroke(14, 11, 31, 9, seam, 1);
  stroke(0, 21, 16, 19, seam, 1);
  stroke(16, 20, 31, 22, seam, 1);
  // Branching cracks through the tiles.
  stroke(3, 2, 10, 7, deep, 1);
  stroke(10, 7, 6, 12, deep, 0);
  stroke(12, 14, 17, 10, deep, 1);
  stroke(17, 10, 15, 5, deep, 0);
  stroke(20, 4, 28, 8, deep, 1);
  stroke(22, 16, 28, 13, deep, 0);
  stroke(21, 18, 26, 25, deep, 1);
  stroke(4, 18, 9, 24, deep, 1);
  stroke(9, 24, 14, 22, deep, 0);
  stroke(16, 22, 20, 28, deep, 1);
  stroke(1, 27, 7, 29, shade, 0);
  stroke(24, 1, 29, 5, shade, 0);
  stroke(27, 27, 30, 30, shade, 0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const chip = hash(x + 3, y + 9);
      if (chip > 0.955) px(deep, x, y);
      if (chip > 0.985) px(seam, x, y);
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) px(edge, x, y);
    }
  }
}

function crumbleChunks(parent: Mesh, piece: Piece, material: MeshToonMaterial): Mesh[] {
  const cols = 3;
  const rows = 3;
  const gap = 0.028;
  const sizeX = (piece.hx * 2 - gap * (cols - 1)) / cols;
  const sizeZ = (piece.hz * 2 - gap * (rows - 1)) / rows;
  const sizeY = piece.hy * 2;
  const chunks: Mesh[] = [];
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const geo = new BoxGeometry(sizeX, sizeY, sizeZ);
      setCrumbleChunkUVs(geo, ix, iz, cols, rows);
      const chunk = new Mesh(geo, material);
      const restX = (ix - (cols - 1) / 2) * (sizeX + gap);
      const restZ = (iz - (rows - 1) / 2) * (sizeZ + gap);
      chunk.position.set(restX, 0, restZ);
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      chunk.userData.restX = restX;
      chunk.userData.restZ = restZ;
      chunk.userData.dirX = ix - (cols - 1) / 2;
      chunk.userData.dirZ = iz - (rows - 1) / 2;
      chunk.userData.tilt = ((ix * 5 + iz * 3) % 5) - 2;
      parent.add(chunk);
      chunks.push(chunk);
    }
  }
  return chunks;
}

function setCrumbleChunkUVs(geo: BoxGeometry, ix: number, iz: number, cols: number, rows: number): void {
  const uv = geo.getAttribute("uv");
  if (!uv) return;
  const u0 = ix / cols;
  const u1 = (ix + 1) / cols;
  const v0 = 1 - (iz + 1) / rows;
  const v1 = 1 - iz / rows;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. Remap every face so pieces share one tile atlas.
  for (let face = 0; face < 6; face += 1) {
    const i = face * 4;
    uv.setXY(i, u0, v1);
    uv.setXY(i + 1, u1, v1);
    uv.setXY(i + 2, u0, v0);
    uv.setXY(i + 3, u1, v0);
  }
  uv.needsUpdate = true;
}

function toon(color: string, emissive = "#000000", emissiveIntensity = 0): MeshToonMaterial {
  return new MeshToonMaterial({
    color,
    emissive,
    emissiveIntensity,
    gradientMap: ramp,
  });
}

function glow(color: string): MeshToonMaterial {
  const mat = toon(color, color, 0.7);
  mat.side = DoubleSide;
  mat.toneMapped = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -4;
  mat.polygonOffsetUnits = -4;
  return mat;
}

function facet(geo: BufferGeometry): BufferGeometry {
  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();
  return flat;
}

function token(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value.length === 0) throw new Error(`Missing CSS token ${name}`);
  return value;
}
