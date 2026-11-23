import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  type MeshToonMaterial,
} from "three";
import { organicProps } from "./boardMaterials.ts";
import type { HomeTowerContext } from "./homeTower.ts";
import { makePalm } from "./winGalleryKit.ts";

export type HomeFreeIslandInfo = {
  x: number;
  z: number;
  /** Ocean discard / camera framing radius. */
  radius: number;
};

export type FreeIslandPalmMats = {
  trunk: MeshToonMaterial;
  palm: MeshToonMaterial;
  palmLit: MeshToonMaterial;
};

/**
 * Sealed hatch — chunky enough to read from the sky dive (raised stone well +
 * thick plank leaves with top-face grooves).
 */
function addHatch(ctx: HomeTowerContext, parent: Group, clearRadius: number): void {
  const wood = ctx.groundMats.wreck;
  const woodDark = ctx.groundMats.wreckDark;
  const stone = ctx.groundMats.moonRock;
  const shade = ctx.groundMats.failCrack;
  const iron = ctx.groundMats.failGroundDark;
  const size = 1.05;
  const frame = 0.16;
  const leaf = size * 0.44;
  const leafT = 0.1;
  const root = new Group();
  ctx.onFreeDoorRoot(root);
  root.position.set(0, 0, 0);
  root.rotation.y = 0;
  root.userData.trapdoor = true;
  root.userData.doorCenterY = 0.08;
  root.userData.clearRadius = clearRadius;

  const well = new Mesh(
    new BoxGeometry(size + frame * 2, 0.14, size + frame * 2),
    stone,
  );
  well.position.y = 0.05;
  well.receiveShadow = organicProps;
  well.castShadow = organicProps;
  const pit = new Mesh(new BoxGeometry(size, 0.16, size), iron);
  pit.position.y = -0.04;
  const voidPlane = new Mesh(
    new PlaneGeometry(size * 0.94, size * 0.94),
    ctx.groundMats.failGroundDark,
  );
  voidPlane.rotation.x = -Math.PI / 2;
  voidPlane.position.y = -0.02;
  root.add(well, pit, voidPlane);

  const mkLeaf = (side: -1 | 1): void => {
    const hatch = new Mesh(
      new BoxGeometry(leaf, leafT, size * 0.88),
      side < 0 ? woodDark : wood,
    );
    hatch.position.set(side * (leaf * 0.5 + 0.015), 0.12, 0);
    hatch.castShadow = organicProps;
    hatch.receiveShadow = organicProps;
    for (const z of [-0.28, -0.08, 0.12, 0.3] as const) {
      const plank = new Mesh(new BoxGeometry(leaf * 0.9, 0.02, 0.06), shade);
      plank.position.set(0, leafT * 0.55, z * size * 0.42);
      hatch.add(plank);
    }
    const hinge = new Mesh(new BoxGeometry(0.05, 0.04, size * 0.72), iron);
    hinge.position.set(side * leaf * 0.42, 0.01, 0);
    hatch.add(hinge);
    root.add(hatch);
  };
  mkLeaf(-1);
  mkLeaf(1);

  const bar = new Mesh(new BoxGeometry(0.08, 0.04, size * 0.82), iron);
  bar.position.y = 0.175;
  const ring = new Mesh(new BoxGeometry(0.14, 0.05, 0.14), shade);
  ring.position.set(0, 0.2, size * 0.14);
  const ringHole = new Mesh(new BoxGeometry(0.07, 0.06, 0.07), iron);
  ringHole.position.set(0, 0.205, size * 0.14);
  root.add(bar, ring, ringHole);

  for (const [bx, bz] of [
    [-size * 0.48, -size * 0.48],
    [size * 0.48, -size * 0.48],
    [-size * 0.48, size * 0.48],
    [size * 0.48, size * 0.48],
  ] as const) {
    const bolt = new Mesh(new BoxGeometry(0.08, 0.07, 0.08), iron);
    bolt.position.set(bx, 0.14, bz);
    root.add(bolt);
  }

  parent.add(root);
}

