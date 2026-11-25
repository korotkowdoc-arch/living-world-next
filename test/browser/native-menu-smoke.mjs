import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {gameMenuContext,MENU_PREFIX} from '../../public/core/game-menu.mjs';
import {replay} from '../../public/core/continuity.mjs';
const wid='10000000-0000-4000-8000-000000000001',bid='20000000-0000-4000-8000-000000000001',sid='30000000-0000-4000-8000-000000000001';
const body='Анна ждала ответа.';
const pending={id:'q',type:'world',dynamics_version:1,dynamics_kind:'player_choice',record_id:'q1',key:'dynamics:player_choice:q1',actor:'Hero',status:'pending',description:'Решение',question:'Что делать?',options:[{id:'yes',text:'Согласиться'},{id:'no',text:'Отказаться'}],evidence:body};
const scene={id:sid,world_id:wid,branch_id:bid,parent_scene_id:null,body,world_time:'2000-01-01 09:00',events:[pending]};
assert.equal(replay([scene]).worldFacts.find(r=>r.dynamics_kind==='player_choice')?.actor,'Hero');
const world={id:wid,title:'Browser fixture',seed:'Synthetic test story.',start_marker:'2000-01-01',active_branch_id:bid,head_scene_id:sid,directive_version:0,auto_save:true,updated_at:'2000-01-01T09:00:00Z'};
const branch={id:bid,head_scene_id:sid,name:'Main'};
const note={scene_id:sid,note_key:'test',note:{key:'test',kind:'other',summary:'Историческая тестовая заметка',quote:body,actors:['Hero']}};
let rules=[],writes=[];
const base=resolve('public'),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{const p=resolve(base,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(base+'/'))throw Error('bad path');const data=await readFile(p);res.writeHead(200,{'content-type':mime[extname(p)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('lw-next-config-v1',JSON.stringify({url:'https://menu-fixture.invalid',key:'fixture-publishable-key'}));localStorage.setItem('lw-next-session-v1',JSON.stringify({access_token:'fixture-token',expires_at:4102444800}));});
 await context.route('https://menu-fixture.invalid/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname,m=req.method();const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'*','content-type':'application/json'};
  if(m==='OPTIONS')return route.fulfill({status:204,headers});
  let result;
  if(p==='/rest/v1/nw_worlds')result=[world];
  else if(p==='/rest/v1/nw_branches')result=[branch];
  else if(p==='/rest/v1/nw_directives')result=rules;
  else if(p==='/rest/v1/rpc/nw_active_history'||p==='/rest/v1/rpc/nw_active_memory_page')result=[scene];
  else if(p==='/rest/v1/nw_scenes')result=[scene];
  else if(p==='/rest/v1/rpc/nw_read_memory_notes')result=[note];
  else if(p==='/rest/v1/nw_visual_preferences')result=[];
  else if(p==='/rest/v1/rpc/nw_list_visual_assets')result=[];
  else if(p==='/rest/v1/rpc/nw_save_menu_preferences'){
   writes.push(p);const input=req.postDataJSON();assert.equal(input.p_expected_head,sid);assert.equal(input.p_expected_version,world.directive_version);
   rules=[{id:'settings',active:true,text:MENU_PREFIX+JSON.stringify(input.p_record)}];world.directive_version++;result={saved:true};
  }else{throw Error('Unexpected request '+m+' '+p);}
  return route.fulfill({status:200,headers,body:JSON.stringify(result)});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);
 const errors=[],navigations=[];page.on('pageerror',e=>errors.push(e.message));page.on('framenavigated',f=>{if(f===page.mainFrame())navigations.push(f.url());});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('.world-card').click();
 await page.getByRole('tab',{name:'Игровое меню',exact:true}).click();
 await page.locator('.menu-tile-button').first().waitFor();
 const menu=gameMenuContext({world,context:{head_scene_id:sid,memory_complete:true}});
 const open=async label=>{
  await page.getByRole('searchbox',{name:'Найти раздел меню'}).fill(label);
  await page.locator('.menu-tile-button').filter({has:page.getByText(label,{exact:true})}).click();
  await page.locator('.menu-screen-heading h2').filter({hasText:label}).waitFor({timeout:10000});
  assert.equal(await page.locator('.menu-directory').isVisible(),false);
  const screenText=await page.locator('.menu-screen').innerText();assert.doesNotMatch(screenText,/\b(?:memory_complete|recorded_status|requires_scene_check|scene_id|player_life_version)\b/);
  assert.equal(await page.locator('.menu-screen .notice').filter({hasText:'Не удалось открыть этот раздел'}).count(),0,label);
 };
 const back=async()=>{await page.getByRole('button',{name:'‹ Главное меню',exact:true}).click();await page.locator('.menu-directory').waitFor();};
 for(const s of menu.sections){
  if(s.id==='settings')continue;
  await open(s.label);
  if(s.id==='journal'){await page.locator('.menu-record-button').first().click();await page.locator('dialog[open] .scene-body').waitFor();assert.match(await page.locator('dialog[open] .scene-body').innerText(),/Анна ждала ответа/);await page.getByRole('button',{name:'Закрыть',exact:true}).click();}
  if(s.id==='memories'){await page.getByText('Историческая тестовая заметка',{exact:true}).waitFor();await page.getByText('Историческая тестовая заметка',{exact:true}).click();await page.getByRole('button',{name:'Прочитать сцену',exact:true}).click();await page.locator('dialog[open] .scene-body').waitFor();await page.getByRole('button',{name:'Закрыть',exact:true}).click();}
  await back();
 }
 await page.getByRole('searchbox',{name:'Найти раздел меню'}).fill('Настройки');await page.locator('.menu-tile-button').filter({has:page.getByText('Настройки',{exact:true})}).click();
 await page.getByLabel('Темп времени').selectOption('fast');
 await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
 await page.getByText('Настройки сохранены. Игровое время не изменилось.',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Темп времени').inputValue(),'fast');
 assert.equal(writes.length,1);assert.equal(world.head_scene_id,sid);
 assert.equal(navigations.length,1,'Internal menu must not navigate the document');
 assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile layout must not overflow');
 console.log('Opened all 47 sections; journal and memory source dialog; persisted preference; no navigation or unexpected writes.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
