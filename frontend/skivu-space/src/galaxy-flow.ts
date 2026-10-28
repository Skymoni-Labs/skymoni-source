import * as T from 'three';

/** Advect the existing artwork locally along its own elliptical river.
 * The background's CSS rectangle is the source of truth for crop and parallax.
 * Two phase-shifted samples hide each reset without rotating the photograph.
 */
export function createGalaxyFlow(host: HTMLElement, onReady: () => void) {
  const plate = document.querySelector<HTMLElement>('.sky-gate');
  const flowScene = new T.Scene();
  const flowCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let ready = false;
  let disposed = false;
  const material = new T.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      artwork: { value: null as T.Texture | null },
      imageOrigin: { value: new T.Vector2() },
      imageExtent: { value: new T.Vector2(1672, 941) },
      viewport: { value: new T.Vector2(1, 1) },
      phase: { value: 0 },
      strength: { value: 0 },
      opacity: { value: 0 },
    },
    vertexShader: `varying vec2 screenUv;
      void main(){screenUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `
      precision highp float;
      varying vec2 screenUv;
      uniform sampler2D artwork;
      uniform vec2 imageOrigin,imageExtent,viewport;
      uniform float phase,strength,opacity;
      const vec2 imageSize=vec2(1672.,941.);
      const float TAU=6.28318530718;
      void main(){
        vec2 screenPx=vec2(screenUv.x,1.-screenUv.y)*viewport;
        vec2 imageUv=(screenPx-imageOrigin)/imageExtent;
        if(any(lessThan(imageUv,vec2(0.)))||any(greaterThan(imageUv,vec2(1.))))discard;
        vec2 px=imageUv*imageSize;
        // Pixel-calibrated centre and axes of the original tilted galaxy.
        float c=.93358043,s=-.35836795;
        vec2 d=px-vec2(900.,374.);
        vec2 local=vec2(c*d.x+s*d.y,-s*d.x+c*d.y);
        vec2 q=local/vec2(680.,207.);
        float r=length(q),angle=atan(q.y,q.x);
        float band=smoothstep(.76,.98,r)*(1.-smoothstep(1.58,2.08,r));
        // Foreground moons, rocks and the outer star field stay fixed.
        band*=1.-smoothstep(680.,790.,px.y);
        band*=smoothstep(.85,1.2,length((px-vec2(171.,784.))/vec2(76.,82.)));
        band*=smoothstep(.8,1.4,length((px-vec2(309.,794.))/vec2(20.,24.)));
        band*=smoothstep(0.,.018,imageUv.x)*(1.-smoothstep(.982,1.,imageUv.x));
        band*=smoothstep(0.,.015,imageUv.y)*(1.-smoothstep(.98,1.,imageUv.y));
        if(band*opacity<.001)discard;
        vec2 tangent=vec2(-sin(angle)*680.,cos(angle)*207.);
        tangent=normalize(vec2(c*tangent.x-s*tangent.y,s*tangent.x+c*tangent.y));
        float shear=.68+.32*smoothstep(.85,1.65,r);
        vec2 velocity=tangent*(48.*strength*shear)/imageSize;
        float a=phase,b=fract(phase+.5),blend=abs(phase*2.-1.);
        vec2 uvA=imageUv-velocity*(a-.5),uvB=imageUv-velocity*(b-.5);
        vec3 colA=texture2D(artwork,vec2(uvA.x,1.-uvA.y)).rgb;
        vec3 colB=texture2D(artwork,vec2(uvB.x,1.-uvB.y)).rgb;
        vec3 color=mix(colA,colB,blend);
        float glint=sin(angle*7.-phase*TAU+r*5.)*.012*strength;
        color*=1.+glint;
        // Match the existing CSS vignette, so the moving mask has no light rim.
        float y=1.-screenUv.y;
        float linearShade=y<.3?mix(.360784,0.,y/.3):y<.6?mix(0.,.14902,(y-.3)/.3):mix(.14902,.866667,(y-.6)/.4);
        float radialShade=clamp((length((screenUv-.5)*1.414214)-.3)/.7,0.,1.)*.501961;
        float shade=1.-(1.-linearShade)*(1.-radialShade);
        color=mix(color,vec3(2.,5.,13.)/255.,shade);
        gl_FragColor=vec4(color,band*opacity);
      }`,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  flowScene.add(mesh);
  host.dataset.galaxyFlow = 'loading';
  const texture = new T.TextureLoader().load(
    new URL('assets/stargate-panorama-20261026.webp', document.baseURI).href,
    loaded => {
      if (disposed) { loaded.dispose(); return; }
      // Shader intentionally composites in sRGB, matching the CSS background.
      loaded.colorSpace = T.NoColorSpace;
      material.uniforms.artwork.value = loaded;
      ready = true;
      host.dataset.galaxyFlow = 'ready';
      onReady();
    }, undefined,
    () => { host.dataset.galaxyFlow = 'unavailable'; },
  );
  function update(time: number, visibility: number) {
    if (!ready || !plate || visibility < .002) return false;
    const rect = plate.getBoundingClientRect();
    const style = getComputedStyle(plate);
    const alpha = Number(style.opacity) * visibility;
    if (alpha < .002 || !rect.width || !rect.height) return false;
    const scale = style.backgroundSize.includes('auto')
      ? rect.height / 941 : Math.max(rect.width / 1672, rect.height / 941);
    const width = 1672 * scale, height = 941 * scale;
    const [x, y] = style.backgroundPosition.split(' ').map(value => Number.parseFloat(value) / 100);
    material.uniforms.imageOrigin.value.set(rect.left + (rect.width - width) * x, rect.top + (rect.height - height) * y);
    material.uniforms.imageExtent.value.set(width, height);
    material.uniforms.viewport.value.set(host.clientWidth, host.clientHeight);
    material.uniforms.phase.value = (time % 18) / 18;
    material.uniforms.strength.value = 1 - Math.exp(-time / 2.5);
    material.uniforms.opacity.value = alpha;
    return true;
  }
  return {
    scene: flowScene, camera: flowCamera,
    get ready() { return ready; }, update,
    dispose() { disposed = true; texture.dispose(); material.dispose(); mesh.geometry.dispose(); },
  };
}