/**
 * Circular tropical islet — sand disc, palms, hatch clearing for free-play enter.
 */
export function addFreePlayIsland(
  ctx: HomeTowerContext,
  parent: Group,
  towerIslandSpan: number,
  palms: FreeIslandPalmMats,
): HomeFreeIslandInfo {
  const span = towerIslandSpan * 0.58;
  const angle = 2.2;
  const dist = towerIslandSpan * 4.2;
  const x = Math.sin(angle) * dist;
  const z = Math.cos(angle) * dist;
  const radius = span * 0.52;
  const segments = 28;

  const island = new Group();
  island.position.set(x, 0, z);
  island.userData.freePlayIsland = true;

  const sand = ctx.groundMats.sand;
  const sandDark = ctx.groundMats.sandDark;
  const wet = ctx.groundMats.seabedSand;

  // Underwater shelf + cliff ring — reads as a round atoll from any angle.
  const shelf = new Mesh(
    new CylinderGeometry(radius * 1.12, radius * 1.22, 0.38, segments),
    sandDark,
  );
  shelf.position.y = -0.28;
  shelf.castShadow = organicProps;
  shelf.receiveShadow = organicProps;

  const pad = new Mesh(
    new CylinderGeometry(radius, radius * 1.04, 0.32, segments),
    sand,
  );
  pad.position.y = -0.08;
  pad.castShadow = organicProps;
  pad.receiveShadow = organicProps;

  const top = new Mesh(new CircleGeometry(radius * 0.98, segments), sand);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.085;
  top.receiveShadow = organicProps;

  // Wet tide ring just inside the shore.
  const tide = new Mesh(
    new RingGeometry(radius * 0.82, radius * 0.98, segments),
    wet,
  );
  tide.rotation.x = -Math.PI / 2;
  tide.position.y = 0.09;
  tide.receiveShadow = organicProps;

  // Sand apron under the hatch.
  const clearing = new Mesh(new CircleGeometry(0.85, 20), sandDark);
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.y = 0.095;
  clearing.receiveShadow = organicProps;

  island.add(shelf, pad, top, tide, clearing);

  // Palms ring the shore; leave the hatch clearing open.
  const palmSpots: { a: number; r: number; s: number }[] = [
    { a: 0.4, r: 0.72, s: 1.15 },
    { a: 1.3, r: 0.78, s: 0.95 },
    { a: 2.1, r: 0.7, s: 1.25 },
    { a: 3.0, r: 0.76, s: 1.05 },
    { a: 3.9, r: 0.68, s: 1.2 },
    { a: 4.8, r: 0.8, s: 0.9 },
    { a: 5.6, r: 0.74, s: 1.1 },
  ];
  for (const spot of palmSpots) {
    island.add(
      makePalm(
        Math.cos(spot.a) * radius * spot.r,
        Math.sin(spot.a) * radius * spot.r,
        spot.s,
        palms.trunk,
        palms.palm,
        palms.palmLit,
      ),
    );
  }

  // Shore pebbles / coral nubs.
  for (let i = 0; i < 10; i += 1) {
    const a = i * 0.7 + 0.15;
    const rock = new Mesh(
      new BoxGeometry(0.14 + (i % 3) * 0.06, 0.08 + (i % 2) * 0.04, 0.12 + (i % 4) * 0.04),
      i % 2 === 0 ? sandDark : wet,
    );
    rock.position.set(
      Math.cos(a) * radius * 0.9,
      0.1,
      Math.sin(a) * radius * 0.9,
    );
    rock.rotation.y = a;
    rock.castShadow = organicProps;
    rock.receiveShadow = organicProps;
    island.add(rock);
  }

  addHatch(ctx, island, Math.max(radius * 1.15, 2.2));
  parent.add(island);
  return { x, z, radius };
}
