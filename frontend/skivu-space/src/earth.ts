import * as T from "three";

// A real-data Blue Marble globe for the closing horizon. Imagery is bundled
// locally; this is a historical satellite composite, not live Earth imagery.
const host = document.querySelector<HTMLElement>(".journey-planet");
if (host) {
  let renderer: T.WebGLRenderer | undefined;
  let loading = false, failed = false, visible = false, raf = 0, last = 0;
  let elapsed = 0;
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1.06, 1.06, 1.06, -1.06, .1, 20);
  camera.position.z = 5;
  const globe = new T.Group();
  globe.rotation.z = -.14;
  scene.add(globe);
  let surface: T.Mesh, clouds: T.Mesh;
  const paused = () => document.hidden || document.documentElement.classList.contains("motion-paused");
  function draw() { renderer?.render(scene, camera); }
  function size() {
    if (!renderer || failed) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 640 ? 1 : 1.5));
    renderer.setSize(host!.clientWidth, host!.clientHeight);
    draw();
  }
  function animate(time: number) {
    raf = 0;
    if (!visible || paused()) return;
    if (time - last >= (innerWidth < 640 ? 50 : 40)) {
      elapsed += last ? Math.min((time - last) / 1000, .08) : 0;
      last = time;
      surface.rotation.y = -1.35 + elapsed * .012;
      clouds.rotation.y = -1.35 + elapsed * .014;
      draw();
    }
    raf = requestAnimationFrame(animate);
  }
  function resume() {
    if (renderer && !failed && visible && !paused() && !raf) {
      last = 0;
      raf = requestAnimationFrame(animate);
    }
  }
  async function initialize() {
    if (renderer || loading || failed || !visible || document.hidden) return;
    loading = true;
    try {
      const loader = new T.TextureLoader();
      const [land, cloud] = await Promise.all([
        loader.loadAsync(new URL("assets/earth-blue-marble-surface.webp", document.baseURI).href),
        loader.loadAsync(new URL("assets/earth-blue-marble-clouds.webp", document.baseURI).href),
      ]);
      land.colorSpace = T.SRGBColorSpace;
      land.wrapS = cloud.wrapS = T.RepeatWrapping;
      land.anisotropy = cloud.anisotropy = 4;
      renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setClearColor(0, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.className = "journey-earth-canvas";
      const geometry = new T.SphereGeometry(1, 128, 64);
      surface = new T.Mesh(geometry, new T.MeshStandardMaterial({ map: land, roughness: .92, metalness: 0 }));
      clouds = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: "#eff8ff", alphaMap: cloud, transparent: true, opacity: .78, depthWrite: false, roughness: 1 }));
      clouds.scale.setScalar(1.003);
      surface.rotation.y = clouds.rotation.y = -1.35;
      globe.add(surface, clouds);
      const atmosphere = new T.Mesh(geometry, new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending,
        vertexShader: `varying vec3 n; varying vec3 view; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);view=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
        fragmentShader: `varying vec3 n; varying vec3 view; void main(){float rim=pow(max(0.,1.+dot(normalize(n),normalize(view))),5.);gl_FragColor=vec4(.14,.42,.85,.34*rim);}`,
      }));
      atmosphere.scale.setScalar(1.014);
      globe.add(atmosphere);
      scene.add(new T.HemisphereLight("#c4e3ff", "#080e25", 1.15));
      const sunlight = new T.DirectionalLight("#fff6e8", 2.3);
      sunlight.position.set(-3, 4, 5);
      scene.add(sunlight);
      host!.appendChild(renderer.domElement);
      size();
      host!.classList.add("earth-ready");
      renderer.domElement.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        cancelAnimationFrame(raf); raf = 0; failed = true;
        renderer?.domElement.remove(); host!.classList.remove("earth-ready");
      });
      resume();
    } catch {
      failed = true;
      renderer?.dispose(); renderer?.domElement.remove();
    } finally { loading = false; }
  }
  new ResizeObserver(size).observe(host);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) { void initialize(); resume(); }
    else { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: "200px" }).observe(host);
  function motionChanged() {
    if (paused()) { cancelAnimationFrame(raf); raf = 0; }
    else { void initialize(); resume(); }
  }
  document.addEventListener("visibilitychange", motionChanged);
  document.addEventListener("skivu-motion-change", motionChanged);
}
