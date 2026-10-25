import * as T from 'three';
import { planetTextures, planetSurfaceGLSL } from './planet-surface';

// The illustrated atmosphere, sunrise, moon and galaxy stay fixed. A global
// surface/cloud map rotates inside the matching curved planetary horizon.
const host = document.querySelector<HTMLElement>('.journey-panorama');
if (host) {
  let renderer: T.WebGLRenderer | undefined;
  let material: T.ShaderMaterial;
  let visible = false, loading = false, failed = false, raf = 0, last = 0, elapsed = 0;
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const paused = () => document.hidden || document.documentElement.classList.contains('motion-paused');
  function resize() {
    if (!renderer) return;
    const w = host!.clientWidth, h = host!.clientHeight;
    const scale = Math.max(w / 1672, h / 941);
    const p = getComputedStyle(host!).backgroundPosition.split(' ');
    material.uniforms.cover.value.set(w / scale, h / scale,
      (w - 1672 * scale) * parseFloat(p[0]) / 100 / scale,
      (h - 941 * scale) * parseFloat(p[1] || '60%') / 100 / scale);
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 640 ? 1 : 1.4));
    renderer.setSize(w, h);
    renderer.render(scene, camera);
  }
  function draw(now: number) {
    raf = 0;
    if (!visible || paused() || !renderer) return;
    if (now - last >= (innerWidth < 640 ? 50 : 33)) {
      elapsed += last ? Math.min((now - last) / 1000, .1) : 0;
      last = now;
      material.uniforms.turn.value = elapsed * .085;
      material.uniforms.mixIn.value = 1 - Math.exp(-elapsed / 2);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(draw);
  }
  function resume() {
    if (renderer && visible && !paused() && !raf) { last = 0; raf = requestAnimationFrame(draw); }
  }
  async function init() {
    if (renderer || loading || failed || !visible) return;
    loading = true;
    try {
      const [texture, [land, cloud]] = await Promise.all([
        new T.TextureLoader().loadAsync(new URL('assets/universe-finale-20261025.webp', document.baseURI).href), planetTextures(),
      ]);
      texture.colorSpace = T.SRGBColorSpace;
      renderer = new T.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.setClearColor(0, 0);
      material = new T.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false,
        uniforms: { plate: { value: texture }, landMap: { value: land }, cloudMap: { value: cloud }, cover: { value: new T.Vector4() }, turn: { value: 0 }, mixIn: { value: 0 } },
        vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
        fragmentShader: `
          uniform sampler2D plate;uniform vec4 cover;uniform float turn;uniform float mixIn;varying vec2 vUv;
          ${planetSurfaceGLSL}
          float horizon(float x){return 574.+.000103*(x-1470.)*(x-1470.);}
          void main(){
            vec2 px=vec2(vUv.x,1.-vUv.y)*cover.xy-cover.zw;
            float depth=px.y-horizon(px.x);
            float mask=smoothstep(25.,95.,depth);
            if(mask<.001){gl_FragColor=vec4(0.);return;}
            vec2 xy=vec2((px.x-1470.)/4626.,(5200.-px.y)/4626.);
            vec3 n=normalize(vec3(xy,sqrt(max(.001,1.-dot(xy,xy)))));
            vec3 tilted=vec3(n.x,.342*n.y-.94*n.z,.94*n.y+.342*n.z);
            vec3 surface=planetarySurface(normalize(tilted),turn-1.2);
            vec3 original=texture2D(plate,vec2(px.x/1672.,1.-px.y/941.)).rgb;
            // Preserve the frame's original warm/cool lighting and deep shadows.
            vec3 light=mix(vec3(.34,.49,.74),vec3(1.18,1.06,.94),1.-clamp(px.x/1672.,0.,1.));
            vec3 color=mix(original,surface*light,.92*mixIn);
            gl_FragColor=vec4(color,mask);
            #include <colorspace_fragment>
          }`,
      });
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), material));
      renderer.domElement.className = 'journey-rotation-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      host!.append(renderer.domElement); resize(); resume();
      renderer.domElement.addEventListener('webglcontextlost', () => {
        failed = true; cancelAnimationFrame(raf); raf = 0; renderer?.domElement.remove();
      });
    } catch { failed = true; renderer?.domElement.remove(); renderer?.dispose(); }
    finally { loading = false; }
  }
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { void init(); resume(); } else { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '100px' }).observe(host);
  for (const event of ['visibilitychange', 'skivu-motion-change']) document.addEventListener(event, () => {
    if (paused()) { cancelAnimationFrame(raf); raf = 0; } else { void init(); resume(); }
  });
}
