import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createISS } from "./iss-model";
import { earthTextures, makeStars } from "./procedural";
import { moduleInfo, type ModuleId } from "./modules";

const host = document.getElementById("station-canvas")!;
const experience = document.getElementById("station-experience")!;
const loading = document.getElementById("loading")!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const embedded = window.parent !== window;
experience.classList.toggle("is-embedded", embedded);
let renderer: T.WebGLRenderer;
try {
  renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch {
  loading.classList.add("error");
  loading.querySelector("p")!.textContent =
    "当前浏览器无法启动 3D 视图。请使用支持 WebGL 2 的浏览器，宣传页其他内容可继续浏览。";
  throw new Error("WebGL 2 unavailable");
}
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.autoClear = false;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute("aria-label", "空间站三维视图，方向键可平移，拖动可旋转");
host.appendChild(renderer.domElement);
const scene = new T.Scene();
const background = new T.Scene();
background.background = new T.Color(0x030810);
const camera = new T.PerspectiveCamera(42, 1, 0.1, 2500);
const skyCamera = new T.PerspectiveCamera(42, 1, 1, 30000);
const pmrem = new T.PMREMGenerator(renderer);
const environment = new RoomEnvironment();
scene.environment = pmrem.fromScene(environment, 0.04).texture;
environment.dispose();
pmrem.dispose();
scene.environmentIntensity = 0.65;
scene.add(new T.HemisphereLight(0xb9d8ff, 0x172a45, 1.1));
const sun = new T.DirectionalLight(0xffedd7, 3);
sun.position.set(-70, 80, 90);
scene.add(sun);
const rim = new T.DirectionalLight(0x80baff, 1.6);
rim.position.set(30, -10, -60);
scene.add(rim);
const model = createISS();
scene.add(model.root);
background.add(makeStars(innerWidth < 640 ? 650 : 1500));
const maps = earthTextures();
const globe = new T.Mesh(
  new T.SphereGeometry(6371, 96, 64),
  new T.MeshPhongMaterial({ map: maps.surface, specular: 0x47728a, shininess: 18 }),
);
globe.position.set(0, -6771, 0);
globe.rotation.set(0.17, -0.7, -0.1);
background.add(globe);
const clouds = new T.Mesh(
  new T.SphereGeometry(6378, 96, 64),
  new T.MeshPhongMaterial({
    map: maps.clouds,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }),
);
clouds.position.copy(globe.position);
clouds.rotation.copy(globe.rotation);
background.add(clouds);
const atmosphere = new T.Mesh(
  new T.SphereGeometry(6403, 80, 48),
  new T.ShaderMaterial({
    side: T.BackSide,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    vertexShader:
      "varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}",
    fragmentShader:
      "varying vec3 n;varying vec3 v;void main(){float fresnel=pow(1.-abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(.13,.45,.95,fresnel*.37);}",
  }),
);
atmosphere.position.copy(globe.position);
background.add(atmosphere);
background.add(new T.AmbientLight(0x7894ad, 1.7));
const earthSun = new T.DirectionalLight(0xcce5ff, 3);
earthSun.position.set(-6000, 4000, 7000);
background.add(earthSun);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.autoRotate = !reduced.matches;
controls.autoRotateSpeed = 0.18;
controls.minDistance = 8;
controls.maxDistance = 360;
controls.enablePan = true;
controls.panSpeed = 0.65;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.65;
controls.maxTargetRadius = 140;
controls.listenToKeyEvents(renderer.domElement);
const exitInteraction = document.createElement("button");
exitInteraction.className = "exit-interaction";
exitInteraction.type = "button";
exitInteraction.textContent = "退出交互 · 继续浏览";
exitInteraction.hidden = true;
experience.appendChild(exitInteraction);
function engage() {
  if (embedded) {
    controls.enableZoom = true;
    exitInteraction.hidden = false;
  }
}
function disengage() {
  if (embedded) {
    controls.enableZoom = false;
    exitInteraction.hidden = true;
    renderer.domElement.blur();
  }
}
controls.enableZoom = !embedded;
exitInteraction.addEventListener("click", disengage);
if (embedded)
  document.querySelector(".interaction-help")!.firstChild!.textContent =
    "拖动开始交互 · 滚轮缩放 · 右键平移";
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") disengage();
});
const homeTarget = new T.Vector3(0, 0, 0),
  homePosition = new T.Vector3(100, 68, 130);
camera.position.copy(homePosition).multiplyScalar(reduced.matches ? 1 : 1.25);
controls.target.copy(homeTarget);
controls.update();
controls.saveState();
let width = 1,
  height = 1,
  view = { x: 0, y: 0, w: 1, h: 1 };
