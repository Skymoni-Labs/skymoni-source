import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import { createEarth } from './Earth';
import { createStation } from './station';
import { createEarthTextures, createStarTexture, mulberry32 } from './textures';
import { ISS_MODULES, NAV_ITEMS, OVERVIEW_ID, OVERVIEW_STATS } from './data';
import type { ModuleView } from './data';

/* ------------------------------------------------------------------ */
/*  DOM                                                               */
/* ------------------------------------------------------------------ */

const must = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

const app = must<HTMLDivElement>('#app');
const canvas = must<HTMLCanvasElement>('#scene');
const loader = must<HTMLDivElement>('#loader');
const loaderBar = must<HTMLSpanElement>('#loaderBar');
const loaderStatus = must<HTMLSpanElement>('#loaderStatus');
const loaderPercent = must<HTMLSpanElement>('#loaderPercent');
const errorPanel = must<HTMLDivElement>('#errorPanel');
const errorMessage = must<HTMLParagraphElement>('#errorMessage');

const navItemsElement = must<HTMLDivElement>('#navItems');
const infoCard = must<HTMLElement>('#infoCard');
const moduleCategory = must<HTMLSpanElement>('#moduleCategory');
const moduleCode = must<HTMLSpanElement>('#moduleCode');
const moduleName = must<HTMLHeadingElement>('#moduleName');
const moduleEnglish = must<HTMLParagraphElement>('#moduleEnglish');
const moduleDescription = must<HTMLParagraphElement>('#moduleDescription');
const moduleFunc = must<HTMLElement>('#moduleFunc');
const moduleBuilt = must<HTMLElement>('#moduleBuilt');
const moduleAgency = must<HTMLElement>('#moduleAgency');
const tooltip = must<HTMLDivElement>('#tooltip');
const tooltipKicker = must<HTMLSpanElement>('#tooltipKicker');
const tooltipName = must<HTMLElement>('#tooltipName');
const tooltipEnglish = must<HTMLSpanElement>('#tooltipEnglish');
const autoRotateButton = must<HTMLButtonElement>('#autoRotateButton');
const resetButton = must<HTMLButtonElement>('#resetButton');
const fullscreenButton = must<HTMLButtonElement>('#fullscreenButton');
const fullscreenLabel = must<HTMLElement>('#fullscreenLabel');
const utcClock = must<HTMLSpanElement>('#utcClock');

const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
const isSmallViewport = () => window.innerWidth <= 900;
const mobileQuality = isCoarsePointer || isSmallViewport();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const embedded = window.parent !== window;
app.classList.toggle('is-embedded', embedded);
let hostPaused = false;
// Render independently until the host supplies visibility. A missed message
// must not leave an embedded viewer permanently black.
let frameVisible = true;
let sceneReady = false;
let contextLost = false;
let frameRequest = 0;
const exitInteraction = must<HTMLButtonElement>('#exitInteraction');
const ambientMotion = () => !hostPaused && !reducedMotion.matches;

/* ------------------------------------------------------------------ */
/*  Rendering setup                                                   */
/* ------------------------------------------------------------------ */

function createRenderer(): THREE.WebGLRenderer {
  try { return new THREE.WebGLRenderer({
  canvas,
  antialias: !mobileQuality,
  powerPreference: mobileQuality ? 'low-power' : 'high-performance',
  logarithmicDepthBuffer: true,
  alpha: false,
  }); } catch {
    showError('当前浏览器无法建立 WebGL 2 视图。请使用支持 WebGL 2 的浏览器。');
    throw new Error('WebGL 2 unavailable');
  }
}
const renderer = createRenderer();
renderer.debug.onShaderError = () => { throw new Error('当前设备无法编译三维着色器，已改为结构预览。'); };
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isCoarsePointer || isSmallViewport() ? 1.25 : 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = !mobileQuality;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.setClearColor(0x010409, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  39,
  window.innerWidth / window.innerHeight,
  0.1,
  80_000_000,
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.rotateSpeed = 0.56;
controls.zoomSpeed = 0.84;
controls.panSpeed = 0.62;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.minDistance = 5.5;
controls.maxDistance = 620;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI * 0.945;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};
controls.autoRotate = false;
controls.autoRotateSpeed = 0.18;
controls.enableZoom = !embedded;
function engage(): void {
  if (!embedded) return;
  controls.enableZoom = true;
  app.classList.add('is-interacting');
  exitInteraction.hidden = false;
}
function disengage(): void {
  if (!embedded) return;
  controls.enableZoom = false;
  app.classList.remove('is-interacting');
  exitInteraction.hidden = true;
}
exitInteraction.addEventListener('click', disengage);

