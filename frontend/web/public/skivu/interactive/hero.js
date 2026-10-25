import{H as e,I as t,L as n,R as r,T as i,n as a,v as o,z as s}from"./chunks/three.module-g9f9OKTm.js";var c=document.querySelector(`.hero-plate`),l=document.querySelector(`.hero`);if(c&&l){let u,d,f,p=new n,m=new i(-1,1,1,-1,.1,4e3);m.position.z=2e3;let h=!0,g=!1,_=0,v=0,y=0,b=0,x=!1,S=!1,C=()=>document.documentElement.classList.contains(`motion-paused`)||document.hidden;function w(){if(!u||!d)return;let e=c.clientWidth,t=c.clientHeight;u.setPixelRatio(Math.min(devicePixelRatio,e<640?1.35:1.75)),u.setSize(e,t),m.left=-e/2,m.right=e/2,m.top=t/2,m.bottom=-t/2,m.updateProjectionMatrix();let n=getComputedStyle(c).backgroundPosition.split(` `),r=parseFloat(n[0])/100,i=parseFloat(n[1]||`50%`)/100,a=Math.max(e/1672,t/941),o=(e-1672*a)*r,s=(t-941*a)*i;d.position.set(o+1400*a-e/2,t/2-s-554*a,0),d.scale.set(448*a,420*a,448*a),u.render(p,m)}function T(e){if(_=0,g&&h&&!C()){if(e-v>(innerWidth<640?42:32)){let t=v?Math.min((e-v)/1e3,.08):0;v=e,y+=t*.026,b+=t,f.uniforms.rotation.value=y,f.uniforms.flow.value=.88*(1-Math.exp(-b/9)),u.render(p,m)}_=requestAnimationFrame(T)}}function E(){g&&h&&!C()&&!_&&(v=0,_=requestAnimationFrame(T))}async function D(){if(!(u||x||S||C())){S=!0;try{let n=await new e().loadAsync(new URL(`assets/universe-hero-20261025.webp`,document.baseURI).href);n.colorSpace=t,u=new a({alpha:!0,antialias:!0,powerPreference:`low-power`}),u.outputColorSpace=t,u.setClearColor(0,0),u.domElement.className=`hero-planet-canvas`,u.domElement.setAttribute(`aria-hidden`,`true`),Object.assign(u.domElement.style,{position:`absolute`,inset:`0`,width:`100%`,height:`100%`,pointerEvents:`none`}),f=new r({transparent:!0,uniforms:{plate:{value:n},rotation:{value:0},flow:{value:0}},vertexShader:`varying vec3 localPoint;varying vec3 facing;void main(){localPoint=position;facing=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
          uniform sampler2D plate;
          uniform float rotation;
          uniform float flow;
          varying vec3 localPoint;
          varying vec3 facing;
          vec2 project(vec3 n){return vec2((1400.+448.*n.x)/1672.,1.-(554.-420.*n.y)/941.);}
          float sunlight(vec3 n){return .18+.82*smoothstep(-.28,.85,dot(n,normalize(vec3(-.65,.7,.22))));}
          vec3 interior(float phase,float latitude){
            vec2 xy=vec2((-.70+1.16*phase)*sqrt(max(0.,1.-latitude*latitude)),.80*latitude);
            vec3 source=vec3(xy,sqrt(max(0.,1.-dot(xy,xy))));
            return texture2D(plate,project(source)).rgb;
          }
          void main(){
            vec3 n=normalize(localPoint);
            float c=cos(rotation),s=sin(rotation);
            vec3 rotated=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
            // Overlap two interior strips with complementary sin² weights.
            // Each strip fades to zero before its wrap seam. Unlike reflected
            // longitude this does not flatten into long bands at quarter turns.
            float longitude=atan(rotated.x,rotated.z);
            float phase=fract(longitude/6.2831853+.5);
            float other=fract(phase+.5);
            float weight=pow(sin(phase*3.14159265),2.);
            vec3 base=texture2D(plate,project(n)).rgb;
            vec3 moving=mix(interior(other,n.y),interior(phase,n.y),weight);
            moving*=.87+.13*sunlight(n);
            float surface=smoothstep(.18,.60,n.z);
            vec3 col=mix(base,moving,surface*flow);
            float edge=smoothstep(0.,.095,abs(facing.z));
            gl_FragColor=vec4(col,edge);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`}),d=new o(new s(1,192,96),f),p.add(d),c.appendChild(u.domElement),g=!0,w(),E(),u.domElement.addEventListener(`webglcontextlost`,()=>{cancelAnimationFrame(_),_=0,g=!1,u?.domElement.remove(),x=!0})}catch{x=!0,u?.dispose(),u?.domElement.remove()}}}new ResizeObserver(w).observe(c),new IntersectionObserver(e=>{h=e[0].isIntersecting,h?(D(),E()):(cancelAnimationFrame(_),_=0)},{rootMargin:`100px`}).observe(l),document.addEventListener(`skivu-motion-change`,()=>{C()?(cancelAnimationFrame(_),_=0):(D(),E())}),document.addEventListener(`visibilitychange`,()=>{C()?(cancelAnimationFrame(_),_=0):(D(),E())}),D()}