import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createDecalTexture,
  createHazardTexture,
  createRadiatorTexture,
  createSolarTexture,
} from './textures';

/* ------------------------------------------------------------------ */
/*  Types & shared construction helpers                                */
/* ------------------------------------------------------------------ */

export interface ModuleBinding {
  id: string;
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  baseEmissive: Array<{ material: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }>;
}

export interface StationBuild {
  root: THREE.Group;
  modules: Map<string, ModuleBinding>;
  update: (elapsed: number) => void;
}

interface SurfaceSet {
  body: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
}

type Axis = 'x' | 'y' | 'z';

const UP = new THREE.Vector3(0, 1, 0);
const TRUSS_Y = 7.8;

function makeSurfaceSet(bodyColor: number, roughness = 0.52): SurfaceSet {
  const body = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.38,
    roughness,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x707a82,
    metalness: 0.78,
    roughness: 0.32,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x363c42,
    metalness: 0.66,
    roughness: 0.43,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xb9893d,
    metalness: 0.9,
    roughness: 0.34,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x07131c,
    metalness: 0.15,
    roughness: 0.08,
    transparent: true,
    opacity: 0.82,
    emissive: 0x12394a,
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  });
  [body, trim, dark, gold].forEach((material) => {
    material.userData.moduleSurface = true;
    material.userData.baseEmissive = material.emissive.clone();
    material.userData.baseEmissiveIntensity = material.emissiveIntensity;
  });
  return { body, trim, dark, gold, glass };
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  castShadow = false,
  receiveShadow = true,
): THREE.Mesh {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = castShadow;
  object.receiveShadow = receiveShadow;
  return object;
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  material: THREE.Material,
  position: [number, number, number],
  rotation?: [number, number, number],
  castShadow = false,
): THREE.Mesh {
  const object = mesh(new THREE.BoxGeometry(...size), material, castShadow);
  object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  parent.add(object);
  return object;
}

function addRoundedBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  radius: number,
  material: THREE.Material,
  position: [number, number, number],
  rotation?: [number, number, number],
): THREE.Mesh {
  const object = mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), material);
  object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  parent.add(object);
  return object;
}

function addCylinderBetween(
  parent: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  segments = 10,
  castShadow = false,
): THREE.Mesh {
  const delta = end.clone().sub(start);
  const length = delta.length();
  const object = mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material, castShadow);
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(UP, delta.normalize());
  parent.add(object);
  return object;
}

function addTorus(
  parent: THREE.Object3D,
  radius: number,
  tube: number,
  position: [number, number, number],
  rotation: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const object = mesh(new THREE.TorusGeometry(radius, tube, 8, 48), material);
  object.position.set(...position);
  object.rotation.set(...rotation);
  parent.add(object);
  return object;
}

function addDecal(
  parent: THREE.Object3D,
  radius: number,
  angle: number,
  y: number,
  texture: THREE.Texture,
  width: number,
  height: number,
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.03,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const object = mesh(new THREE.PlaneGeometry(width, height), material, false, false);
  object.position.set(Math.sin(angle) * (radius + 0.055), y, Math.cos(angle) * (radius + 0.055));
  object.rotation.y = angle;
  object.renderOrder = 3;
  parent.add(object);
  return object;
}

function addLocalDecal(
  parent: THREE.Object3D,
  position: [number, number, number],
  rotation: [number, number, number],
  texture: THREE.Texture,
  width: number,
  height: number,
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.03,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const object = mesh(new THREE.PlaneGeometry(width, height), material, false, false);
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.renderOrder = 3;
  parent.add(object);
  return object;
}

/* ------------------------------------------------------------------ */
/*  Pressurized module                                                 */
/* ------------------------------------------------------------------ */

interface ModuleOptions {
  id: string;
  radius: number;
  length: number;
  axis: Axis;
  position: [number, number, number];
  bodyColor?: number;
  roughness?: number;
  label?: {
    title: string;
    subtitle: string;
    accent: string;
    angle?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  windows?: Array<{ angle: number; y: number; width?: number; height?: number }>;
  handrails?: boolean;
  goldBands?: boolean;
  endDetails?: boolean;
  ringCount?: number;
}

function createPressurizedModule(options: ModuleOptions, anisotropy: number): THREE.Group {
  const {
    radius,
    length,
    axis,
    position,
    bodyColor = 0xd8dde0,
    roughness = 0.5,
    label,
    windows = [],
    handrails = true,
    goldBands = true,
    endDetails = true,
    ringCount = Math.max(2, Math.round(length / 2.4)),
  } = options;

  const root = new THREE.Group();
  root.position.set(...position);
  if (axis === 'z') root.rotation.x = Math.PI / 2;
  if (axis === 'x') root.rotation.z = -Math.PI / 2;

  const surfaces = makeSurfaceSet(bodyColor, roughness);

  const core = mesh(
    new THREE.CylinderGeometry(radius * 0.965, radius * 0.965, length, 48, 1, false),
    surfaces.body,
    true,
  );
  root.add(core);

  // Longitudinal panel seams.
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const strip = mesh(new THREE.BoxGeometry(0.025, length * 0.97, 0.045), surfaces.trim);
    strip.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    strip.rotation.y = angle;
    root.add(strip);
  }

  // Structural rings.
  for (let i = 0; i <= ringCount; i += 1) {
    const y = -length / 2 + (length * i) / ringCount;
    addTorus(root, radius + 0.012, 0.034, [0, y, 0], [Math.PI / 2, 0, 0], surfaces.trim);
  }

  // Multilayer insulation collars near each end.
  if (goldBands) {
    for (const sign of [-1, 1]) {
      const band = mesh(
        new THREE.CylinderGeometry(radius + 0.018, radius + 0.018, 0.62, 48, 1, true),
        surfaces.gold,
      );
      band.position.y = sign * (length / 2 - 1.25);
      root.add(band);
      addTorus(
        root,
        radius + 0.022,
        0.045,
        [0, sign * (length / 2 - 0.94), 0],
        [Math.PI / 2, 0, 0],
        surfaces.dark,
      );
    }
  }

  // A pair of external cable trays.
  for (const angle of [Math.PI * 0.32, Math.PI * 1.27]) {
    const tray = mesh(new THREE.BoxGeometry(0.12, length * 0.66, 0.22), surfaces.dark);
    tray.position.set(Math.sin(angle) * (radius + 0.16), 0, Math.cos(angle) * (radius + 0.16));
    tray.rotation.y = angle;
    root.add(tray);
  }