/* ------------------------------------------------------------------ */
/*  Lighting                                                          */
/* ------------------------------------------------------------------ */

const hemisphere = new THREE.HemisphereLight(0x9ec9e8, 0x04070a, mobileQuality ? 1.15 : 0.78);
scene.add(hemisphere);

const sun = new THREE.DirectionalLight(0xfff5e8, 3.7);
sun.position.set(-118, 162, 104);
sun.castShadow = !mobileQuality;
sun.shadow.mapSize.set(isCoarsePointer ? 1024 : 2048, isCoarsePointer ? 1024 : 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 420;
sun.shadow.camera.left = -88;
sun.shadow.camera.right = 88;
sun.shadow.camera.top = 88;
sun.shadow.camera.bottom = -88;
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.03;
sun.target.position.set(0, 2, 0);
scene.add(sun);
scene.add(sun.target);

const earthshine = new THREE.DirectionalLight(0x4f86b6, 0.58);
earthshine.position.set(90, -35, -70);
scene.add(earthshine);

const rim = new THREE.DirectionalLight(0xa9d8ff, 0.72);
rim.position.set(80, 30, -100);
scene.add(rim);

const sunDirection = sun.position.clone().normalize();

/* ------------------------------------------------------------------ */
/*  Stars & space background                                          */
/* ------------------------------------------------------------------ */

function createStarLayer(
  count: number,
  radius: number,
  size: number,
  opacity: number,
  seed: number,
  bright = false,
): THREE.Points {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const z = rng() * 2 - 1;
    const theta = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const distance = radius * (0.82 + rng() * 0.28);
    positions[i * 3] = r * Math.cos(theta) * distance;
    positions[i * 3 + 1] = z * distance;
    positions[i * 3 + 2] = r * Math.sin(theta) * distance;

    const warmth = rng();
    if (bright) {
      color.setHSL(warmth > 0.76 ? 0.088 : 0.57, 0.3, 0.85 + rng() * 0.1);
    } else {
      color.setHSL(warmth > 0.82 ? 0.08 : 0.58, 0.35, 0.55 + rng() * 0.32);
    }
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    map: starTexture,
    transparent: true,
    opacity,
    size,
    sizeAttenuation: false,
    vertexColors: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.01,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

const starTexture = createStarTexture();
const stars = new THREE.Group();
stars.add(createStarLayer(9200, 24_000_000, 1.65, 0.82, 721_331));
stars.add(createStarLayer(320, 25_000_000, 3.2, 0.92, 910_117, true));
// A faint galactic band made from a concentrated extra star layer.
const milkyWay = createStarLayer(2600, 27_000_000, 1.3, 0.32, 401_301);
milkyWay.rotation.set(0.68, 0.2, 1.12);
stars.add(milkyWay);
scene.add(stars);

// A deep, almost-black gradient dome gives the void depth without assets.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(28_000_000, 32, 20),
  new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vec3 low = vec3(0.003, 0.010, 0.018);
        vec3 high = vec3(0.001, 0.003, 0.008);
        float horizon = smoothstep(-0.75, 0.7, vDirection.y);
        vec3 color = mix(low, high, horizon);
        float haze = pow(max(0.0, 1.0 - abs(dot(vDirection, normalize(vec3(0.58, 0.24, 0.78))))), 9.0);
        color += vec3(0.012, 0.021, 0.035) * haze;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  }),
);
sky.frustumCulled = false;
sky.renderOrder = -10;
scene.add(sky);

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