let selected: ModuleId | undefined, hovered: ModuleId | undefined;
let raf = 0,
  last = 0,
  elapsed = 0,
  active = true,
  globalPaused = false,
  auto = !reduced.matches;
let transition:
  | {
      fromCamera: T.Vector3;
      toCamera: T.Vector3;
      fromTarget: T.Vector3;
      toTarget: T.Vector3;
      elapsed: number;
      duration: number;
    }
  | undefined;
let dragStart = { x: 0, y: 0 },
  dragged = false;
const tooltip = document.getElementById("hover-tooltip")!;
const raycaster = new T.Raycaster();
const pointer = new T.Vector2();
const info = document.getElementById("module-info")!;
function viewport() {
  if (width <= 640) {
    const focused = !!selected;
    const h = height * (focused ? 0.34 : 0.43);
    view = { x: 0, y: height * (focused ? 0.43 : 0.34), w: width, h };
  } else {
    const left = width > 1000 ? 300 : 255,
      right = width > 1000 ? 185 : 160;
    view = { x: left, y: 0, w: Math.max(200, width - left - right), h: height };
  }
  camera.aspect = view.w / view.h;
  camera.updateProjectionMatrix();
}
function resize() {
  width = host.clientWidth;
  height = host.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width <= 640 ? 1.35 : 1.75));
  renderer.setSize(width, height);
  skyCamera.aspect = width / height;
  skyCamera.updateProjectionMatrix();
  viewport();
  render();
}
function render() {
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
  renderer.clear();
  skyCamera.quaternion.copy(camera.quaternion);
  renderer.render(background, skyCamera);
  renderer.clearDepth();
  renderer.setViewport(view.x, view.y, view.w, view.h);
  renderer.setScissor(view.x, view.y, view.w, view.h);
  renderer.setScissorTest(true);
  renderer.render(scene, camera);
  renderer.setScissorTest(false);
}
function canAnimate() {
  return active && !document.hidden && !globalPaused;
}
function animate(time: number) {
  raf = 0;
  if (!canAnimate()) return;
  raf = requestAnimationFrame(animate);
  if (time - last < (width <= 640 ? 42 : 32)) return;
  const delta = last ? Math.min((time - last) / 1000, 0.08) : 0;
  last = time;
  elapsed += delta;
  if (transition) {
    transition.elapsed += delta;
    const t = Math.min(1, transition.elapsed / transition.duration),
      ease = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.fromCamera, transition.toCamera, ease);
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, ease);
    if (t === 1) transition = undefined;
  }
  controls.autoRotate = auto && !reduced.matches && !transition;
  controls.update(delta);
  if (!reduced.matches) {
    model.hinges.forEach((hinge, i) => {
      hinge.rotation.z = Math.sin(elapsed * 0.12 + i * 0.3) * 0.009;
      hinge.rotation.x = Math.sin(elapsed * 0.07 + i * 0.4) * 0.007;
    });
    clouds.rotation.y += delta * 0.0003;
  }
  render();
}
function resume() {
  if (!raf && canAnimate()) {
    last = 0;
    raf = requestAnimationFrame(animate);
  }
}
function pause() {
  cancelAnimationFrame(raf);
  raf = 0;
  controls.autoRotate = false;
}
function travel(target: T.Vector3, position: T.Vector3, duration = 1.6) {
  if (reduced.matches || globalPaused) {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    render();
    return;
  }
  transition = {
    fromCamera: camera.position.clone(),
    toCamera: position,
    fromTarget: controls.target.clone(),
    toTarget: target,
    elapsed: 0,
    duration,
  };
  resume();
}
function highlight() {
  model.modules.forEach((group, id) => {
    const strong = id === selected,
      soft = id === hovered;
    group.traverse((object) => {
      if (object instanceof T.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((mat) => {
          if (mat instanceof T.MeshStandardMaterial || mat instanceof T.MeshPhongMaterial) {
            mat.emissive.setHex(strong ? 0x276279 : soft ? 0x173844 : 0x000000);
            mat.emissiveIntensity = strong ? 0.24 : soft ? 0.16 : 0;
          }
        });
      }
    });
  });
  if (!canAnimate()) render();
}
function select(id: ModuleId) {
  engage();
  selected = id;
  experience.dataset.selected = id;
  const data = moduleInfo[id];
  viewport();
  document.getElementById("info-kicker")!.textContent = data.kicker;
  document.getElementById("info-title")!.textContent = data.name;
  document.getElementById("info-description")!.textContent = data.description;
  document.getElementById("info-date")!.textContent = data.date;
  document.getElementById("info-agency")!.textContent = data.agency;
  (document.getElementById("info-source") as HTMLAnchorElement).href = data.source;
  document
    .querySelectorAll<HTMLElement>("[data-module]")
    .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.module === id)));
  info.classList.remove("changing");
  requestAnimationFrame(() => info.classList.add("changing"));
  auto = false;
  document.getElementById("auto-rotate")!.setAttribute("aria-pressed", "false");
  highlight();
  const target = new T.Vector3(...data.target);
  travel(target, target.clone().add(new T.Vector3(...data.offset)));
}
function reset() {
  selected = undefined;
  hovered = undefined;
  delete experience.dataset.selected;
  viewport();
  document
    .querySelectorAll("[data-module]")
    .forEach((button) => button.setAttribute("aria-pressed", "false"));
  document.getElementById("info-kicker")!.textContent = "ORBITAL OVERVIEW";
  document.getElementById("info-title")!.textContent = "从这里，望向更远。";
  document.getElementById("info-description")!.textContent =
    "拖动旋转，靠近细节。点击舱段，探索这座人类共同建造的轨道实验室。";
  document.getElementById("info-date")!.textContent = "1998 年起分阶段组装";
  document.getElementById("info-agency")!.textContent = "NASA · ESA · JAXA · CSA 等";
  (document.getElementById("info-source") as HTMLAnchorElement).href =
    "https://www.nasa.gov/international-space-station/space-station-facts-and-figures/";
  highlight();
  travel(homeTarget, homePosition);
}
function pick(event: PointerEvent): ModuleId | undefined {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left,
    y = height - (event.clientY - rect.top);
  if (x < view.x || x > view.x + view.w || y < view.y || y > view.y + view.h) return;
  pointer.set(((x - view.x) / view.w) * 2 - 1, ((y - view.y) / view.h) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects([...model.modules.values()], true)[0];
  return hit?.object.userData.moduleId as ModuleId | undefined;
}
renderer.domElement.addEventListener("pointerdown", (event) => {
  engage();
  dragStart = { x: event.clientX, y: event.clientY };
  dragged = false;
  transition = undefined;
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 5) dragged = true;
  if (event.buttons) {
    tooltip.hidden = true;
    return;
  }
  const id = pick(event);
  if (id !== hovered) {
    hovered = id;
    highlight();
  }
  renderer.domElement.style.cursor = id ? "pointer" : "grab";
  tooltip.hidden = !id;
  if (id) {
    tooltip.textContent = moduleInfo[id].name;
    tooltip.style.left = Math.min(event.clientX + 16, width - 180) + "px";
    tooltip.style.top = Math.max(10, event.clientY - 36) + "px";
  }
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (!dragged && event.button === 0) {
    const id = pick(event);
    if (id) select(id);
  }
});
renderer.domElement.addEventListener("pointerleave", () => {
  hovered = undefined;
  tooltip.hidden = true;
  highlight();
});
renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
controls.addEventListener("start", () => {
  transition = undefined;
});
controls.addEventListener("change", () => {
  if (!canAnimate()) render();
});
document
  .querySelectorAll<HTMLElement>("[data-module]")
  .forEach((button) =>
    button.addEventListener("click", () => select(button.dataset.module as ModuleId)),
  );
