/** Upload a verified archive in deterministic byte-bounded chunks. The server
 * keeps staging private and creates a new world only during atomic finalize.
 */
export const IMPORT_SECTIONS=Object.freeze(['branches','directives','directive_edits','scenes','revisions']);
export const IMPORT_MAX_BYTES=100*1024*1024;
export const IMPORT_MAX_ROWS=50000;
const bytes=s=>new TextEncoder().encode(s);
async function hash(s,crypto){
 if(!crypto?.subtle)throw Error('Для проверки пакетов нужен HTTPS.');
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function prepareStagedArchive(archive,archiveSha,{crypto=globalThis.crypto,chunkBytes=512*1024,chunkRows=200}={}){
 if(!/^[a-f0-9]{64}$/.test(archiveSha||''))throw Error('Нет проверенной контрольной суммы архива.');
 if(!Number.isInteger(chunkBytes)||chunkBytes<4096||chunkBytes>2*1024*1024||
    !Number.isInteger(chunkRows)||chunkRows<1||chunkRows>400)throw Error('Неверный размер пакета.');
 const chunks=[],counts={};
 let totalBytes=0;
 for(const section of IMPORT_SECTIONS){
  const rows=archive[section];
  if(!Array.isArray(rows)||rows.length>IMPORT_MAX_ROWS)throw Error('Слишком много записей в разделе '+section);
  counts[section]=rows.length;
  let batch=[],size=2;
  const flush=async()=>{
   if(!batch.length)return;
   const payload='['+batch.join(',')+']',length=bytes(payload).length;
   if(length>2*1024*1024)throw Error('Отдельный пакет превышает 2 МБ.');
   const index=chunks.length;
   totalBytes+=length;
   if(totalBytes>IMPORT_MAX_BYTES||index>=1000)throw Error('Архив превышает предел пакетного импорта.');
   chunks.push({section,index,count:batch.length,bytes:length,sha256:await hash(payload,crypto),payload});
   batch=[];size=2;
  };
  for(const row of rows){
   const raw=JSON.stringify(row),length=bytes(raw).length;
   if(length+2>2*1024*1024)throw Error('Одна запись архива превышает 2 МБ.');
   if(batch.length&&(size+length+1>chunkBytes||batch.length>=chunkRows))await flush();
   size+=length+(batch.length?1:0);batch.push(raw);
  }
  await flush();
 }
 if(!counts.branches||Object.values(counts).reduce((a,b)=>a+b,0)>100000)throw Error('Некорректное количество записей архива.');
 const manifest={format:'living-world-next-staged-v1',archive_sha256:archiveSha,world:archive.world,counts,
  total_bytes:totalBytes,chunks:chunks.map(({payload,...meta})=>meta)};
 return {manifest,chunks};
}
/** Replaying an interrupted job is harmless: server checks identical manifest,
 * exact SHA-256 per chunk and returns the same final world receipt.
 */
export async function uploadStagedArchive({manifest,chunks},importId,{rpc,onProgress=()=>{}}={}){
 if(typeof rpc!=='function')throw Error('Нет подключения для импорта.');
 const job=await rpc('nw_import_begin',{p_import_id:importId,p_manifest:manifest});
 if(job?.result?.world_id)return job.result;
 const uploaded=new Set(job?.uploaded||[]);
 let done=0;
 for(const chunk of chunks){
  if(!uploaded.has(chunk.index))await rpc('nw_import_chunk',{p_import_id:importId,p_index:chunk.index,p_payload:chunk.payload});
  done++;onProgress({phase:'upload',done,total:chunks.length});
 }
 onProgress({phase:'finalize',done,total:chunks.length});
 const result=await rpc('nw_import_finalize',{p_import_id:importId});
 if(!result?.world_id||result.world_id===manifest.world.id)throw Error('Не получена квитанция создания нового мира.');
 return result;
}
