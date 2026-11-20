import {
  BoxGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  type BufferGeometry,
  type MeshBasicMaterial,
  type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { organicProps, toon, token } from "./boardMaterials.ts";
import { HOME_LAYER_H, HOME_TOWER_LAYERS } from "./homeEnterConstants.ts";
import { makeSadShack, voxel } from "./winGalleryKit.ts";

/** Explicit deps + hooks so the home backdrop builders don't touch MazeWorld internals. */
export interface HomeTowerContext {
  groundMats: Record<string, MeshToonMaterial>;
  /** Maze frame material (accent posts on the tower). */
  frameMat: MeshToonMaterial;
  onFloorMat: (mat: MeshToonMaterial) => void;
  onWallMat: (mat: MeshToonMaterial) => void;
  /** Summit chamber door root (enter-play tower approach). */
  onTowerDoorRoot: (root: Group) => void;
  /** Free-play trapdoor root (enter-play hatch approach). */
  onFreeDoorRoot: (root: Group) => void;
}

/**
 * Sealed hatch set into the barren floor — free-play zooms down into the pit.
 */
export function addFreePlayTrapdoor(
  ctx: HomeTowerContext,
  parent: Group, span: number, towerBase: number): void {
  const wood = ctx.groundMats.wreck;
  const woodDark = ctx.groundMats.wreckDark;
  const stone = ctx.groundMats.moonRock;
  const shade = ctx.groundMats.failCrack;
  const iron = ctx.groundMats.failGroundDark;
  const rim = span * 0.34;
  let x = rim * 0.42;
  let z = rim * 0.58;
  if (Math.hypot(x, z) < towerBase * 0.7) {
    x = rim * 0.55;
    z = rim * 0.62;
  }
  const size = 0.92;
  const frame = 0.1;
  const leaf = size * 0.42;
  const root = new Group();
  ctx.onFreeDoorRoot(root);
  root.position.set(x, 0, z);
  root.rotation.y = 0;
  root.userData.trapdoor = true;
  root.userData.doorCenterY = 0.04;
  // Camera arc must stay outside this radius so the enter path clears the tower.
  root.userData.clearRadius = towerBase * 0.92;

  // Stone lip flush with the dirt.
  const lip = new Mesh(new BoxGeometry(size + frame * 2, 0.06, size + frame * 2), stone);
  lip.position.y = 0.02;
  lip.receiveShadow = organicProps;
  lip.castShadow = organicProps;
  const pit = new Mesh(new BoxGeometry(size, 0.08, size), iron);
  pit.position.y = -0.02;
  // Dark mouth under the closed leaves.
  const voidPlane = new Mesh(new PlaneGeometry(size * 0.92, size * 0.92), ctx.groundMats.failGroundDark);
  voidPlane.rotation.x = -Math.PI / 2;
  voidPlane.position.y = -0.01;
  root.add(lip, pit, voidPlane);

  const mkLeaf = (side: -1 | 1): void => {
    const hatch = new Mesh(new BoxGeometry(leaf, 0.045, size * 0.9), side < 0 ? woodDark : wood);
    hatch.position.set(side * (leaf * 0.5 + 0.01), 0.055, 0);
    hatch.castShadow = organicProps;
    hatch.receiveShadow = organicProps;
    // Plank seams.
    const seam = new Mesh(new BoxGeometry(leaf * 0.92, 0.01, 0.02), shade);
    seam.position.set(0, 0.028, size * 0.18);
    const seam2 = seam.clone();
    seam2.position.z = -size * 0.16;
    const hinge = new Mesh(new BoxGeometry(0.04, 0.03, size * 0.7), shade);
    hinge.position.set(side * leaf * 0.42, 0.01, 0);
    hatch.add(seam, seam2, hinge);
    root.add(hatch);
  };
  mkLeaf(-1);
  mkLeaf(1);

  // Center seam bar + iron ring pull.
  const bar = new Mesh(new BoxGeometry(0.05, 0.03, size * 0.85), shade);
  bar.position.y = 0.07;
  const ring = new Mesh(new BoxGeometry(0.1, 0.02, 0.1), shade);
  ring.position.set(0, 0.085, size * 0.12);
  const ringHole = new Mesh(new BoxGeometry(0.05, 0.025, 0.05), iron);
  ringHole.position.set(0, 0.09, size * 0.12);
  root.add(bar, ring, ringHole);

  // Corner bolts / stakes so it reads as sealed shut.
  for (const [bx, bz] of [
    [-size * 0.48, -size * 0.48],
    [size * 0.48, -size * 0.48],
    [-size * 0.48, size * 0.48],
    [size * 0.48, size * 0.48],
  ] as const) {
    const bolt = new Mesh(new BoxGeometry(0.06, 0.05, 0.06), shade);
    bolt.position.set(bx, 0.06, bz);
    root.add(bolt);
  }

  parent.add(root);
}

/** A few slumped hovels clinging to the barren ring around the tower. */
export function addHomeShacks(
  ctx: HomeTowerContext,
  parent: Group, span: number, towerBase: number): void {
  const keepOut = towerBase * 0.62;
  const rim = span * 0.34;
  const wood = ctx.groundMats.wreck;
  const woodDark = ctx.groundMats.wreckDark;
  const stone = ctx.groundMats.moonRock;
  const shade = ctx.groundMats.failCrack;
  const spots: {
    x: number;
    z: number;
    scale: number;
    yaw: number;
    lean: number;
    kind: "hut" | "lean" | "ruin";
  }[] = [
    { x: rim * -0.72, z: rim * 0.55, scale: 1.15, yaw: 0.55, lean: 0.12, kind: "hut" },
    { x: rim * 0.68, z: rim * 0.42, scale: 0.95, yaw: -0.85, lean: -0.18, kind: "lean" },
    { x: rim * -0.35, z: rim * -0.78, scale: 1.05, yaw: 2.5, lean: 0.08, kind: "hut" },
    { x: rim * 0.82, z: rim * -0.35, scale: 0.88, yaw: -1.9, lean: 0.22, kind: "ruin" },
    { x: rim * 0.15, z: rim * 0.88, scale: 0.78, yaw: 0.2, lean: -0.1, kind: "lean" },
  ];
  for (const spot of spots) {
    if (Math.hypot(spot.x, spot.z) < keepOut) continue;
    parent.add(
      makeSadShack(spot.x, spot.z, spot.scale, spot.yaw, spot.lean, spot.kind, {
        wood,
        woodDark,
        stone,
        shade,
      }),
    );
  }
  // Lonely fence posts and a crumbled wall stub near the path.
  const stub = new Group();
  stub.position.set(rim * -0.15, 0, rim * 0.62);
  stub.rotation.y = 0.4;
  voxel(stub, woodDark, 0.03, 0.22, 0.03, -0.28, 0.22, 0);
  voxel(stub, woodDark, 0.03, 0.18, 0.03, 0.05, 0.18, 0.04);
  voxel(stub, wood, 0.03, 0.14, 0.03, 0.32, 0.14, -0.02);
  voxel(stub, wood, 0.28, 0.015, 0.015, 0, 0.28, 0.02);
  voxel(stub, shade, 0.18, 0.08, 0.12, 0.55, 0.08, 0.1);
  parent.add(stub);
}

export function addBarrenRocks(ctx: HomeTowerContext, parent: Group, span: number): void {
  const rim = span * 0.42;
  for (let i = 0; i < 28; i += 1) {
    const a = i * 1.37 + 0.2;
    const radius = rim * (0.35 + ((i * 17) % 100) / 100 * 0.62);
    const rock = new Mesh(
      new BoxGeometry(
        0.22 + (i % 5) * 0.11,
        0.1 + (i % 4) * 0.08,
        0.18 + (i % 3) * 0.1,
      ),
      i % 3 === 0
        ? ctx.groundMats.moonRock
        : i % 3 === 1
          ? ctx.groundMats.failGround
          : ctx.groundMats.failCrack,
    );
    rock.position.set(
      Math.cos(a) * radius,
      0.06 + (i % 3) * 0.02,
      Math.sin(a) * radius * 0.92,
    );
    rock.rotation.y = a * 0.55;
    rock.rotation.z = ((i % 5) - 2) * 0.04;
    rock.castShadow = organicProps;
    rock.receiveShadow = organicProps;
    parent.add(rock);
  }
  for (let i = 0; i < 10; i += 1) {
    const a = i * 2.1 + 0.8;
    const ridge = new Mesh(
      new BoxGeometry(0.7 + (i % 3) * 0.35, 0.18 + (i % 2) * 0.12, 0.28 + (i % 4) * 0.08),
      ctx.groundMats.failGroundDark,
    );
    ridge.position.set(Math.cos(a) * rim * 0.78, 0.1, Math.sin(a) * rim * 0.7);
    ridge.rotation.y = a * 0.4;
    ridge.castShadow = organicProps;
    ridge.receiveShadow = organicProps;
    parent.add(ridge);
  }
}

export function addOminousTower(ctx: HomeTowerContext, parent: Group, span: number): void {
  const root = new Group();
  const baseSize = span * 0.36;
  const floorT = 0.045;
  const wallH = 0.088;
  const wallT = 0.038;
  const floorGeos: BufferGeometry[] = [];
  const wallGeos: BufferGeometry[] = [];
  const shadeGeos: BufferGeometry[] = [];
  const accentGeos: BufferGeometry[] = [];

  for (let i = 0; i < HOME_TOWER_LAYERS; i += 1) {
    const t = i / Math.max(1, HOME_TOWER_LAYERS - 1);
    // Pyramid: keep the base fat, then shrink hard toward the tip (~25% width).
    const taper = 1 - Math.pow(t, 0.9) * 0.75;
    const wobble = Math.sin(i * 0.73) * 0.01 + Math.cos(i * 1.17) * 0.007;
    const size = baseSize * taper * (1 + wobble * taper);
    const y = i * HOME_LAYER_H + floorT * 0.5;
    const ox = Math.sin(i * 0.41) * 0.04 * taper;
    const oz = Math.cos(i * 0.37) * 0.04 * taper;
    const half = size * 0.5;

    const slab = new BoxGeometry(size, floorT, size);
    slab.translate(ox, y, oz);
    floorGeos.push(slab);

    const wy = y + floorT * 0.5 + wallH * 0.5;
    const north = new BoxGeometry(size, wallH, wallT);
    north.translate(ox, wy, oz - half + wallT * 0.5);
    const south = new BoxGeometry(size, wallH, wallT);
    south.translate(ox, wy, oz + half - wallT * 0.5);
    const west = new BoxGeometry(wallT, wallH, size - wallT * 2);
    west.translate(ox - half + wallT * 0.5, wy, oz);
    const east = new BoxGeometry(wallT, wallH, size - wallT * 2);
    east.translate(ox + half - wallT * 0.5, wy, oz);
    wallGeos.push(north, south, west, east);

    // Sparse interior stubs so layers read like maze floors.
    if (i % 2 === 0) {
      const stubW = size * (0.28 + ((i * 13) % 7) * 0.04);
      const stub = new BoxGeometry(stubW, wallH * 0.85, wallT * 0.9);
      const angle = (i * 1.7) % (Math.PI * 2);
      stub.translate(
        ox + Math.cos(angle) * size * 0.18,
        wy,
        oz + Math.sin(angle) * size * 0.18,
      );
      shadeGeos.push(stub);
    }
    if (i % 5 === 0) {
      const post = new BoxGeometry(wallT * 1.4, wallH * 1.15, wallT * 1.4);
      post.translate(ox + half * 0.72, wy, oz + half * 0.72);
      accentGeos.push(post);
    }
  }

  const merge = (geos: BufferGeometry[]): BufferGeometry | null => {
    if (geos.length === 0) return null;
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos);
    if (geos.length > 1) {
      for (const geo of geos) geo.dispose();
    }
    if (!merged) return null;
    // Translated floor slabs sit far from the origin — refresh bounds or frustum culling hides the tower.
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  };

  const floorMesh = merge(floorGeos);
  if (floorMesh) {
    // Lit toon stone — picks up storm lights + emissive flash on lightning.
    const floorMat = toon(token("--maze-fail-ground"), "#c8d6ff", 0);
    const mesh = new Mesh(floorMesh, floorMat);
    mesh.frustumCulled = false;
    mesh.userData.owned = true;
    mesh.userData.ownedMats = true;
    mesh.castShadow = organicProps;
    mesh.receiveShadow = organicProps;
    root.add(mesh);
    ctx.onFloorMat(floorMat);
  }
  const wallMesh = merge(wallGeos);
  if (wallMesh) {
    const wallMat = toon(token("--maze-wall"), "#dce6ff", 0);
    const mesh = new Mesh(wallMesh, wallMat);
    mesh.frustumCulled = false;
    mesh.userData.owned = true;
    mesh.userData.ownedMats = true;
    mesh.castShadow = organicProps;
    mesh.receiveShadow = organicProps;
    root.add(mesh);
    ctx.onWallMat(wallMat);
  }
  const shadeMesh = merge(shadeGeos);
  if (shadeMesh) {
    const mesh = new Mesh(shadeMesh, ctx.groundMats.failCrack);
    mesh.frustumCulled = false;
    mesh.castShadow = organicProps;
    root.add(mesh);
  }
  const accentMesh = merge(accentGeos);
  if (accentMesh) {
    const mesh = new Mesh(accentMesh, ctx.frameMat);
    mesh.frustumCulled = false;
    mesh.castShadow = organicProps;
    root.add(mesh);
  }

  // Tip metrics must match the last layer so the summit sits flush and square.
  const tipI = HOME_TOWER_LAYERS - 1;
  const tipT = tipI / Math.max(1, HOME_TOWER_LAYERS - 1);
  const tipTaper = 1 - Math.pow(tipT, 0.9) * 0.75;
  const tipWobble = Math.sin(tipI * 0.73) * 0.01 + Math.cos(tipI * 1.17) * 0.007;
  const tipSize = baseSize * tipTaper * (1 + tipWobble * tipTaper);
  const tipOx = Math.sin(tipI * 0.41) * 0.04 * tipTaper;
  const tipOz = Math.cos(tipI * 0.37) * 0.04 * tipTaper;
  // Sit on the tip floor slab (inside the wall rim), not on top of the walls.
  const tipTopY = tipI * HOME_LAYER_H + floorT;
  addSinisterSummit(ctx, root, tipSize, tipOx, tipTopY, tipOz);
  parent.add(root);
}

