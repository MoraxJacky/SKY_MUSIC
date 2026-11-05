(function(){'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const copy=v=>JSON.parse(JSON.stringify(v));
const SCALE=[0,2,4,5,7,9,11,12,14,16,17,19,21,23,24];
const SEMIS=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const KEY_ROOTS={C:60,Db:61,D:62,Eb:63,E:64,F:65,Fs:66,G:67,Ab:68,A:69,Bb:70,B:71};
const KEY_DEGREES={C:['C','D','E','F','G','A','B'],Db:['D♭','E♭','F','G♭','A♭','B♭','C'],D:['D','E','F♯','G','A','B','C♯'],Eb:['E♭','F','G','A♭','B♭','C','D'],E:['E','F♯','G♯','A','B','C♯','D♯'],F:['F','G','A','B♭','C','D','E'],Fs:['F♯','G♯','A♯','B','C♯','D♯','E♯'],G:['G','A','B','C','D','E','F♯'],Ab:['A♭','B♭','C','D♭','E♭','F','G'],A:['A','B','C♯','D','E','F♯','G♯'],Bb:['B♭','C','D','E♭','F','G','A'],B:['B','C♯','D♯','E','F♯','G♯','A♯']};
const BUILTINS=(window.SKY_BUILTINS||[]).map(p=>({...copy(p),originKind:'builtin'}));
const BUILTIN_IDS=new Set(BUILTINS.map(p=>p.id));
const SAMPLES=window.SKY_SAMPLES||{};
const SCENE_EMBEDS=window.SKY_EMBED_SCENES||{};
const PRESETS={
 christmas:{id:'christmas',name:'CHRISTMAS NIGHT',accent:'#e8c88a',stage:'christmas'},
 starlight:{id:'starlight',name:'STARLIGHT PIANO',accent:'#c9b6f5',stage:'starlight'},
 citylights:{id:'citylights',name:'CITY OF STARS',accent:'#f0c3a8',stage:'citylights'}
};
const state={library:BUILTINS,project:null,mode:'home',isPlaying:false,position:0,rate:1,tuning:'C',sustain:.45,selected:0,page:-1,windowSec:12,rollPageStart:0,rollFinish:null,rollFinishRaf:0,raf:0,interval:0,clockAnchor:0,mediaAnchor:0,scheduleIndex:0,activeVoices:new Set(),sceneFrame:0,sceneTick:0,sceneBase:0,toastTimer:0,assetCache:new Map(),lastSelected:-1,importStatus:'',audioCtx:null,pianoBuffers:new Map(),loadedSamplePromise:null,stageImages:[],history:new Map(),future:new Map(),editorOpen:false,editMode:false,editDirty:false,editBaseline:null,editSource:null,pendingEditAction:null,pendingSongId:null,pendingDeleteId:null,onlinePianoBuffers:new Map(),onlineSamplePromise:null,videoFile:null,videoScanAbort:false,stageMotionEnabled:true,importBusy:false};
const positionFmt=ms=>{let x=Math.max(0,Math.floor(ms));return String(Math.floor(x/60000)).padStart(2,'0')+':'+String(Math.floor(x/1000)%60).padStart(2,'0')+'.'+String(x%1000).padStart(3,'0')};
const durationFmt=ms=>positionFmt(ms).slice(0,5);
const scoreEvents=p=>p?.score?.events||[];
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
 const themeId=PRESETS[source.theme?.id]?source.theme.id:'starlight';
 return {
  format:'skymusic-project',schemaVersion:1,id:String(source.id||('import-'+Date.now())).slice(0,100),originKind:(source.originKind==='builtin'&&BUILTIN_IDS.has(source.id))?'builtin':(source.originKind==='imported'?'imported':'user'),author:String(source.author||'').slice(0,100),favorite:Boolean(source.favorite),lastOpened:Number(source.lastOpened)||0,createdAt:Number(source.createdAt)||Date.now(),
  title:String(source.title||'未命名乐曲').slice(0,120),subtitle:String(source.subtitle||'IMPORTED SCORE').slice(0,150),author:String(source.author||'').slice(0,100),favorite:Boolean(source.favorite),createdAt:Number(source.createdAt)||Date.now(),lastOpened:Number(source.lastOpened)||0,
  description:String(source.description||'').slice(0,600),durationMs:Math.max(total,normalEvents.at(-1)?.timeMs||0),keyCount:15,
  score:{mode:source.score?.mode==='free'?'free':'grid',gridIntervalMs:clamp(Number(source.score?.gridIntervalMs)||166.6667,20,5000),events:normalEvents},
  playback:{tuning:Object.hasOwn(KEY_ROOTS,source.playback?.tuning)?source.playback.tuning:'C',rate:clamp(Number(source.playback?.rate)||1,.25,2),sustain:clamp(Number(source.playback?.sustain ?? .45),0,1),instrument:source.playback?.instrument==='salamander'?'salamander':'offline'},
  theme:{id:themeId,accent:/^#[0-9a-fA-F]{6}$/.test(source.theme?.accent||'')?source.theme.accent:PRESETS[themeId].accent,stage:themeId,motion:source.theme?.motion||'ambient',name:String(source.theme?.name||PRESETS[themeId].name).slice(0,80),snow:clamp(Number(source.theme?.snow ?? (themeId==='christmas'?50:18)),0,100),glow:clamp(Number(source.theme?.glow ?? 58),0,100),backgroundColor:/^#[0-9a-fA-F]{6}$/.test(source.theme?.backgroundColor||'')?source.theme.backgroundColor:null,customStage:Boolean(source.theme?.customStage),appearance:sanitizePlayerAppearance(source.theme?.appearance)},
  provenance:copy(source.provenance||{source:'导入'}),
  _imageUrl:source._imageUrl||null,
  _imageBytes:source._imageBytes||null
 };
}
const noteMidi=(n,tuning=state.tuning)=>(KEY_ROOTS[tuning]??60)+SCALE[n-1];
const tuneCents=()=>0;
const noteName=(n,tuning=state.tuning)=>{let key=KEY_DEGREES[tuning]||KEY_DEGREES.C,di=(n-1)%7,m=noteMidi(n,tuning);return key[di]+(Math.floor(m/12)-1)};
const eventLabel=(e,tuning=state.tuning)=>e?.notes?.length?e.notes.map(n=>noteName(n,tuning)).join(' + '):'休止';
const songNotes=p=>scoreEvents(p).reduce((s,e)=>s+e.notes.length,0);
function toast(text,ms=3500){const el=$('toast');el.textContent=text;el.hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.hidden=true,ms)}
function saveLibrary(){if(state.editMode&&state.project&&state.editBaseline){state.editDirty=snapshot(state.project)!==state.editBaseline;updateEditButton()}try{localStorage.setItem('sky-studio-projects-v03',JSON.stringify(state.library.map(p=>({...p,_imageBytes:null,_imageUrl:(p._imageUrl?.length||0)<500000?p._imageUrl:null}))))}catch(e){console.warn('本地收藏缓存空间不足',e);toast(e?.name==='SecurityError'?'当前预览环境禁止本地保存，请导出 .skymusic 文件':'本地存储空间不足，请导出 .skymusic 备份',6000)}scheduleDbBackup?.()}
function loadLibrary(){try{let saved=JSON.parse(localStorage.getItem('sky-studio-projects-v03')||localStorage.getItem('sky-studio-projects-v02')||'[]');if(Array.isArray(saved)){for(const p of saved.slice(0,40)){try{let n=normalize({...p,originKind:BUILTIN_IDS.has(p.id)?'builtin':(p.originKind||'user')});{let idx=state.library.findIndex(q=>q.id===n.id);if(idx>=0)state.library[idx]=n;else state.library.push(n)}}catch(e){}}}}catch(e){}}
function downloadBytes(name,bytes,mime){let url=URL.createObjectURL(new Blob([bytes],{type:mime}));let a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
function sceneId(p){return PRESETS[p?.theme?.id]?p.theme.id:'starlight'}
function setTheme(id){if(!state.project||!state.editMode)return;let next=PRESETS[id]||PRESETS.christmas;rememberEdit();state.project.theme={...state.project.theme,id:next.id,accent:next.accent,stage:next.id,name:next.name,appearance:{},backgroundColor:null};applyTheme();saveLibrary();renderLibrary();toast('已切换至 '+next.name+' 主题')}
