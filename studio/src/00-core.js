(function(){'use strict';
const $=id=>document.getElementById(id);
const APP_CONFIG=window.SKY_STUDIO_CONFIG;
if(!APP_CONFIG)throw Error('缺少配置文件，请重新构建工程');
const PLAYER_RULES=APP_CONFIG.player,THEME_DEFINITIONS=APP_CONFIG.themes;
const BEATS_PER_PAGE=PLAYER_RULES.grid.columns*PLAYER_RULES.grid.rows;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const copy=v=>JSON.parse(JSON.stringify(v));
const SCALE=[0,2,4,5,7,9,11,12,14,16,17,19,21,23,24];
const SEMIS=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const KEY_ROOTS={C:60,Db:61,D:62,Eb:63,E:64,F:65,Fs:66,G:67,Ab:68,A:69,Bb:70,B:71};
const KEY_DEGREES={C:['C','D','E','F','G','A','B'],Db:['D♭','E♭','F','G♭','A♭','B♭','C'],D:['D','E','F♯','G','A','B','C♯'],Eb:['E♭','F','G','A♭','B♭','C','D'],E:['E','F♯','G♯','A','B','C♯','D♯'],F:['F','G','A','B♭','C','D','E'],Fs:['F♯','G♯','A♯','B','C♯','D♯','E♯'],G:['G','A','B','C','D','E','F♯'],Ab:['A♭','B♭','C','D♭','E♭','F','G'],A:['A','B','C♯','D','E','F♯','G♯'],Bb:['B♭','C','D','E♭','F','G','A'],B:['B','C♯','D♯','E','F♯','G♯','A♯']};
KEY_ROOTS['sky-original']=60;KEY_DEGREES['sky-original']=KEY_DEGREES.C;
const BUILTINS=(window.SKY_BUILTINS||[]).map(p=>({...copy(p),originKind:'builtin'}));
const BUILTIN_IDS=new Set(BUILTINS.map(p=>p.id));
const LOCALLY_LOADED_IDS=new Set();
const SAMPLES=window.SKY_SAMPLES||{};
const SCENE_EMBEDS=window.SKY_EMBED_SCENES||{};
const PRESETS=Object.fromEntries(Object.entries(THEME_DEFINITIONS).map(([id,t])=>[id,{id,name:t.name,accent:t.defaults.accent,stage:id}]));
const state={library:BUILTINS,project:null,mode:'home',isPlaying:false,position:0,rate:1,tuning:'C',sustain:.45,volume:PLAYER_RULES.volume.default,selected:0,page:-1,windowSec:PLAYER_RULES.roll.initialSeconds,rollPageStart:0,rollFinish:null,rollFinishRaf:0,raf:0,interval:0,clockAnchor:0,mediaAnchor:0,scheduleIndex:0,activeVoices:new Set(),sceneFrame:0,sceneTick:0,sceneBase:0,toastTimer:0,assetCache:new Map(),lastSelected:-1,importStatus:'',audioCtx:null,pianoBuffers:new Map(),loadedSamplePromise:null,stageImages:[],history:new Map(),future:new Map(),editorOpen:false,editMode:false,editDirty:false,editBaseline:null,editSource:null,pendingEditAction:null,pendingSongId:null,pendingDeleteId:null,onlinePianoBuffers:new Map(),onlineSamplePromise:null,videoFile:null,videoScanAbort:false,stageMotionEnabled:true,importBusy:false};
const positionFmt=ms=>{let x=Math.max(0,Math.floor(ms));return String(Math.floor(x/60000)).padStart(2,'0')+':'+String(Math.floor(x/1000)%60).padStart(2,'0')+'.'+String(x%1000).padStart(3,'0')};
const durationFmt=ms=>positionFmt(ms).slice(0,5);
const scoreEvents=p=>p?.score?.events||[];
// Only the suffix after the last sounding event is disposable; internal rests keep their timing.
function trimTrailingRests(project){
 const events=scoreEvents(project);let last=events.length-1;
 while(last>=0&&!events[last].notes.length)last--;
 // An entirely blank score is an editable new-song template, not a finished performance.
 if(last<0)return project;
 events.splice(last+1);
 let soundingEnd=0;for(const e of events)if(e.notes.length)soundingEnd=Math.max(soundingEnd,e.timeMs+Math.max(1,e.durationMs));
 project.durationMs=soundingEnd;
 return project;
}
function normalizeVolume(value){return typeof value==='number'&&Number.isFinite(value)?clamp(value,0,1):PLAYER_RULES.volume.default}
function normalize(raw){
 if(!raw||typeof raw!=='object')throw Error('项目内容不是有效对象');
 let source=raw;
 if(!raw.score && Array.isArray(raw.events))source={...raw,score:{events:raw.events,mode:'grid',gridIntervalMs:raw.grid_interval_ms||166.667}};
 const evs=scoreEvents(source); if(!Array.isArray(evs))throw Error('缺少 score.events');
 if(evs.length>100000)throw Error('乐谱事件超过 100000 条');
 const normalEvents=evs.map((e,i)=>{
  const nn=Array.isArray(e.notes)?e.notes:Array.isArray(e.n)?e.n:[];
  const notes=[...new Set(nn.map(v=>Number(v)).filter(n=>Number.isInteger(n)&&n>=1&&n<=15))].sort((a,b)=>a-b);
  const time=Number(e.timeMs??e.time_ms??e.t??((Number(e.step)-1)*(source.score?.gridIntervalMs||166.6667)));
  if(!Number.isFinite(time)||time<0||time>36000000)throw Error('非法事件时间 '+i);
  const duration=Number(e.durationMs??e.duration_ms??(notes.length?190:0));
  const velocity=Number(e.velocity??e.vel??85);
  return {timeMs:Math.round(time),notes,durationMs:clamp(Number.isFinite(duration)?duration:190,0,10000),velocity:clamp(Number.isFinite(velocity)?Math.round(velocity):85,1,127),confidence:String(e.confidence||e.status||'imported').slice(0,40)};
 }).sort((a,b)=>a.timeMs-b.timeMs);
 const total=Number(source.durationMs??source.duration_ms??((normalEvents.at(-1)?.timeMs||0)+500));
 if(!Number.isFinite(total)||total<0||total>36000000)throw Error('歌曲时长不合法');
 const definition=source.theme?.definition&&Object.hasOwn(THEME_DEFINITIONS,source.theme.id)?sanitizeThemeDefinition(source.theme.definition):null;
 const themeId=PRESETS[source.theme?.id]?source.theme.id:APP_CONFIG.defaultTheme;
 const themeDefaults=THEME_DEFINITIONS[themeId].defaults;
 const project={
  format:'skymusic-project',schemaVersion:1,id:String(source.id||('import-'+Date.now())).slice(0,100),originKind:(source.originKind==='builtin'&&BUILTIN_IDS.has(source.id))?'builtin':(source.originKind==='imported'?'imported':'user'),author:String(source.author||'').slice(0,100),favorite:Boolean(source.favorite),lastOpened:Number(source.lastOpened)||0,createdAt:Number(source.createdAt)||Date.now(),
  title:String(source.title||'未命名乐曲').slice(0,120),subtitle:String(source.subtitle||'IMPORTED SCORE').slice(0,150),author:String(source.author||'').slice(0,100),favorite:Boolean(source.favorite),createdAt:Number(source.createdAt)||Date.now(),lastOpened:Number(source.lastOpened)||0,
  card:source.card?{title:String(source.card.title||'').slice(0,120),subtitle:String(source.card.subtitle||'').slice(0,180),coverElement:typeof source.card.coverElement==='string'?source.card.coverElement.slice(0,100):null}:null,entry:source.entry?copy(source.entry):null,
  description:String(source.description||'').slice(0,600),durationMs:Math.max(total,normalEvents.at(-1)?.timeMs||0),keyCount:15,
  score:{mode:source.score?.mode==='free'?'free':'grid',gridIntervalMs:clamp(Number(source.score?.gridIntervalMs)||166.6667,20,5000),events:normalEvents},
  playback:{volume:normalizeVolume(source.playback?.volume),tuning:Object.hasOwn(KEY_ROOTS,source.playback?.tuning)?source.playback.tuning:'C',rate:clamp(Number(source.playback?.rate)||1,.25,2),sustain:clamp(Number(source.playback?.sustain ?? .45),0,1),instrument:instrumentSpec(source.playback?.instrument).id},
  theme:{id:themeId,accent:/^#[0-9a-fA-F]{6}$/.test(source.theme?.accent||'')?source.theme.accent:PRESETS[themeId].accent,stage:themeId,motion:source.theme?.motion||'ambient',name:String(source.theme?.name||PRESETS[themeId].name).slice(0,80),snow:clamp(Number(source.theme?.snow ?? themeDefaults.snow),0,100),glow:clamp(Number(source.theme?.glow ?? themeDefaults.glow),0,100),backgroundColor:/^#[0-9a-fA-F]{6}$/.test(source.theme?.backgroundColor||'')?source.theme.backgroundColor:null,customStage:Boolean(source.theme?.customStage),appearance:sanitizePlayerAppearance(source.theme?.appearance),...(definition?{definition}:{}),...(source.theme?.assets?{assets:copy(source.theme.assets)}:{})},
  provenance:copy(source.provenance||{source:'导入'}),
  _imageUrl:source._imageUrl||null,
  _imageBytes:source._imageBytes||null
 };
 return trimTrailingRests(project);
}
const noteMidi=(n,tuning=state.tuning)=>(KEY_ROOTS[tuning]??60)+SCALE[n-1];
const tuneCents=()=>0;
const noteName=(n,tuning=state.tuning)=>{let key=KEY_DEGREES[tuning]||KEY_DEGREES.C,di=(n-1)%7,m=noteMidi(n,tuning);return key[di]+(Math.floor(m/12)-1)};
const eventLabel=(e,tuning=state.tuning)=>e?.notes?.length?e.notes.map(n=>noteName(n,tuning)).join(' + '):'休止';
const songNotes=p=>scoreEvents(p).reduce((s,e)=>s+e.notes.length,0);
function saveLibrary(){state.beatLayoutCache=null;if(state.editMode&&state.project&&state.editBaseline){state.editDirty=snapshot(state.project)!==state.editBaseline;updateEditButton()}try{localStorage.setItem('sky-studio-projects-v03',JSON.stringify(state.library.map(p=>({...p,_imageBytes:null,_imageUrl:(p._imageUrl?.length||0)<500000?p._imageUrl:null}))))}catch(e){console.warn('本地收藏缓存空间不足',e);toast(e?.name==='SecurityError'?'当前预览环境禁止本地保存，请导出 .skymusic 文件':'本地存储空间不足，请导出 .skymusic 备份',6000)}scheduleDbBackup?.()}
function loadLibrary(){try{let saved=JSON.parse(localStorage.getItem('sky-studio-projects-v03')||localStorage.getItem('sky-studio-projects-v02')||'[]');if(Array.isArray(saved)){for(const p of saved.slice(0,40)){try{let n=normalize({...p,originKind:BUILTIN_IDS.has(p.id)?'builtin':(p.originKind||'user')});LOCALLY_LOADED_IDS.add(n.id);{let idx=state.library.findIndex(q=>q.id===n.id);if(idx>=0)state.library[idx]=n;else state.library.push(n)}}catch(e){}}}}catch(e){}}
function downloadBytes(name,bytes,mime){let url=URL.createObjectURL(new Blob([bytes],{type:mime}));let a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
function sceneId(p){return PRESETS[p?.theme?.id]?p.theme.id:APP_CONFIG.defaultTheme}
function setTheme(id){if(!state.project||!state.editMode)return;let next=PRESETS[id]||PRESETS[APP_CONFIG.defaultTheme];rememberEdit();state.project.theme=normalize({score:{events:[]},theme:{id:next.id,...THEME_DEFINITIONS[next.id].defaults,...THEME_DEFINITIONS[next.id].initialOverrides}}).theme;state.project._imageUrl=null;state.project._imageBytes=null;applyTheme();saveLibrary();renderLibrary();toast('已切换至 '+next.name+' 主题')}
