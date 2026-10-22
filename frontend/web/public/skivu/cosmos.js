'use strict';
/* Local-only product demonstrations. No request, quota or account effects. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.getElementById('cosmos-canvas');
  const ctx = canvas.getContext('2d', {alpha:false});
  let width=0,height=0,stars=[],nebula,raf=0,last=0,time=0,meteor=null,nextMeteor=5;
  let seed=8129;
  const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  const pointer={x:-2000,y:-2000};
  const hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
  function noise(x,y){const a=Math.floor(x),b=Math.floor(y);let u=x-a,v=y-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;}
  function fbm(x,y){let v=0,a=.5;for(let i=0;i<5;i++){v+=a*noise(x,y);x=x*2.03+13;y=y*2.03+7;a*=.5;}return v;}
  function resize(){
    width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    seed=8129;stars=Array.from({length:Math.min(310,Math.round(width*height/3500))},()=>({x:rand()*width,y:rand()*height,r:rand()<.1?1.1+rand()*.6:.3+rand()*.65,phase:rand()*6.28,speed:.3+rand()*.6,depth:.3+rand()*.7,dx:0,dy:0,vx:0,vy:0}));
    nebula=document.createElement('canvas');nebula.width=420;nebula.height=Math.max(220,Math.round(420*height/width));
    const nctx=nebula.getContext('2d');const pixels=nctx.createImageData(nebula.width,nebula.height);
    for(let y=0;y<nebula.height;y++)for(let x=0;x<nebula.width;x++){
      const u=x/nebula.width,v=y/nebula.height;
      const ridge=v-(.88-u*.7+Math.sin(u*5)*.055);
      const dust=Math.exp(-ridge*ridge*14)*Math.pow(fbm(u*4.5,v*5),2)*2;
      const cloud=fbm(u*7+10,v*7+4);
      const violet=Math.exp(-((u-.7)**2+(v-.35)**2)*6);
      const i=(y*nebula.width+x)*4;
      pixels.data[i]=4+dust*(22+violet*23)*cloud;
      pixels.data[i+1]=7+dust*(22+Math.max(0,.5-u)*35)*cloud;
      pixels.data[i+2]=17+dust*(73+violet*23)*cloud;
      pixels.data[i+3]=255;
    }
    nctx.putImageData(pixels,0,0);draw(0);
  }
  function draw(dt){
    time+=dt;ctx.drawImage(nebula,0,0,width,height);
    const nearby=[];
    for(const s of stars){
      const drift=reduced.matches?0:time*s.speed*.65;
      const px=(s.x+drift)%width,py=(s.y+drift*.2)%height;
      const dist=Math.hypot(px-pointer.x,py-pointer.y);
      const force=dist<160?(1-dist/160)*10:0;
      if(!reduced.matches){s.vx+=(force*(px-pointer.x)/Math.max(dist,1)-s.dx)*.035;s.vy+=(force*(py-pointer.y)/Math.max(dist,1)-s.dy)*.035;s.vx*=.85;s.vy*=.85;s.dx+=s.vx;s.dy+=s.vy;}
      const x=px+s.dx,y=py+s.dy;
      const alpha=.28+.57*(.5+.5*Math.sin(time*.65*s.speed+s.phase));
      ctx.fillStyle=`rgba(205,215,255,${alpha})`;ctx.beginPath();ctx.arc(x,y,s.r,0,Math.PI*2);ctx.fill();
      if(s.r>1.15){const glow=ctx.createRadialGradient(x,y,0,x,y,s.r*7);glow.addColorStop(0,`rgba(167,173,255,${alpha*.23})`);glow.addColorStop(1,'rgba(125,138,255,0)');ctx.fillStyle=glow;ctx.fillRect(x-s.r*7,y-s.r*7,s.r*14,s.r*14);ctx.strokeStyle=`rgba(218,218,255,${alpha*.45})`;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x-s.r*3,y);ctx.lineTo(x+s.r*3,y);ctx.moveTo(x,y-s.r*3);ctx.lineTo(x,y+s.r*3);ctx.stroke();}
      if(dist<190&&nearby.length<18)nearby.push({x,y,dist});
    }
    for(let i=0;i<nearby.length;i++)for(let j=i+1;j<nearby.length;j++){const a=nearby[i],b=nearby[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>115)continue;ctx.strokeStyle=`rgba(162,145,242,${(1-d/115)*(1-Math.max(a.dist,b.dist)/200)*.28})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    if(!reduced.matches&&time>nextMeteor&&!meteor){meteor={x:width*(.3+rand()*.5),y:height*rand()*.3,age:0};nextMeteor=time+12+rand()*8;}
    if(meteor){meteor.age+=dt;const x=meteor.x+meteor.age*450,y=meteor.y+meteor.age*240;const fade=Math.sin(Math.min(1,meteor.age/1.2)*Math.PI);const g=ctx.createLinearGradient(x-140,y-75,x,y);g.addColorStop(0,'rgba(157,137,242,0)');g.addColorStop(1,`rgba(216,211,255,${fade*.65})`);ctx.strokeStyle=g;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(x-140,y-75);ctx.lineTo(x,y);ctx.stroke();if(meteor.age>1.2)meteor=null;}
  }
  function tick(now){raf=requestAnimationFrame(tick);if(now-last<33)return;const dt=Math.min(.05,(now-last)/1000);last=now;draw(dt);}
  function run(){cancelAnimationFrame(raf);raf=0;last=performance.now();if(!document.hidden&&!reduced.matches)raf=requestAnimationFrame(tick);else draw(0);}
  window.addEventListener('resize',resize);window.addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY;},{passive:true});document.addEventListener('pointerleave',()=>{pointer.x=-2000;pointer.y=-2000;});
  document.addEventListener('visibilitychange',run);reduced.addEventListener('change',run);resize();run();

  const modelCopy={think:'深度思考 · 让复杂变得清晰',create:'灵感创作 · 让想象自由生长',chat:'轻松聊聊 · 让每个日常都有回响'};
  const personas={cloud:['云朵 · 日常陪伴','“慢慢说，我一直在。”','#a884e5'],creative:['灵感搭档 · 一起创造','“这个想法，值得再大胆一点。”','#71c9d5'],night:['深夜倾听 · 安静相伴','“不急，今晚的星光还很长。”','#9399d9']};
  document.querySelectorAll('[data-model]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-model]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});
    const label=document.querySelector('.experience-section #model-label');if(label)label.textContent=modelCopy[button.dataset.model];
    document.querySelector('.model-nucleus').style.filter=button.dataset.model==='create'?'hue-rotate(40deg)':button.dataset.model==='chat'?'hue-rotate(-45deg)':'none';
  }));
  document.querySelectorAll('[data-persona]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-persona]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});
    const p=personas[button.dataset.persona];const name=document.querySelector('.experience-section #persona-name'),message=document.querySelector('.experience-section #persona-message');if(name)name.textContent=p[0];if(message)message.textContent=p[1];document.querySelector('.character-disc').style.boxShadow=`0 0 55px ${p[2]}44, inset 0 1px 0 #ffffff22`;
  }));
  document.getElementById('glass-demo').addEventListener('input',e=>{document.querySelector('.glass-experiment').style.setProperty('--demo-blur',`${e.target.value}px`);document.getElementById('glass-value').textContent=`${e.target.value} px`;});
  const colors={violet:'#9572ff',cyan:'#58c3ca',rose:'#d28aae'};
  document.querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-theme]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});document.querySelector('.glass-experiment').style.setProperty('--demo-color',colors[button.dataset.theme]);
  }));
  document.querySelector('[data-film]').addEventListener('click',()=>document.getElementById('brand-film').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'}));
  document.querySelectorAll('[data-spotlight]').forEach(card=>{
    card.addEventListener('pointermove',e=>{if(reduced.matches||e.pointerType==='touch')return;const r=card.getBoundingClientRect();card.style.setProperty('--mx',`${e.clientX-r.left}px`);card.style.setProperty('--my',`${e.clientY-r.top}px`);});
  });
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('revealed');observer.unobserve(entry.target);}}),{threshold:.08});
  document.querySelectorAll('.section-heading,.experience-card,.film-frame,.grand-invitation').forEach(el=>{el.classList.add('reveal-pending');observer.observe(el);});
})();
