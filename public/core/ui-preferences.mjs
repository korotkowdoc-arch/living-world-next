/** Device-local UI preferences only. Never contains story text, names or tokens. */
const KEY='nw_ui_v1';
export const DEFAULT_UI=Object.freeze({theme:'dark',density:'normal',textScale:'normal',favorites:['character','tasks','calendar','places'],hudFields:['hunger','thirst','energy','hygiene','comfort','stress'],lastSection:'dashboard'});
const sectionIds=new Set(['dashboard','character','health','wardrobe','relationships','contacts','inventory','finances','property','work','education','skills','calendar','places','letters','tasks','journal','memories','settings','interests','goals','circles','psychology','network','news','timeline','map']);
const needs=new Set(DEFAULT_UI.hudFields);
const selected=(value,choices,fallback)=>choices.includes(value)?value:fallback;
const filtered=(value,allowed,max,fallback)=>Array.isArray(value)?[...new Set(value.filter(x=>allowed.has(x)))].slice(0,max):[...fallback];
export function normalizeUI(v={}){
 return {theme:selected(v?.theme,['dark','light','system'],'dark'),density:selected(v?.density,['compact','normal','large'],'normal'),textScale:selected(v?.textScale,['small','normal','large'],'normal'),favorites:filtered(v?.favorites,sectionIds,8,DEFAULT_UI.favorites),hudFields:filtered(v?.hudFields,needs,6,DEFAULT_UI.hudFields),lastSection:sectionIds.has(v?.lastSection)?v.lastSection:'dashboard'};
}
export function readUI(storage){try{return normalizeUI(JSON.parse(storage?.getItem(KEY)||'{}'));}catch{return normalizeUI();}}
export function saveUI(storage,value){const v=normalizeUI(value);try{storage?.setItem(KEY,JSON.stringify(v));}catch{}return v;}
export function filterSections(sections,query=''){const q=String(query).trim().toLocaleLowerCase('ru');return q?sections.filter(s=>[s.id,s.label,...(s.actions||[])].some(x=>String(x).toLocaleLowerCase('ru').includes(q))):sections;}
export function hudStates(needs=[],fields=DEFAULT_UI.hudFields){
 const known=new Set(['comfortable','noticeable','urgent','critical']);
 return needs.filter(n=>fields.includes(n.need)).map(n=>({need:n.need,label:n.label,observed:known.has(n.status)?n.status:'unknown',estimate:known.has(n.forecast?.estimated_status)?n.forecast.estimated_status:null,source:n.source??null}));
}
