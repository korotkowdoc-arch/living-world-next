/** Bounded, process-local cache of immutable committed ancestry.
 * Authentication and current branch/head checks are performed by the caller
 * on EVERY read, including a hit. Never stores auth tokens or incomplete pages.
 * This is an optimization, not persistent memory or a source of truth. */
export function createAncestryCache({maxEntries=4,maxBytes=12*1024*1024,ttlMs=120000,now=()=>Date.now()}={}){
 const rows=new Map();let bytes=0;
 const key=(scope,world,branch,head,limit)=>JSON.stringify([scope,world,branch,head,limit]);
 const remove=k=>{const e=rows.get(k);if(e){bytes-=e.bytes;rows.delete(k);}};
 const expire=()=>{for(const [k,e] of rows)if(now()>=e.expires)remove(k);};
 return {
  get(scope,world,branch,head,limit){
   if(!scope||!world||!branch||!head)return null;
   expire();const k=key(scope,world,branch,head,limit),e=rows.get(k);if(!e)return null;
   rows.delete(k);rows.set(k,e);return JSON.parse(e.payload);
  },
  put(scope,world,branch,head,limit,result){
   if(!scope||!world||!branch||!head||!result?.complete||result.scenes?.at(-1)?.id!==head)return false;
   expire();const k=key(scope,world,branch,head,limit),payload=JSON.stringify(result),size=payload.length*2;
   if(size>maxBytes)return false;
   remove(k);while(rows.size>=maxEntries||bytes+size>maxBytes){const first=rows.keys().next();if(first.done)return false;remove(first.value);}
   rows.set(k,{payload,bytes:size,expires:now()+ttlMs});bytes+=size;return true;
  },
  stats(){expire();return {entries:rows.size,bytes};}
 };
}
