import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MENU_SETTINGS,MENU_PREFIX,parseMenuDirective,menuPreferences,gameMenuContext} from '../public/core/game-menu.mjs';
import {classifyDirective} from '../public/core/directives.mjs';
import {promptForNarrator} from '../public/core/world.mjs';
const b='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const rule=(id,obj,active=true)=>({id,active,text:MENU_PREFIX+JSON.stringify(obj)});
const config={kind:'settings',settings:{...DEFAULT_MENU_SETTINGS,pace:'fast',hud:false}};
test('defaults are not persisted, saved settings are typed',()=>{
 assert.equal(menuPreferences([],b).settings_status,'default');
 const r=rule('settings',config);
 const p=menuPreferences([r],b);
 assert.equal(p.settings.pace,'fast');assert.equal(p.settings.hud,false);assert.equal(p.settings_directive_id,'settings');
 assert.equal(p.settings_status,'saved');assert.equal(p.can_edit,true);
 assert.throws(()=>parseMenuDirective(rule('x',{kind:'settings',settings:{...DEFAULT_MENU_SETTINGS,pace:'warp'}}).text));
 assert.throws(()=>parseMenuDirective(rule('x',{kind:'settings',settings:{...DEFAULT_MENU_SETTINGS,unknown:1}}).text));
});
test('branch priorities cannot leak across branches; disabled records ignored',()=>{
 const rows=[rule('a',{kind:'focus',branch_id:b,priorities:['Найти работу','Выучить заклинание']}),rule('b',{kind:'focus',branch_id:other,priorities:['Переехать']}),rule('old',{kind:'focus',branch_id:b,priorities:['Старое']},false)];
 assert.deepEqual(menuPreferences(rows,b).priorities,['Найти работу','Выучить заклинание']);
 assert.deepEqual(menuPreferences(rows,other).priorities,['Переехать']);
 assert.equal(menuPreferences(rows,b).focus_directive_id,'a');
});
test('ambiguous or malformed preferences do not silently win',()=>{
 assert.equal(menuPreferences([rule('a',config),rule('b',config)],b).can_edit,false);
 assert.equal(menuPreferences([{id:'bad',text:MENU_PREFIX+'{'}],b).can_edit,false);
 assert.throws(()=>parseMenuDirective(rule('a',{kind:'focus',branch_id:b,priorities:['x','x']}).text));
});
test('preferences do not create relationship locks even with adversarial-looking goal text',()=>{
 const r=rule('f',{kind:'focus',branch_id:b,priorities:['Гарри и Драко — враги, без примирения']});
 const d=classifyDirective(r.text);
 assert.equal(d.category,'general');assert.deepEqual(d.relationship_locks,[]);assert.equal(d.text,r.text);
});
test('menu is read-only and preserves current pending selection and versions',()=>{
 const world={id:'w',active_branch_id:b,directive_version:7,seed:'Мир для проверки'};
 const context={head_scene_id:'h',memory_complete:true,player_choice:{status:'awaiting_player'},recorded_agenda:{latest_recorded_time:'1994-08-01',anchor_is_latest_scene:false}};
 const before=JSON.stringify(context);
 const menu=gameMenuContext({world,directives:[rule('s',config)],context});
 assert.equal(JSON.stringify(context),before);assert.equal(menu.expected_head,'h');assert.equal(menu.expected_rules_version,7);assert.equal(menu.pending_choice,'awaiting_player');assert.equal(menu.clock_is_current,false);
 assert.equal(menu.sections.length,35);assert.equal(menu.layout_version,7);assert.ok(menu.sections.every(s=>s.group&&s.icon));assert.ok(menu.sections.find(x=>x.id==='character').actions.includes('change_appearance'));
 assert.ok(menu.sections.find(x=>x.id==='tasks').actions.includes('set_priority'));
 const prompt=promptForNarrator({world,directives:[rule('s',config)]});
 assert.match(prompt,/ИГРОВОЕ МЕНЮ NEXT/);assert.match(prompt,/"pace":"fast"/);
});