document.getElementById("auto-rotate")!.setAttribute("aria-pressed", String(auto));
document.getElementById("auto-rotate")!.addEventListener("click", () => {
  auto = !auto;
  document.getElementById("auto-rotate")!.setAttribute("aria-pressed", String(auto));
  resume();
});
document.getElementById("reset-view")!.addEventListener("click", reset);
const fullscreen = document.getElementById("fullscreen")!;
fullscreen.setAttribute("aria-pressed", "false");
fullscreen.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await experience.requestFullscreen();
  } catch {
    fullscreen.textContent = "全屏暂不可用";
  }
});
document.addEventListener("fullscreenchange", () => {
  fullscreen.setAttribute("aria-pressed", String(!!document.fullscreenElement));
  resize();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
  else resume();
});
reduced.addEventListener("change", () => {
  if (reduced.matches) {
    auto = false;
    document.getElementById("auto-rotate")!.setAttribute("aria-pressed", "false");
    transition = undefined;
  }
  resume();
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== parent) return;
  if (event.data?.type === "skivu-station-visibility") {
    active = !!event.data.visible;
    active ? resume() : pause();
  }
  if (event.data?.type === "skivu-motion") {
    globalPaused = !!event.data.paused;
    globalPaused ? pause() : resume();
  }
});
renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  pause();
  loading.classList.remove("ready");
  loading.classList.add("error");
  loading.querySelector("p")!.textContent = "3D 视图已暂停，请刷新重新进入轨道。";
});
new ResizeObserver(resize).observe(host);
resize();
loading.classList.add("ready");
travel(homeTarget, homePosition, 2);
resume();