interface CameraTweenState {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromFov: number;
  toFov: number;
  start: number;
  duration: number;
  onComplete?: () => void;
}

let station: ReturnType<typeof createStation> | null = null;
let earth: ReturnType<typeof createEarth> | null = null;
let tween: CameraTweenState | null = null;
let activeModuleId = OVERVIEW_ID;
let cameraMode: string = OVERVIEW_ID;
let autoRotate = false;
let navButtons = new Map<string, HTMLButtonElement>();
let overviewView: ModuleView = {
  position: [120, 58, 150],
  target: [0, 5, -3],
  fov: 39,
};

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
let pointerDirty = false;
let hoveredId: string | null = null;
let pointerDownPosition: { x: number; y: number } | null = null;

const clock = { last: performance.now() };
let elapsed = 0;

/* ------------------------------------------------------------------ */
/*  UI construction                                                   */
/* ------------------------------------------------------------------ */

function padIndex(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function buildStats(): void {
  const container = document.querySelector<HTMLDivElement>('#statsGrid');
  if (container) {
    container.replaceChildren();
  }
  // The stats live in a static grid in the HTML; keep values in data.ts so
  // they can be updated without hunting through markup.
  const statNodes = document.querySelectorAll<HTMLDivElement>('.stats-grid .stat');
  statNodes.forEach((node, index) => {
    const stat = OVERVIEW_STATS[index];
    if (!stat) return;
    const label = node.querySelector<HTMLSpanElement>('.stat-label');
    const value = node.querySelector<HTMLSpanElement>('.stat-value');
    if (label) label.textContent = stat.label;
    if (value) value.innerHTML = `${stat.value}<small>${stat.unit}</small>`;
  });
}

function buildNavigation(): void {
  navItemsElement.replaceChildren();
  navButtons = new Map();

  NAV_ITEMS.forEach((id, index) => {
    const info = ISS_MODULES[id];
    if (!info) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item';
    button.dataset.module = id;
    button.setAttribute('aria-pressed', 'false');

    const number = document.createElement('span');
    number.className = 'nav-index';
    number.textContent = padIndex(index);

    const copy = document.createElement('span');
    copy.className = 'nav-copy';
    const title = document.createElement('strong');
    title.textContent = info.name;
    const english = document.createElement('small');
    english.textContent = info.english;
    copy.append(title, english);

    const arrow = document.createElement('span');
    arrow.className = 'nav-arrow';
    arrow.textContent = '↗';

    button.append(number, copy, arrow);
    button.addEventListener('click', () => {
      engage();
      selectModule(id, true);
      cameraMode = id;
      setAutoRotate(false);
      const view = focusViewFor(id);
      flyTo(view, 1500);
    });
    navItemsElement.append(button);
    navButtons.set(id, button);
  });
}

function setNavActive(id: string): void {
  activeModuleId = id;
  let activeButton: HTMLButtonElement | undefined;
  navButtons.forEach((button, key) => {
    const active = key === id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) activeButton = button;
  });
  if (activeButton && isSmallViewport()) {
    centerActiveNav(activeButton, 'smooth');
  }
}

function centerActiveNav(button: HTMLButtonElement, behavior: ScrollBehavior): void {
  const target = button.offsetLeft - (navItemsElement.clientWidth - button.clientWidth) / 2;
  navItemsElement.scrollTo({ left: Math.max(0, target), behavior });
}

function infoCode(id: string): string {
  const index = (NAV_ITEMS as readonly string[]).indexOf(id);
  return index >= 0 ? `ISS / ${padIndex(index)}` : 'ISS / EXT';
}