  if (endDetails) {
    for (const sign of [-1, 1]) {
      const endBase = new THREE.Group();
      endBase.position.y = sign * (length / 2);
      root.add(endBase);

      const collar = mesh(new THREE.CylinderGeometry(radius * 0.93, radius * 0.98, 0.52, 40), surfaces.trim);
      collar.position.y = sign * 0.2;
      endBase.add(collar);

      const hatch = mesh(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, 0.1, 40), surfaces.dark);
      hatch.position.y = sign * 0.48;
      endBase.add(hatch);

      addTorus(
        endBase,
        radius * 0.7,
        0.07,
        [0, sign * 0.54, 0],
        [Math.PI / 2, 0, 0],
        surfaces.trim,
      );
      addTorus(
        endBase,
        radius * 0.35,
        0.035,
        [0, sign * 0.56, 0],
        [Math.PI / 2, 0, 0],
        surfaces.gold,
      );

      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4) * Math.PI * 2;
        const dog = mesh(new THREE.BoxGeometry(0.16, 0.13, 0.28), surfaces.gold);
        dog.position.set(
          Math.sin(angle) * radius * 0.82,
          sign * 0.55,
          Math.cos(angle) * radius * 0.82,
        );
        dog.rotation.y = angle;
        endBase.add(dog);
      }
    }
  }

  for (const spec of windows) {
    const width = spec.width ?? 0.82;
    const height = spec.height ?? 0.52;
    const windowGroup = new THREE.Group();
    windowGroup.position.set(
      Math.sin(spec.angle) * (radius + 0.03),
      spec.y,
      Math.cos(spec.angle) * (radius + 0.03),
    );
    windowGroup.rotation.y = spec.angle;
    root.add(windowGroup);

    const frame = mesh(new RoundedBoxGeometry(width + 0.18, height + 0.18, 0.12, 2, 0.035), surfaces.trim);
    frame.position.z = 0.02;
    windowGroup.add(frame);

    const glass = mesh(new RoundedBoxGeometry(width, height, 0.06, 2, 0.02), surfaces.glass, false, false);
    glass.position.z = 0.09;
    glass.renderOrder = 2;
    windowGroup.add(glass);

    const highlight = mesh(
      new THREE.BoxGeometry(width * 0.72, 0.025, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x9de7ff, transparent: true, opacity: 0.35, toneMapped: false }),
      false,
      false,
    );
    highlight.position.set(-width * 0.1, height * 0.28, 0.125);
    highlight.rotation.z = -0.18;
    windowGroup.add(highlight);
  }

  if (handrails) {
    for (const angle of [Math.PI * 0.68, Math.PI * 1.68]) {
      const railRadius = radius + 0.32;
      const start = new THREE.Vector3(Math.sin(angle) * railRadius, -length * 0.3, Math.cos(angle) * railRadius);
      const end = new THREE.Vector3(Math.sin(angle) * railRadius, length * 0.3, Math.cos(angle) * railRadius);
      addCylinderBetween(root, start, end, 0.035, surfaces.dark, 6);
      for (const y of [-length * 0.3, 0, length * 0.3]) {
        addCylinderBetween(
          root,
          new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius),
          new THREE.Vector3(Math.sin(angle) * railRadius, y, Math.cos(angle) * railRadius),
          0.025,
          surfaces.dark,
          6,
        );
      }
    }
  }

  if (label) {
    const texture = createDecalTexture(
      label.title,
      label.subtitle,
      label.accent,
      anisotropy,
    );
    const primaryAngle = label.angle ?? Math.PI / 2;
    const decalWidth = label.width ?? Math.min(2.9, length * 0.46);
    const decalHeight = label.height ?? 0.68;
    addDecal(
      root,
      radius,
      primaryAngle,
      label.y ?? length * 0.17,
      texture,
      decalWidth,
      decalHeight,
    );
    // A mirrored-side placard keeps the identity readable from either side.
    addDecal(
      root,
      radius,
      primaryAngle + Math.PI,
      label.y ?? length * 0.17,
      texture,
      decalWidth,
      decalHeight,
    );
  }

  // Small greebles: service boxes and handholds.
  for (let i = 0; i < 3; i += 1) {
    const angle = -0.5 + i * 0.48;
    const box = addRoundedBox(
      root,
      [0.46, 0.28, 0.18],
      0.03,
      i === 1 ? surfaces.gold : surfaces.trim,
      [Math.sin(angle) * (radius + 0.1), -length * 0.32 + i * 0.4, Math.cos(angle) * (radius + 0.1)],
      [0, angle, 0],
    );
    box.castShadow = false;
  }

  return root;
}

