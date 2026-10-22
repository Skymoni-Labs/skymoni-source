/* Local product-section animation only. No accounts, network or App configuration. */
(()=>{'use strict';
 const section=document.querySelector('.experience-section');if(!section)return;
 const root=section.querySelector('.cosmos-bento'),svg=section.querySelector('.experience-guide'),play=section.querySelector('.experience-tour-play');
 const cards=[...section.querySelectorAll('.experience-card')],reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const grad=svg.querySelector('linearGradient'),trail=[...svg.querySelectorAll('polyline')],star=svg.querySelector('.tour-star'),halo=svg.querySelector('.tour-halo');
 let raf=0,start=0,nodes=[],previous=-1,hasRun=false,manual=false;
 const q=s=>section.querySelector(s),smooth=x=>x*x*(3-2*x);
 function center(selector){const el=q(selector),r=el.getBoundingClientRect(),b=root.getBoundingClientRect();return [r.left-b.left+r.width/2,r.top-b.top+r.height/2];}
 function geometry(){const b=root.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${b.width} ${b.height}`);nodes=[[-25,10],center('.model-nucleus'),center('[data-model=create]'),center('.character-disc'),center('[data-persona=creative]'),center('.demo-glass'),center('#glass-demo'),[b.width+30,b.height-15]];}
 const times=[0,1.1,2.5,3.9,5.1,6.7,8.5,10.4];
 function point(t){let k=times.findIndex((v,i)=>i>0&&t<v)-1;k=Math.max(0,Math.min(nodes.length-2,k<0&&t>=10.4?nodes.length-2:k));const a=nodes[k],b=nodes[k+1],prev=nodes[Math.max(0,k-1)],next=nodes[Math.min(nodes.length-1,k+2)],u=Math.max(0,Math.min(1,(t-times[k])/(times[k+1]-times[k])));return [0,1].map(d=>.5*(2*a[d]+(-prev[d]+b[d])*u+(2*prev[d]-5*a[d]+4*b[d]-next[d])*u*u+(-prev[d]+3*a[d]-3*b[d]+next[d])*u*u*u));}
 function animate(el,frames,options){if(!reduced.matches)el.animate(frames,options);}
 function activate(index){cards.forEach((card,i)=>{card.classList.toggle('tour-active',i===index);if(i<=index)card.classList.add('tour-lit');});}
 function stop(){cancelAnimationFrame(raf);raf=0;svg.classList.remove('is-flying');cards.forEach(card=>card.classList.remove('tour-active'));play.innerHTML='✦ 重新播放引导 <span>↗</span>';}
 function fire(t){const stage=t<1.1?-1:t<2.5?0:t<3.9?1:t<5.1?2:t<6.7?3:t<8.5?4:5;if(stage===previous)return;previous=stage;
  if(stage===0){activate(0);q('[data-model=think]').click();}
  if(stage===1)q('[data-model=create]').click();
  if(stage===2){activate(1);q('[data-persona=cloud]').click();}
  if(stage===3)q('[data-persona=creative]').click();
  if(stage===4){activate(2);q('[data-theme=cyan]').click();}
  if(stage===5)q('[data-theme=rose]').click();
 }
 function tick(now){const t=(now-start)/1000;if(t>10.4){stop();return;}fire(t);const p=point(t),tail=point(t-.2),points=Array.from({length:18},(_,i)=>point(t-.2+i*.2/17).join(',')).join(' ');trail.forEach(el=>el.setAttribute('points',points));grad.setAttribute('x1',tail[0]);grad.setAttribute('y1',tail[1]);grad.setAttribute('x2',p[0]);grad.setAttribute('y2',p[1]);[star,halo].forEach(el=>{el.setAttribute('cx',p[0]);el.setAttribute('cy',p[1]);});if(t>6.7&&t<8.5){const range=q('#glass-demo');range.value=String(Math.round(smooth((t-6.7)/1.8)*24));range.dispatchEvent(new Event('input',{bubbles:true}));}raf=requestAnimationFrame(tick);}
 function run(){stop();if(reduced.matches){cards.forEach(c=>c.classList.add('tour-lit'));return;}geometry();previous=-1;start=performance.now();hasRun=true;manual=false;svg.classList.add('is-flying');play.innerHTML='✦ 流星引导中 <span>↗</span>';raf=requestAnimationFrame(tick);}
 play.addEventListener('click',run);
 root.addEventListener('pointerdown',e=>{if(e.isTrusted){manual=true;stop();}},{passive:true});
 section.querySelectorAll('[data-model]').forEach(button=>button.addEventListener('click',()=>{q('.model-card').dataset.motionModel=button.dataset.model;q('#model-label').textContent={think:'深度思考 · 让复杂变得清晰',create:'灵感创作 · 让想象自由生长',chat:'轻松聊聊 · 让每个日常都有回响'}[button.dataset.model];animate(q('.model-nucleus'),[{scale:.9,opacity:.6},{scale:1.06,opacity:1},{scale:1}],{duration:650,easing:'cubic-bezier(.2,.7,.3,1)'});animate(q('#model-label'),[{opacity:0,translate:'0 7px'},{opacity:1,translate:'0 0'}],{duration:420});}));
 section.querySelectorAll('[data-persona]').forEach(button=>button.addEventListener('click',()=>{const copy={cloud:['云朵 · 日常陪伴','“慢慢说，我一直在。”'],creative:['灵感搭档 · 一起创造','“这个想法，值得再大胆一点。”'],night:['深夜倾听 · 安静相伴','“不急，今晚的星光还很长。”']}[button.dataset.persona];q('#persona-name').textContent=copy[0];q('#persona-message').textContent=copy[1];animate(q('.character-disc'),[{scale:.92,rotate:'-6deg'},{scale:1.04,rotate:'2deg'},{scale:1,rotate:'0deg'}],{duration:700,easing:'cubic-bezier(.2,.7,.3,1)'});animate(q('.character-message'),[{opacity:.3,translate:'18px 0'},{opacity:1,translate:'0 0'}],{duration:450});}));
 q('#glass-demo').addEventListener('input',e=>{q('.glass-experiment').style.setProperty('--guide-tilt',`${-7+Number(e.target.value)/28*11}deg`);if(e.isTrusted){manual=true;stop();}});
 section.querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>animate(q('.demo-glass'),[{opacity:.5,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:450})));
 const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!hasRun&&!manual&&innerWidth>650)run();},{threshold:.35});observer.observe(cards[0]);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('resize',()=>{if(raf)stop();});reduced.addEventListener('change',()=>{stop();if(reduced.matches)cards.forEach(c=>c.classList.add('tour-lit'));});
})();
