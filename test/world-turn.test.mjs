import test from 'node:test';import assert from 'node:assert/strict';
import {replay,validateScene,validateStateAppend,branchAncestry,buildNextContext} from '../public/core/continuity.mjs';
import {dynamicsView} from '../public/core/world-dynamics.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
const body='Клуб создан. Дежурство по понедельникам. Начались переговоры. Решение принято. Два друга поссорились.';
const ev=(k,id,fields)=>({id,type:'world',dynamics_version:1,dynamics_kind:k,record_id:id,key:'dynamics:'+k+':'+id,description:'Начались переговоры',evidence:'Начались переговоры',...fields});
const group={id:'g',type:'world',social_record_version:1,social_kind:'group',record_id:'club',key:'social:group:club',name:'Клуб',purpose:'Учёба',status:'active',evidence:'Клуб создан'};
const inst=ev('institution','school',{group_id:'club',name:'Клуб',function:'Учёба',place:'Зал',status:'operating'});
const contest=ev('contest','book',{title:'Спор за книгу',resource:'Книга',actors:['А','Б'],status:'open'});
const bond=ev('bond','friend',{actor:'А',counterparty:'Б',bond_type:'friendship',status:'strained'});
const change=ev('development','repair',{title:'Ремонт',place:'Зал',actors:[],status:'scheduled',due_at:'1991-09-02 12:00'});
const routine={id:'r',type:'world',world_record_version:1,record_kind:'routine',record_id:'duty',key:'routine:duty',actor:'А',activity:'Дежурство',place:'Зал',status:'active',weekdays:[1],start:'10:00',end:'11:00',evidence:'Дежурство по понедельникам'};
const scene=(id,events,parent_scene_id=null,world_time='1991-09-02 09:00')=>({id,body,events,parent_scene_id,world_time});
test('dynamics are separate from emotions, economy and knowledge',()=>{
 const p=replay([scene('a',[group,inst,contest,bond,change])]);const v=dynamicsView(p);
 assert.equal(v.institutions.length,1);assert.equal(v.bonds[0].status,'strained');assert.equal(v.contests.length,1);
 assert.equal(p.relationships.length,0);assert.equal(p.knowledge.length,0);assert.equal(p.items.length,0);
});
test('invalid institutional reference, changed bond and terminal contest fail preflight',()=>{
 const history=[scene('a',[group,inst,bond,contest]),scene('b',[{...contest,status:'decided',outcome:'Книга остаётся на полке'}],'a')];
 assert.equal(validateStateAppend([], [inst],body).ok,false);
 assert.equal(validateStateAppend(history,[{...bond,counterparty:'В'}],body).ok,false);
 assert.equal(validateStateAppend(history,[contest],body).ok,false);
 assert.equal(validateScene({body,events:[{...contest,status:'decided'}]}).ok,false);
 assert.equal(validateScene({body,events:[{id:'bad',type:'world',key:contest.key,evidence:'Начались переговоры'}]}).ok,false);
});
test('time jump notices a whole elapsed routine and due changes without executing either',()=>{
 const scenes=[scene('a',[group,inst,contest,bond,change,routine])],p=replay(scenes);
 const before=JSON.stringify(p);
 const turn=prepareStoryTurn(scenes,p,[],{target_time:'1991-09-02 13:00',actors:['А']});
 assert.equal(turn.elapsed_story_minutes,240);
 assert.ok(turn.candidates.some(x=>x.kind==='routine'));
 assert.ok(turn.candidates.some(x=>x.kind==='development'&&x.timing==='reached_requires_story'));
 assert.ok(turn.candidates.every(x=>x.certainty==='candidate_only_not_performed'));
 assert.equal(JSON.stringify(p),before);
 assert.throws(()=>prepareStoryTurn(scenes,p,[],{target_time:'1991-09-01'}));
 assert.equal(prepareStoryTurn(scenes,p,[],{target_time:'1991-09-02'}).elapsed_story_minutes,null);
 assert.ok(buildNextContext({world:{seed:'Мир'},scenes}).next_turn.candidates.length);
});
test('alternate world developments are absent, partial history is labelled',()=>{
 const a=scene('a',[group,inst]),b=scene('b',[contest],'a'),c=scene('c',[change],'a');
 const chain=branchAncestry([a,b,c],'c'),p=replay(chain);
 assert.equal(dynamicsView(p).contests.length,0);
 const t=prepareStoryTurn(chain,p,[],{complete:false});
 assert.equal(t.memory_complete,false);assert.ok(t.warnings.length);
 assert.equal(t.candidates.some(x=>x.kind==='contest'),false);
});
test('closed place is visible as a constraint, never proof of travel or presence',()=>{
 const place={id:'p',type:'world',world_record_version:1,record_kind:'place',record_id:'hall',key:'place:hall',name:'Зал',status:'closed',evidence:'Клуб создан'};
 const scenes=[scene('a',[routine,place])],p=replay(scenes);
 const t=prepareStoryTurn(scenes,p,[],{target_time:'1991-09-02 10:30'});
 assert.equal(t.candidates[0].location_status,'closed');
 assert.equal(t.candidates[0].last_known_location,null);
});