function addNodePorts(root: THREE.Group, radius: number, surfaces: SurfaceSet): void {
  for (const side of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      const x = side * (radius + 0.52);
      const cylinder = mesh(new THREE.CylinderGeometry(1.52, 1.42, 1.05, 32), surfaces.body);
      cylinder.rotation.z = Math.PI / 2;
      cylinder.position.set(x, zSide * 0.08, 0);
      root.add(cylinder);

      addTorus(
        root,
        1.48,
        0.08,
        [side * (radius + 0.03), zSide * 0.08, 0],
        [0, Math.PI / 2, 0],
        surfaces.trim,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Cupola                                                             */
/* ------------------------------------------------------------------ */

function createCupola(anisotropy: number): THREE.Group {
  const root = new THREE.Group();
  root.position.set(-6.9, -2.15, -3.1);

  const surfaces = makeSurfaceSet(0xd5dce0, 0.48);
  const frameMat = surfaces.body;
  const innerMat = surfaces.dark;

  const base = mesh(new THREE.CylinderGeometry(2.05, 1.95, 0.58, 48), frameMat, true);
  base.position.y = 0.0;
  root.add(base);
  addTorus(root, 1.98, 0.075, [0, -0.27, 0], [Math.PI / 2, 0, 0], surfaces.trim);
  addTorus(root, 1.72, 0.06, [0, 0.29, 0], [Math.PI / 2, 0, 0], surfaces.gold);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x79b6c8,
    metalness: 0.05,
    roughness: 0.03,
    transparent: true,
    opacity: 0.22,
    transmission: 0,
    emissive: 0x0e4258,
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const outerY = -0.24;
  const innerY = -1.68;
  const outerR = 1.84;
  const innerR = 0.9;
  const segments = 6;
  const gap = THREE.MathUtils.degToRad(4.2);

  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2 + gap;
    const a1 = ((i + 1) / segments) * Math.PI * 2 - gap;
    const positions = new Float32Array([
      Math.sin(a0) * outerR, outerY, Math.cos(a0) * outerR,
      Math.sin(a1) * outerR, outerY, Math.cos(a1) * outerR,
      Math.sin(a1) * innerR, innerY, Math.cos(a1) * innerR,
      Math.sin(a0) * innerR, innerY, Math.cos(a0) * innerR,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const pane = mesh(geometry, glassMaterial, false, false);
    pane.renderOrder = 4;
    root.add(pane);
  }

  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2 + gap;
    addCylinderBetween(
      root,
      new THREE.Vector3(Math.sin(angle) * outerR, outerY, Math.cos(angle) * outerR),
      new THREE.Vector3(Math.sin(angle) * innerR, innerY, Math.cos(angle) * innerR),
      0.062,
      frameMat,
      8,
    );
  }

  addTorus(root, outerR, 0.07, [0, outerY, 0], [Math.PI / 2, 0, 0], frameMat);
  addTorus(root, innerR, 0.062, [0, innerY, 0], [Math.PI / 2, 0, 0], frameMat);
  addTorus(root, 1.53, 0.045, [0, -0.82, 0], [Math.PI / 2, 0, 0], innerMat);

  const topWindow = mesh(new THREE.CircleGeometry(0.84, 48), glassMaterial, false, false);
  topWindow.rotation.x = -Math.PI / 2;
  topWindow.position.y = innerY - 0.025;
  topWindow.renderOrder = 4;
  root.add(topWindow);

  const topFrame = mesh(new THREE.CylinderGeometry(0.94, 0.94, 0.14, 48, 1, true), frameMat);
  topFrame.position.y = innerY - 0.05;
  root.add(topFrame);
  addTorus(root, 0.91, 0.07, [0, innerY - 0.13, 0], [Math.PI / 2, 0, 0], surfaces.trim);

  // Window shutters / protective rail around the base.
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    addCylinderBetween(
      root,
      new THREE.Vector3(Math.sin(angle) * 2.05, 0.16, Math.cos(angle) * 2.05),
      new THREE.Vector3(Math.sin(angle) * 2.38, -0.3, Math.cos(angle) * 2.38),
      0.035,
      surfaces.dark,
      6,
    );
  }

  const plaque = createDecalTexture('CUPOLA', 'ESA · EARTH OBSERVATION', '#78dfff', anisotropy);
  addLocalDecal(root, [0, 0.18, 2.07], [0, 0, 0], plaque, 1.9, 0.48);

  return root;
}

/* ------------------------------------------------------------------ */
/*  Integrated truss, radiators & antennas                             */
/* ------------------------------------------------------------------ */

function createTruss(anisotropy: number): THREE.Group {
  const root = new THREE.Group();
  root.position.set(0, TRUSS_Y, 0);

  const surfaces = makeSurfaceSet(0x9ba4ac, 0.44);
  const hazard = new THREE.MeshStandardMaterial({
    map: createHazardTexture(anisotropy),
    metalness: 0.55,
    roughness: 0.45,
    userData: { moduleSurface: true },
  });
  hazard.userData.baseEmissive = hazard.emissive.clone();
  hazard.userData.baseEmissiveIntensity = hazard.emissiveIntensity;

  const length = 104;
  const half = 4.5;
  const cross = 2.05;

  // Four continuous longerons.
  const beamPositions: Array<[number, number, number]> = [
    [0, cross, cross],
    [0, cross, -cross],
    [0, -cross, cross],
    [0, -cross, -cross],
  ];
  for (const [x, y, z] of beamPositions) {
    addBox(root, [length, 0.3, 0.3], surfaces.trim, [x, y, z], undefined, false);
  }

  // Four faces of lattice bracing.
  const bay = 6.5;
  const bays = Math.round(length / bay);
  for (let i = 0; i <= bays; i += 1) {
    const x = -length / 2 + (i * length) / bays;
    for (const y of [-cross, cross]) {
      for (const z of [-cross, cross]) {
        addBox(root, [0.23, cross * 2, 0.23], surfaces.trim, [x, y, z]);
      }
    }
    if (i < bays) {
      const x2 = -length / 2 + ((i + 1) * length) / bays;
      const faces: Array<[THREE.Vector3, THREE.Vector3]> = [
        [new THREE.Vector3(x, cross, -cross), new THREE.Vector3(x2, cross, cross)],
        [new THREE.Vector3(x, -cross, cross), new THREE.Vector3(x2, -cross, -cross)],
        [new THREE.Vector3(x, -cross, cross), new THREE.Vector3(x2, cross, cross)],
        [new THREE.Vector3(x, cross, -cross), new THREE.Vector3(x2, -cross, -cross)],
        [new THREE.Vector3(x, -cross, -cross), new THREE.Vector3(x2, cross, -cross)],
        [new THREE.Vector3(x, cross, cross), new THREE.Vector3(x2, -cross, cross)],
      ];
      for (const [start, end] of faces) {
        addCylinderBetween(root, start, end, 0.07, surfaces.dark, 6);
      }
    }
  }

  // Rail tracks for the mobile transporter.
  for (const z of [-2.35, 2.35]) {
    addBox(root, [length + 0.8, 0.1, 0.2], surfaces.dark, [0, cross + 0.32, z]);
  }

  // S0 center keel and gold foil wrap.
  addBox(root, [12.4, 4.3, 4.3], surfaces.body, [0, 0, 0], undefined, false);
  for (let i = -2; i <= 2; i += 1) {
    addBox(root, [1.3, 4.42, 4.42], i % 2 === 0 ? surfaces.gold : surfaces.dark, [i * 2.45, 0, 0]);
  }

  // Utility boxes and ORUs along the truss.
  const oruMaterial = new THREE.MeshStandardMaterial({
    color: 0xc2c5c0,
    metalness: 0.32,
    roughness: 0.58,
    userData: { moduleSurface: true },
  });
  oruMaterial.userData.baseEmissive = oruMaterial.emissive.clone();
  oruMaterial.userData.baseEmissiveIntensity = oruMaterial.emissiveIntensity;

  const oruPositions: Array<[number, number, number, number]> = [
    [-43, cross + 1, 0, 0.2],
    [-34, -cross - 0.8, 1.2, -0.1],
    [-22, cross + 0.9, -0.8, 0.12],
    [18, -cross - 0.9, 0.4, 0.18],
    [31, cross + 0.7, 0.6, -0.08],
    [43, cross + 0.6, 0, 0.15],
  ];
  for (const [x, y, z, angle] of oruPositions) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = angle;
    root.add(group);
    addRoundedBox(group, [2.6, 1.55, 1.8], 0.06, oruMaterial, [0, 0, 0]);
    addBox(group, [2.63, 0.26, 1.84], surfaces.gold, [0, 0.72, 0]);
    addBox(group, [2.2, 0.04, 1.2], hazard, [0, 0.15, 0.92]);
    for (let i = -1; i <= 1; i += 1) {
      addBox(group, [0.06, 1.2, 1.2], surfaces.dark, [i * 0.9, 0, 0.9]);
    }
  }

  // Payload pallets hanging from the nadir side.
  for (const x of [-36, 36]) {
    const pallet = new THREE.Group();
    pallet.position.set(x, -cross - 1.55, -0.2);
    root.add(pallet);
    addBox(pallet, [6.4, 0.32, 4.0], surfaces.body, [0, 0, 0]);
    addBox(pallet, [6.1, 0.08, 3.7], surfaces.gold, [0, 0.2, 0]);
    for (let i = 0; i < 4; i += 1) {
      addRoundedBox(
        pallet,
        [1.2, 0.85, 1.25],
        0.04,
        i % 2 === 0 ? oruMaterial : surfaces.gold,
        [-2.25 + i * 1.5, 0.58, 0],
      );
    }
  }

  // Heat-rejection radiators (white, ribbed panels on the aft side).
  const radiatorTex = createRadiatorTexture(anisotropy);
  const radiatorFace = new THREE.MeshStandardMaterial({
    map: radiatorTex,
    metalness: 0.2,
    roughness: 0.62,
    userData: { moduleSurface: true },
  });
  radiatorFace.userData.baseEmissive = radiatorFace.emissive.clone();
  radiatorFace.userData.baseEmissiveIntensity = radiatorFace.emissiveIntensity;
  const radiatorSide = surfaces.trim;
  const radiatorMats = [radiatorSide, radiatorSide, radiatorFace, radiatorFace, radiatorSide, radiatorSide];

  for (const x of [-10.4, 0, 10.4]) {
    const radiator = new THREE.Group();
    radiator.position.set(x, -0.2, -8.6);
    radiator.rotation.x = THREE.MathUtils.degToRad(4);
    root.add(radiator);
    const panel = mesh(new THREE.BoxGeometry(7.0, 0.16, 16.2), radiatorMats, true);
    radiator.add(panel);
    addBox(radiator, [7.15, 0.26, 0.28], surfaces.dark, [0, 0.14, -8.05]);
    addBox(radiator, [7.15, 0.26, 0.28], surfaces.dark, [0, 0.14, 8.05]);
    for (const hingeX of [-3.0, 3.0]) {
      addCylinderBetween(
        radiator,
        new THREE.Vector3(hingeX, 0, 7.9),
        new THREE.Vector3(hingeX, 1.5, 9.2),
        0.09,
        surfaces.dark,
        8,
      );
    }
    for (let i = -3; i <= 3; i += 1) {
      addBox(radiator, [0.05, 0.2, 15.6], surfaces.trim, [i * 0.96, 0.13, 0]);
    }
  }

  // Communication dishes and antenna farms.
  for (const [x, y, z, scale] of [
    [-11, 2.8, 2.7, 1],
    [14, -2.6, 2.4, 0.75],
  ] as Array<[number, number, number, number]>) {
    const dishGroup = new THREE.Group();
    dishGroup.position.set(x, y, z);
    dishGroup.rotation.z = -0.2;
    root.add(dishGroup);
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const r = (i / 12) * 1.15;
      points.push(new THREE.Vector2(r, r * r * 0.26));
    }
    const dish = mesh(new THREE.LatheGeometry(points, 28), surfaces.body);
    dish.rotation.x = Math.PI / 2;
    dish.scale.setScalar(scale);
    dishGroup.add(dish);
    addCylinderBetween(
      dishGroup,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1.2),
      0.035,
      surfaces.dark,
      6,
    );
    addBox(dishGroup, [0.48, 0.36, 0.32], surfaces.gold, [0, 0, 0.9]);
  }

  // Small helical / whip antennas at the truss tips.
  for (const x of [-52, 52]) {
    addCylinderBetween(
      root,
      new THREE.Vector3(x, 2.05, 0),
      new THREE.Vector3(x * 1.006, 4.9, 0.6),
      0.035,
      surfaces.dark,
      6,
    );
    addRoundedBox(root, [0.55, 0.4, 0.55], 0.045, surfaces.gold, [x, 2.1, 0]);
  }

  // S0 identification plate facing the initial camera.
  const trussLabel = createDecalTexture('S0 TRUSS', 'INTEGRATED TRUSS · NASA', '#9fe8ff', anisotropy);
  addLocalDecal(root, [0, 0.1, 2.23], [0, 0, 0], trussLabel, 5.2, 1.3);

  const hazardPanel = mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({
    map: createHazardTexture(anisotropy),
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  }), false, false);
  hazardPanel.position.set(-6.8, 0.2, 2.23);
  root.add(hazardPanel);

  return root;
}

