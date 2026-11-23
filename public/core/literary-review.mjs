/** A review queue, NOT a semantic proof. Never auto-rewrite player-authored narrative. */
const MARKERS=[
 {id:'permission-loop',label:'Повторное ожидание разрешения вместо инициативы',
  pattern:/(?:не\s+(?:смел|решал(?:ся)?|хотел)\s+(?:сам\s+)?(?:решать\s+за|действовать\s+без\s+разрешения)|только\s+если\s+ты\s+(?:хочешь|не\s+против)|можно\s+я\s+(?:тебя\s+)?(?:поцелую|обниму)|не\s+хотел\s+навязываться)/giu},
 {id:'forced-reconciliation',label:'Возможное навязанное примирение',
  pattern:/(?:нашли\s+общий\s+язык|начали\s+понимать\s+друг\s+друга|впервые\s+почувствовал\s+(?:к\s+нему\s+)?уважение|ненависть\s+уступила\s+место\s+уважению|забыть\s+старую\s+вражду)/giu},
 {id:'generic-compromise',label:'Повторяющиеся предложения договориться',
  pattern:/(?:может\s+быть[,.]?\s+(?:нам\s+)?(?:стоит\s+)?(?:поговорить|попробовать\s+понять)|давай\s+(?:просто\s+)?поговорим|нам\s+надо\s+найти\s+общий\s+язык)/giu}
];

export function literaryReview(scenes=[],{maxSamples=20}={}){
 const samples=[];const counts=Object.fromEntries(MARKERS.map(m=>[m.id,0]));
 for(const scene of scenes){
  const body=typeof scene?.body==='string'?scene.body:'';
  if(!body)continue;
  for(const marker of MARKERS){
   marker.pattern.lastIndex=0;
   for(const hit of body.matchAll(marker.pattern)){
    counts[marker.id]++;
    if(samples.length<maxSamples){
     const start=Math.max(0,hit.index-90);
     samples.push({scene_id:scene.id||null,world_time:scene.world_time||null,marker:marker.id,label:marker.label,
      excerpt:body.slice(start,Math.min(body.length,hit.index+hit[0].length+110))});
    }
   }
  }
 }
 const repeated=Object.entries(counts).filter(([,n])=>n>=3).map(([kind,n])=>({kind,count:n}));
 return {scanned_scenes:scenes.length,counts,repeated,samples,
  note:'Словесные совпадения могут быть уместны в конкретной сцене. Это сигнал для литературной проверки, а не цензура и не автоматическая оценка психологии.'};
}