/**
 * Small brick cube crowning the storm tower — axis-aligned with the tip slab.
 */
function addSinisterSummit(
  ctx: HomeTowerContext,
  parent: Group,
  tipSize: number,
  tipX: number,
  tipTopY: number,
  tipZ: number,
): void {
  const brick = ctx.groundMats.buildingBrickOld;
  const mortar = ctx.groundMats.cobbleDark;
  const wood = ctx.groundMats.wreck;
  const woodDark = ctx.groundMats.wreckDark;
  // Slightly inset from the tip edges so the cube reads as seated on the slab.
  const roomW = tipSize * 0.78;
  const roomD = tipSize * 0.78;
  const roomH = tipSize * 0.7;
  const wallT = tipSize * 0.08;
  const openingW = tipSize * 0.48;
  const openingH = tipSize * 0.55;
  const root = new Group();
  ctx.onTowerDoorRoot(root);
  // Same axes as the tower slabs — doors face +Z (home orbit looks from +Z).
  root.position.set(tipX, tipTopY, tipZ);
  root.rotation.y = 0;
  root.userData.doorYaw = 0;

  const add = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: MeshToonMaterial | MeshBasicMaterial,
  ): Mesh => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = organicProps;
    mesh.receiveShadow = organicProps;
    root.add(mesh);
    return mesh;
  };

  // Cube centered on the tip; door face is the +Z wall. Floor sits on the tip.
  const floorY = 0;
  const midY = floorY + roomH * 0.5;
  const frontZ = roomD * 0.5 - wallT * 0.35;
  const backZ = -roomD * 0.5 + wallT * 0.5;

  add(roomW, wallT * 0.55, roomD, 0, floorY, 0, mortar);
  add(roomW, wallT * 0.55, roomD, 0, floorY + roomH, 0, brick);

  add(roomW, roomH, wallT, 0, midY, backZ, brick);
  add(wallT, roomH, roomD - wallT * 2, -roomW * 0.5 + wallT * 0.5, midY, 0, brick);
  add(wallT, roomH, roomD - wallT * 2, roomW * 0.5 - wallT * 0.5, midY, 0, brick);

  const sideW = (roomW - openingW) * 0.5;
  add(sideW, roomH, wallT, -roomW * 0.5 + sideW * 0.5, midY, frontZ, brick);
  add(sideW, roomH, wallT, roomW * 0.5 - sideW * 0.5, midY, frontZ, brick);
  add(openingW, roomH - openingH, wallT, 0, floorY + openingH + (roomH - openingH) * 0.5, frontZ, brick);

  const courseH = roomH / 5;
  for (let i = 1; i < 5; i += 1) {
    const y = floorY + courseH * i;
    add(wallT * 0.12, courseH * 0.12, roomD * 0.88, -roomW * 0.5 - wallT * 0.02, y, 0, mortar);
    add(wallT * 0.12, courseH * 0.12, roomD * 0.88, roomW * 0.5 + wallT * 0.02, y, 0, mortar);
    add(roomW * 0.88, courseH * 0.12, wallT * 0.12, 0, y, backZ - wallT * 0.08, mortar);
  }

  // Half-opening leaves with overlap so the seam stays closed.
  const leafW = openingW * 0.51;
  const leafH = openingH * 0.98;
  const doorZ = frontZ + wallT * 0.2;
  const mkDoor = (side: -1 | 1): Mesh => {
    const pivot = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), woodDark);
    pivot.position.set(side * openingW * 0.5, floorY + openingH * 0.5, doorZ);
    const leaf = new Mesh(
      new BoxGeometry(leafW, leafH, wallT * 0.22),
      side < 0 ? woodDark : wood,
    );
    leaf.position.set(-side * leafW * 0.5, 0, 0);
    leaf.castShadow = organicProps;
    const band = new Mesh(new BoxGeometry(leafW * 0.82, wallT * 0.1, wallT * 0.26), mortar);
    band.position.set(-side * leafW * 0.5, leafH * 0.08, wallT * 0.06);
    const knob = new Mesh(new BoxGeometry(wallT * 0.16, wallT * 0.16, wallT * 0.18), mortar);
    knob.position.set(-side * leafW * 0.18, 0, wallT * 0.12);
    pivot.add(leaf, band, knob);
    root.add(pivot);
    return pivot;
  };
  mkDoor(-1);
  mkDoor(1);

  const voidPlane = new Mesh(
    new PlaneGeometry(openingW * 0.98, openingH * 0.94),
    ctx.groundMats.failGroundDark,
  );
  voidPlane.position.set(0, floorY + openingH * 0.5, frontZ - wallT * 0.2);
  root.add(voidPlane);

  root.userData.doorCenterY = floorY + openingH * 0.5;
  root.userData.doorFaceZ = doorZ;
  root.userData.doorOpeningW = openingW;
  root.userData.doorOpeningH = openingH;
  parent.add(root);
}
