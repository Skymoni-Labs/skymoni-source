import * as T from 'three';

// Original procedural art: no models, remote services or device permissions.
const host = document.getElementById('cosmos-viewport');
const story = document.querySelector<HTMLElement>('.cosmos-journey');
if (host && story) {
  type Mode = { camera: [number, number, number]; color: string; scale: number; moons: number; network: number; rings: number };
  const modes: Record<string, Mode> = {
    overview: { camera: [.2, 1.6, 12.2], color: '#92d3f4', scale: 1, moons: .15, network: 0, rings: 1 },
    conversation: { camera: [1.1, 2.1, 10.8], color: '#8fe7e8', scale: .94, moons: 0, network: .15, rings: 1.25 },
    characters: { camera: [3.7, 2.1, 13.3], color: '#b5acf4', scale: .86, moons: 1, network: 0, rings: .7 },
    appearance: { camera: [-2.4, 1.1, 10.8], color: '#bd9de9', scale: 1, moons: .3, network: 0, rings: 1.1 },
    ecosystem: { camera: [1.8, 4.6, 14.1], color: '#a3e0d1', scale: .76, moons: .2, network: 1, rings: .8 },
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 1, .1, 90);
  const world = new T.Group(); scene.add(world);
  const planetGroup = new T.Group(); world.add(planetGroup);
  const targetCamera = new T.Vector3();
  const targetColor = new T.Color();
  const color = new T.Color();
  const look = new T.Vector3(0, 0, 0);
  let renderer: T.WebGLRenderer | undefined;
  let visible = false, initialized = false, failed = false, raf = 0;
  let last = 0, renderedAt = 0, elapsed = 0, pointerX = 0, pointerY = 0;
  let key = story.dataset.activeChapter || 'overview';
  let currentScale = 1, moonOpacity = 0, networkOpacity = 0, ringIntensity = 1, transitionAge = 3;
  const paused = () => document.hidden || reduced.matches || document.documentElement.classList.contains('motion-paused');
  const geometry = new T.SphereGeometry(2.35, 112, 64);
  const planetMaterial = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, tint: { value: color }, style: { value: 0 } },
    vertexShader: `varying vec3 p;varying vec3 n;void main(){p=position/2.35;n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec3 p;varying vec3 n;uniform float time;uniform vec3 tint;uniform float style;
      float hash(vec3 q){q=fract(q*.3183099+vec3(.1,.2,.3));q*=17.;return fract(q.x*q.y*q.z*(q.x+q.y+q.z));}
      float noise(vec3 q){vec3 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float fbm(vec3 q){return .57*noise(q)+.28*noise(q*2.07)+.15*noise(q*4.13);}
      void main(){
        vec3 normal=normalize(n);float sun=max(0.,dot(normal,normalize(vec3(-.8,.55,.18))));
        float cloud=fbm(p*6.+vec3(0.,0.,time*.012));
        float bands=sin(p.y*28.+cloud*5.+sin(p.x*5.)*.6);
        float fine=fbm(p*24.+vec3(time*.006,0.,0.));
        float vapor=smoothstep(-.5,.8,bands)*.09+cloud*.76+fine*.12;
        vec3 base=mix(vec3(.016,.026,.069),tint*.40,vapor);
        base=mix(base,vec3(.48,.38,.69)*vapor,style*.28);
        float rim=pow(1.-abs(normal.z),3.3);
        vec3 col=base*(.08+sun*1.7)+tint*rim*(.15+sun*.9);
        float silver=pow(sun,18.)*.26;
        col+=vec3(.73,.84,.92)*silver;
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`,
  });
  const planet = new T.Mesh(geometry, planetMaterial); planet.rotation.z = .22; planetGroup.add(planet);
  const atmosphere = new T.Mesh(new T.SphereGeometry(2.41, 80, 48), new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending,
    uniforms: { tint: { value: color } },
    vertexShader: `varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 n;uniform vec3 tint;void main(){vec3 v=normalize(n);float rim=pow(1.-abs(v.z),3.8);float sun=.12+.88*max(0.,dot(v,normalize(vec3(-.8,.55,.18))));gl_FragColor=vec4(tint,rim*sun*.46);}`,
  }));
  planetGroup.add(atmosphere);
  const ringMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { time: { value: 0 }, tint: { value: color }, strength: { value: 1 }, pulse: { value: 1 } },
    vertexShader: `varying vec2 p;void main(){p=position.xy;vec3 q=position;q.z+=sin(length(p)*8.+atan(p.y,p.x)*3.)*.018;gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.);}`,
    fragmentShader: `varying vec2 p;uniform float time;uniform vec3 tint;uniform float strength;uniform float pulse;void main(){float r=length(p),a=atan(p.y,p.x);float edges=smoothstep(2.72,2.93,r)*(1.-smoothstep(4.35,4.7,r));float filaments=pow(.5+.5*sin(r*28.+sin(a*4.+time*.12)*.7),10.);float grain=fract(sin(dot(floor(p*170.),vec2(12.9898,78.233)))*43758.5453);float dust=.15+.15*filaments+grain*.06;float current=.22+.78*pow(.5+.5*sin(a*2.-time*.16+r*.6),3.);float wave=exp(-pow((r-2.8-pulse*2.)*13.,2.))*(1.-pulse)*.18;gl_FragColor=vec4(mix(tint,vec3(.76,.86,1.),filaments*.25),edges*(dust*current*strength+wave));}`,
  });
  const rings = new T.Mesh(new T.RingGeometry(2.72, 4.7, 192, 5), ringMaterial);
  rings.rotation.set(1.1, -.1, -.22); world.add(rings);
  const orbitMaterial = new T.LineBasicMaterial({ color: '#a7c9e1', transparent: true, opacity: .13 });
  for (const radius of [3.18, 4.82]) {
    const positions: number[] = [];
    for (let i = 0; i <= 180; i++) { const a = i / 180 * Math.PI * 2; positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0); }
    const orbit = new T.Line(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(positions, 3)), orbitMaterial);
    orbit.rotation.copy(rings.rotation); world.add(orbit);
  }
  const moons: T.Mesh[] = [];
  const moonGeometry = new T.SphereGeometry(1, 40, 28);
  scene.add(new T.HemisphereLight('#b9d7f6', '#020611', 1.5));
  const sun = new T.DirectionalLight('#dcecfb', 3); sun.position.set(-4, 5, 6); scene.add(sun);
  for (const radius of [.29, .43, .2]) {
    const mat = new T.MeshStandardMaterial({ color: '#90a6c4', metalness: .24, roughness: .75, transparent: true, opacity: 0 });
    const moon = new T.Mesh(moonGeometry, mat); moon.scale.setScalar(radius); world.add(moon); moons.push(moon);
  }
  let seed = 261026;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const dustPositions: number[] = [];
  for (let i = 0; i < 1800; i++) {
    const a = random() * Math.PI * 2, r = 2.85 + random() * 1.7;
    dustPositions.push(Math.cos(a) * r, Math.sin(a) * r, (random() - .5) * .035);
  }
  const dust = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(dustPositions, 3)), new T.PointsMaterial({ color: '#b8dbec', size: .009, transparent: true, opacity: .4, depthWrite: false }));
  dust.rotation.copy(rings.rotation); world.add(dust);
  const starPositions: number[] = [], sizes: number[] = [], phases: number[] = [];
  for (let i = 0; i < 650; i++) { starPositions.push((random() - .5) * 30, (random() - .5) * 22, -7 - random() * 14); sizes.push(.8 + random() * 1.7); phases.push(random() * 6.28); }
  const starMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { time: { value: 0 }, ratio: { value: 1 } },
    vertexShader: `attribute float size;attribute float phase;varying float alpha;uniform float time;uniform float ratio;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*16./(-mv.z),.6,3.)*ratio;alpha=.25+.2*sin(time*.35+phase);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float alpha;void main(){float r=length(gl_PointCoord-.5);gl_FragColor=vec4(.65,.79,1.,(1.-smoothstep(.05,.5,r))*alpha);}`,
  });
  const starGeometry = new T.BufferGeometry(); starGeometry.setAttribute('position', new T.Float32BufferAttribute(starPositions, 3)); starGeometry.setAttribute('size', new T.Float32BufferAttribute(sizes, 1)); starGeometry.setAttribute('phase', new T.Float32BufferAttribute(phases, 1));
  const stars = new T.Points(starGeometry, starMaterial); scene.add(stars);
  const nodePositions: number[] = [], connections: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const p = new T.Vector3(Math.cos(a) * (3.6 + i % 3 * .25), Math.sin(a * 2) * .65, Math.sin(a) * 3.7);
    nodePositions.push(p.x, p.y, p.z);
    if (i > 0) connections.push(nodePositions[(i - 1) * 3], nodePositions[(i - 1) * 3 + 1], nodePositions[(i - 1) * 3 + 2], p.x, p.y, p.z);
  }
  const nodeMaterial = new T.PointsMaterial({ color: '#b7eceb', size: .09, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
  const nodes = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(nodePositions, 3)), nodeMaterial); world.add(nodes);
  const connectionMaterial = new T.LineBasicMaterial({ color: '#91c2cf', transparent: true, opacity: 0 });
  const network = new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(connections, 3)), connectionMaterial); world.add(network);
  const curve = new T.CatmullRomCurve3([new T.Vector3(-7, 3, -4), new T.Vector3(-3, 2.1, -.5), new T.Vector3(-.8, .7, 3.2), new T.Vector3(4.7, -.8, 1)]);
  const path = curve.getPoints(150), travel = path.map((_, i) => i / 150);
  const meteorMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { phase: { value: 0 } },
    vertexShader: `attribute float travel;varying float t;void main(){t=travel;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float phase;varying float t;void main(){float lag=mod(phase-t+1.,1.);float tail=pow(1.-smoothstep(0.,.14,lag),2.);float gate=smoothstep(0.,.04,phase)*(1.-smoothstep(.94,1.,phase));gl_FragColor=vec4(.68,.88,1.,tail*gate*.95);}`,
  });
  const meteorGeometry = new T.BufferGeometry().setFromPoints(path); meteorGeometry.setAttribute('travel', new T.Float32BufferAttribute(travel, 1));
  const meteor = new T.Line(meteorGeometry, meteorMaterial); world.add(meteor);
  const headMaterial = new T.MeshBasicMaterial({ color: '#e7faff', transparent: true, opacity: .9 });
  const head = new T.Mesh(new T.SphereGeometry(.035, 12, 8), headMaterial); world.add(head);

  function setMode(snap: boolean) {
    const mode = modes[key] || modes.overview;
    targetCamera.set(...mode.camera); targetColor.set(mode.color);
    if (snap) { camera.position.copy(targetCamera); color.copy(targetColor); currentScale = mode.scale; moonOpacity = mode.moons; networkOpacity = mode.network; ringIntensity = mode.rings; planetMaterial.uniforms.style.value = key === 'appearance' ? 1 : 0; }
  }
  function paint(dt: number) {
    const mode = modes[key] || modes.overview;
    const blend = 1 - Math.exp(-dt * 2.8);
    camera.position.lerp(targetCamera, blend); color.lerp(targetColor, blend);
    currentScale = T.MathUtils.lerp(currentScale, mode.scale, blend);
    moonOpacity = T.MathUtils.lerp(moonOpacity, mode.moons, blend);
    networkOpacity = T.MathUtils.lerp(networkOpacity, mode.network, blend);
    ringIntensity = T.MathUtils.lerp(ringIntensity, mode.rings, blend);
    look.set(pointerX * .1, pointerY * -.07, 0); camera.lookAt(look);
    world.rotation.y = Math.sin(elapsed * .055) * .05 + pointerX * .025;
    planetGroup.scale.setScalar(currentScale);
    planet.rotation.y = elapsed * .032;
    planetMaterial.uniforms.time.value = elapsed;
    planetMaterial.uniforms.style.value = T.MathUtils.lerp(planetMaterial.uniforms.style.value, key === 'appearance' ? 1 : 0, blend);
    ringMaterial.uniforms.time.value = elapsed; ringMaterial.uniforms.strength.value = ringIntensity;
    transitionAge += dt; ringMaterial.uniforms.pulse.value = Math.min(1, transitionAge / 2.4);
    rings.rotation.z = -.22 + Math.sin(elapsed * .07) * .035;
    dust.rotation.copy(rings.rotation);
    starMaterial.uniforms.time.value = elapsed;
    moons.forEach((moon, i) => {
      const a = elapsed * (.055 + i * .009) + i * 2.25 + .35;
      moon.position.set(Math.cos(a) * (3.15 + i * .55), .45 + Math.sin(a * 1.1) * .65, Math.sin(a) * (3.1 + i * .4));
      (moon.material as T.MeshStandardMaterial).opacity = moonOpacity;
      moon.visible = moonOpacity > .01;
    });
    nodeMaterial.opacity = networkOpacity * .9; connectionMaterial.opacity = networkOpacity * .16;
    const phase = (elapsed * .047 + .17) % 1; meteorMaterial.uniforms.phase.value = phase;
    head.position.copy(curve.getPoint(phase)); headMaterial.opacity = Math.min(phase / .04, (1 - phase) / .06, 1) * .9;
    renderer!.render(scene, camera);
  }
  function size() {
    if (!renderer) return;
    const w = host!.clientWidth, h = host!.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, coarse.matches || w < 560 ? 1 : 1.35);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); starMaterial.uniforms.ratio.value = dpr;
    paint(0);
  }
  function fail() {
    failed = true; cancelAnimationFrame(raf); raf = 0;
    renderer?.domElement.remove(); host!.classList.remove('webgl-ready');
  }
  function frame(now: number) {
    raf = 0;
    if (!visible || paused() || failed) return;
    const interval = host!.clientWidth < 560 ? 1000 / 24 : 1000 / 30;
    const pending = now - last;
    if (pending >= interval) {
      const dt = Math.min((now - renderedAt) / 1000, .08);
      elapsed += dt; renderedAt = now; last = now - pending % interval;
      try { paint(dt); } catch { fail(); return; }
    }
    raf = requestAnimationFrame(frame);
  }
  function resume() {
    if (!renderer || !visible || paused() || failed || raf) return;
    last = renderedAt = performance.now(); raf = requestAnimationFrame(frame);
  }
  function init() {
    if (initialized || failed) return;
    initialized = true;
    if (new URLSearchParams(location.search).get('cosmos') === 'css') return;
    try {
      renderer = new T.WebGLRenderer({ alpha: true, antialias: !coarse.matches && host!.clientWidth > 560, powerPreference: 'low-power' });
      renderer.outputColorSpace = T.SRGBColorSpace; renderer.setClearColor(0, 0);
      renderer.debug.onShaderError = () => { throw new Error('Cosmic art shader unavailable'); };
      renderer.domElement.setAttribute('aria-hidden', 'true'); host!.append(renderer.domElement);
      setMode(true); size(); host!.classList.add('webgl-ready');
      renderer.domElement.addEventListener('webglcontextlost', fail);
      document.dispatchEvent(new Event('skivu-cosmos-ready')); resume();
    } catch { fail(); renderer?.dispose(); }
  }
  document.addEventListener('skivu-cosmos-change', (event) => {
    const next = (event as CustomEvent<{chapter: string}>).detail.chapter;
    if (!Object.prototype.hasOwnProperty.call(modes, next)) return;
    key = next; transitionAge = paused() ? 3 : 0; setMode(paused()); if (renderer) paint(0); resume();
  });
  new ResizeObserver(size).observe(host);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { init(); resume(); } else { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '120px' }).observe(host);
  const syncMotion = () => {
    if (paused()) { cancelAnimationFrame(raf); raf = 0; }
    else { if (visible) init(); resume(); }
  };
  document.addEventListener('visibilitychange', syncMotion);
  document.addEventListener('skivu-motion-change', syncMotion);
  reduced.addEventListener('change', syncMotion);
  host.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || paused()) return;
    const box = host!.getBoundingClientRect(); pointerX = (event.clientX - box.left) / box.width - .5; pointerY = (event.clientY - box.top) / box.height - .5;
  }, { passive: true });
  host.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
}
