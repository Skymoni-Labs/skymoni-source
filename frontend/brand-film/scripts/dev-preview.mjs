import {context} from 'esbuild';
import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
const ctx=await context({entryPoints:['src/Preview.tsx'],bundle:true,format:'iife',define:{'process.env.NODE_ENV':'"development"'},outfile:'public/preview.js',sourcemap:true});
await ctx.watch();
const root=resolve('public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ttf':'font/ttf','.wav':'audio/wav','.map':'application/json'};
// Range-aware serving is important for arbitrary audio seeks in @remotion/media.
const server=createServer((req,res)=>{
  let file;
  try {const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));}catch{res.writeHead(400).end();return;}
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  let stat;try{stat=statSync(file);}catch{res.writeHead(404).end();return;}
  if(!stat.isFile()){res.writeHead(404).end();return;}
  const headers={'Content-Type':mime[extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store'};
  let start=0,end=stat.size-1,code=200;
  if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}
    if(!match[1]){start=Math.max(0,stat.size-Number(match[2]));}else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}
    code=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  }
  res.writeHead(code,{...headers,'Content-Length':end-start+1});
  if(req.method==='HEAD'){res.end();return;}
  createReadStream(file,{start,end}).pipe(res);
});
server.listen(18912,'127.0.0.1',()=>console.log('Skivu film preview: http://127.0.0.1:18912/ (byte-range audio enabled)'));
process.on('SIGINT',async()=>{server.close();await ctx.dispose();process.exit(0);});
