import {
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  Vector2,
  type BufferGeometry,
} from "three";

/** Disc with a shallow inset ring carved into both faces. */
export function makeCoinGeo(): BufferGeometry {
  // Lathe profile: x = radius, y = half-thickness. Revolved around Y, then tipped to face ±Z.
  const pts: Vector2[] = [];
  const add = (r: number, y: number) => pts.push(new Vector2(r, y));

  // Front face (center → rim)
  add(0, 0.09);
  add(0.17, 0.09);
  add(0.22, 0.09);
  add(0.255, 0.042); // drop into groove
  add(0.37, 0.042);
  add(0.405, 0.09); // climb out
  add(0.455, 0.09);
  add(0.5, 0.055);
  // Rim wall
  add(0.5, -0.055);
  // Back face (rim → center), mirrored inset
  add(0.455, -0.09);
  add(0.405, -0.09);
  add(0.37, -0.042);
  add(0.255, -0.042);
  add(0.22, -0.09);
  add(0.17, -0.09);
  add(0, -0.09);

  const geo = new LatheGeometry(pts, 36);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function makeHeartGeo(): BufferGeometry {
  const shape = new Shape();
  const s = 0.048;
  const x = (value: number) => (value - 12) * s;
  const y = (value: number) => (16 - value) * s;
  // Tall lobes + deep center cleft so the dip reads clearly after bevel.
  shape.moveTo(x(12), y(21.2));
  shape.bezierCurveTo(x(12), y(21.2), x(2.2), y(14.8), x(2.2), y(8));
  shape.bezierCurveTo(x(2.2), y(4.4), x(5), y(1.4), x(8.1), y(1.4));
  shape.bezierCurveTo(x(9.7), y(1.4), x(11.1), y(3.1), x(12), y(6.8));
  shape.bezierCurveTo(x(12.9), y(3.1), x(14.3), y(1.4), x(15.9), y(1.4));
  shape.bezierCurveTo(x(19), y(1.4), x(21.8), y(4.4), x(21.8), y(8));
  shape.bezierCurveTo(x(21.8), y(14.8), x(12), y(21.2), x(12), y(21.2));
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/** Glossy heart: thick dark outline, body, inner shade. Specular shine comes from lighting. */
export function makeHeartIcon(
  geo: BufferGeometry,
  outlineMat: MeshStandardMaterial,
  bodyMat: MeshStandardMaterial,
  shadeMat: MeshStandardMaterial,
): Group {
  const root = new Group();

  const outline = new Mesh(geo, outlineMat);
  outline.scale.setScalar(1.16);
  outline.position.z = -0.05;

  const body = new Mesh(geo, bodyMat);
  body.position.z = 0.02;

  const shade = new Mesh(geo, shadeMat);
  shade.scale.set(0.9, 0.88, 0.55);
  shade.position.set(0.06, -0.07, 0.14);

  root.add(outline, body, shade);
  return root;
}

export function makeHeartMaterials(heartColor: string): {
  outline: MeshStandardMaterial;
  body: MeshStandardMaterial;
  shade: MeshStandardMaterial;
} {
  const outline = new MeshStandardMaterial({
    color: "#5a1e22",
    emissive: "#2a0c10",
    emissiveIntensity: 0.05,
    roughness: 0.65,
    metalness: 0.1,
  });
  const body = new MeshStandardMaterial({
    color: heartColor,
    emissive: heartColor,
    emissiveIntensity: 0.2,
    roughness: 0.22,
    metalness: 0.15,
  });
  const shade = new MeshStandardMaterial({
    color: "#b02030",
    emissive: "#801018",
    emissiveIntensity: 0.08,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  return { outline, body, shade };
}

export function makeCoinMaterial(coin: string, shine: string): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    color: coin,
    emissive: shine,
    emissiveIntensity: 0.4,
    metalness: 0.7,
    roughness: 0.25,
  });
  return mat;
}
