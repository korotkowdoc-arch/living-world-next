import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalIndex} from '../public/core/operational-life.mjs';
const source={scene_id:'s',event_id:'e'};
const life=(kind,id,fields)=>({player_life_version:1,life_kind:kind,record_id:id,key:'player-life:'+kind+':'+id,source,...fields});
test('a teacher receives submitted-work review, student does not see another teacher queue',()=>{
 const rows=[life('lesson','l',{actor:'Student',teacher:'Teacher',status:'attended'}),life('assignment','a',{actor:'Student',lesson_id:'l',status:'submitted',title:'Essay'}),life('assignment','b',{actor:'Student',lesson_id:'l',status:'graded',title:'Old'})];
 const index=operationalIndex({worldFacts:rows});
 assert.equal(index.view('Teacher').education.total,1);assert.equal(index.view('Student').education.total,0);
 assert.equal(index.opportunities()[0].kind,'grading_review');
 assert.equal(operationalIndex({worldFacts:rows},{complete:false}).opportunities().length,0);
});
test('property review belongs to current title holder, not previous owner',()=>{
 const rows=[life('estate','e',{actor:'Buyer',title:'House',place:'Lane',status:'owned'}),life('estate_condition','c',{actor:'Seller',estate_id:'e',area:'Roof',status:'unsafe'})];
 const index=operationalIndex({worldFacts:rows});
 assert.equal(index.view('Seller').property.total,0);assert.equal(index.view('Buyer').property.records[0].inspection_needed,true);
});
test('only completed unpaid exact-rate shifts count; no automatic balance debit',()=>{
 const shift=(id,status='worked')=>life('work_shift',id,{actor:'Worker',employer:'Shop',title:'Shift',status,pay_period:'task',rate:7,currency:'G'});
 const projection={worldFacts:[shift('a'),shift('b'),shift('c'),shift('d','scheduled'),life('wage','w',{shift_id:'a',status:'paid'})],balances:[{actor:'Shop',currency:'G',known:true,balance:10}]};
 const index=operationalIndex(projection);
 assert.equal(index.view('Shop').payroll.records[0].total,14);assert.equal(index.view('Shop').payroll.records[0].shortfall,4);
 assert.equal(index.view('Worker').payroll.total,0);assert.equal(projection.balances[0].balance,10);
});
test('shared stocks aggregate accepted pinned recipes and operating production, ignore new requests',()=>{
 const recipe=life('service_recipe','r',{actor:'Shop',service_id:'svc',status:'retired',stock_lines:[{product_id:'flour',unit:'kg',quantity:-3}]});
 const visit=(id,status)=>life('service_visit',id,{provider:'Shop',service_id:'svc',recipe_id:'r',status});
 const enterprise={dynamics_version:1,dynamics_kind:'enterprise',record_id:'biz',key:'dynamics:enterprise:biz',actor:'Shop',status:'operating',source};
 const order={dynamics_version:1,dynamics_kind:'production_order',record_id:'o',key:'dynamics:production_order:o',actor:'Shop',enterprise_id:'biz',status:'planned',source,stock_lines:[{product_id:'flour',unit:'kg',quantity:-2},{product_id:'bread',unit:'pc',quantity:5}]};
 const p={worldFacts:[recipe,visit('a','accepted'),visit('b','requested'),enterprise,order],stock:[{holder:'Shop',product_id:'flour',unit:'kg',known:true,quantity:4}]};
 const r=operationalIndex(p).view('Shop').materials.records[0];assert.equal(r.total,5);assert.equal(r.shortfall,1);
 p.stock=[];assert.equal(operationalIndex(p).view('Shop').materials.records[0].shortfall,null);
});
test('program completion and unrecorded accepted exam result are distinct administrative steps',()=>{
 const rows=[life('study_program','p',{actor:'Organizer',institution_id:'inst',title:'Healing',status:'active',modules:[{id:'m',title:'Basics'}]}),life('enrollment','e',{actor:'Student',institution_id:'inst',status:'enrolled'}),life('program_enrollment','pe',{actor:'Student',program_id:'p',enrollment_id:'e',status:'active'}),life('assessment','a',{actor:'Student',enrollment_id:'e',title:'Basics',status:'passed'})];
 let index=operationalIndex({worldFacts:rows});assert.equal(index.view('Student').program_progress.records[0].modules[0].status,'result_pending');assert.equal(index.view('Organizer').education.records[0].kind,'module_record_review');
 rows.push(life('module_result','mr',{actor:'Student',program_enrollment_id:'pe',assessment_id:'a',module_id:'m',status:'passed'}));
 index=operationalIndex({worldFacts:rows});assert.equal(index.view('Organizer').education.records[0].kind,'program_completion_review');
});
