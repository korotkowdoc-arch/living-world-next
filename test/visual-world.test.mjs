import test from 'node:test';
import assert from 'node:assert/strict';
import {visualSubjects,visualReferences,visualPrompt,visualRequest,visualPreferences,visibleVisuals,visualUploadHash,parseVisualHash,imageFileError} from '../public/core/visual-world.mjs';
import {validateImageBytes} from '../public/lib/visual-storage.mjs';
const world='11111111-1111-4111-8111-111111111111',asset='22222222-2222-4222-8222-222222222222';
const overview={actor:'Hero',character:{fields:[{field:'appearance',value:'Black hair'}]},contacts:{records:[{name:'Friend'}]},inventory:{records:[{id:'wand',name:'Wand'}]},documents:{library:{records:[{id:'book',title:'Magic',summary:'Study',contents:[{id:'one',title:'Known',read:true},{id:'two',title:'Secret',read:false}]}]}}};
test('visual subjects and prompts are based on player-visible data; references immutable and scoped',()=>{
 const subjects=visualSubjects(overview,world);
 assert.ok(subjects.some(s=>s.subject_id==='Hero'&&s.detail.includes('Black hair')));
 assert.ok(subjects.some(s=>s.subject_id==='book:one'));
 assert.ok(!subjects.some(s=>s.subject_id==='book:two'));
 const subject=subjects.find(s=>s.subject_id==='Hero');
 const rows=[{id:asset,subject_kind:'character',subject_id:'Hero',status:'ready',identity_notes:'Original look'},{id:world,subject_kind:'character',subject_id:'Hero',status:'pending'},{subject_kind:'character',subject_id:'Friend',status:'ready'}];
 const refs=visualReferences(rows,subject);assert.equal(refs.length,1);assert.equal(refs[0].id,asset);
 const prompt=visualPrompt(subject,'Portrait',refs,{style:'Watercolor'});assert.match(prompt,/Black hair/);assert.match(prompt,/Original look/);assert.match(prompt,/текущие сведения имеют приоритет/);assert.match(prompt,/Watercolor/);
 const request=visualRequest({...subject,kind:'portrait',prompt,reference_asset_ids:[asset]});assert.equal(request.reference_asset_ids[0],asset);
 assert.throws(()=>visualRequest({...request,reference_asset_ids:[asset,asset]}));
 assert.throws(()=>visualRequest({...request,kind:'unknown'}));
 assert.equal(visibleVisuals(rows,subjects,'inventory').length,0);
 assert.equal(visualPreferences({frequency:'bad'}).frequency,'request');
});
test('authenticated app link is strictly validated, no arbitrary file types',async()=>{
 assert.deepEqual(parseVisualHash(visualUploadHash(world,asset)),{worldId:world,assetId:asset});
 assert.equal(parseVisualHash('#visual=../../evil'),null);
 assert.throws(()=>visualUploadHash('https://evil',asset));
 assert.ok(imageFileError({type:'image/svg+xml',size:100}));
 assert.ok(imageFileError({type:'image/png',size:9000000}));
 await validateImageBytes(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}));
 await assert.rejects(validateImageBytes(new Blob(['not an image'],{type:'image/png'})));
});

test('shared episode contacts appear even when formal contacts empty; explicit identity revision takes precedence',()=>{
 const subjects=visualSubjects({actor:'Hero',character:{fields:[{field:'birth_date',value:'1990-01-01'}]},contacts:{records:[]},world_depth:{social:{nodes:[{name:'Hero'},{name:'Friend'}]},places:{places:{records:[{name:'Без постоянного жилья'},{name:'Library'}]}}}},world);
 assert.ok(subjects.some(s=>s.subject_kind==='character'&&s.subject_id==='Friend'));
 assert.ok(subjects.some(s=>s.subject_id==='Hero'&&s.detail.includes('1990-01-01')));
 assert.ok(!subjects.some(s=>s.subject_id==='Без постоянного жилья'));
 assert.ok(subjects.some(s=>s.subject_id==='Library'));
 const prompt=visualPrompt({title:'Hero',detail:'New haircut'},'Portrait',[{identity_notes:'Old haircut'}]);
 assert.match(prompt,/Сохраняй подтверждённые признаки: New haircut/);
 assert.match(prompt,/Исторические заметки.*Old haircut/);
 assert.match(prompt,/текущие сведения имеют приоритет/);
});
