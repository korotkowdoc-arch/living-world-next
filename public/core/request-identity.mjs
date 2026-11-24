/** Stable, content-bound UUID for retrying an interrupted browser write.
 * Same world/head/payload => same request_id even after a page reload.
 * Different payload => different id; we never claim uncertain writes succeeded.
 * This function is only an idempotency key, not user authorization.
 */
export async function requestIdentity(kind,payload,cryptoProvider=globalThis.crypto){
 if(typeof kind!=='string'||!kind||!payload||typeof payload!=='object')throw Error('Неверная запись для сохранения.');
 if(!cryptoProvider?.subtle)throw Error('Для защищённого сохранения нужен HTTPS.');
 const bytes=new TextEncoder().encode('LWN:v1:'+kind+':'+JSON.stringify(payload));
 const digest=new Uint8Array(await cryptoProvider.subtle.digest('SHA-256',bytes));
 const b=digest.slice(0,16);b[6]=(b[6]&0x0f)|0x50;b[8]=(b[8]&0x3f)|0x80;
 const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

/** JSONB may return object keys in a different order. Compare semantic JSON
 * without changing existing deterministic request IDs or array order.
 */
export function sameJson(a,b){
 if(a===b)return true;
 if(a===null||b===null||typeof a!==typeof b||typeof a!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameJson(v,b[i]));
 const keys=Object.keys(a),other=Object.keys(b);
 return keys.length===other.length&&keys.every(k=>Object.hasOwn(b,k)&&sameJson(a[k],b[k]));
}