function updateModuleCard(id: string, animate = true): void {
  const info = ISS_MODULES[id] ?? ISS_MODULES[OVERVIEW_ID];
  activeModuleId = id;
  setNavActive(id);
  moduleCategory.textContent = info.category;
  moduleCode.textContent = infoCode(id);
  moduleName.textContent = info.name;
  moduleEnglish.textContent = info.english;
  moduleDescription.textContent = info.description;
  moduleFunc.textContent = info.func;
  moduleBuilt.textContent = info.built;
  moduleAgency.textContent = info.agency;
  infoCard.style.setProperty('--module-accent', info.accent);
  tooltipKicker.style.color = info.accent;
  app.classList.toggle('has-selection', id !== OVERVIEW_ID);

  if (animate) {
    infoCard.classList.remove('is-switching');
    // Force a style flush so the stagger animation restarts on every change.
    void infoCard.offsetWidth;
    infoCard.classList.add('is-switching');
  }
}

function selectModule(id: string, keepCamera: boolean): void {
  if (keepCamera) cameraMode = id;
  updateModuleCard(id, true);
  hideTooltip();
}

function showError(message: string): void {
  window.dispatchEvent(new CustomEvent('skivu-scene-error', { detail: message }));
}

/* ------------------------------------------------------------------ */
/*  Camera helpers                                                    */
/* ------------------------------------------------------------------ */

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function flyTo(view: ModuleView, duration = 1500, onComplete?: () => void): void {
  if (!ambientMotion()) {
    tween = null;
    camera.position.set(...view.position);
    controls.target.set(...view.target);
    camera.fov = view.fov ?? 39;
    camera.updateProjectionMatrix();
    controls.update();
    onComplete?.();
    queueFrame();
    return;
  }
  tween = {
    fromPosition: camera.position.clone(),
    toPosition: new THREE.Vector3(...view.position),
    fromTarget: controls.target.clone(),
    toTarget: new THREE.Vector3(...view.target),
    fromFov: camera.fov,
    toFov: view.fov ?? 39,
    start: performance.now(),
    duration,
    onComplete,
  };
  queueFrame();
}

function cancelTween(): void {
  if (!tween) return;
  tween = null;
  controls.update();
}

function updateTween(now: number): void {
  if (!tween) return;
  const raw = Math.min(1, (now - tween.start) / tween.duration);
  const eased = easeInOutCubic(raw);
  camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  camera.fov = THREE.MathUtils.lerp(tween.fromFov, tween.toFov, eased);
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);

  if (raw >= 1) {
    const callback = tween.onComplete;
    tween = null;
    controls.update();
    callback?.();
  }
}

function setAutoRotate(enabled: boolean): void {
  autoRotate = enabled;
  controls.autoRotate = enabled && ambientMotion();
  autoRotateButton.classList.toggle('is-active', enabled);
  autoRotateButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  queueFrame();
}

function availableView(): { left: number; top: number; width: number; height: number } {
  const width = innerWidth, height = innerHeight;
  const panel = must<HTMLElement>('.left-panel').getBoundingClientRect();
  const nav = must<HTMLElement>('.right-nav').getBoundingClientRect();
  if (isSmallViewport()) {
    const top = Math.min(height * .49, panel.bottom + 18);
    const bottom = Math.max(top + 150, nav.top - 18);
    return { left: 12, top, width: width - 24, height: Math.max(150, bottom - top) };
  }
  const left = panel.right + 22;
  return { left, top: 78, width: Math.max(240, nav.left - left - 22), height: Math.max(240, height - 180) };
}
function updateProjection(): void {
  const view = availableView();
  camera.setViewOffset(innerWidth, innerHeight,
    -(view.left + view.width / 2 - innerWidth / 2),
    -(view.top + view.height / 2 - innerHeight / 2), innerWidth, innerHeight);
  camera.updateProjectionMatrix();
}

