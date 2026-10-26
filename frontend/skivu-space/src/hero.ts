import * as T from "three";
import './finale';
import { planetTextures, planetSurfaceGLSL } from './planet-surface';

// Preserve the illustrated silhouette and lighting. Complete global maps
// supply the rotating interior, without stretching a cropped front hemisphere.
const plate = document.querySelector<HTMLElement>(".hero-plate");
const hero = document.querySelector<HTMLElement>(".hero");
if (plate && hero) {
  let renderer: T.WebGLRenderer | undefined,
    mesh: T.Mesh | undefined,
    material: T.ShaderMaterial | undefined;
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  camera.position.z = 2000;
  let active = true,
    ready = false,
    raf = 0,
    last = 0,
    angle = 0,
    elapsed = 0,
    failed = false,
    loading = false;
  const paused = () =>
    document.documentElement.classList.contains("motion-paused") || document.hidden;
  function size() {
    if (!renderer || !mesh) return;
    const w = plate!.clientWidth,
      h = plate!.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 640 ? 1.35 : 1.75));
    renderer.setSize(w, h);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
    const style = getComputedStyle(plate!);
    const positions = style.backgroundPosition.split(" ");
    const px = parseFloat(positions[0]) / 100,
      py = parseFloat(positions[1] || "50%") / 100;
    const scale = Math.max(w / 1672, h / 941),
      offsetX = (w - 1672 * scale) * px,
      offsetY = (h - 941 * scale) * py;
    mesh.position.set(offsetX + 1400 * scale - w / 2, h / 2 - offsetY - 554 * scale, 0);
    mesh.scale.set(448 * scale, 420 * scale, 448 * scale);
    renderer.render(scene, camera);
  }
  function render(time: number) {
    raf = 0;
    if (!ready || !active || paused()) return;
    if (time - last > (innerWidth < 640 ? 42 : 32)) {
      const dt = last ? Math.min((time - last) / 1000, 0.08) : 0;
      last = time;
      angle += dt * 0.105;
      elapsed += dt;
      material!.uniforms.rotation.value = angle;
      material!.uniforms.flow.value = 0.92 * (1 - Math.exp(-elapsed / 1.8));
      renderer!.render(scene, camera);
    }
    raf = requestAnimationFrame(render);
  }
  function resume() {
    if (ready && active && !paused() && !raf) {
      last = 0;
      raf = requestAnimationFrame(render);
    }
  }
  async function initialize() {
    if (renderer || failed || loading || paused()) return;
    loading = true;
    try {
      const [texture, [land, cloud]] = await Promise.all([
        new T.TextureLoader().loadAsync(new URL("assets/universe-hero-20261025.webp", document.baseURI).href),
        planetTextures(),
      ]);
      texture.colorSpace = T.SRGBColorSpace;
      renderer = new T.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.setClearColor(0, 0);
      renderer.domElement.className = "hero-planet-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");
      Object.assign(renderer.domElement.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      });
      material = new T.ShaderMaterial({
        transparent: true,
        uniforms: { plate: { value: texture }, landMap: { value: land }, cloudMap: { value: cloud }, rotation: { value: 0 }, flow: { value: 0 } },
        vertexShader: `varying vec3 localPoint;varying vec3 facing;void main(){localPoint=position;facing=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `
          uniform sampler2D plate;
          uniform float rotation;
          uniform float flow;
          varying vec3 localPoint;
          varying vec3 facing;
          ${planetSurfaceGLSL}
          vec2 project(vec3 n){return vec2((1400.+448.*n.x)/1672.,1.-(554.-420.*n.y)/941.);}
          float sunlight(vec3 n){return .18+.82*smoothstep(-.28,.85,dot(n,normalize(vec3(-.65,.7,.22))));}
          void main(){
            vec3 n=normalize(localPoint);
            vec3 base=texture2D(plate,project(n)).rgb;
            vec3 tilted=vec3(.97*n.x+.24*n.y,-.24*n.x+.97*n.y,n.z);
            vec3 moving=planetarySurface(normalize(tilted),rotation-1.2);
            moving*=.35+.9*sunlight(n);
            float surface=smoothstep(.18,.60,n.z);
            vec3 col=mix(base,moving,surface*flow);
            float edge=smoothstep(0.,.095,abs(facing.z));
            gl_FragColor=vec4(col,edge);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      mesh = new T.Mesh(new T.SphereGeometry(1, 192, 96), material);
      scene.add(mesh);
      plate!.appendChild(renderer.domElement);
      ready = true;
      size();
      resume();
      renderer.domElement.addEventListener("webglcontextlost", () => {
        cancelAnimationFrame(raf);
        raf = 0;
        ready = false;
        renderer?.domElement.remove();
        failed = true;
      });
    } catch {
      failed = true;
      renderer?.dispose();
      renderer?.domElement.remove();
    }
  }
  new ResizeObserver(size).observe(plate);
  new IntersectionObserver(
    (entries) => {
      active = entries[0].isIntersecting;
      if (!active) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        void initialize();
        resume();
      }
    },
    { rootMargin: "100px" },
  ).observe(hero);
  document.addEventListener("skivu-motion-change", () => {
    if (paused()) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      void initialize();
      resume();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (paused()) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      void initialize();
      resume();
    }
  });
  void initialize();
}
