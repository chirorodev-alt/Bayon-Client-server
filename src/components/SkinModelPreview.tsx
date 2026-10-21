import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type FaceRect = readonly [number, number, number, number];
type CubeFaces = readonly [FaceRect, FaceRect, FaceRect, FaceRect, FaceRect, FaceRect];

type SkinModelPreviewProps = {
  imageUrl?: string;
  skinName: string;
  rotation: number;
  slimArms: boolean;
  onRotationChange: (rotation: number) => void;
};

const faceMaterialOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;

function createFallbackTexture(skinName: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the fallback skin texture.');

  const palette = skinName === 'Volcanic'
    ? { skin: '#a87a5a', hair: '#302724', shirt: '#68443b', highlight: '#bd7854', pants: '#382f30', arm: '#875342' }
    : skinName === 'Nightfall'
      ? { skin: '#c49b7b', hair: '#20212b', shirt: '#293752', highlight: '#687da2', pants: '#252c3a', arm: '#354b6c' }
      : skinName === 'Ashen'
        ? { skin: '#bea995', hair: '#5b5b5b', shirt: '#65696c', highlight: '#c2c6c8', pants: '#41464b', arm: '#7b8084' }
        : { skin: '#9c7053', hair: '#432c24', shirt: '#253d5b', highlight: '#3a5d87', pants: '#303943', arm: '#40546b' };

  context.fillStyle = palette.skin;
  context.fillRect(0, 0, 32, 16);
  context.fillRect(8, 8, 8, 8);
  context.fillStyle = palette.hair;
  context.fillRect(0, 0, 32, 8);
  context.fillRect(8, 8, 8, 3);
  context.fillStyle = '#17191d';
  context.fillRect(10, 11, 1, 1);
  context.fillRect(13, 11, 1, 1);
  context.fillStyle = '#e0d0bd';
  context.fillRect(11, 14, 3, 1);

  context.fillStyle = palette.shirt;
  context.fillRect(20, 20, 8, 12);
  context.fillStyle = palette.highlight;
  context.fillRect(20, 20, 8, 2);
  context.fillRect(20, 20, 2, 12);
  context.fillStyle = '#d4e6fa';
  context.fillRect(23, 23, 2, 6);

  context.fillStyle = palette.pants;
  context.fillRect(0, 16, 16, 16);
  context.fillRect(16, 48, 16, 16);
  context.fillStyle = palette.arm;
  context.fillRect(40, 16, 16, 16);
  context.fillRect(32, 48, 16, 16);
  context.fillRect(4, 20, 4, 12);
  context.fillRect(4, 36, 4, 12);
  context.fillRect(44, 20, 4, 12);
  context.fillRect(20, 52, 4, 12);
  return canvas;
}

function cropFace(image: CanvasImageSource, sourceWidth: number, sourceHeight: number, rect: FaceRect, legacyRect?: FaceRect): THREE.CanvasTexture {
  const useLegacyFace = sourceHeight === 32 && legacyRect !== undefined;
  const sourceRect = useLegacyFace && legacyRect ? legacyRect : rect;
  const [x, y, width, height] = sourceRect;
  const mirrorLegacyFace = useLegacyFace && legacyRect !== undefined && (rect[0] !== legacyRect[0] || rect[1] !== legacyRect[1]);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to build a Minecraft skin texture.');

  if (mirrorLegacyFace) {
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(image, x, y, width, height, 0, 0, width, height);
    context.restore();
  } else if (x + width <= sourceWidth && y + height <= sourceHeight) {
    context.drawImage(image, x, y, width, height, 0, 0, width, height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function faceMaterials(
  image: CanvasImageSource,
  width: number,
  height: number,
  faces: CubeFaces,
  legacyFaces?: CubeFaces,
  transparent = false,
): THREE.MeshStandardMaterial[] {
  return faceMaterialOrder.map((_face, index) => {
    const texture = cropFace(image, width, height, faces[index], legacyFaces?.[index]);
    return new THREE.MeshStandardMaterial({
      map: texture,
      transparent,
      alphaTest: transparent ? 0.05 : 0,
      roughness: 1,
      metalness: 0,
    });
  });
}

function textureDimensions(image: CanvasImageSource): { width: number; height: number } {
  if (image instanceof HTMLImageElement) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  if (image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height };
  }
  if (image instanceof ImageBitmap) {
    return { width: image.width, height: image.height };
  }
  throw new Error('Unsupported Minecraft skin texture image.');
}

function createTexturedCube(
  image: CanvasImageSource,
  width: number,
  height: number,
  depth: number,
  position: THREE.Vector3,
  faces: CubeFaces,
  legacyFaces?: CubeFaces,
  transparent = false,
): THREE.Mesh {
  const { width: textureWidth, height: textureHeight } = textureDimensions(image);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    faceMaterials(image, textureWidth, textureHeight, faces, legacyFaces, transparent),
  );
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
  });
}

