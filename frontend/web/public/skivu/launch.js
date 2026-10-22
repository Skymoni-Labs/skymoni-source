'use strict';

const paths = {
  chat:'<path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2 1.7-5A8 8 0 1 1 20 11.5Z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  spark:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M10 19h4"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/>',
  shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
  check:'<path d="m5 12 4 4L20 5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  refresh:'<path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
};
function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.spark}</svg>`;}
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}

icons();
// Small, pointer-driven highlights; disabled for touch and reduced motion.
const motionCard=document.querySelector('[data-motion-card]');
const artStage=motionCard.querySelector('.art-stage');
const motionPreference=matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
let motionFrame=0;
let pointerPosition=null;
function resetMotion(){
 cancelAnimationFrame(motionFrame);motionFrame=0;pointerPosition=null;
 motionCard.style.removeProperty('--pointer-x');motionCard.style.removeProperty('--pointer-y');
 artStage.style.removeProperty('--tilt-x');artStage.style.removeProperty('--tilt-y');
}
motionCard.addEventListener('pointermove',event=>{
 if(!motionPreference.matches)return;
 const box=motionCard.getBoundingClientRect();
 pointerPosition={x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};
 if(motionFrame)return;
 motionFrame=requestAnimationFrame(()=>{
  const p=pointerPosition;if(!p)return;
  motionCard.style.setProperty('--pointer-x',`${(p.x*100).toFixed(1)}%`);
  motionCard.style.setProperty('--pointer-y',`${(p.y*100).toFixed(1)}%`);
  artStage.style.setProperty('--tilt-x',`${((.5-p.y)*3).toFixed(2)}deg`);
  artStage.style.setProperty('--tilt-y',`${((p.x-.5)*4).toFixed(2)}deg`);
  motionFrame=0;
 });
});
motionCard.addEventListener('pointerleave',resetMotion);
motionPreference.addEventListener('change',resetMotion);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetMotion();});
