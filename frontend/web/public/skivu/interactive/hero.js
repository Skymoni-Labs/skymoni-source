import{B as e,G as t,H as n,L as r,O as i,V as a,g as o,t as s,w as c,z as l}from"./chunks/three.module-LVvQzp37.js";var u;function d(){if(!u){let e=new t;u=Promise.all([e.loadAsync(new URL(`assets/earth-blue-marble-surface.webp`,document.baseURI).href),e.loadAsync(new URL(`assets/earth-blue-marble-clouds.webp`,document.baseURI).href)]).then(([e,t])=>(e.colorSpace=l,e.wrapS=t.wrapS=r,e.anisotropy=t.anisotropy=2,[e,t]))}return u}var f=`
  uniform sampler2D landMap;
  uniform sampler2D cloudMap;
  vec3 planetarySurface(vec3 n, float angle){
    float c=cos(angle),s=sin(angle);
    vec3 p=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
    vec2 uv=vec2(atan(p.x,p.z)/6.2831853+.5,asin(clamp(p.y,-1.,1.))/3.14159265+.5);
    // Longitude wraps at atan's branch. Unwrapped derivatives prevent a row
    // of coarse mip samples from appearing as a dashed dark seam on rotation.
    vec2 dx=dFdx(uv),dy=dFdy(uv);
    dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
    vec3 land=textureGrad(landMap,vec2(uv.x+.32,uv.y),dx,dy).rgb;
    float lum=dot(land,vec3(.2126,.7152,.0722));
    land=mix(land,vec3(lum*.53,lum*.78,lum*1.20),.62);
    float cloud=textureGrad(cloudMap,vec2(uv.x+.32+angle*.025,uv.y),dx,dy).r;
    cloud=smoothstep(.12,.86,cloud);
    return mix(land*1.1+vec3(.008,.016,.036),vec3(.69,.79,.97),cloud*.93);
  }
`,p=document.querySelector(`.journey-planet-stage`);if(p){let t,r,u=!1,m=!1,h=!1,g=0,_=0,v=0,y=new e,b=new i(-1,1,1,-1,.1,1e4);b.position.z=4e3;let x=new o;y.add(x);let S=new o;S.rotation.set(.25,0,-.18),x.add(S);let C=()=>document.hidden||document.documentElement.classList.contains(`motion-paused`);function w(){if(!t)return;let e=p.clientWidth,n=p.clientHeight;t.setPixelRatio(Math.min(devicePixelRatio,e<640?1:1.4)),t.setSize(e,n),b.left=-e/2,b.right=e/2,b.top=n/2,b.bottom=-n/2,b.updateProjectionMatrix();let r=e<640?Math.max(e*.88,n*.44):Math.max(e*.59,n*.69),i=n*(e<640?.58:.57);x.scale.setScalar(r),x.position.set(e*.025,n/2-i-r,0),t.render(y,b)}function T(e){g=0,u&&!C()&&t&&!h&&(e-_>=(innerWidth<640?42:32)&&(v+=_?Math.min((e-_)/1e3,.1):0,_=e,r.rotation.y=-1.2+v*.105,t.render(y,b)),g=requestAnimationFrame(T))}function E(){t&&u&&!C()&&!h&&!g&&(_=0,g=requestAnimationFrame(T))}function D(){h=!0,cancelAnimationFrame(g),g=0,t==null||t.domElement.remove(),p.parentElement.classList.remove(`planet-ready`)}async function O(){if(!(t||m||h||!u)){m=!0;try{let[e,i]=await d();t=new s({alpha:!0,antialias:!1,powerPreference:`low-power`}),t.outputColorSpace=l,t.setClearColor(0,0),t.debug.onShaderError=()=>{throw Error(`Closing globe shader unavailable`)};let o=new n(1,128,64),u=new a({uniforms:{landMap:{value:e},cloudMap:{value:i}},vertexShader:`
          varying vec3 localPoint;varying vec3 facing;
          void main(){
            localPoint=position;facing=normalize(normalMatrix*normal);
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
          }`,fragmentShader:`
          varying vec3 localPoint;varying vec3 facing;
          ${f}
          void main(){
            vec3 n=normalize(facing);
            float sun=max(0.,dot(n,normalize(vec3(-.7,.65,.8))));
            vec3 surface=planetarySurface(normalize(localPoint),0.);
            vec3 color=surface*(.12+sun*1.05);
            float rim=pow(1.-max(n.z,0.),3.5);
            color+=vec3(.025,.10,.23)*rim*(.35+sun);
            gl_FragColor=vec4(color,1.);
            #include <colorspace_fragment>
          }`});r=new c(o,u),r.rotation.y=-1.2,S.add(r);let m=new c(o,new a({transparent:!0,side:1,depthWrite:!1,blending:2,vertexShader:`varying vec3 facing;void main(){facing=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
          varying vec3 facing;
          void main(){
            vec3 n=normalize(facing);
            float rim=pow(1.-abs(n.z),3.5);
            float sun=.20+.80*max(0.,dot(n,normalize(vec3(-.7,.65,.8))));
            gl_FragColor=vec4(.18,.46,.92,rim*sun*.62);
          }`}));m.scale.setScalar(1.012),x.add(m),t.domElement.className=`journey-rotation-canvas`,t.domElement.setAttribute(`aria-hidden`,`true`),p.append(t.domElement),w(),p.parentElement.classList.add(`planet-ready`),t.domElement.addEventListener(`webglcontextlost`,D),E()}catch(e){D(),t==null||t.dispose()}finally{m=!1}}}new ResizeObserver(w).observe(p),new IntersectionObserver(e=>{u=e[0].isIntersecting,u?(O(),E()):(cancelAnimationFrame(g),g=0)},{rootMargin:`100px`}).observe(p);for(let e of[`visibilitychange`,`skivu-motion-change`])document.addEventListener(e,()=>{C()?(cancelAnimationFrame(g),g=0):(O(),E())})}var m=document.querySelector(`.hero-plate`),h=document.querySelector(`.hero`);if(m&&h){let r,o,u,p=new e,g=new i(-1,1,1,-1,.1,4e3);g.position.z=2e3;let _=!0,v=!1,y=0,b=0,x=0,S=0,C=!1,w=!1,T=()=>document.documentElement.classList.contains(`motion-paused`)||document.hidden;function E(){if(!r||!o)return;let e=m.clientWidth,t=m.clientHeight;r.setPixelRatio(Math.min(devicePixelRatio,e<640?1.35:1.75)),r.setSize(e,t),g.left=-e/2,g.right=e/2,g.top=t/2,g.bottom=-t/2,g.updateProjectionMatrix();let n=getComputedStyle(m).backgroundPosition.split(` `),i=parseFloat(n[0])/100,a=parseFloat(n[1]||`50%`)/100,s=Math.max(e/1672,t/941),c=(e-1672*s)*i,l=(t-941*s)*a;o.position.set(c+1400*s-e/2,t/2-l-554*s,0),o.scale.set(448*s,420*s,448*s),r.render(p,g)}function D(e){if(y=0,v&&_&&!T()){if(e-b>(innerWidth<640?42:32)){let t=b?Math.min((e-b)/1e3,.08):0;b=e,x+=t*.105,S+=t,u.uniforms.rotation.value=x,u.uniforms.flow.value=.92*(1-Math.exp(-S/1.8)),r.render(p,g)}y=requestAnimationFrame(D)}}function O(){v&&_&&!T()&&!y&&(b=0,y=requestAnimationFrame(D))}async function k(){if(!(r||C||w||T())){w=!0;try{let[e,[i,h]]=await Promise.all([new t().loadAsync(new URL(`assets/universe-hero-20261025.webp`,document.baseURI).href),d()]);e.colorSpace=l,r=new s({alpha:!0,antialias:!0,powerPreference:`low-power`}),r.outputColorSpace=l,r.setClearColor(0,0),r.domElement.className=`hero-planet-canvas`,r.domElement.setAttribute(`aria-hidden`,`true`),Object.assign(r.domElement.style,{position:`absolute`,inset:`0`,width:`100%`,height:`100%`,pointerEvents:`none`}),u=new a({transparent:!0,uniforms:{plate:{value:e},landMap:{value:i},cloudMap:{value:h},rotation:{value:0},flow:{value:0}},vertexShader:`varying vec3 localPoint;varying vec3 facing;void main(){localPoint=position;facing=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
          uniform sampler2D plate;
          uniform float rotation;
          uniform float flow;
          varying vec3 localPoint;
          varying vec3 facing;
          ${f}
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
          }`}),o=new c(new n(1,192,96),u),p.add(o),m.appendChild(r.domElement),v=!0,E(),O(),r.domElement.addEventListener(`webglcontextlost`,()=>{cancelAnimationFrame(y),y=0,v=!1,r==null||r.domElement.remove(),C=!0})}catch(e){C=!0,r==null||r.dispose(),r==null||r.domElement.remove()}}}new ResizeObserver(E).observe(m),new IntersectionObserver(e=>{_=e[0].isIntersecting,_?(k(),O()):(cancelAnimationFrame(y),y=0)},{rootMargin:`100px`}).observe(h),document.addEventListener(`skivu-motion-change`,()=>{T()?(cancelAnimationFrame(y),y=0):(k(),O())}),document.addEventListener(`visibilitychange`,()=>{T()?(cancelAnimationFrame(y),y=0):(k(),O())}),k()}