import test from 'node:test';
import assert from 'node:assert/strict';
import {readPagedArchiveRows} from '../public/lib/storage.mjs';

const worldId='11111111-1111-4111-8111-111111111111';
const data=[
 {id:'a',created_at:'2026-11-24T10:00:00+00:00'},
 {id:'b',created_at:'2026-11-24T10:00:00+00:00'},
 {id:'c',created_at:'2026-11-24T10:00:00+00:00'},
 {id:'d',created_at:'2026-11-24T10:00:01+00:00'}
];
function requester(rows,requests=[]){
 return async path=>{
  const uri=new URL(path,'https://example.invalid');
  requests.push(uri);
  return rows.slice(Number(uri.searchParams.get('offset')),Number(uri.searchParams.get('offset'))+Number(uri.searchParams.get('limit')));
 };
}
test('archive export uses stable unique ordering when multiple scenes share exact timestamp',async()=>{
 const requests=[];
 const result=await readPagedArchiveRows('nw_scenes',worldId,
  {pageSize:2,maxRows:10,request:requester(data,requests)});
 assert.deepEqual(result,data);
 assert.ok(requests.length>=3);
 for(const url of requests){
  assert.equal(url.searchParams.get('order'),'created_at.asc,id.asc');
  assert.equal(url.searchParams.get('world_id'),'eq.'+worldId);
 }
});
test('archive export handles exactly maxRows instead of refusing a complete backup',async()=>{
 const reqs=[];
 const result=await readPagedArchiveRows('nw_scenes',worldId,
  {pageSize:2,maxRows:3,request:requester(data.slice(0,3),reqs)});
 assert.equal(result.length,3);
 assert.deepEqual(reqs.map(r=>[r.searchParams.get('offset'),r.searchParams.get('limit')]),
  [['0','2'],['2','1'],['3','1']]);
});
test('archive export refuses truncation when even one extra row exists at hard cap',async()=>{
 await assert.rejects(readPagedArchiveRows('nw_scenes',worldId,
  {pageSize:2,maxRows:3,request:requester(data)}),/превышает 3/);
});
test('archive exporter rejects duplicate rows across offset pages under concurrent changes',async()=>{
 const request=async path=>Number(new URL(path,'https://example.invalid').searchParams.get('offset'))===0?
  data.slice(0,2):[data[1],data[2]];
 await assert.rejects(readPagedArchiveRows('nw_scenes',worldId,
  {pageSize:2,maxRows:10,request}),/Повтор записи/);
});
test('archival queries accept only known owner-scoped tables and valid page bounds',async()=>{
 await assert.rejects(readPagedArchiveRows('auth.users',worldId,{request:requester([])}),/Недопустимый раздел/);
 await assert.rejects(readPagedArchiveRows('nw_scenes',worldId,{pageSize:0,request:requester([])}),/Неверные параметры/);
 await assert.rejects(readPagedArchiveRows('nw_revisions',worldId,{request:async()=>({unexpected:'json'})}),/Неверная страница/);
});