export function SkinModelPreview({ imageUrl, skinName, rotation, slimArms, onRotationChange }: SkinModelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<{ renderer: THREE.WebGLRenderer; player: THREE.Group; render: () => void } | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; rotation: number } | null>(null);
  const rotationRef = useRef(rotation);
  const [renderError, setRenderError] = useState('');

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    let renderer: THREE.WebGLRenderer;
    let disposed = false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : '3D preview is not supported on this device.');
      return;
    }

    setRenderError('');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(30, 17, 42);
    camera.lookAt(0, 2, 0);

    scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x252b35, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3);
    keyLight.position.set(-15, 22, 24);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x9fc7ff, 1.6);
    rimLight.position.set(14, 9, -18);
    scene.add(rimLight);

    const player = new THREE.Group();
    scene.add(player);
    const render = () => renderer.render(scene, camera);
    previewRef.current = { renderer, player, render };

    const drawModel = (textureSource: CanvasImageSource, textureHeight: number) => {
      const legacy = textureHeight === 32;
      const rightArm: CubeFaces = [
        [40, 20, 4, 12], [48, 20, 4, 12], [44, 16, 4, 4], [48, 16, 4, 4], [44, 20, 4, 12], [52, 20, 4, 12],
      ];
      const leftArm: CubeFaces = [
        [32, 52, 4, 12], [40, 52, 4, 12], [36, 48, 4, 4], [40, 48, 4, 4], [36, 52, 4, 12], [44, 52, 4, 12],
      ];
      const rightLeg: CubeFaces = [
        [0, 20, 4, 12], [8, 20, 4, 12], [4, 16, 4, 4], [8, 16, 4, 4], [4, 20, 4, 12], [12, 20, 4, 12],
      ];
      const leftLeg: CubeFaces = [
        [16, 52, 4, 12], [24, 52, 4, 12], [20, 48, 4, 4], [24, 48, 4, 4], [20, 52, 4, 12], [28, 52, 4, 12],
      ];
      const head: CubeFaces = [
        [0, 8, 8, 8], [16, 8, 8, 8], [8, 0, 8, 8], [16, 0, 8, 8], [8, 8, 8, 8], [24, 8, 8, 8],
      ];
      const body: CubeFaces = [
        [16, 20, 4, 12], [28, 20, 4, 12], [20, 16, 8, 4], [28, 16, 8, 4], [20, 20, 8, 12], [32, 20, 8, 12],
      ];
      const add = (mesh: THREE.Mesh) => player.add(mesh);
      const armWidth = slimArms ? 3 : 4;
      const armOffset = slimArms ? 5.5 : 6;

      add(createTexturedCube(textureSource, 8, 8, 8, new THREE.Vector3(0, 14, 0), head));
      add(createTexturedCube(textureSource, 8, 12, 4, new THREE.Vector3(0, 4, 0), body));
      add(createTexturedCube(textureSource, armWidth, 12, 4, new THREE.Vector3(-armOffset, 4, 0), rightArm, rightArm));
      add(createTexturedCube(textureSource, armWidth, 12, 4, new THREE.Vector3(armOffset, 4, 0), leftArm, rightArm));
      add(createTexturedCube(textureSource, 4, 12, 4, new THREE.Vector3(-2, -8, 0), rightLeg, rightLeg));
      add(createTexturedCube(textureSource, 4, 12, 4, new THREE.Vector3(2, -8, 0), leftLeg, rightLeg));

      if (!legacy) {
        const overlayHead: CubeFaces = [
          [32, 8, 8, 8], [48, 8, 8, 8], [40, 0, 8, 8],
          [48, 0, 8, 8], [40, 8, 8, 8], [56, 8, 8, 8],
        ];
        const overlayBody: CubeFaces = [
          [16, 36, 4, 12], [28, 36, 4, 12], [20, 32, 8, 4], [28, 32, 8, 4], [20, 36, 8, 12], [32, 36, 8, 12],
        ];
        const overlayArmRight: CubeFaces = [
          [40, 36, 4, 12], [48, 36, 4, 12], [44, 32, 4, 4], [48, 32, 4, 4], [44, 36, 4, 12], [52, 36, 4, 12],
        ];
        const overlayArmLeft: CubeFaces = [
          [48, 52, 4, 12], [56, 52, 4, 12], [52, 48, 4, 4], [56, 48, 4, 4], [52, 52, 4, 12], [60, 52, 4, 12],
        ];
        const overlayLegRight: CubeFaces = [
          [0, 36, 4, 12], [8, 36, 4, 12], [4, 32, 4, 4], [8, 32, 4, 4], [4, 36, 4, 12], [12, 36, 4, 12],
        ];
        const overlayLegLeft: CubeFaces = [
          [0, 52, 4, 12], [8, 52, 4, 12], [4, 48, 4, 4], [8, 48, 4, 4], [4, 52, 4, 12], [12, 52, 4, 12],
        ];
        add(createTexturedCube(textureSource, 8.6, 8.6, 8.6, new THREE.Vector3(0, 14, 0), overlayHead, undefined, true));
        add(createTexturedCube(textureSource, 8.4, 12.4, 4.4, new THREE.Vector3(0, 4, 0), overlayBody, undefined, true));
        add(createTexturedCube(textureSource, armWidth + 0.4, 12.4, 4.4, new THREE.Vector3(-armOffset, 4, 0), overlayArmRight, undefined, true));
        add(createTexturedCube(textureSource, armWidth + 0.4, 12.4, 4.4, new THREE.Vector3(armOffset, 4, 0), overlayArmLeft, undefined, true));
        add(createTexturedCube(textureSource, 4.4, 12.4, 4.4, new THREE.Vector3(-2, -8, 0), overlayLegRight, undefined, true));
        add(createTexturedCube(textureSource, 4.4, 12.4, 4.4, new THREE.Vector3(2, -8, 0), overlayLegLeft, undefined, true));
      }
      player.rotation.y = THREE.MathUtils.degToRad(rotation);
    };

    let skinTexture: THREE.Texture | null = null;
    if (imageUrl) {
      new THREE.TextureLoader().load(
        imageUrl,
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          skinTexture = texture;
          const image = texture.image as CanvasImageSource;
          const dimensions = textureDimensions(image);
          drawModel(image, dimensions.height);
          render();
        },
        undefined,
        () => setRenderError('Unable to load this skin texture for the 3D preview.'),
      );
    } else {
      const fallback = createFallbackTexture(skinName);
      drawModel(fallback, fallback.height);
    }

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let dragging = false;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, rotation: rotationRef.current };
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!dragging || !drag || drag.pointerId !== event.pointerId) return;
      onRotationChange(drag.rotation + (event.clientX - drag.x) * 0.8);
    };
    const onPointerUp = () => {
      dragging = false;
      dragRef.current = null;
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      disposeObject(player);
      previewRef.current = null;
      skinTexture?.dispose();
      renderer.dispose();
    };
  }, [imageUrl, skinName, slimArms]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.player.rotation.y = THREE.MathUtils.degToRad(rotation);
    preview.render();
  }, [rotation]);

  return (
    <div className="skin-model-wrap" aria-label={`3D preview of ${skinName}`} data-rotation={rotation}>
      <canvas ref={canvasRef} className="skin-model-canvas" aria-label={`Rotatable Minecraft skin model: ${skinName}`} />
      {renderError && <div role="alert" className="skin-model-error">{renderError}</div>}
      <span className="skin-model-hint">Drag to rotate</span>
    </div>
  );
}
