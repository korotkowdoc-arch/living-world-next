import {buildDurableProjection,validateSnapshotRequest,PROJECTION_ENGINE_ID} from './durable-projection.mjs';
/** Pure HTTP handler; adapters authenticate the real caller and use only the
 * trusted service role for the private SQL snapshot RPCs. */
export function createSnapshotHandler({authenticate,readInput,putSnapshot}){
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 return async req=>{
  if(req.method!=='POST')return json({status:'method_not_allowed'},405);
  const header=req.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(header))return json({status:'unauthorized'},401);
  let args;
  try{
   if(Number(req.headers.get('content-length'))>2048)return json({status:'invalid_request'},400);
   const raw=await req.text();if(raw.length>2048)return json({status:'invalid_request'},400);
   args=validateSnapshotRequest(JSON.parse(raw));
  }catch{return json({status:'invalid_request'},400);}
  let owner;
  try{owner=await authenticate(header.slice(7));}catch{return json({status:'unavailable'},503);}
  if(!owner)return json({status:'unauthorized'},401);
  try{
   const input=await readInput(owner,args),result=buildDurableProjection(input,args.head);
   if(!result)return json({status:'unavailable'},404);
   let stored=!result.persist;
   if(result.persist){try{stored=await putSnapshot(owner,args,result.checkpoint)===true;}catch{stored=false;}}
   return json({status:'ready',engine_id:PROJECTION_ENGINE_ID,checkpoint:result.checkpoint,stored});
  }catch{return json({status:'unavailable'},503);}
 };
}
