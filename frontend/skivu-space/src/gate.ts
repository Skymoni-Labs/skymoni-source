import * as T from 'three';
import { createGalaxyFlow } from './galaxy-flow';

// Skivu / Stargate: six original, deterministic light sculptures. No external models.
const host = document.getElementById('gate-viewport');
if (host) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, .1, 120);
  const sculptures: T.Group[] = [];
  const opacityUniforms: { group: number; uniform: T.IUniform<number>; maximum: number }[] = [];
  const ordinaryMaterials: { group: number; material: T.Material & { opacity: number }; maximum: number }[] = [];
  const visibility = [1, 0, 0, 0, 0, 0];
  const cameraTarget = new T.Vector3(0, 0, 14.5);
  let renderer: T.WebGLRenderer | undefined;
  let sceneIndex = Math.max(0, Math.min(5, Number(document.documentElement.dataset.gateScene) || 0));
  let progress = 0, time = 0, previous = 0, budgetAt = 0, frameId = 0;
  let initialized = false, failed = false, visible = true, pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0;
  const galaxyFlow = createGalaxyFlow(host, () => {
    if (renderer && !failed && !document.hidden) {
      try { paint(0, paused()); } catch { fail(); }
    }
  });
  let seed = 10102628;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(.00001, random()))) * Math.cos(random() * Math.PI * 2);
  const mobile = () => coarse.matches || host!.clientWidth < 760;
  const paused = () => reduced.matches || document.hidden || document.documentElement.classList.contains('motion-paused');
  for (let i = 0; i < 6; i++) { const group = new T.Group(); sculptures.push(group); scene.add(group); }
  function remember<M extends T.Material & { opacity: number }>(material: M, group: number, maximum = material.opacity): M {
    ordinaryMaterials.push({ group, material, maximum }); return material;
  }
  function luminousMaterial(group: number, color: string, maximum: number, width = .09) {
    const opacity = { value: 0 };
    opacityUniforms.push({ group, uniform: opacity, maximum });
    return new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      uniforms: { time: { value: 0 }, opacity, tint: { value: new T.Color(color) }, width: { value: width } },
      vertexShader: `varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 p;uniform float time;uniform float opacity;uniform float width;uniform vec3 tint;void main(){float edge=pow(max(0.,sin(p.y*3.14159265)),1.8);float stream=.55+.45*pow(.5+.5*sin(p.x*18.-time*.7),3.);float taper=pow(max(0.,sin(p.x*3.14159265)),.48);gl_FragColor=vec4(tint,edge*stream*taper*opacity);}`,
    });
  }
  const animatedMaterials: T.ShaderMaterial[] = [];
  function ribbonGeometry(curve: T.Curve<T.Vector3>, width: number, segments = 160) {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, p = curve.getPoint(t), direction = curve.getTangent(t).normalize();
      const normal = new T.Vector3().crossVectors(direction, new T.Vector3(0, 0, 1)).normalize();
      for (const side of [-1, 1]) { const v = p.clone().addScaledVector(normal, side * width * .5); positions.push(v.x, v.y, v.z); uvs.push(t, (side + 1) / 2); }
      if (i < segments) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    }
    return new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(positions, 3)).setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)).setIndex(indices);
  }

  // 00 / A vast aperture: fine illuminated accretion strands, an empty heart.
  const aperture = new T.Group(); sculptures[0].add(aperture);
  aperture.rotation.set(.98, -.08, .38);
  const apertureOpacity = { value: 1 }; opacityUniforms.push({ group: 0, uniform: apertureOpacity, maximum: .18 });
  const apertureMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { time: { value: 0 }, opacity: apertureOpacity },
    vertexShader: `varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 p;uniform float time;uniform float opacity;
      float hash(float n){return fract(sin(n*12.9898)*43758.5453);}
      void main(){float r=length(p),a=atan(p.y,p.x);float inner=smoothstep(1.91,2.02,r);float outer=1.-smoothstep(3.5,4.3,r);
      float fine=pow(.5+.5*sin(r*242.+sin(a*3.-time*.19)*.9),8.);float striation=.25+fine*.55+hash(floor(r*710.))*.14;
      float band=exp(-pow((r-2.16)*4.2,2.))*.46+exp(-pow((r-2.6)*1.7,2.))*.13;
      float arc=.42+.58*pow(.5+.5*cos(a+1.25),3.);float river=.65+.35*sin(a*5.-time*.27+r*7.);
      vec3 ice=vec3(.65,.85,.94),silver=vec3(.88,.94,1.),gold=vec3(.92,.8,.61);
      vec3 col=mix(ice,silver,fine*.5);col=mix(col,gold,pow(.5+.5*cos(a+1.25),8.)*.34);
      float glow=exp(-pow((r-2.045)*42.,2.))*.52;gl_FragColor=vec4(col,(band*striation*arc*river+glow)*inner*outer*opacity);}`,
  }); animatedMaterials.push(apertureMaterial);
  aperture.add(new T.Mesh(new T.RingGeometry(1.91, 4.3, 256, 8), apertureMaterial));
  // The hero artwork already supplies its empty aperture. Do not paint over it.
  const darkMaterial = remember(new T.MeshBasicMaterial({ color: '#01040a', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }), 0);
  const darkHeart = new T.Mesh(new T.CircleGeometry(1.98, 160), darkMaterial); darkHeart.position.z = -.018; aperture.add(darkHeart);
  const lensOpacity = { value: 0 }; opacityUniforms.push({ group: 0, uniform: lensOpacity, maximum: .045 });
  const lensMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { opacity: lensOpacity },
    vertexShader: `varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 p;uniform float opacity;void main(){float r=length(p),a=atan(p.y,p.x);float core=exp(-pow((r-2.095)*52.,2.));float veil=exp(-pow((r-2.09)*12.,2.))*.08;gl_FragColor=vec4(.7,.9,1.,(core+veil)*(.3+.7*pow(.5+.5*sin(a),2.))*opacity);}`,
  });
  aperture.add(new T.Mesh(new T.RingGeometry(1.98, 2.24, 240, 3), lensMaterial));
  const dustPositions: number[] = [];
  for (let i = 0; i < 2900; i++) { const angle = random() * Math.PI * 2, radius = 2.04 + Math.pow(random(), 1.4) * 2.1; dustPositions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, gaussian() * .035); }
  const dustMaterial = remember(new T.PointsMaterial({ color: '#d3e0e6', size: .007, transparent: true, opacity: .26, depthWrite: false, blending: T.AdditiveBlending }), 0);
  const apertureDust = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(dustPositions, 3)), dustMaterial); aperture.add(apertureDust);

  // 01 / Photon rivers: long coherent streams, with light following a curved route.
  const photonCurves: T.CatmullRomCurve3[] = [];
  const photonHeads: T.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const y = (i - 2) * .38;
    const curve = new T.CatmullRomCurve3([new T.Vector3(-5, -2 + y, -1), new T.Vector3(-2.8, -1.1 + y, 1.2), new T.Vector3(-.2, .2 + y, .2), new T.Vector3(2.2, 1.1 + y, -.9), new T.Vector3(4.7, 1.9 + y, -2)]);
    photonCurves.push(curve);
    const material = luminousMaterial(1, i % 2 ? '#b8b8ec' : '#b6e6ec', .36, .07); animatedMaterials.push(material);
    sculptures[1].add(new T.Mesh(ribbonGeometry(curve, .045 + i * .008), material));
    const lineMaterial = remember(new T.LineBasicMaterial({ color: '#9ac9d9', transparent: true, opacity: .1 }), 1);
    sculptures[1].add(new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(130)), lineMaterial));
    const headMaterial = remember(new T.MeshBasicMaterial({ color: '#d9f5f8', transparent: true, opacity: .65 }), 1);
    const head = new T.Mesh(new T.SphereGeometry(.021, 12, 8), headMaterial); sculptures[1].add(head); photonHeads.push(head);
  }
  const routeNodes: number[] = [];
  for (let i = 0; i < 26; i++) { const p = photonCurves[i % 5].getPoint(.12 + random() * .76); routeNodes.push(p.x, p.y, p.z); }
  sculptures[1].add(new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(routeNodes, 3)), remember(new T.PointsMaterial({ color: '#d0e7ee', size: .035, transparent: true, opacity: .46, depthWrite: false }), 1)));

  // 02 / Binary halos: a gentle, open nest for the brand's cloud character.
  const halos: T.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const halo = new T.Group(); halo.rotation.set(.15 + i * .34, -.35 + i * .28, i * .65); sculptures[2].add(halo); halos.push(halo);
    const opacity = { value: 0 }; opacityUniforms.push({ group: 2, uniform: opacity, maximum: i === 1 ? .52 : .26 });
    const material = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      uniforms: { time: { value: 0 }, opacity, hue: { value: i } },
      vertexShader: `varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 p;uniform float opacity;uniform float time;uniform float hue;void main(){float r=length(p),a=atan(p.y,p.x);float core=exp(-pow((r-2.13)*75.,2.));float haze=exp(-pow((r-2.13)*14.,2.))*.1;float arc=.25+.75*pow(.5+.5*cos(a-time*.08+hue*2.),5.);vec3 col=mix(vec3(.69,.79,.96),vec3(.81,.68,.93),hue*.25);gl_FragColor=vec4(col,(core+haze)*arc*opacity);}`,
    }); animatedMaterials.push(material);
    halo.add(new T.Mesh(new T.RingGeometry(1.95, 2.3, 224, 3), material));
  }
  const haloSparks: T.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const material = remember(new T.MeshBasicMaterial({ color: i ? '#d6c6f1' : '#c4e9f2', transparent: true, opacity: .78 }), 2);
    const spark = new T.Mesh(new T.SphereGeometry(.055, 16, 12), material); sculptures[2].add(spark); haloSparks.push(spark);
  }

  // 03 / Aurora glass: broad translucent light, not another circular planet.
  const ribbons: T.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const offset = i * .38;
    const curve = new T.CatmullRomCurve3([new T.Vector3(-4.5, -1.8 + offset, -1.1), new T.Vector3(-1.7, -.9 + offset, .9), new T.Vector3(.4, .4 + offset, -.2), new T.Vector3(2.2, .2 + offset, -1), new T.Vector3(4.6, 2.3 + offset, -2.2)]);
    const material = luminousMaterial(3, ['#82d5df', '#a8bfe8', '#c0addf', '#b1c6e9', '#b0e0cf'][i], .13 + (i % 2) * .06, 1);
    animatedMaterials.push(material);
    const ribbon = new T.Mesh(ribbonGeometry(curve, .5 + i * .12, 180), material); sculptures[3].add(ribbon); ribbons.push(ribbon);
  }

  // 04 / An open constellation: sparse branches, each node has breathing room.
  const constellation = new T.Group(); sculptures[4].add(constellation);
  const branchPositions: T.Vector3[] = [new T.Vector3(0, 0, 0)];
  const lineVertices: number[] = [];
  for (let branch = 0; branch < 5; branch++) {
    const baseAngle = branch / 5 * Math.PI * 2 + .2;
    let parent = branchPositions[0];
    for (let step = 1; step <= 3; step++) {
      const a = baseAngle + (random() - .5) * .4;
      const p = new T.Vector3(Math.cos(a) * step * 1.13, Math.sin(a) * step * .84, (random() - .5) * 1.4);
      branchPositions.push(p); lineVertices.push(parent.x, parent.y, parent.z, p.x, p.y, p.z); parent = p;
    }
  }
  constellation.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(lineVertices, 3)), remember(new T.LineBasicMaterial({ color: '#a2d8d4', transparent: true, opacity: .16 }), 4)));
  const nodeGeometry = new T.SphereGeometry(1, 18, 12);
  branchPositions.forEach((p, i) => {
    const material = remember(new T.MeshBasicMaterial({ color: i % 3 === 0 ? '#e2ede4' : '#a8d4d8', transparent: true, opacity: i === 0 ? .82 : .62 }), 4);
    const node = new T.Mesh(nodeGeometry, material); node.position.copy(p); node.scale.setScalar(i === 0 ? .075 : i % 3 === 0 ? .044 : .025); constellation.add(node);
    if (i % 3 === 0) {
      const halo = new T.Mesh(new T.RingGeometry(.12, .126, 48), remember(new T.MeshBasicMaterial({ color: '#a1d6d0', transparent: true, opacity: .14, side: T.DoubleSide, depthWrite: false }), 4)); halo.position.copy(p); constellation.add(halo);
    }
  });

  // 05 / A final horizon. The planet appears once, as an immense dark curve.
  const horizonMaterial = remember(new T.MeshBasicMaterial({ color: '#020611', transparent: true, opacity: 1 }), 5);
  const horizon = new T.Mesh(new T.SphereGeometry(9, 96, 64), horizonMaterial); horizon.position.set(0, -10.2, -7); sculptures[5].add(horizon);
  const horizonOpacity = { value: 0 }; opacityUniforms.push({ group: 5, uniform: horizonOpacity, maximum: .75 });
  const horizonAtmosphere = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending,
    uniforms: { opacity: horizonOpacity },
    vertexShader: `varying vec3 n;varying vec3 w;void main(){n=normalize(mat3(modelMatrix)*normal);w=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 n;varying vec3 w;uniform float opacity;void main(){vec3 N=normalize(n),V=normalize(cameraPosition-w);float rim=pow(1.-abs(dot(N,V)),5.8);float light=.18+.82*pow(max(0.,dot(N,normalize(vec3(-.24,1.,.35)))),4.);vec3 col=mix(vec3(.4,.66,.95),vec3(.95,.82,.63),light*.55);gl_FragColor=vec4(col,rim*light*opacity);}`,
  });
  const horizonShell = new T.Mesh(new T.SphereGeometry(9.05, 96, 64), horizonAtmosphere); horizonShell.position.copy(horizon.position); sculptures[5].add(horizonShell);

  // Fine distant stars remain shared; no full-screen procedural noise shader.
  const starPositions: number[] = [], starSizes: number[] = [], starPhases: number[] = [];
  for (let i = 0; i < 1000; i++) { starPositions.push((random() - .5) * 74, (random() - .5) * 45, -12 - random() * 52); starSizes.push(.7 + Math.pow(random(), 5) * 3); starPhases.push(random() * Math.PI * 2); }
  const starsMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { time: { value: 0 }, ratio: { value: 1 } },
    vertexShader: `attribute float size;attribute float phase;uniform float time;uniform float ratio;varying float a;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*30./(-p.z),.6,3.)*ratio;a=.24+.11*sin(time*.2+phase);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float a;void main(){float r=length(gl_PointCoord-.5);gl_FragColor=vec4(.73,.84,1.,exp(-r*r*27.)*a);}`,
  }); animatedMaterials.push(starsMaterial);
  const starGeometry = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(starPositions, 3)).setAttribute('size', new T.Float32BufferAttribute(starSizes, 1)).setAttribute('phase', new T.Float32BufferAttribute(starPhases, 1));
  const stars = new T.Points(starGeometry, starsMaterial); scene.add(stars);

  function positionSculptures() {
    const narrow = mobile();
    sculptures[0].position.set(narrow ? .1 : .8, narrow ? 2.5 : .4, narrow ? -2.4 : -4.2);
    sculptures[0].scale.setScalar(narrow ? 1.2 : 2.05);
    sculptures[1].position.set(narrow ? .4 : 2.7, narrow ? 3.1 : .1, -2);
    sculptures[1].scale.setScalar(narrow ? .68 : .88);
    sculptures[2].position.set(narrow ? .4 : 3.25, narrow ? -2.7 : .2, -1.5);
    sculptures[2].scale.setScalar(narrow ? .82 : 1.1);
    sculptures[3].position.set(narrow ? .2 : 3, narrow ? 2.7 : -.6, -2);
    sculptures[3].scale.setScalar(narrow ? .73 : 1.02);
    sculptures[4].position.set(narrow ? .1 : 3.1, narrow ? 3.1 : .3, -1.7);
    sculptures[4].scale.setScalar(narrow ? .65 : 1.05);
    sculptures[5].position.set(0, narrow ? -1 : -.8, 0);
  }
  function paint(dt: number, snap = false) {
    const blend = snap ? 1 : 1 - Math.exp(-dt * 2.4);
    for (let i = 0; i < 6; i++) { visibility[i] = T.MathUtils.lerp(visibility[i], i === sceneIndex ? 1 : 0, blend); sculptures[i].visible = visibility[i] > .002 && !(i === 0 && galaxyFlow.ready); }
    opacityUniforms.forEach(item => { item.uniform.value = visibility[item.group] * item.maximum * (item.group === 0 && galaxyFlow.ready ? 0 : 1); });
    ordinaryMaterials.forEach(item => { item.material.opacity = visibility[item.group] * item.maximum * (item.group === 0 && galaxyFlow.ready ? 0 : 1); });
    smoothX = T.MathUtils.lerp(smoothX, pointerX, blend * .6); smoothY = T.MathUtils.lerp(smoothY, pointerY, blend * .6);
    cameraTarget.set(smoothX * .22, -smoothY * .15, sceneIndex === 5 ? 15.5 : 14.5);
    camera.position.lerp(cameraTarget, blend); camera.lookAt(0, 0, 0);
    animatedMaterials.forEach(material => { material.uniforms.time.value = time; });
    apertureDust.rotation.z = time * .013;
    aperture.rotation.z = .38 + Math.sin(time * .025) * .012;
    aperture.rotation.y = -.08 + Math.sin(time * .02) * .016;
    photonHeads.forEach((head, i) => { head.position.copy(photonCurves[i].getPoint((time * .025 + i * .18) % 1)); });
    halos.forEach((halo, i) => { halo.rotation.z = i * .65 + Math.sin(time * .028 + i) * .09; });
    haloSparks.forEach((spark, i) => { const a = time * .045 + i * Math.PI; spark.position.set(Math.cos(a) * 2.13, Math.sin(a) * 1.9, Math.sin(a) * .5); });
    ribbons.forEach((ribbon, i) => { ribbon.rotation.y = Math.sin(time * .025 + i * .4) * .09; ribbon.position.y = Math.sin(time * .045 + i) * .04; });
    constellation.rotation.y = Math.sin(time * .035) * .12;
    constellation.rotation.z = Math.sin(time * .018) * .035;
    stars.rotation.y = smoothX * .003 + Math.sin(time * .009) * .004;
    renderer!.clear();
    if (galaxyFlow.update(time, Math.max(visibility[0], visibility[5]))) {
      renderer!.render(galaxyFlow.scene, galaxyFlow.camera);
      renderer!.clearDepth();
    }
    renderer!.render(scene, camera);
  }
  function size() {
    if (!renderer || failed) return;
    const w = host!.clientWidth, h = host!.clientHeight; if (!w || !h) return;
    const ratio = Math.min(devicePixelRatio || 1, mobile() ? 1 : 1.35);
    renderer.setPixelRatio(ratio); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); starsMaterial.uniforms.ratio.value = ratio;
    positionSculptures(); paint(0, true);
  }
  function fail() {
    failed = true; cancelAnimationFrame(frameId); frameId = 0;
    renderer?.domElement.remove(); renderer?.dispose(); galaxyFlow.dispose(); host!.classList.remove('webgl-ready'); host!.classList.add('webgl-failed');
  }
  function frame(now: number) {
    frameId = 0; if (!visible || paused() || failed) return;
    const interval = 1000 / (mobile() ? 24 : 30), pending = now - budgetAt;
    if (pending >= interval) { const dt = Math.min((now - previous) / 1000, .08); time += dt; previous = now; budgetAt = now - pending % interval; try { paint(dt); } catch { fail(); return; } }
    frameId = requestAnimationFrame(frame);
  }
  function resume() {
    if (!renderer || frameId || !visible || paused() || failed) return;
    previous = budgetAt = performance.now(); frameId = requestAnimationFrame(frame);
  }
  function init() {
    if (initialized || failed) return; initialized = true;
    if (new URLSearchParams(location.search).get('gate') === 'css') { host!.classList.add('webgl-failed'); return; }
    try {
      renderer = new T.WebGLRenderer({ alpha: true, antialias: !mobile(), powerPreference: 'low-power' });
      renderer.setClearColor(0, 0); renderer.outputColorSpace = T.SRGBColorSpace; renderer.autoClear = false;
      renderer.debug.onShaderError = () => { throw new Error('Stargate shader unavailable'); };
      renderer.domElement.setAttribute('aria-hidden', 'true'); host!.append(renderer.domElement); renderer.domElement.addEventListener('webglcontextlost', fail);
      camera.position.set(0, 0, 14.5); size(); host!.classList.add('webgl-ready'); document.dispatchEvent(new Event('gate:ready')); resume();
    } catch { fail(); }
  }
  document.addEventListener('gate:scene', event => {
    const detail = (event as CustomEvent<{ scene: number; progress?: number }>).detail;
    if (!detail || !Number.isFinite(detail.scene)) return;
    sceneIndex = T.MathUtils.clamp(Math.round(detail.scene), 0, 5); progress = T.MathUtils.clamp(detail.progress || 0, 0, 1);
    // Progress is reserved for timing; every section retains a stable composition.
    if (paused() && renderer && !failed) paint(0, true); resume();
  });
  const sync = () => {
    if (paused()) {
      cancelAnimationFrame(frameId); frameId = 0;
      // The page recentres its CSS parallax after dispatching the pause event.
      // Repaint once afterwards, with frozen time, to keep the image mask aligned.
      Promise.resolve().then(() => { if (renderer && !failed && !document.hidden && paused()) paint(0); });
    } else { if (visible) init(); resume(); }
  };
  new ResizeObserver(size).observe(host);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) { init(); resume(); } else { cancelAnimationFrame(frameId); frameId = 0; } }, { rootMargin: '100px' }).observe(host);
  ['visibilitychange', 'skivu-motion-change', 'skivu:motion'].forEach(name => document.addEventListener(name, sync)); reduced.addEventListener('change', sync);
  window.addEventListener('pointermove', event => { if (event.pointerType !== 'mouse' || paused()) return; pointerX = event.clientX / Math.max(innerWidth, 1) - .5; pointerY = event.clientY / Math.max(innerHeight, 1) - .5; }, { passive: true });
  document.addEventListener('pointerleave', () => { pointerX = pointerY = 0; });
  init();
}