/* ------------------------------------------------------------------ */
/*  Solar array wings                                                  */
/* ------------------------------------------------------------------ */

interface SolarWing {
  pivot: THREE.Group;
  baseYaw: number;
  phase: number;
}

function createSolarArrays(anisotropy: number): { root: THREE.Group; wings: SolarWing[] } {
  const root = new THREE.Group();
  const surfaces = makeSurfaceSet(0xaeb5b9, 0.42);
  const solarTexture = createSolarTexture(anisotropy);
  const solarMat = new THREE.MeshStandardMaterial({
    map: solarTexture,
    color: 0xffffff,
    metalness: 0.34,
    roughness: 0.32,
    emissive: 0x06172b,
    emissiveIntensity: 0.28,
    userData: { moduleSurface: true },
  });
  solarMat.userData.baseEmissive = solarMat.emissive.clone();
  solarMat.userData.baseEmissiveIntensity = solarMat.emissiveIntensity;

  const backMat = new THREE.MeshStandardMaterial({
    color: 0x8f9ba3,
    metalness: 0.45,
    roughness: 0.6,
    userData: { moduleSurface: true },
  });
  backMat.userData.baseEmissive = backMat.emissive.clone();
  backMat.userData.baseEmissiveIntensity = backMat.emissiveIntensity;
  const edgeMat = surfaces.trim;
  const blanketMats = [solarMat, backMat, edgeMat, edgeMat, edgeMat, edgeMat];

  const wings: SolarWing[] = [];
  const mastLength = 31.5;
  const panelWidth = 4.85;
  const columnOffset = 2.72;
  const segments = 3;
  const segmentGap = 0.36;
  const segmentLength = (mastLength - 2.0 - segmentGap * (segments - 1)) / segments;
  const baseYaw = -0.28;

  for (const [pairIndex, x] of [-45, -29, 29, 45].entries()) {
    const pair = new THREE.Group();
    pair.position.set(x, TRUSS_Y, 0);
    root.add(pair);

    // Beta gimbal / rotary joint housing.
    const housing = mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 24), surfaces.trim);
    housing.rotation.z = Math.PI / 2;
    housing.position.set(0, 0, 0);
    pair.add(housing);
    addTorus(pair, 0.93, 0.08, [0, 0, 0], [0, Math.PI / 2, 0], surfaces.gold);
    addBox(pair, [1.4, 1.7, 1.7], surfaces.dark, [-1.25, 0, 0]);

    for (const direction of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, 0);
      pivot.rotation.y = baseYaw + direction * 0.005;
      pair.add(pivot);

      // Mast and tip cap.
      addCylinderBetween(
        pivot,
        new THREE.Vector3(0, direction * 0.55, 0),
        new THREE.Vector3(0, direction * (mastLength + 0.6), 0),
        0.2,
        surfaces.trim,
        10,
        true,
      );
      addCylinderBetween(
        pivot,
        new THREE.Vector3(0, direction * 0.85, 0),
        new THREE.Vector3(0, direction * 1.45, 0),
        0.45,
        surfaces.gold,
        12,
      );
      addRoundedBox(
        pivot,
        [0.7, 0.9, 0.7],
        0.06,
        surfaces.gold,
        [0, direction * (mastLength + 1.0), 0],
      );

      for (const column of [-1, 1]) {
        const z = column * columnOffset;
        for (let segment = 0; segment < segments; segment += 1) {
          const yCenter =
            direction *
            (1.15 + segmentLength / 2 + segment * (segmentLength + segmentGap));
          const blanket = mesh(
            new THREE.BoxGeometry(0.1, segmentLength, panelWidth),
            blanketMats,
            true,
          );
          blanket.position.set(0, yCenter, z);
          pivot.add(blanket);
        }
      }

      // Side spars, cross ribs and tension cables.
      for (const z of [-5.35, 5.35]) {
        addBox(
          pivot,
          [0.22, mastLength + 1.4, 0.22],
          surfaces.trim,
          [0, direction * (mastLength / 2 + 0.7), z],
          undefined,
          true,
        );
        addCylinderBetween(
          pivot,
          new THREE.Vector3(-0.26, direction * 0.7, z),
          new THREE.Vector3(-0.26, direction * (mastLength + 1.25), z),
          0.017,
          surfaces.dark,
          4,
        );
        addCylinderBetween(
          pivot,
          new THREE.Vector3(0.26, direction * 0.7, z),
          new THREE.Vector3(0.26, direction * (mastLength + 1.25), z),
          0.017,
          surfaces.dark,
          4,
        );
      }

      for (let i = 0; i <= segments; i += 1) {
        const y =
          direction *
          (1.15 + i * (segmentLength + segmentGap) - (i === 0 ? 0.15 : 0.18));
        addBox(pivot, [0.28, 0.15, 10.8], surfaces.trim, [0, y, 0]);
      }

      addBox(
        pivot,
        [0.26, 0.26, 10.7],
        surfaces.trim,
        [0, direction * (mastLength + 0.75), 0],
        undefined,
        true,
      );
      addCylinderBetween(
        pivot,
        new THREE.Vector3(0, direction * 0.8, 0),
        new THREE.Vector3(0, direction * (mastLength + 0.6), 0),
        0.075,
        surfaces.gold,
        8,
      );

      // Rounded root fairing.
      addRoundedBox(
        pivot,
        [1.1, 1.4, 1.55],
        0.16,
        surfaces.body,
        [0, direction * 0.42, 0],
      );

      wings.push({
        pivot,
        baseYaw: pivot.rotation.y,
        phase: pairIndex * 1.7 + (direction > 0 ? 0.4 : 2.25),
      });
    }
  }

  return { root, wings };
}

