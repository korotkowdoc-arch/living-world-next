import test from 'node:test';import assert from 'node:assert/strict';
import {replay,validateScene,buildNextContext} from '../public/core/continuity.mjs';
import {socialWorldView} from '../public/core/social-world.mjs';
import {knowledgeView} from '../public/core/knowledge.mjs';
import {validateMemoryNotes} from '../public/core/memory-notes.mjs';
const body='Снейп сказал, что письмо украдено. Драко не согласен. Клуб создан.';
const s=(id,events)=>({id,body,events});
const g={id:'g',type:'world',social_record_version:1,social_kind:'group',record_id:'club',key:'social:group:club',name:'Клуб',purpose:'Учёба',status:'active',evidence:'Клуб создан'};
const m={id:'m',type:'world',social_record_version:1,social_kind:'membership',record_id:'member1',key:'social:membership:member1',group_id:'club',actor:'Драко',status:'member',evidence:'Драко не согласен'};
const k={id:'k',type:'knowledge',knowledge_version:1,topic_id:'letter',actor:'Снейп',fact:'Письмо украдено',channel:'claim',status:'believes',evidence:'Снейп сказал, что письмо украдено'};
test('groups, membership and independent belief do not imply common knowledge',()=>{
 const a=s('a',[g,m,k]),b=s('b',[{...k,id:'k2',actor:'Драко',status:'suspects'},{...m,id:'m2',status:'left'}]);
 const p=replay([a,b]);const v=socialWorldView(p,{actor:'Драко'});
 assert.equal(v.memberships[0].status,'left');
 assert.equal(knowledgeView(p,{actor:'Снейп'}).records[0].status,'believes');
 assert.equal(knowledgeView(p,{actor:'Драко'}).records[0].status,'suspects');
 assert.equal(knowledgeView(p,{actor:'Гарри'}).total,0);
 assert.equal(buildNextContext({world:{},scenes:[a,b]}).social_world.groups[0].name,'Клуб');
});
test('a membership cannot silently change identity; invalid knowledge rejected',()=>{
 const p=replay([s('a',[g,m]),s('b',[{...m,actor:'Гарри'}])]);
 assert.equal(socialWorldView(p).memberships[0].actor,'Драко');
 assert.equal(p.validation_warnings.length,1);
 assert.equal(validateScene(s('a',[{...k,status:'truth'}])).ok,false);
});
test('historical notes require exact source and remain separate from canon',()=>{
 const note={key:'n1',kind:'claim',summary:'Снейп утверждает, что письмо украдено',quote:'Снейп сказал, что письмо украдено',actors:['Снейп']};
 const scene=s('a',[]);
 assert.deepEqual(validateMemoryNotes(scene,[note]),[note]);
 assert.throws(()=>validateMemoryNotes(scene,[{...note,quote:'выдуманный текст'}]));
 assert.throws(()=>validateMemoryNotes(scene,[note,note]));
 assert.equal(replay([scene]).knowledge.length,0);
});
