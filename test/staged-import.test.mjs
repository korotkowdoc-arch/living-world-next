import test from 'node:test';import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareStagedArchive,uploadStagedArchive} from '../public/core/staged-import.mjs';
const archive={world:{id:'old'},branches:[{id:'b'}],directives:[],directive_edits:[],revisions:[],
 scenes:Array.from({length:7},(_,i)=>({id:i,body:'Сцена '+i+' 🌙 '+ 'а'.repeat(300)}))};
const sha='a'.repeat(64);
test('deterministic chunks have exact UTF8 size, hashes and manifest counts',async()=>{
 const a=await prepareStagedArchive(archive,sha,{crypto:webcrypto,chunkRows:2,chunkBytes:4096});
 const b=await prepareStagedArchive(archive,sha,{crypto:webcrypto,chunkRows:2,chunkBytes:4096});
 assert.deepEqual(a,b);assert.equal(a.manifest.counts.scenes,7);
 assert.deepEqual(a.chunks.filter(c=>c.section==='scenes').flatMap(c=>JSON.parse(c.payload)),archive.scenes);
 for(const c of a.chunks){assert.equal(c.bytes,new TextEncoder().encode(c.payload).length);assert.equal(c.sha256.length,64);}
});
test('resume uploads only missing chunks and finalizes once',async()=>{
 const a=await prepareStagedArchive(archive,sha,{crypto:webcrypto,chunkRows:2});
 const calls=[],progress=[];
 const rpc=async(name,args)=>{calls.push([name,args]);if(name==='nw_import_begin')return {uploaded:[0,1]};if(name==='nw_import_finalize')return {world_id:'new',scenes:7};return {accepted:true};};
 const out=await uploadStagedArchive(a,'job',{rpc,onProgress:p=>progress.push(p)});
 assert.equal(out.world_id,'new');assert.deepEqual(calls.filter(([n])=>n==='nw_import_chunk').map(([,args])=>args.p_index),[2,3,4]);
 assert.equal(progress.at(-1).phase,'finalize');
});
test('a lost finalize response can be recovered without re-uploading a world',async()=>{
 const a=await prepareStagedArchive(archive,sha,{crypto:webcrypto});const calls=[];
 const out=await uploadStagedArchive(a,'job',{rpc:async(name)=>{calls.push(name);return {result:{world_id:'new'}};}});
 assert.equal(out.world_id,'new');assert.deepEqual(calls,['nw_import_begin']);
});
test('migration isolates private staging and uses atomic new-world finalize',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/008_staged_archive_import.sql',import.meta.url),'utf8');
 assert.match(sql,/primary key\(owner_id,id\)/);
 assert.match(sql,/sha256\(convert_to\(p_payload,'UTF8'\)\)/);
 assert.match(sql,/with recursive reachable/);
 assert.match(sql,/if j.result is not null then return j.result/);
 assert.match(sql,/insert into public.nw_worlds\(id,owner_id/);
 assert.doesNotMatch(sql,/delete from public.nw_worlds/i);
 assert.match(sql,/revoke all on public.nw_import_jobs,public.nw_import_chunks,public.nw_import_rows from public,anon,authenticated/);
});
