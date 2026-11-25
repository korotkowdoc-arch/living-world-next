import test from 'node:test';
import assert from 'node:assert/strict';
import {menuLabel,menuValue,isMenuMetadata,menuError} from '../public/core/menu-ru.mjs';
test('current world data labels and enumerations are Russian',()=>{
 for(const k of ['birth_date','cash','interaction','current_location','floorplans','own_attitude','memory_complete','hunger','calendar','known_places']){
  if(isMenuMetadata(k))continue;
  assert.match(menuLabel(k),/[А-Яа-яЁё]/,k);
 }
 assert.equal(menuLabel('birth_date'),'Дата рождения');assert.equal(menuLabel('interaction'),'Взаимодействие');assert.equal(menuValue('knows','status'),'Знает');
 assert.equal(menuValue('requires_scene_check','availability'),'Требует проверки в сцене');
 assert.equal(menuValue('unmapped_future_enum','status'),'Не уточнено');
 assert.equal(menuLabel('unmapped_future_field'),'Дополнительные сведения');
});
test('prose, names, titles, real currencies and source values are not mutated',()=>{
 assert.equal(menuValue('active','title'),'active');assert.equal(menuValue('Open','name'),'Open');
 assert.equal(menuValue('Queen','description'),'Queen');assert.equal(menuValue('GBP','currency'),'Фунты стерлингов');
 assert.equal(menuValue('XYZ','currency'),'XYZ');assert.equal(menuValue(false,'effective'),'Нет');
 for(const k of ['record_id','scene_id','policy','player_life_version','app_url'])assert.equal(isMenuMetadata(k),true);
 assert.match(menuError(new Error('Failed to fetch')),/сервером/);
});