function focusViewFor(id: string): ModuleView {
  const info = ISS_MODULES[id];
  if (info?.view) {
    if (isSmallViewport()) {
      const target = new THREE.Vector3(...info.view.target);
      const position = new THREE.Vector3(...info.view.position);
      position.sub(target).multiplyScalar(1.16).add(target);
      return { ...info.view, position: [position.x, position.y, position.z] };
    }
    return info.view;
  }

  if (!station) {
    return overviewView;
  }
  const binding = station.modules.get(id);
  const box = new THREE.Box3();
  if (binding) {
    box.setFromObject(binding.group);
  } else {
    box.setFromObject(station.root);
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  const direction = new THREE.Vector3(0.74, 0.36, 0.82).normalize();
  const distance = Math.max(8, radius / Math.sin(THREE.MathUtils.degToRad(20)) * 1.06);
  const position = center.clone().addScaledVector(direction, distance);
  return {
    target: [center.x, center.y, center.z],
    position: [position.x, position.y, position.z],
    fov: 39,
  };
}

function computeOverviewView(): ModuleView {
  if (!station) {
    return overviewView;
  }
  const box = new THREE.Box3().setFromObject(station.root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const direction = new THREE.Vector3(0.4, 0.28, 0.88).normalize();
  const target = center.clone();
  // The off-axis projection already centers the model in the mobile free area.

  const fov = 39;
  const view = availableView();
  const fullHalf = THREE.MathUtils.degToRad(fov * 0.5);
  const vHalf = Math.atan(Math.tan(fullHalf) * view.height / innerHeight);
  const hHalf = Math.atan(Math.tan(fullHalf) * view.width / innerHeight);

  const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, direction).normalize();
  let maxRight = 0;
  let maxUp = 0;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).sub(target);
        maxRight = Math.max(maxRight, Math.abs(point.dot(right)));
        maxUp = Math.max(maxUp, Math.abs(point.dot(up)));
      }
    }
  }
  const margin = isSmallViewport() ? 1.04 : 0.97;
  const distance = Math.max(
    maxRight / Math.tan(hHalf),
    maxUp / Math.tan(vHalf),
    size.length() * 0.5,
  ) * margin;
  const position = target.clone().addScaledVector(direction, distance);

  return {
    target: [target.x, target.y, target.z],
    position: [position.x, position.y, position.z],
    fov,
  };
}

/* ------------------------------------------------------------------ */
/*  Hovering & picking                                                */
/* ------------------------------------------------------------------ */

function findModuleId(object: THREE.Object3D | null): string | null {
  let current = object;
  while (current) {
    const id = current.userData.moduleId;
    if (typeof id === 'string') return id;
    current = current.parent;
  }
  return null;
}

function setGlow(id: string | null): void {
  if (!station) return;
  for (const [moduleId, binding] of station.modules) {
    const on = moduleId === id;
    for (const base of binding.baseEmissive) {
      if (on) {
        base.material.emissive.setHex(0x17617a);
        base.material.emissiveIntensity = 0.72;
      } else {
        base.material.emissive.copy(base.color);
        base.material.emissiveIntensity = base.intensity;
      }
    }
  }
}