/* ------------------------------------------------------------------ */
/*  Canadarm2                                                          */
/* ------------------------------------------------------------------ */

function createCanadarm(anisotropy: number): { root: THREE.Group; sway: THREE.Group } {
  const root = new THREE.Group();
  root.position.set(20, TRUSS_Y + 2.4, -0.2);

  const surfaces = makeSurfaceSet(0xe0e3e2, 0.42);
  const arm = new THREE.Group();
  root.add(arm);

  // Mobile Base System cradle.
  addRoundedBox(root, [3.2, 0.7, 3.1], 0.12, surfaces.body, [0, -1.4, 0]);
  addBox(root, [3.35, 0.16, 3.2], surfaces.gold, [0, -1.0, 0]);
  addCylinderBetween(
    root,
    new THREE.Vector3(0, -1.85, 0),
    new THREE.Vector3(0, 0, 0),
    0.34,
    surfaces.dark,
    12,
  );

  const points = [
    new THREE.Vector3(0, 0.35, 0),
    new THREE.Vector3(2.8, 5.7, 5.8),
    new THREE.Vector3(-1.7, 9.3, 12.2),
    new THREE.Vector3(-8.4, 7.2, 15.8),
  ];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const radius = i === 0 ? 0.36 : 0.3;
    addCylinderBetween(arm, start, end, radius, surfaces.body, 18, true);

    // Gold joint collars at both ends.
    const direction = end.clone().sub(start).normalize();
    const collarStart = start.clone().addScaledVector(direction, 0.42);
    const collarEnd = start.clone().addScaledVector(direction, 0.95);
    addCylinderBetween(arm, collarStart, collarEnd, radius + 0.08, surfaces.gold, 18, true);

    const joint = mesh(new THREE.SphereGeometry(radius + 0.17, 20, 16), surfaces.trim, true);
    joint.position.copy(start);
    arm.add(joint);
    addTorus(arm, radius + 0.18, 0.055, [start.x, start.y, start.z], [0, 0, Math.PI / 2], surfaces.dark);
  }

  const end = points[points.length - 1];
  const joint = mesh(new THREE.SphereGeometry(0.45, 20, 16), surfaces.trim, true);
  joint.position.copy(end);
  arm.add(joint);

  const wristDirection = end.clone().sub(points[points.length - 2]).normalize();
  const wristEnd = end.clone().addScaledVector(wristDirection, 1.8);
  addCylinderBetween(arm, end, wristEnd, 0.24, surfaces.gold, 16, true);

  const endEffector = new THREE.Group();
  endEffector.position.copy(wristEnd);
  endEffector.quaternion.setFromUnitVectors(UP, wristDirection);
  arm.add(endEffector);
  addRoundedBox(endEffector, [1.0, 1.1, 1.0], 0.12, surfaces.dark, [0, 0.45, 0]);
  addTorus(endEffector, 0.53, 0.08, [0, 1.0, 0], [Math.PI / 2, 0, 0], surfaces.trim);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    addCylinderBetween(
      endEffector,
      new THREE.Vector3(Math.sin(angle) * 0.45, 0.95, Math.cos(angle) * 0.45),
      new THREE.Vector3(Math.sin(angle) * 0.62, 1.55, Math.cos(angle) * 0.62),
      0.075,
      surfaces.gold,
      8,
    );
  }

  // Cable run.
  const cableCurve = new THREE.CatmullRomCurve3(
    points.map((p, index) => p.clone().add(new THREE.Vector3(index === 0 ? 0.45 : 0.35, 0, 0.3))),
  );
  const cable = mesh(new THREE.TubeGeometry(cableCurve, 50, 0.04, 6, false), surfaces.dark);
  arm.add(cable);

  const label = createDecalTexture('CANADARM2', 'CSA · MDA ROBOTICS', '#f1c565', anisotropy);
  addLocalDecal(arm, [1.25, 3.4, 3.2], [0, 0.45, 0], label, 2.7, 0.68);

  return { root, sway: arm };
}

