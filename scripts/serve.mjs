import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
 try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/')pathname='/index.html';
  const loc=path.resolve(dir,'.'+pathname);if(!loc.startsWith(dir+path.sep))throw Error('Outside root');
  const body=await readFile(loc);res.writeHead(200,{'content-type':mime[path.extname(loc)]||'application/octet-stream','x-content-type-options':'nosniff'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173'));
