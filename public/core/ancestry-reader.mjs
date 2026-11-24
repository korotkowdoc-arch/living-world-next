/** Strict newest-first ancestry paging. A capped read is explicitly incomplete. */
export function createAncestryReader(head,{maxScenes=50000,pageSize=200}={}){
 if(!Number.isInteger(maxScenes)||maxScenes<1||maxScenes>50000||!Number.isInteger(pageSize)||pageSize<1||pageSize>200)throw Error('Invalid ancestry limits');
 const rows=[],seen=new Set();let expected=head??null,finished=head==null,complete=finished;
 return {
  next(){if(finished)return null;return {offset:rows.length,limit:Math.min(pageSize,Math.max(1,maxScenes-rows.length))};},
  accept(page){
   if(finished)throw Error('History already finished');
   const limit=Math.min(pageSize,Math.max(1,maxScenes-rows.length));
   if(!Array.isArray(page)||page.length>limit)throw Error('Invalid history page');
   if(rows.length===maxScenes){if(page.length!==1||page[0]?.id!==expected||seen.has(expected))throw Error('Missing or mixed ancestor at history limit');complete=false;finished=true;return;}
   for(const row of page){
    if(!row?.id||row.id!==expected||seen.has(row.id))throw Error('History contains a missing, repeated or mixed ancestor');
    if(!Object.hasOwn(row,'parent_scene_id'))throw Error('History page lacks parent identity');
    seen.add(row.id);rows.push(row);expected=row.parent_scene_id??null;
   }
   if(expected===null){finished=true;complete=true;}
   else if(page.length<limit)throw Error('History ended before its recorded root');
  },
  result(){if(!finished)throw Error('History read unfinished');return {scenes:rows.slice().reverse(),complete};}
 };
}
