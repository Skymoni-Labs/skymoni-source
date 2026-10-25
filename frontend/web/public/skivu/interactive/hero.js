import{B as e,D as t,F as n,G as r,I as i,L as a,N as o,P as s,b as c,t as l,w as u}from"./chunks/three.module-B12vqkaj.js";var d;function f(){if(!d){let t=new e;d=Promise.all([t.loadAsync(new URL(`assets/earth-blue-marble-surface.webp`,document.baseURI).href),t.loadAsync(new URL(`assets/earth-blue-marble-clouds.webp`,document.baseURI).href)]).then(([e,t])=>(e.colorSpace=s,e.wrapS=t.wrapS=o,e.anisotropy=t.anisotropy=2,[e,t]))}return d}var p=`
  uniform sampler2D landMap;
  uniform sampler2D cloudMap;
  vec3 planetarySurface(vec3 n, float angle){
    float c=cos(angle),s=sin(angle);
    vec3 p=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
    vec2 uv=vec2(atan(p.x,p.z)/6.2831853+.5,asin(clamp(p.y,-1.,1.))/3.14159265+.5);
    vec3 land=texture2D(landMap,vec2(fract(uv.x+.32),uv.y)).rgb;
    float lum=dot(land,vec3(.2126,.7152,.0722));
    land=mix(land,vec3(lum*.53,lum*.78,lum*1.20),.62);
    float cloud=texture2D(cloudMap,vec2(fract(uv.x+.32+angle*.025),uv.y)).r;
    cloud=smoothstep(.12,.86,cloud);
    return mix(land*1.1+vec3(.008,.016,.036),vec3(.69,.79,.97),cloud*.93);
  }
`,m=document.querySelector(`.journey-panorama`);if(m){let a,o,d=!1,h=!1,g=!1,_=0,v=0,y=0,b=new n,x=new u(-1,1,1,-1,0,2);x.position.z=1;let S=()=>document.hidden||document.documentElement.classList.contains(`motion-paused`);function C(){if(!a)return;let e=m.clientWidth,t=m.clientHeight,n=Math.max(e/1672,t/941),r=getComputedStyle(m).backgroundPosition.split(` `);o.uniforms.cover.value.set(e/n,t/n,(e-1672*n)*parseFloat(r[0])/100/n,(t-941*n)*parseFloat(r[1]||`60%`)/100/n),a.setPixelRatio(Math.min(devicePixelRatio,e<640?1:1.4)),a.setSize(e,t),a.render(b,x)}function w(e){_=0,d&&!S()&&a&&(e-v>=(innerWidth<640?50:33)&&(y+=v?Math.min((e-v)/1e3,.1):0,v=e,o.uniforms.turn.value=y*.085,o.uniforms.mixIn.value=1-Math.exp(-y/2),a.render(b,x)),_=requestAnimationFrame(w))}function T(){a&&d&&!S()&&!_&&(v=0,_=requestAnimationFrame(w))}async function E(){if(!(a||h||g||!d)){h=!0;try{let[n,[u,d]]=await Promise.all([new e().loadAsync(new URL(`assets/universe-finale-20261025.webp`,document.baseURI).href),f()]);n.colorSpace=s,a=new l({alpha:!0,antialias:!1,powerPreference:`low-power`}),a.outputColorSpace=s,a.setClearColor(0,0),o=new i({transparent:!0,depthTest:!1,depthWrite:!1,uniforms:{plate:{value:n},landMap:{value:u},cloudMap:{value:d},cover:{value:new r},turn:{value:0},mixIn:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`
          uniform sampler2D plate;uniform vec4 cover;uniform float turn;uniform float mixIn;varying vec2 vUv;
          ${p}
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
          }`}),b.add(new c(new t(2,2),o)),a.domElement.className=`journey-rotation-canvas`,a.domElement.setAttribute(`aria-hidden`,`true`),m.append(a.domElement),C(),T(),a.domElement.addEventListener(`webglcontextlost`,()=>{g=!0,cancelAnimationFrame(_),_=0,a==null||a.domElement.remove()})}catch(e){g=!0,a==null||a.domElement.remove(),a==null||a.dispose()}finally{h=!1}}}new ResizeObserver(C).observe(m),new IntersectionObserver(e=>{d=e[0].isIntersecting,d?(E(),T()):(cancelAnimationFrame(_),_=0)},{rootMargin:`100px`}).observe(m);for(let e of[`visibilitychange`,`skivu-motion-change`])document.addEventListener(e,()=>{S()?(cancelAnimationFrame(_),_=0):(E(),T())})}var h=document.querySelector(`.hero-plate`),g=document.querySelector(`.hero`);if(h&&g){let t,r,o,d=new n,m=new u(-1,1,1,-1,.1,4e3);m.position.z=2e3;let _=!0,v=!1,y=0,b=0,x=0,S=0,C=!1,w=!1,T=()=>document.documentElement.classList.contains(`motion-paused`)||document.hidden;function E(){if(!t||!r)return;let e=h.clientWidth,n=h.clientHeight;t.setPixelRatio(Math.min(devicePixelRatio,e<640?1.35:1.75)),t.setSize(e,n),m.left=-e/2,m.right=e/2,m.top=n/2,m.bottom=-n/2,m.updateProjectionMatrix();let i=getComputedStyle(h).backgroundPosition.split(` `),a=parseFloat(i[0])/100,o=parseFloat(i[1]||`50%`)/100,s=Math.max(e/1672,n/941),c=(e-1672*s)*a,l=(n-941*s)*o;r.position.set(c+1400*s-e/2,n/2-l-554*s,0),r.scale.set(448*s,420*s,448*s),t.render(d,m)}function D(e){if(y=0,v&&_&&!T()){if(e-b>(innerWidth<640?42:32)){let n=b?Math.min((e-b)/1e3,.08):0;b=e,x+=n*.105,S+=n,o.uniforms.rotation.value=x,o.uniforms.flow.value=.92*(1-Math.exp(-S/1.8)),t.render(d,m)}y=requestAnimationFrame(D)}}function O(){v&&_&&!T()&&!y&&(b=0,y=requestAnimationFrame(D))}async function k(){if(!(t||C||w||T())){w=!0;try{let[n,[u,m]]=await Promise.all([new e().loadAsync(new URL(`assets/universe-hero-20261025.webp`,document.baseURI).href),f()]);n.colorSpace=s,t=new l({alpha:!0,antialias:!0,powerPreference:`low-power`}),t.outputColorSpace=s,t.setClearColor(0,0),t.domElement.className=`hero-planet-canvas`,t.domElement.setAttribute(`aria-hidden`,`true`),Object.assign(t.domElement.style,{position:`absolute`,inset:`0`,width:`100%`,height:`100%`,pointerEvents:`none`}),o=new i({transparent:!0,uniforms:{plate:{value:n},landMap:{value:u},cloudMap:{value:m},rotation:{value:0},flow:{value:0}},vertexShader:`varying vec3 localPoint;varying vec3 facing;void main(){localPoint=position;facing=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
          uniform sampler2D plate;
          uniform float rotation;
          uniform float flow;
          varying vec3 localPoint;
          varying vec3 facing;
          ${p}
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
          }`}),r=new c(new a(1,192,96),o),d.add(r),h.appendChild(t.domElement),v=!0,E(),O(),t.domElement.addEventListener(`webglcontextlost`,()=>{cancelAnimationFrame(y),y=0,v=!1,t==null||t.domElement.remove(),C=!0})}catch(e){C=!0,t==null||t.dispose(),t==null||t.domElement.remove()}}}new ResizeObserver(E).observe(h),new IntersectionObserver(e=>{_=e[0].isIntersecting,_?(k(),O()):(cancelAnimationFrame(y),y=0)},{rootMargin:`100px`}).observe(g),document.addEventListener(`skivu-motion-change`,()=>{T()?(cancelAnimationFrame(y),y=0):(k(),O())}),document.addEventListener(`visibilitychange`,()=>{T()?(cancelAnimationFrame(y),y=0):(k(),O())}),k()}