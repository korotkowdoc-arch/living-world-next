import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionScrollTarget,WORLD_TABS} from '../public/core/section-navigation.mjs';
import {playerMenuOverview,menuSection,menuActionIntent,gameMenuContext,MENU_ACTION_LABELS} from '../public/core/game-menu.mjs';
import {readFileSync} from 'node:fs';
test('section scroll keeps header position, resets deep content to navigation anchor, not page top',()=>{
 assert.equal(sectionScrollTarget(450,900),450);
 assert.equal(sectionScrollTarget(3000,900),900);
 assert.equal(sectionScrollTarget(0,900),0);
 assert.equal(sectionScrollTarget(-20,900),0);
 assert.equal(sectionScrollTarget(200,NaN),0);
 assert.ok(WORLD_TABS.some(x=>x[0]==='menu'));
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/worldSectionContent\(existing\)/);
 assert.match(app,/sectionScrollTarget\(y,top\)/);
});
test('player personal menu hides other actors and private narrative records',()=>{
 const p={people:[{name:'Harry',state_fields:[{field:'preference',value:'Music'}]},{name:'Lia',state_fields:[{field:'preference',value:'Secret'}]}],worldFacts:[
 {actor:'Harry',activity_version:1,activity_kind:'habit',record_id:'music',name:'Music',status:'active'},
 {actor:'Lia',activity_version:1,activity_kind:'habit',record_id:'secret',name:'Secret habit',status:'active'},
 {actor:'Harry',growth_version:1,growth_kind:'project',record_id:'book',title:'Book',status:'active'},
 {actor:'Lia',growth_version:1,growth_kind:'project',record_id:'hidden',title:'Hidden',status:'active'},
 {social_record_version:1,social_kind:'group',record_id:'club',name:'Club'},
 {actor:'Harry',social_record_version:1,social_kind:'membership',record_id:'mine',group_id:'club',status:'member'},
 {actor:'Lia',social_record_version:1,social_kind:'membership',record_id:'hers',group_id:'club',status:'member'},
 {social_record_version:1,social_kind:'thread',title:'Private thread',actors:['Harry','Lia'],visibility:'private'}]};
 const v=playerMenuOverview(p,'Harry');
 assert.deepEqual(v.personal_life.habits.records.map(x=>x.id),['music']);
 assert.deepEqual(v.personal_life.projects.records.map(x=>x.id),['book']);
 assert.deepEqual(v.personal_life.circles.records.map(x=>x.id),['mine']);
 for(const s of ['interests','goals','circles'])assert.doesNotMatch(JSON.stringify(menuSection(v,s)),/Secret|Hidden|Private thread|hers/);
 assert.equal(menuActionIntent({action:'pause_habit',habit_id:'music',detail:'Pause'},v).saved,false);
 assert.throws(()=>menuActionIntent({action:'resume_habit',habit_id:'music',detail:'Resume'},v));
 assert.throws(()=>menuActionIntent({action:'edit_project',project_id:'hidden',detail:'Edit'},v));
 assert.throws(()=>menuActionIntent({action:'leave_circle',circle_id:'hers',detail:'Leave'},v));
 const menu=gameMenuContext({world:{id:'w',active_branch_id:'b',directive_version:1},context:{}});
 assert.ok(menu.sections.every(s=>s.actions.every(a=>Object.hasOwn(MENU_ACTION_LABELS,a)||['set_priority','clear_priority','save_settings','reset_settings'].includes(a))));
});