function positionTooltip(clientX: number, clientY: number): void {
  const width = tooltip.offsetWidth || 230;
  const height = tooltip.offsetHeight || 120;
  let x = clientX + 22;
  let y = clientY + 20;
  if (x + width > window.innerWidth - 12) x = clientX - width - 22;
  if (y + height > window.innerHeight - 12) y = clientY - height - 20;
  x = Math.max(12, Math.min(x, window.innerWidth - width - 12));
  y = Math.max(12, Math.min(y, window.innerHeight - height - 12));
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function showTooltip(id: string, clientX: number, clientY: number): void {
  const info = ISS_MODULES[id];
  if (!info) return;
  tooltipKicker.textContent = info.category;
  tooltipKicker.style.color = info.accent;
  tooltipName.textContent = info.name;
  tooltipEnglish.textContent = info.english;
  tooltip.classList.add('is-visible');
  positionTooltip(clientX, clientY);
}

function hideTooltip(): void {
  tooltip.classList.remove('is-visible');
}

function setHovered(id: string | null, clientX: number, clientY: number): void {
  if (id === hoveredId) {
    if (id) positionTooltip(clientX, clientY);
    return;
  }
  hoveredId = id;
  setGlow(id);
  canvas.classList.toggle('is-hovering', Boolean(id));
  if (id) {
    showTooltip(id, clientX, clientY);
  } else {
    hideTooltip();
  }
}

function updateHover(): void {
  if (!station || !pointerDirty) return;
  pointerDirty = false;

  if (tween) {
    // The model is still pickable during a camera move; the tooltip simply
    // follows the pointer.
  }

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(station.root, true);
  let id: string | null = null;
  for (const hit of hits) {
    if (hit.object.userData.noPick) continue;
    id = findModuleId(hit.object);
    if (id) break;
  }

  const lastX = lastPointer.clientX;
  const lastY = lastPointer.clientY;
  setHovered(id, lastX, lastY);
}

const lastPointer = { clientX: 0, clientY: 0 };

function updatePointer(event: PointerEvent): void {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  lastPointer.clientX = event.clientX;
  lastPointer.clientY = event.clientY;
  pointerDirty = true;
  queueFrame();
}

function pickAt(event: PointerEvent): void {
  if (!station) return;
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(station.root, true);
  let id: string | null = null;
  for (const hit of hits) {
    if (hit.object.userData.noPick) continue;
    id = findModuleId(hit.object);
    if (id) break;
  }
  if (!id) return;
  updateModuleCard(id, true);
  cameraMode = id;
}

/* ------------------------------------------------------------------ */
/*  Earth texture generation & scene assembly                         */
/* ------------------------------------------------------------------ */

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
// Lazy iframes can have requestAnimationFrame suspended before their first
// intersection. Boot must complete even while the iframe is offscreen.
const nextFrame = () => new Promise<void>((resolve) => {
  const timer = window.setTimeout(resolve, 100);
  requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
});

function setLoader(progress: number, message: string): void {
  loaderBar.style.width = `${progress}%`;
  loaderPercent.textContent = `${Math.round(progress)}%`;
  loaderStatus.textContent = message;
}

async function init(): Promise<void> {
  setLoader(4, 'INITIALIZING ORBITAL FRAME');
  await nextFrame();
  await delay(80);

  const maxAnisotropy = Math.min(mobileQuality ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
  const quality = mobileQuality ? 512 : 1536;

  setLoader(16, 'GENERATING PROCEDURAL EARTH');
  await nextFrame();
  const earthTextures = createEarthTextures(quality, maxAnisotropy);

  setLoader(43, 'ASSEMBLING PRESSURIZED MODULES');
  await nextFrame();
  station = createStation(maxAnisotropy, mobileQuality);
  scene.add(station.root);

  setLoader(63, 'ALIGNING SOLAR ARRAY GIMBALS');
  await nextFrame();
  earth = createEarth(earthTextures, sunDirection, mobileQuality);
  scene.add(earth.group);

  const defaultView = computeOverviewView();
  overviewView = defaultView;
  const initialTarget = new THREE.Vector3(...defaultView.target);
  const initialPosition = new THREE.Vector3(...defaultView.position)
    .sub(initialTarget)
    .multiplyScalar(1.32)
    .add(initialTarget)
    .add(new THREE.Vector3(0, 18, 0));
  camera.position.copy(initialPosition);
  camera.fov = defaultView.fov ?? 39;
  camera.updateProjectionMatrix();
  controls.target.copy(initialTarget);
  controls.update();

  updateModuleCard(OVERVIEW_ID, false);
  setNavActive(OVERVIEW_ID);

  setLoader(82, 'CALIBRATING ORBITAL TELEMETRY');
  await nextFrame();
  await delay(120);
  setLoader(100, 'ORBITAL LINK ESTABLISHED');
  await delay(420);

  sceneReady = true;
  if (app.classList.contains('is-compat')) return;
  updateProjection();
  // Paint a real frame before hiding the loading/fallback view. First paint
  // deliberately does not depend on animation, host messages or visibility.
  renderer.render(scene, camera);
  app.classList.add('is-ready');
  window.dispatchEvent(new Event('skivu-scene-ready'));
  loader.classList.add('is-complete');
  window.setTimeout(() => loader.remove(), 1200);
  setAutoRotate(!reducedMotion.matches);
  cameraMode = OVERVIEW_ID;
  // A gentle arrival move from the outer approach to the fitted overview.
  flyTo(defaultView, 2600, () => {
    cameraMode = OVERVIEW_ID;
  });
  animate();
}

/* ------------------------------------------------------------------ */
/*  Events                                                            */
/* ------------------------------------------------------------------ */

function updateClock(): void {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  utcClock.textContent = `${formatter.format(new Date())} UTC`;
}
updateClock();
window.setInterval(updateClock, 1000);

canvas.addEventListener('pointermove', updatePointer);
canvas.addEventListener('pointerleave', () => {
  pointerDirty = false;
  setHovered(null, 0, 0);
  hideTooltip();
});
canvas.addEventListener('pointerdown', (event) => {
  engage();
  if (event.button === 0) {
    pointerDownPosition = { x: event.clientX, y: event.clientY };
  }
});
canvas.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !pointerDownPosition) return;
  const distance = Math.hypot(
    event.clientX - pointerDownPosition.x,
    event.clientY - pointerDownPosition.y,
  );
  pointerDownPosition = null;
  if (distance < 7) pickAt(event);
});
canvas.addEventListener('wheel', () => {
  if (tween) cancelTween();
}, { passive: true });

