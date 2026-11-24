import test from 'node:test';import assert from 'node:assert/strict';
import {replay,validateScene,branchAncestry} from '../public/core/continuity.mjs';
import {relationshipHistory} from '../public/core/relationship-memory.mjs';
import {activityView} from '../public/core/activities.mjs';
import {storyDrivers} from '../public/core/story-drivers.mjs';
const body='Драко ненавидит Гарри. Они вместе работали. Драко продолжил заниматься.';
const s=(id,events,parent_scene_id=null)=>({id,body,events,parent_scene_id});
const rel={id:'r',type:'relationship',a:'Драко',b:'Гарри',stance:'enemies',relationship_version:1,relationship_patch:{affection:'hatred',trust:'distrusted'},evidence:'Драко ненавидит Гарри'};
const meeting={id:'meet',type:'world',interaction_version:1,interaction_kind:'cooperation',actors:['Драко','Гарри'],description:'Работали вместе',evidence:'Они вместе работали'};
const habit={id:'h',type:'world',activity_version:1,activity_kind:'habit',record_id:'study',key:'activity:habit:study',actor:'Драко',name:'Учёба',description:'Упражнения',status:'active',evidence:'Драко продолжил заниматься'};
const act={...habit,id:'a',activity_kind:'activity',record_id:'work',key:'activity:activity:work',actors:['Драко','Гарри'],status:'planned'};
test('cooperation does not erase hostility, trust, or create reciprocal feelings',()=>{
 const a=s('a',[rel]),b=s('b',[meeting,{id:'r2',type:'relationship',a:'Драко',b:'Гарри',relationship_version:1,relationship_patch:{cooperation:'cooperating'},evidence:meeting.evidence}],'a');
 const p=replay([a,b]);const v=relationshipHistory([a,b],p,{actor:'Драко',other:'Гарри'});
 assert.equal(v.current.length,1);assert.equal(v.current[0].stance,'enemies');assert.equal(v.current[0].relationship_fields.find(x=>x.field==='trust').source.scene_id,'a');
 assert.equal(v.current[0].relationship_fields.find(x=>x.field==='cooperation').source.scene_id,'b');
 assert.equal(v.total_history,3);assert.equal(storyDrivers(p).some(x=>x.kind==='established_antagonism'),true);
});
test('relationship locks apply to new emotional fields and malformed fields fail',()=>{
 const rule={text:'Без уважения',active:true,metadata:{relationship_lock:{a:'Драко',b:'Гарри',forbid_respect:true,forbid_reconciliation:true}}};
 assert.equal(validateScene({body,events:[{...rel,relationship_patch:{respect:'respected'}}],directives:[rule]}).ok,false);
 assert.equal(validateScene({body,events:[{...rel,relationship_patch:{trust:100}}]}).ok,false);
});
test('alternative meetings never enter the active branch',()=>{
 const a=s('a',[rel]),b=s('b',[meeting],'a'),c=s('c',[],'a');const chain=branchAncestry([a,b,c],'c');
 assert.equal(relationshipHistory(chain,replay(chain),{actor:'Гарри'}).total_history,1);
});
test('multiple named habits persist; finished shared activity cannot reopen under same id',()=>{
 const a=s('a',[habit,{...habit,id:'h2',record_id:'walk',key:'activity:habit:walk',name:'Прогулка'},act]);
 const b=s('b',[{...act,id:'end',status:'completed'}],'a');
 const c=s('c',[{...act,id:'again',status:'in_progress'}],'b');
 const p=replay([a,b,c]),v=activityView(p,{actor:'Драко'});
 assert.equal(v.habits.length,2);assert.equal(v.activities[0].status,'completed');assert.equal(p.validation_warnings.length,1);
 assert.equal(activityView(p,{actor:'Снейп'}).activities.length,0);
});