/* ------------------------------------------------------------------ */
/*  Visiting vehicles                                                  */
/* ------------------------------------------------------------------ */

function createCrewDragon(anisotropy: number): THREE.Group {
  const root = new THREE.Group();
  const surfaces = makeSurfaceSet(0xe6e9e8, 0.46);

  const capsule = mesh(new THREE.CylinderGeometry(0.62, 1.86, 2.65, 40), surfaces.body, true);
  capsule.rotation.x = -Math.PI / 2;
  capsule.position.set(0, 0, 16.9);
  root.add(capsule);

  addTorus(root, 1.78, 0.09, [0, 0, 18.0], [0, 0, 0], surfaces.trim);
  addTorus(root, 0.66, 0.08, [0, 0, 15.58], [0, 0, 0], surfaces.trim);

  const trunk = mesh(new THREE.CylinderGeometry(1.78, 1.78, 3.1, 40), surfaces.body, true);
  trunk.rotation.x = Math.PI / 2;
  trunk.position.set(0, 0, 19.95);
  root.add(trunk);

  const solarBand = mesh(
    new THREE.CylinderGeometry(1.81, 1.81, 2.2, 40, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x0b223f,
      metalness: 0.5,
      roughness: 0.32,
      emissive: 0x071629,
      emissiveIntensity: 0.2,
    }),
     true,
  );
  solarBand.rotation.x = Math.PI / 2;
  solarBand.position.set(0, 0, 19.95);
  root.add(solarBand);

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    addBox(
      root,
      [0.08, 0.45, 3.4],
      surfaces.trim,
      [Math.sin(angle) * 1.74, Math.cos(angle) * 1.74, 19.95],
      [0, 0, angle],
    );
  }

  addRoundedBox(root, [0.7, 0.25, 0.7], 0.04, surfaces.dark, [0, 1.9, 19.8]);
  addRoundedBox(root, [0.7, 0.25, 0.7], 0.04, surfaces.dark, [0, -1.9, 19.8]);

  const label = createDecalTexture('CREW DRAGON', 'SPACEX · NASA', '#a6e6ff', anisotropy);
  addLocalDecal(root, [1.55, 0.55, 17.5], [0, Math.PI / 2, 0], label, 2.2, 0.55);

  return root;
}

function createSoyuz(anisotropy: number): THREE.Group {
  const root = new THREE.Group();
  const surfaces = makeSurfaceSet(0xb7c0b8, 0.56);
  const solarMat = new THREE.MeshStandardMaterial({
    map: createSolarTexture(anisotropy),
    color: 0xc9dfff,
    metalness: 0.32,
    roughness: 0.34,
    emissive: 0x061b33,
    emissiveIntensity: 0.24,
    userData: { moduleSurface: true },
  });
  solarMat.userData.baseEmissive = solarMat.emissive.clone();
  solarMat.userData.baseEmissiveIntensity = solarMat.emissiveIntensity;

  const orbital = mesh(new THREE.SphereGeometry(1.35, 28, 20), surfaces.body, true);
  orbital.scale.set(1.0, 1.0, 1.12);
  orbital.position.z = -32.7;
  root.add(orbital);

  const descent = mesh(new THREE.CylinderGeometry(1.28, 0.82, 2.0, 32), surfaces.gold, true);
  descent.rotation.x = Math.PI / 2;
  descent.position.z = -34.6;
  root.add(descent);

  const service = mesh(new THREE.CylinderGeometry(1.35, 1.35, 2.8, 32), surfaces.body, true);
  service.rotation.x = Math.PI / 2;
  service.position.z = -37.0;
  root.add(service);

  addTorus(root, 1.25, 0.06, [0, 0, -33.7], [0, 0, 0], surfaces.trim);
  addTorus(root, 1.28, 0.06, [0, 0, -35.5], [0, 0, 0], surfaces.trim);
  addTorus(root, 0.9, 0.07, [0, 0, -31.55], [0, 0, 0], surfaces.trim);

  for (const side of [-1, 1]) {
    const panel = new THREE.Group();
    panel.position.set(side * 1.45, 0, -37.0);
    panel.rotation.y = side * 0.04;
    root.add(panel);
    addCylinderBetween(panel, new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 3.7, 0, 0), 0.07, surfaces.trim, 6);
    const blanket = mesh(new THREE.BoxGeometry(4.8, 0.08, 2.1), [
      surfaces.trim,
      surfaces.trim,
      solarMat,
      solarMat,
      surfaces.trim,
      surfaces.trim,
    ], true);
    blanket.position.x = side * 4.6;
    panel.add(blanket);
  }

  const label = createDecalTexture('SOYUZ MS', 'ROSCOSMOS · ENERGIA', '#f49d72', anisotropy);
  addLocalDecal(root, [1.37, 0.18, -32.7], [0, Math.PI / 2, 0], label, 1.8, 0.45);

  return root;
}

/* ------------------------------------------------------------------ */
/*  Assemble the station                                               */
/* ------------------------------------------------------------------ */

