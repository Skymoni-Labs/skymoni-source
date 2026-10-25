import * as T from 'three';
import { planetTextures, planetSurfaceGLSL } from './planet-surface';

// A separate sphere rotates within a fixed atmospheric light field.
const stage = document.querySelector<HTMLElement>('.journey-planet-stage');
if (stage) {
  let renderer: T.WebGLRenderer | undefined;
  let earth: T.Mesh;
  let visible = false, loading = false, failed = false, raf = 0, last = 0, elapsed = 0;
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 10000);
  camera.position.z = 4000;
  const globe = new T.Group();
  scene.add(globe);
  const axis = new T.Group();
  axis.rotation.set(.25, 0, -.18);
  globe.add(axis);
  const paused = () => document.hidden || document.documentElement.classList.contains('motion-paused');
  function resize() {
    if (!renderer) return;
    const w = stage!.clientWidth, h = stage!.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 640 ? 1 : 1.4));
    renderer.setSize(w, h);
    camera.left = -w / 2; camera.right = w / 2;
    camera.top = h / 2; camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
    const radius = w < 640 ? Math.max(w * .88, h * .44) : Math.max(w * .59, h * .69);
    const horizon = h * (w < 640 ? .58 : .57);
    globe.scale.setScalar(radius);
    globe.position.set(w * .025, h / 2 - horizon - radius, 0);
    renderer.render(scene, camera);
  }
  function draw(now: number) {
    raf = 0;
    if (!visible || paused() || !renderer || failed) return;
    if (now - last >= (innerWidth < 640 ? 42 : 32)) {
      elapsed += last ? Math.min((now - last) / 1000, .1) : 0;
      last = now;
      earth.rotation.y = -1.2 + elapsed * .105;
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(draw);
  }
  function resume() {
    if (renderer && visible && !paused() && !failed && !raf) { last = 0; raf = requestAnimationFrame(draw); }
  }
  function fallback() {
    failed = true; cancelAnimationFrame(raf); raf = 0;
    renderer?.domElement.remove();
    stage!.parentElement!.classList.remove('planet-ready');
  }
  async function init() {
    if (renderer || loading || failed || !visible) return;
    loading = true;
    try {
      const [land, cloud] = await planetTextures();
      renderer = new T.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.setClearColor(0, 0);
      renderer.debug.onShaderError = () => { throw new Error('Closing globe shader unavailable'); };
      const geometry = new T.SphereGeometry(1, 128, 64);
      const material = new T.ShaderMaterial({
        uniforms: { landMap: { value: land }, cloudMap: { value: cloud } },
        vertexShader: `
          varying vec3 localPoint;varying vec3 facing;
          void main(){
            localPoint=position;facing=normalize(normalMatrix*normal);
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
          }`,
        fragmentShader: `
          varying vec3 localPoint;varying vec3 facing;
          ${planetSurfaceGLSL}
          void main(){
            vec3 n=normalize(facing);
            float sun=max(0.,dot(n,normalize(vec3(-.7,.65,.8))));
            vec3 surface=planetarySurface(normalize(localPoint),0.);
            vec3 color=surface*(.12+sun*1.05);
            float rim=pow(1.-max(n.z,0.),3.5);
            color+=vec3(.025,.10,.23)*rim*(.35+sun);
            gl_FragColor=vec4(color,1.);
            #include <colorspace_fragment>
          }`,
      });
      earth = new T.Mesh(geometry, material);
      earth.rotation.y = -1.2;
      axis.add(earth);
      const atmosphere = new T.Mesh(geometry, new T.ShaderMaterial({
        transparent: true, side: T.BackSide, depthWrite: false, blending: T.AdditiveBlending,
        vertexShader: `varying vec3 facing;void main(){facing=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `
          varying vec3 facing;
          void main(){
            vec3 n=normalize(facing);
            float rim=pow(1.-abs(n.z),3.5);
            float sun=.20+.80*max(0.,dot(n,normalize(vec3(-.7,.65,.8))));
            gl_FragColor=vec4(.18,.46,.92,rim*sun*.62);
          }`,
      }));
      atmosphere.scale.setScalar(1.012);
      globe.add(atmosphere);
      renderer.domElement.className = 'journey-rotation-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      stage!.append(renderer.domElement);
      resize();
      stage!.parentElement!.classList.add('planet-ready');
      renderer.domElement.addEventListener('webglcontextlost', fallback);
      resume();
    } catch { fallback(); renderer?.dispose(); }
    finally { loading = false; }
  }
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { void init(); resume(); } else { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '100px' }).observe(stage);
  for (const event of ['visibilitychange', 'skivu-motion-change']) document.addEventListener(event, () => {
    if (paused()) { cancelAnimationFrame(raf); raf = 0; } else { void init(); resume(); }
  });
}
