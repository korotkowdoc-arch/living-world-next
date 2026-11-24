import test from 'node:test';import assert from 'node:assert/strict';
import {replay,validateScene,validateStateAppend,branchAncestry} from '../public/core/continuity.mjs';
import {growthView} from '../public/core/growth.mjs';
import {storyDrivers} from '../public/core/story-drivers.mjs';
const body='Драко упражнялся. Снейп сообщил Драко слух. Драко пересказал слух Люпину. Проект завершён. Причина установлена.';
const e=(k,r,fields)=>({id:r,type:'world',growth_version:1,growth_kind:k,record_id:r,key:'growth:'+k+':'+r,evidence:'Драко упражнялся',...fields});
const skill=e('skill','s',{actor:'Драко',name:'Зелья',description:'Упражнения',status:'learning'});
const project=e('project','p',{actor:'Драко',title:'Исследование',description:'Опыт',status:'active'});
const rumor=e('rumor','r',{sender:'Снейп',recipient:'Драко',topic_id:'letter',claim:'Письмо украдено',channel:'разговор'});
const second=e('rumor','r2',{sender:'Драко',recipient:'Люпин',topic_id:'letter',claim:'Письмо спрятано',channel:'разговор',parent_rumor_id:'r'});
const scene=(id,events,parent_scene_id=null)=>({id,body,events,parent_scene_id});
test('growth is recorded explicitly, rumor can change wording without creating knowledge',()=>{
 const p=replay([scene('a',[skill,project,rumor]),scene('b',[second])]);const v=growthView(p);
 assert.equal(v.skills[0].status,'learning');assert.equal(v.projects[0].status,'active');
 assert.equal(v.rumors.length,2);assert.equal(v.rumors[0].claim,'Письмо спрятано');assert.equal(p.knowledge.length,0);
 assert.equal(growthView(p,{actor:'Люпин'}).rumors.length,1);
 assert.equal(storyDrivers(p).some(x=>x.kind==='personal_project'),true);
});
test('wrong rumor source and reopened terminal projects rejected before append',()=>{
 const scenes=[scene('a',[rumor,project]),scene('b',[{...project,status:'completed',outcome:'Получен результат'}])];
 assert.equal(validateStateAppend(scenes,[{...second,sender:'Гарри'}],body).ok,false);
 assert.equal(validateStateAppend(scenes,[project],body).ok,false);
 assert.equal(validateStateAppend(scenes,[rumor],body).ok,false);
 assert.equal(validateScene({body,events:[{...project,status:'completed'}]}).ok,false);
});
test('established causal links require earlier records and reject directed cycles',()=>{
 const a=e('cause','c1',{from_key:skill.key,to_key:project.key,status:'established',description:'Навык помог проекту'});
 const b=e('cause','c2',{from_key:project.key,to_key:skill.key,status:'established',description:'Обратная причина'});
 const scenes=[scene('a',[skill,project,a])];
 assert.equal(validateStateAppend(scenes,[b],body).ok,false);
 assert.equal(validateStateAppend(scenes,[{...b,status:'claimed',actor:'Драко'}],body).ok,true);
 assert.equal(validateStateAppend([], [a],body).ok,false);
});
test('voice fields survive independent changes, alternative rumors stay out of canon',()=>{
 const a=scene('a',[{id:'v',type:'character',name:'Драко',state_patch:{speech_style:'Короткие реплики',humor:'Сарказм'},evidence:'Драко упражнялся'},rumor]);
 const b=scene('b',[second],'a'),c=scene('c',[{id:'v2',type:'character',name:'Драко',state_patch:{mood:'Устал'},evidence:'Драко упражнялся'}],'a');
 const p=replay(branchAncestry([a,b,c],'c'));
 assert.equal(growthView(p).rumors.length,1);
 assert.equal(p.people[0].state_fields.find(x=>x.field==='speech_style').source.scene_id,'a');
 assert.equal(p.people[0].state_fields.find(x=>x.field==='mood').source.scene_id,'c');
});
test('many plans do not starve other story pressure categories',()=>{
 const plans=Array.from({length:30},(_,i)=>({actor:'А'+i,goal:'Цель',status:'active'}));
 const p={plans,worldFacts:[project],relationships:[{a:'А',b:'Б',stance:'enemies'}]};
 const drivers=storyDrivers(p,[],{max:5});assert.equal(drivers.length,5);
 assert.ok(drivers.some(x=>x.kind==='personal_project'));assert.ok(drivers.some(x=>x.kind==='established_antagonism'));
});
