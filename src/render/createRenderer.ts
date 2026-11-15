import {
  BasicShadowMap,
  NoToneMapping,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = BasicShadowMap;
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(1);
  return renderer;
}

