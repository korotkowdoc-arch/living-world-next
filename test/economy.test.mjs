import test from 'node:test';
import assert from 'node:assert/strict';
import {replay,validateScene,validateEconomyAppend} from '../public/core/continuity.mjs';
import {economyView} from '../public/core/economy.mjs';
const body='Свидетельство: герой передал вещь и деньги.';
const money=(id,actor,delta,extra={})=>({id,type:'money',actor,currency:'монеты',delta,evidence:body,...extra});
const item=(id,actor,action,extra={})=>({id,type:'item',actor,item_id:'book-1',action,custody_version:1,evidence:body,...extra});
const scene=(id,...events)=>({id,body,events});
test('one transfer applies both sides, unknown recipient stays unknown',()=>{
 const p=replay([scene('a',money('a','А',0,{operation:'reconcile',balance:10})),
  scene('b',money('b','А',-4,{operation:'transfer',counterparty:'Б'}))]);
 assert.equal(p.balances.find(x=>x.actor==='А').balance,6);
 const recipient=p.balances.find(x=>x.actor==='Б');
 assert.equal(recipient.known,false);assert.equal(recipient.delta,4);
 assert.equal(p.validation_warnings.length,0);
});
test('overspending and overflow never partly credit the recipient',()=>{
 const base=scene('a',money('a','А',0,{operation:'reconcile',balance:3}));
 const p=replay([base,scene('b',money('b','А',-4,{operation:'transfer',counterparty:'Б'}))]);
 assert.equal(p.balances.length,1);assert.equal(p.balances[0].balance,3);
 assert.equal(p.validation_warnings.length,1);
 const rich=scene('r',money('r','Б',0,{operation:'reconcile',balance:Number.MAX_SAFE_INTEGER}));
 const q=replay([base,rich,scene('b',money('b','А',-1,{operation:'transfer',counterparty:'Б'}))]);
 assert.equal(q.balances.find(x=>x.actor==='А').balance,3);
 assert.equal(q.validation_warnings.length,1);
});
test('unique item moves, cannot be stolen by contradictory annotation or resurrected',()=>{
 const history=[scene('a',item('a','А','acquire')),scene('b',item('b','А','transfer',{counterparty:'Б'})),
  scene('c',item('c','А','drop')),scene('d',item('d','Б','destroy')),scene('e',item('e','Б','recover'))];
 const p=replay(history);assert.equal(p.items[0].custody_status,'destroyed');
 assert.equal(p.items[0].source.scene_id,'d');assert.equal(p.validation_warnings.length,2);
});
test('lost item may be recovered by another actor; legacy owner stays uncertain',()=>{
 const p=replay([scene('a',item('a','А','acquire')),scene('b',item('b','А','drop')),scene('c',item('c','Б','recover'))]);
 assert.equal(p.items[0].holder,'Б');
 const q=replay([scene('legacy',{id:'old',type:'item',item_id:'book-1',action:'hold',actor:'А',evidence:body})]);
 assert.equal(q.items[0].custody_status,'unknown');assert.equal(q.items[0].holder,null);
});
test('malformed transfer and reconciliation rejected before replay',()=>{
 for(const event of [money('a','А',4,{operation:'transfer',counterparty:'Б'}),money('a','А',-1,{operation:'transfer',counterparty:'А'}),money('a','А',0,{operation:'reconcile',balance:-1}),item('a','А','transfer')])
  assert.equal(validateScene({body,events:[event]}).ok,false);
});
test('append preflight rejects new contradictions but not previous branch warnings',()=>{
 const history=[scene('a',money('a','А',0,{operation:'reconcile',balance:3})),scene('b',money('b','А',-4))];
 assert.equal(validateEconomyAppend(history,[money('c','А',-2)],body).ok,true);
 assert.equal(validateEconomyAppend(history,[money('c','А',-5)],body).ok,false);
});
test('economy view pages results and labels partial memory',()=>{
 const p=replay([scene('a',money('a','А',2),money('b','Б',3),item('c','А','acquire'))]);
 const view=economyView(p,{actor:'А',limit:1,complete:false});
 assert.equal(view.total_records,2);assert.equal(view.next_offset,1);assert.equal(view.memory_complete,false);
 assert.equal(economyView(p,{actor:'А',offset:1,limit:1}).records[0].kind,'item');
});