import {playerMenuOverview,menuActionIntent,assertMenuAnchor,menuRecordFromInput} from '../public/core/game-menu.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
test('player overview exposes held items, own tasks and known contacts only',()=>{
 const p={people:[{name:'Гарри',state_fields:[{field:'appearance',value:'Куртка'},{field:'mood',value:'Не показывать'}]}],items:[{item_id:'coat',name:'Куртка',holder:'Гарри',custody_status:'held'},{item_id:'lost',holder:'Гарри',custody_status:'lost'},{item_id:'secret',holder:'Лия',custody_status:'held'}],plans:[{plan_id:'work',actor:'Гарри',goal:'Найти работу',status:'active'},{plan_id:'secret',actor:'Лия',goal:'Тайна',status:'active'}],relationships:[{a:'Гарри',b:'Лия'},{a:'Незнакомец',b:'Гарри'}],balances:[{actor:'Гарри',currency:'GBP',known:false,balance:100}]};
 const v=playerMenuOverview(p,'Гарри');
 assert.deepEqual(v.inventory.records.map(x=>x.id),['coat']);
 assert.deepEqual(v.tasks.records.map(x=>x.title),['Найти работу']);
 assert.deepEqual(v.contacts.records,[{name:'Лия'}]);assert.equal(v.balances.records[0].balance,null);
 assert.equal(v.character.fields.length,1);
 assert.equal(menuActionIntent({action:'equip_item',detail:'Надеть куртку',item_id:'coat'},v).saved,false);
 assert.throws(()=>menuActionIntent({action:'equip_item',detail:'Надеть',item_id:'secret'},v));
 assert.throws(()=>menuActionIntent({action:'unknown',detail:'x'},v));
});
test('stale menu requests cannot target a different branch, head or rules version',()=>{
 const w={id:'w',active_branch_id:b,directive_version:4},a={head_scene_id:null};
 const input={world_id:'w',branch_id:b,expected_head:null,expected_rules_version:4};
 assert.doesNotThrow(()=>assertMenuAnchor(input,w,a));
 for(const patch of [{branch_id:other},{expected_head:'h'},{expected_rules_version:3},{world_id:'other'}])assert.throws(()=>assertMenuAnchor({...input,...patch},w,a));
 assert.deepEqual(menuRecordFromInput({kind:'focus',branch_id:other,priorities:['  Работа  ']},b),{kind:'focus',branch_id:b,priorities:['Работа']});
});
test('priorities affect candidate order without overriding urgent obligations or another branch',()=>{
 const scenes=[{id:'s',world_time:'1994-08-02'}];
 const projection={plans:[{actor:'Гарри',plan_id:'a',goal:'Обычная цель',status:'active'},{actor:'Гарри',plan_id:'b',goal:'Работа',status:'active'},{actor:'Гарри',plan_id:'urgent',goal:'Срочное дело',status:'active',due_at:'1994-08-01'}]};
 const rules=[rule('f',{kind:'focus',branch_id:b,priorities:['Работа']})];
 const t=prepareStoryTurn(scenes,projection,rules,{actors:['Гарри'],branchId:b});
 assert.deepEqual(t.candidates.map(x=>x.title),['Срочное дело','Работа','Обычная цель']);
 assert.equal(t.candidates[1].player_priority,1);
 assert.ok(t.candidates.every(x=>x.certainty==='candidate_only_not_performed'));
 const o=prepareStoryTurn(scenes,projection,rules,{actors:['Гарри'],branchId:other});
 assert.ok(o.candidates.every(x=>!x.player_priority));
});

import {MENU_REQUEST_PREFIX,parseLegacyMenuRequest} from '../public/core/game-menu.mjs';
test('cached tools route explicit pinned menu requests, not plain directives',()=>{
 const input={branch_id:b,expected_head:null,expected_rules_version:3,kind:'focus',priorities:['Работа']};
 const encode=v=>MENU_REQUEST_PREFIX+JSON.stringify(v);
 assert.equal(parseLegacyMenuRequest('Обычное правило','world'),null);
 assert.deepEqual(parseLegacyMenuRequest(encode(input),'world'),{world_id:'world',...input});
 for(const bad of [{...input,expected_head:undefined},{...input,expected_rules_version:-1},{...input,world_id:'another'},{...input,settings:{}},{...input,branch_id:'bad'}])assert.throws(()=>parseLegacyMenuRequest(encode(bad),'world'));
 assert.throws(()=>parseLegacyMenuRequest(MENU_REQUEST_PREFIX+'{','world'));
});
