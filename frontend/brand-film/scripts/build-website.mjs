import {build} from 'esbuild';
import {mkdir, writeFile, copyFile, readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const destination = resolve(process.argv[2] || '../skivu-promo-preview-20261022/film');
await mkdir(destination, {recursive:true});
await build({
  entryPoints:['src/WebsitePlayer.tsx'], bundle:true, minify:true, format:'iife',
  define:{'process.env.NODE_ENV':'"production"'},
  legalComments:'linked', outfile:resolve(destination,'player.js'),
  plugins:[{name:'website-audio',setup(b){b.onLoad({filter:/[/\\]design\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replaceAll('.wav"','.mp3"'),loader:'ts'}));}}],
});
for (const name of ['audio/glass-touch.wav','audio/product-arrival.wav','audio/soft-sweep.wav','audio/skivu-atmosphere-40s.wav','brand/skivu.png']) {
  await mkdir(resolve(destination,name,'..'),{recursive:true});
  if(name.endsWith('.wav')) {
    execFileSync(resolve('node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe'),['-y','-v','error','-i',resolve('public',name),'-c:a','libmp3lame','-b:a','192k',resolve(destination,name.replace('.wav','.mp3'))]);
  } else await copyFile(resolve('public',name),resolve(destination,name));
}
execFileSync('python',['scripts/subset-website-font.py',destination],{stdio:'inherit'});
await mkdir(resolve(destination,'licenses'), {recursive:true});
for (const name of await readdir('licenses')) {
  if (name.toLowerCase().includes('noto')) await copyFile(resolve('licenses',name),resolve(destination,'licenses',name));
}
await writeFile(resolve(destination,'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Skivu 品牌宣传片</title>
<style>
*{box-sizing:border-box}html,body,#skivu-film{width:100%;height:100%;margin:0;overflow:hidden;background:#030611}body{color:#eef1f9;font-family:system-ui,sans-serif}button{font:inherit}
.film-poster{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(ellipse at 72% 20%,#203c674a,transparent 55%),radial-gradient(ellipse at 30% 80%,#5742724f,transparent 65%),#030611}
.film-poster:before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,#e0efff99 .7px,transparent 1px),radial-gradient(circle,#adcae877 .6px,transparent 1px);background-size:83px 97px,131px 167px;background-position:17px 30px,55px 65px;pointer-events:none}
.poster-orbit{position:absolute;width:85%;height:50%;border:1px solid #b0caff20;border-radius:50%;transform:rotate(-20deg);pointer-events:none}.poster-brand{font-size:clamp(26px,8vw,104px);font-weight:450;letter-spacing:-.04em;line-height:1.2;z-index:1}.poster-copy{font-size:clamp(10px,2vw,26px);color:#bfcce0;margin:2% 0 4%;z-index:1}
.film-poster button{z-index:1;display:flex;align-items:center;gap:12px;border:1px solid #b8cce84f;background:#9bbfe81c;border-radius:50px;color:#e5f2ff;padding:clamp(8px,1.4vw,18px) clamp(14px,2.8vw,35px);font-size:clamp(11px,1.8vw,22px);cursor:pointer}.film-poster button:focus-visible{outline:2px solid #a4d8c9;outline-offset:5px}.film-poster small{font-size:.65em;color:#a6b8d2}
</style></head><body><div id="skivu-film"></div><script>window.remotion_staticBase=new URL('.',location.href).pathname.slice(0,-1);</script><script src="player.js" defer></script></body></html>`);
console.log('Website film built:', destination);
