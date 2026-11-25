/** Native ChatGPT file handoff: no generation API, no credentials in source fetch. */
export const MAX_VISUAL_BYTES=8*1024*1024;
export const OPENAI_FILE_HOSTS=Object.freeze(['files.oaiusercontent.com']);
export const nativeImageDescriptor={type:'object',properties:{download_url:{type:'string'},file_id:{type:'string'},mime_type:{type:'string'},file_name:{type:'string'}},required:['download_url','file_id'],additionalProperties:false};
export function trustedFileUrl(value){
 if(typeof value!=='string'||value.length>16384)throw Error('Missing authorized ChatGPT file URL. Select the actual image from ChatGPT Library.');
 let u;try{u=new URL(value);}catch{throw Error('Invalid ChatGPT file URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!OPENAI_FILE_HOSTS.includes(u.hostname))throw Error('Only authorized ChatGPT file download URLs are supported.');
 return u;
}
export function imageMime(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x)&&String.fromCharCode(...b.slice(12,16))==='IHDR')return 'image/png';
 if(b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217)return 'image/jpeg';
 if(b.length>=16&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
 throw Error('File is not a supported PNG, JPEG or WebP image.');
}
export async function limitedBytes(res,limit=MAX_VISUAL_BYTES){
 if(!res.ok)throw Error('Image bytes unavailable. Select the file again if the link expired.');
 const length=Number(res.headers.get('content-length')||0);if(length>limit){await res.body?.cancel();throw Error('Image exceeds 8 MB.');}
 if(!res.body)throw Error('Missing image body');
 const reader=res.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Image exceeds 8 MB.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 if(!size)throw Error('Empty image');
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}return bytes;
}
export async function fetchNativeImage(file,fetcher=fetch){
 if(!file||typeof file.file_id!=='string'||!file.file_id.trim()||file.file_id.length>512)throw Error('ChatGPT did not provide an authorized image file. Select or attach the image itself.');
 if(file.mime_type&&!['image/png','image/jpeg','image/webp','application/octet-stream'].includes(file.mime_type))throw Error('Select a PNG, JPEG or WebP image.');
 let u=trustedFileUrl(file.download_url);
 for(let i=0;i<3;i++){
  let res;try{res=await fetcher(u.href,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw Error('Could not retrieve authorized ChatGPT file; select it again.');}
  if([301,302,303,307,308].includes(res.status)){const location=res.headers.get('location');await res.body?.cancel();if(!location)throw Error('Missing file redirect');u=trustedFileUrl(new URL(location,u).href);continue;}
  const bytes=await limitedBytes(res),mime=imageMime(bytes);
  if(file.mime_type&&file.mime_type!=='application/octet-stream'&&file.mime_type!==mime)throw Error('Image format does not match file metadata.');
  return {bytes,mime};
 }
 throw Error('Too many file redirects');
}
const sameBytes=(a,b)=>a.byteLength===b.byteLength&&a.every((x,i)=>x===b[i]);
export function privateImagePath(asset){
 if(!/^([0-9a-f-]{36}\/){2}[0-9a-f-]{36}$/i.test(asset?.storage_path||''))throw Error('Invalid private image path');
 return asset.storage_path.split('/').map(encodeURIComponent).join('/');
}
export async function transferNativeImage({asset,file,download=fetchNativeImage,read,upload,finish}){
 if(!asset||!['pending','ready'].includes(asset.status))throw Error('Image request is not available');
 const {bytes,mime}=await download(file);
 if(asset.status==='ready'){
  const existing=await read(asset);if(!sameBytes(existing,bytes))throw Error('This image is already saved and immutable. Create a new request for a different image.');
  return {asset,reused:true};
 }
 let reused=false;
 try{await upload(asset,bytes,mime);}catch{
  let existing;try{existing=await read(asset);}catch{throw Error('Could not save image. Retry the request.');}
  if(!sameBytes(existing,bytes))throw Error('A different image already occupies this request. It was not overwritten.');
  reused=true;
 }
 const saved=await finish(asset.id);
 if(saved?.status!=='ready'||saved.mime_type!==mime||Number(saved.byte_size)!==bytes.byteLength)throw Error('Storage did not confirm the actual image; refresh and retry.');
 return {asset:saved,reused};
}
export function base64Image(bytes){
 let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);
}
