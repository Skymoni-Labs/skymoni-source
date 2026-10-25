import{F as e,I as t,L as n,R as r,T as i,V as a,n as o,v as s}from"./chunks/three.module-BamX8uyO.js";var c=document.querySelector(`.hero-plate`),l=document.querySelector(`.hero`);if(c&&l){let u,d,f,p=new t,m=new i(-1,1,1,-1,.1,4e3);m.position.z=2e3;let h=!0,g=!1,_=0,v=0,y=0,b=!1,x=!1,S=()=>document.documentElement.classList.contains(`motion-paused`)||document.hidden;function C(){if(!u||!d)return;let e=c.clientWidth,t=c.clientHeight;u.setPixelRatio(Math.min(devicePixelRatio,e<640?1.35:1.75)),u.setSize(e,t),m.left=-e/2,m.right=e/2,m.top=t/2,m.bottom=-t/2,m.updateProjectionMatrix();let n=getComputedStyle(c).backgroundPosition.split(` `),r=parseFloat(n[0])/100,i=parseFloat(n[1]||`50%`)/100,a=Math.max(e/1672,t/941),o=(e-1672*a)*r,s=(t-941*a)*i;d.position.set(o+1400*a-e/2,t/2-s-554*a,0),d.scale.set(448*a,420*a,448*a),u.render(p,m)}function w(e){if(_=0,g&&h&&!S()){if(e-v>(innerWidth<640?42:32)){let t=v?Math.min((e-v)/1e3,.08):0;v=e,y+=t*.026,f.uniforms.rotation.value=y,u.render(p,m)}_=requestAnimationFrame(w)}}function T(){g&&h&&!S()&&!_&&(v=0,_=requestAnimationFrame(w))}async function E(){if(!(u||b||x||S())){x=!0;try{let t=await new a().loadAsync(new URL(`assets/universe-hero-20261025.webp`,document.baseURI).href);t.colorSpace=e,u=new o({alpha:!0,antialias:!0,powerPreference:`low-power`}),u.outputColorSpace=e,u.setClearColor(0,0),u.domElement.className=`hero-planet-canvas`,u.domElement.setAttribute(`aria-hidden`,`true`),Object.assign(u.domElement.style,{position:`absolute`,inset:`0`,width:`100%`,height:`100%`,pointerEvents:`none`}),f=new n({transparent:!0,uniforms:{plate:{value:t},rotation:{value:0}},vertexShader:`varying vec3 localPoint;varying vec3 facing;void main(){localPoint=position;facing=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
          uniform sampler2D plate;
          uniform float rotation;
          varying vec3 localPoint;
          varying vec3 facing;
          vec2 project(vec3 n){return vec2((1400.+448.*n.x)/1672.,1.-(554.-420.*n.y)/941.);}
          float sunlight(vec3 n){return .18+.82*smoothstep(-.28,.85,dot(n,normalize(vec3(-.65,.7,.22))));}
          void main(){
            vec3 n=normalize(localPoint);
            float c=cos(rotation),s=sin(rotation);
            vec3 rotated=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
            vec2 uv=project(rotated);
            uv.x=1.-abs(1.-uv.x);
            vec3 sourceNormal=vec3((uv.x*1672.-1400.)/448.,rotated.y,0.);
            sourceNormal.z=sqrt(max(0.,1.-dot(sourceNormal.xy,sourceNormal.xy)));
            vec3 base=texture2D(plate,project(n)).rgb;
            vec3 moving=texture2D(plate,uv).rgb*sunlight(n)/sunlight(normalize(sourceNormal));
            float surface=smoothstep(.06,.43,n.z);
            vec3 col=mix(base,moving,surface);
            float edge=smoothstep(0.,.095,abs(facing.z));
            gl_FragColor=vec4(col,edge);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`}),d=new s(new r(1,192,96),f),p.add(d),c.appendChild(u.domElement),g=!0,C(),T(),u.domElement.addEventListener(`webglcontextlost`,()=>{cancelAnimationFrame(_),_=0,g=!1,u?.domElement.remove(),b=!0})}catch{b=!0,u?.dispose(),u?.domElement.remove()}}}new ResizeObserver(C).observe(c),new IntersectionObserver(e=>{h=e[0].isIntersecting,h?(E(),T()):(cancelAnimationFrame(_),_=0)},{rootMargin:`100px`}).observe(l),document.addEventListener(`skivu-motion-change`,()=>{S()?(cancelAnimationFrame(_),_=0):(E(),T())}),document.addEventListener(`visibilitychange`,()=>{S()?(cancelAnimationFrame(_),_=0):(E(),T())}),E()}