export function createStation(anisotropy: number, mobile = false): StationBuild {
  const root = new THREE.Group();
  root.name = 'International Space Station';
  const modules = new Map<string, ModuleBinding>();

  const register = (id: string, group: THREE.Group) => {
    group.userData.moduleId = id;
    const mats = new Set<THREE.MeshStandardMaterial>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.receiveShadow = true;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (material instanceof THREE.MeshStandardMaterial && material.userData.moduleSurface) {
          mats.add(material);
        }
      }
    });
    modules.set(id, {
      id,
      group,
      materials: [...mats],
      baseEmissive: [...mats].map((material) => ({
        material,
        color: material.emissive.clone(),
        intensity: material.emissiveIntensity,
      })),
    });
    root.add(group);
  };

  // Main pressurized spine.
  const destiny = createPressurizedModule(
    {
      id: 'destiny',
      radius: 2.15,
      length: 8.6,
      axis: 'z',
      position: [0, 0.1, 3.8],
      bodyColor: 0xd9dde0,
      roughness: 0.48,
      label: { title: 'DESTINY', subtitle: 'US LABORATORY · NASA', accent: '#6ee5ff' },
      windows: [
        { angle: 0, y: 1.6, width: 1.1, height: 0.66 },
        { angle: 0.4, y: -1.4, width: 0.8, height: 0.5 },
      ],
    },
    anisotropy,
  );
  register('destiny', destiny);

  const harmony = createPressurizedModule(
    {
      id: 'harmony',
      radius: 2.2,
      length: 7.0,
      axis: 'z',
      position: [0, 0.1, 11.7],
      bodyColor: 0xdadfe1,
      label: { title: 'HARMONY', subtitle: 'NODE 2 · NASA', accent: '#72dfff', angle: Math.PI * 0.52 },
      windows: [{ angle: 0.1, y: 1.1, width: 0.8, height: 0.5 }],
    },
    anisotropy,
  );
  addNodePorts(harmony, 2.2, makeSurfaceSet(0xdadfe1, 0.48));
  register('harmony', harmony);

  const unity = createPressurizedModule(
    {
      id: 'unity',
      radius: 2.18,
      length: 5.4,
      axis: 'z',
      position: [0, 0.1, -3.1],
      bodyColor: 0xdadfe1,
      label: { title: 'UNITY', subtitle: 'NODE 1 · NASA', accent: '#72dfff', y: 0.9 },
      windows: [{ angle: 0.1, y: 0.9, width: 0.72, height: 0.46 }],
    },
    anisotropy,
  );
  addNodePorts(unity, 2.18, makeSurfaceSet(0xdadfe1, 0.48));
  register('unity', unity);

  const zarya = createPressurizedModule(
    {
      id: 'zarya',
      radius: 2.05,
      length: 12.8,
      axis: 'z',
      position: [0, 0.1, -12.4],
      bodyColor: 0xc0c7bd,
      roughness: 0.6,
      label: { title: 'ЗАРЯ', subtitle: 'ZARYA · ROSCOSMOS', accent: '#f39b79', angle: Math.PI * 0.54, y: 2.2 },
      windows: [{ angle: 0.05, y: 2.0, width: 0.62, height: 0.42 }],
    },
    anisotropy,
  );
  register('zarya', zarya);

  const zvezda = createPressurizedModule(
    {
      id: 'zvezda',
      radius: 2.08,
      length: 13.2,
      axis: 'z',
      position: [0, 0.1, -23.6],
      bodyColor: 0xbfc7bc,
      roughness: 0.58,
      label: { title: 'ЗВЕЗДА', subtitle: 'ZVEZDA · ROSCOSMOS', accent: '#f39b79', angle: Math.PI * 0.5, y: 2.8 },
      windows: [
        { angle: 0.08, y: 2.0, width: 0.52, height: 0.44 },
        { angle: 0.08, y: -1.4, width: 0.52, height: 0.44 },
        { angle: 0.75, y: 0.3, width: 0.44, height: 0.4 },
      ],
      ringCount: 6,
    },
    anisotropy,
  );
  register('zvezda', zvezda);

  const tranquility = createPressurizedModule(
    {
      id: 'tranquility',
      radius: 2.2,
      length: 6.6,
      axis: 'x',
      position: [-6.9, 0.1, -3.1],
      bodyColor: 0xd8dddf,
      label: { title: 'TRANQUILITY', subtitle: 'NODE 3 · NASA / ESA', accent: '#72dfff', y: 0.55 },
      windows: [{ angle: Math.PI * 0.5, y: 0.8, width: 0.65, height: 0.44 }],
    },
    anisotropy,
  );
  register('tranquility', tranquility);

  const cupola = createCupola(anisotropy);
  register('cupola', cupola);

  const questModule = createPressurizedModule(
    {
      id: 'quest',
      radius: 2.1,
      length: 5.6,
      axis: 'x',
      position: [6.0, 0.1, -3.1],
      bodyColor: 0xd8dcde,
      label: { title: 'QUEST', subtitle: 'EVA AIRLOCK · NASA', accent: '#d9e6ec', y: 0.5 },
      windows: [{ angle: Math.PI * 0.5, y: 0.8, width: 0.55, height: 0.4 }],
    },
    anisotropy,
  );
  const quest = new THREE.Group();
  quest.add(questModule);
  // High-pressure tanks beside the airlock.
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0xcbd1d1,
    metalness: 0.35,
    roughness: 0.52,
  });
  for (const z of [-1.35, 1.35]) {
    const tank = mesh(new THREE.CapsuleGeometry(0.72, 1.9, 8, 20), tankMat);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(6.9, -1.85, -3.1 + z);
    quest.add(tank);
    addTorus(quest, 0.73, 0.06, [6.9, -1.85, -3.1 + z - 0.94], [0, 0, 0], tankMat);
  }
  register('quest', quest);

  const columbusModule = createPressurizedModule(
    {
      id: 'columbus',
      radius: 2.2,
      length: 7.0,
      axis: 'x',
      position: [-7.2, 0.1, 11.7],
      bodyColor: 0xdde1e1,
      label: { title: 'COLUMBUS', subtitle: 'ESA LABORATORY', accent: '#5bb8ff', y: 0.55 },
      windows: [{ angle: Math.PI * 0.5, y: 0.7, width: 0.62, height: 0.44 }],
    },
    anisotropy,
  );
  const columbus = new THREE.Group();
  columbus.add(columbusModule);
  const columbusPlatform = new THREE.Group();
  columbusPlatform.position.set(-7.2, 2.65, 11.7);
  columbus.add(columbusPlatform);
  addBox(columbusPlatform, [4.1, 0.28, 3.2], tankMat, [0, 0, 0]);
  addBox(columbusPlatform, [3.9, 0.06, 3.0], new THREE.MeshStandardMaterial({
    color: 0x9c8b5d,
    metalness: 0.8,
    roughness: 0.4,
  }), [0, 0.18, 0]);
  for (let i = 0; i < 3; i += 1) {
    addRoundedBox(
      columbusPlatform,
      [1.0, 0.65, 0.9],
      0.04,
      i === 1 ? tankMat : new THREE.MeshStandardMaterial({ color: 0xc3914a, metalness: 0.75, roughness: 0.38 }),
      [-1.3 + i * 1.3, 0.6, 0.25],
    );
  }
  register('columbus', columbus);

  const kiboModule = createPressurizedModule(
    {
      id: 'kibo',
      radius: 2.2,
      length: 11.2,
      axis: 'x',
      position: [8.2, 0.1, 11.7],
      bodyColor: 0xe0e3e1,
      label: { title: 'きぼう', subtitle: 'KIBO · JAXA', accent: '#f0c36b', y: 0.8 },
      windows: [
        { angle: Math.PI * 0.5, y: 0.7, width: 0.7, height: 0.46 },
        { angle: Math.PI * 0.5, y: -1.6, width: 0.6, height: 0.4 },
      ],
    },
    anisotropy,
  );
  const kibo = new THREE.Group();
  kibo.add(kiboModule);

  const exposedFacility = new THREE.Group();
  exposedFacility.position.set(16.2, 0.5, 12.0);
  kibo.add(exposedFacility);
  addBox(exposedFacility, [6.4, 0.32, 4.3], tankMat, [0, 0, 0]);
  addBox(exposedFacility, [6.2, 0.05, 4.0], new THREE.MeshStandardMaterial({
    color: 0xb4a274,
    metalness: 0.75,
    roughness: 0.4,
  }), [0, 0.2, 0]);
  const payloadPalette = new THREE.MeshStandardMaterial({ color: 0xd0d3cd, metalness: 0.35, roughness: 0.55 });
  for (let i = 0; i < 4; i += 1) {
    addRoundedBox(
      exposedFacility,
      [1.12, 0.82, 1.15],
      0.04,
      i % 2 === 0 ? payloadPalette : new THREE.MeshStandardMaterial({ color: 0xb78843, metalness: 0.78, roughness: 0.38 }),
      [-2.2 + i * 1.45, 0.62, 0.15],
    );
  }
  addCylinderBetween(
    exposedFacility,
    new THREE.Vector3(2.7, 0.2, -1.7),
    new THREE.Vector3(2.8, 2.8, -1.9),
    0.08,
    tankMat,
    8,
  );
  addRoundedBox(exposedFacility, [0.5, 0.34, 0.4], 0.03, tankMat, [2.8, 2.95, -1.9]);
  register('kibo', kibo);

  // Central pressurised mating adapters and close-out panels.
  const adapterMat = tankMat;
  for (const z of [-6.15, 7.85, 15.15]) {
    const adapter = mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.8, 32), adapterMat);
    adapter.rotation.x = Math.PI / 2;
    adapter.position.set(0, 0.1, z);
    root.add(adapter);
    addTorus(root, 1.38, 0.06, [0, 0.1, z + 0.36], [0, 0, 0], adapterMat);
  }

  const truss = createTruss(anisotropy);
  register('truss', truss);

  const solar = createSolarArrays(anisotropy);
  register('solar-array', solar.root);

  const arm = createCanadarm(anisotropy);
  register('canadarm', arm.root);

  const dragon = createCrewDragon(anisotropy);
  register('dragon', dragon);

  const soyuz = createSoyuz(anisotropy);
  register('soyuz', soyuz);

  // A small forest of external stowage and avionics boxes adds scale.
  const stowageMat = new THREE.MeshStandardMaterial({
    color: 0xcfd1ca,
    metalness: 0.32,
    roughness: 0.55,
  });
  for (let i = 0; i < 6; i += 1) {
    addRoundedBox(
      root,
      [1.1, 0.75, 1.4],
      0.04,
      stowageMat,
      [i % 2 === 0 ? 5.4 : -5.4, -2.15, -3.1 + (i - 2.5) * 1.25],
    );
  }

  if (mobile) {
    // Merge only static siblings with the same material. The module groups,
    // solar pivots, arm joints and their picking/animation boundaries survive.
    const batch = (parent: THREE.Object3D) => {
      for (const child of [...parent.children]) if (!(child instanceof THREE.Mesh)) batch(child);
      const buckets = new Map<string, THREE.Mesh[]>();
      for (const child of parent.children) {
        if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.children.length || child.userData.noPick) continue;
        const layout = Object.keys(child.geometry.attributes).sort().map(name => {
          const attr = child.geometry.getAttribute(name) as THREE.BufferAttribute;
          return `${name}/${attr.itemSize}/${attr.normalized}/${attr.array.constructor.name}`;
        }).join(',');
        const key = `${child.material.uuid}:${child.castShadow}:${child.receiveShadow}:${layout}`;
        const list = buckets.get(key) || []; list.push(child); buckets.set(key, list);
      }
      for (const list of buckets.values()) {
        if (list.length < 2) continue;
        const parts = list.map(object => {
          object.updateMatrix();
          const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
          return geometry.applyMatrix4(object.matrix);
        });
        const geometry = mergeGeometries(parts, false);
        parts.forEach(part => part.dispose());
        if (!geometry) continue;
        const combined = new THREE.Mesh(geometry, list[0].material);
        combined.castShadow = list[0].castShadow;
        combined.receiveShadow = list[0].receiveShadow;
        list.forEach(object => parent.remove(object));
        parent.add(combined);
      }
    };
    batch(root);
  }

  const update = (elapsed: number) => {
    for (const wing of solar.wings) {
      const slow = Math.sin(elapsed * 0.045 + wing.phase) * 0.012;
      wing.pivot.rotation.y = wing.baseYaw + slow;
      wing.pivot.rotation.z = Math.sin(elapsed * 0.37 + wing.phase) * 0.0046;
      wing.pivot.rotation.x = Math.sin(elapsed * 0.29 + wing.phase * 1.7) * 0.0032;
    }
    arm.sway.rotation.z = Math.sin(elapsed * 0.21 + 0.4) * 0.007;
    arm.sway.rotation.x = Math.sin(elapsed * 0.17 + 1.1) * 0.004;
  };

  return { root, modules, update };
}