controls.addEventListener('start', () => {
  if (tween) cancelTween();
  cameraMode = 'free';
  canvas.classList.add('is-dragging');
});
controls.addEventListener('end', () => {
  canvas.classList.remove('is-dragging');
});
controls.addEventListener('change', queueFrame);

autoRotateButton.addEventListener('click', () => {
  if (tween) cancelTween();
  setAutoRotate(!autoRotate);
});

resetButton.addEventListener('click', () => {
  selectModule(OVERVIEW_ID, false);
  setAutoRotate(false);
  cameraMode = OVERVIEW_ID;
  overviewView = computeOverviewView();
  flyTo(overviewView, 1400);
});

fullscreenButton.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // Fullscreen can be rejected by embedded browsers; keep the scene usable.
  }
});

function updateFullscreenLabel(): void {
  const fullscreen = Boolean(document.fullscreenElement);
  fullscreenLabel.textContent = fullscreen ? '退出全屏' : '全屏模式';
  fullscreenButton.classList.toggle('is-active', fullscreen);
}
document.addEventListener('fullscreenchange', updateFullscreenLabel);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    disengage();
    hideTooltip();
    return;
  }
  const index = Number(event.key) - 1;
  if (Number.isInteger(index) && index >= 0 && index < NAV_ITEMS.length) {
    const id = NAV_ITEMS[index];
    if (!id) return;
    selectModule(id, true);
    cameraMode = id;
    setAutoRotate(false);
    flyTo(focusViewFor(id), 1500);
    return;
  }
  if (event.key.toLowerCase() === 'r') {
    selectModule(OVERVIEW_ID, false);
    setAutoRotate(false);
    overviewView = computeOverviewView();
    flyTo(overviewView, 1400);
  }
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isCoarsePointer || isSmallViewport() ? 1.25 : 1.6));
  renderer.setSize(width, height);
  updateProjection();
  queueFrame();

  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (isSmallViewport()) {
      const active = navButtons.get(activeModuleId);
      if (active) centerActiveNav(active, 'auto');
    }
    if (cameraMode === OVERVIEW_ID && !tween && station) {
      overviewView = computeOverviewView();
      flyTo(overviewView, 600);
    }
  }, 180);
});

renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  contextLost = true;
  cancelAnimationFrame(frameRequest);
  frameRequest = 0;
  showError('三维渲染暂时中断，已切换为结构预览。可点击重新加载恢复三维视图。');
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  // The compatibility controls may already be in use; let the user choose
  // when to reload rather than changing the current view underneath them.
  showError('三维渲染已恢复，可点击重新加载返回三维视图。');
});
window.addEventListener('skivu-scene-compat', () => {
  contextLost = true; cancelAnimationFrame(frameRequest); frameRequest = 0;
});

/* ------------------------------------------------------------------ */
/*  Render loop                                                       */
/* ------------------------------------------------------------------ */

function queueFrame(): void {
  if (sceneReady && frameVisible && !document.hidden && !contextLost && !frameRequest)
    frameRequest = requestAnimationFrame(renderFrame);
}
function renderFrame(now: number): void {
    frameRequest = 0;
    if (!frameVisible || document.hidden || contextLost) return;
    if (now - clock.last < (isSmallViewport() ? 42 : 32)) { queueFrame(); return; }
    const delta = Math.min((now - clock.last) / 1000, 0.08);
    clock.last = now;
    if (ambientMotion()) elapsed += delta;

    station?.update(elapsed);
    earth?.update(elapsed);

    if (tween) {
      updateTween(now);
    } else {
      controls.update(delta);
    }

    if (pointerDirty) updateHover();
    try { renderer.render(scene, camera); }
    catch { contextLost = true; showError('三维渲染暂时不可用，已切换为二维结构预览。'); return; }
    if (ambientMotion() || tween) queueFrame();
}
function animate(): void {
  clock.last = performance.now();
  queueFrame();
}

let suspendedAt = 0;
function syncActivity(): void {
  app.classList.toggle('motion-paused', !ambientMotion());
  controls.autoRotate = autoRotate && ambientMotion();
  if (!frameVisible || document.hidden) {
    if (!suspendedAt) suspendedAt = performance.now();
    cancelAnimationFrame(frameRequest); frameRequest = 0;
  } else {
    if (suspendedAt && tween) tween.start += performance.now() - suspendedAt;
    suspendedAt = 0;
    clock.last = performance.now();
    queueFrame();
  }
}
window.addEventListener('message', (event) => {
  if (!embedded || event.source !== window.parent || event.origin !== location.origin) return;
  if (event.data?.type === 'skivu-motion') { hostPaused = event.data.paused === true; syncActivity(); }
  if (event.data?.type === 'skivu-station-visibility') { frameVisible = event.data.visible === true; syncActivity(); }
});
function requestHostState(): void {
  if (embedded) window.parent.postMessage({ type: 'skivu-station-ready' }, location.origin);
}
// Both sides announce readiness: ordering of iframe load and async modules
// differs between mobile browsers and bfcache restores.
requestHostState();
window.addEventListener('pageshow', () => { requestHostState(); syncActivity(); });
document.addEventListener('visibilitychange', () => { requestHostState(); syncActivity(); });
new IntersectionObserver((entries) => {
  frameVisible = entries[0].isIntersecting;
  syncActivity();
}, { rootMargin: '150px' }).observe(canvas);
reducedMotion.addEventListener('change', syncActivity);
new ResizeObserver(() => { updateProjection(); queueFrame(); }).observe(must<HTMLElement>('.left-panel'));

/* ------------------------------------------------------------------ */
/*  Boot                                                              */
/* ------------------------------------------------------------------ */

buildStats();
buildNavigation();
updateModuleCard(OVERVIEW_ID, false);
updateFullscreenLabel();

init().catch((error: unknown) => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  showError(`无法建立三维场景：${message}`);
});
