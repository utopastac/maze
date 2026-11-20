import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type PerspectiveCamera,
  type Scene,
} from "three";
import { clamp } from "../core/math.ts";
import { token } from "./boardMaterials.ts";
import { easeInOutCubic } from "./easing.ts";
import { ENTER_CURTAIN_H, ENTER_CURTAIN_W, ENTER_CURTAIN_Z } from "./homeEnterConstants.ts";

/** Full-frame wood panels parented to the camera — slide apart like curtains. */
export class EnterPlayCurtains {
  private root: Group | null = null;
  private left: Mesh | null = null;
  private right: Mesh | null = null;

  private readonly camera: PerspectiveCamera;
  private readonly scene: Scene;

  constructor(camera: PerspectiveCamera, scene: Scene) {
    this.camera = camera;
    this.scene = scene;
  }

  /** Create (or re-show) the closed curtains. */
  ensure(): void {
    if (this.root) {
      this.root.visible = true;
      this.sync(0);
      return;
    }
    if (!this.camera.parent) this.scene.add(this.camera);
    const root = new Group();
    root.renderOrder = 1000;
    const mkMat = (hex: string): MeshBasicMaterial =>
      new MeshBasicMaterial({
        color: hex,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
      });
    const left = new Mesh(
      new PlaneGeometry(ENTER_CURTAIN_W, ENTER_CURTAIN_H),
      mkMat(token("--maze-wreck")),
    );
    const right = new Mesh(
      new PlaneGeometry(ENTER_CURTAIN_W, ENTER_CURTAIN_H),
      mkMat(token("--maze-wreck-dark")),
    );
    left.position.set(-ENTER_CURTAIN_W * 0.5, 0, ENTER_CURTAIN_Z);
    right.position.set(ENTER_CURTAIN_W * 0.5, 0, ENTER_CURTAIN_Z);
    left.renderOrder = 1001;
    right.renderOrder = 1001;
    left.frustumCulled = false;
    right.frustumCulled = false;
    left.userData.owned = true;
    right.userData.owned = true;
    root.add(left, right);
    this.camera.add(root);
    this.root = root;
    this.left = left;
    this.right = right;
  }

  /** 0 = closed, 1 = fully parted. */
  sync(open: number): void {
    const { root, left, right } = this;
    if (!root || !left || !right) return;
    const a = easeInOutCubic(clamp(open, 0, 1));
    const slide = a * (ENTER_CURTAIN_W + 0.2);
    left.position.set(-ENTER_CURTAIN_W * 0.5 - slide, 0, ENTER_CURTAIN_Z);
    right.position.set(ENTER_CURTAIN_W * 0.5 + slide, 0, ENTER_CURTAIN_Z);
    root.visible = a < 0.995;
  }

  dispose(): void {
    const root = this.root;
    if (root) {
      this.camera.remove(root);
      root.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        child.geometry.dispose();
        if (child.userData.owned && child.material instanceof MeshBasicMaterial) {
          child.material.dispose();
        }
      });
    }
    this.root = null;
    this.left = null;
    this.right = null;
  }
}
