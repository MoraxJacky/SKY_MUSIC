/* 00-core.js */
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
const state={library:BUILTINS,project:null,mode:'home',isPlaying:false,position:0,rate:1,tuning:'C',sustain:PLAYER_RULES.sustain.default,volume:PLAYER_RULES.volume.default,selected:0,page:-1,windowSec:PLAYER_RULES.roll.initialSeconds,rollPageStart:0,rollFinish:null,rollFinishRaf:0,raf:0,interval:0,clockAnchor:0,mediaAnchor:0,scheduleIndex:0,activeVoices:new Set(),sceneFrame:0,sceneTick:0,sceneBase:0,toastTimer:0,assetCache:new Map(),lastSelected:-1,importStatus:'',audioCtx:null,pianoBuffers:new Map(),loadedSamplePromise:null,stageImages:[],history:new Map(),future:new Map(),editorOpen:false,editMode:false,editDirty:false,editBaseline:null,editSource:null,pendingEditAction:null,pendingSongId:null,pendingDeleteId:null,onlinePianoBuffers:new Map(),onlineSamplePromise:null,videoFile:null,videoScanAbort:false,stageMotionEnabled:true,importBusy:false};
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
  playback:{loop:source.playback?.loop===true,volume:normalizeVolume(source.playback?.volume),tuning:Object.hasOwn(KEY_ROOTS,source.playback?.tuning)?source.playback.tuning:'C',rate:clamp(Number(source.playback?.rate)||1,.25,2),sustain:clamp(Number(source.playback?.sustain ?? PLAYER_RULES.sustain.default),0,1),instrument:instrumentSpec(source.playback?.instrument).id},
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

/* 10-zip.js */
// Zero-dependency ZIP store/reader for .skymusic v1. Export is STORE, import also handles DEFLATE on modern Chromium.
const ENCODER=new TextEncoder(),DECODER=new TextDecoder();
const asBytes=x=>typeof x==='string'?ENCODER.encode(x):x instanceof Uint8Array?x:new Uint8Array(x);
let CRC_TABLE=null;
function crc32(buf){if(!CRC_TABLE){CRC_TABLE=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);CRC_TABLE[n]=c>>>0}}let c=0xffffffff;for(let v of buf)c=CRC_TABLE[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function makeZip(items){const locals=[],centrals=[];let offset=0;for(const [name,value] of Object.entries(items)){
 const nameBytes=ENCODER.encode(name),data=asBytes(value),crc=crc32(data);
 const local=new Uint8Array(30+nameBytes.length+data.length),lv=new DataView(local.buffer);
 lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,nameBytes.length,true);local.set(nameBytes,30);local.set(data,30+nameBytes.length);locals.push(local);
 const central=new Uint8Array(46+nameBytes.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,nameBytes.length,true);cv.setUint32(42,offset,true);central.set(nameBytes,46);centrals.push(central);offset+=local.length}
 const centralSize=centrals.reduce((s,a)=>s+a.length,0);const output=new Uint8Array(offset+centralSize+22);let p=0;for(const entry of [...locals,...centrals]){output.set(entry,p);p+=entry.length}let ev=new DataView(output.buffer,p,22);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,centrals.length,true);ev.setUint16(10,centrals.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return output
}
async function readZip(arrayBuffer){const bytes=asBytes(arrayBuffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eo=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--){if(view.getUint32(i,true)===0x06054b50){eo=i;break}}
 if(eo<0)throw Error('不是有效的 ZIP / .skymusic 文件');let count=view.getUint16(eo+10,true),p=view.getUint32(eo+16,true);if(count>100)throw Error('项目条目过多');let result={},totalSize=0;
 for(let i=0;i<count;i++){if(p+46>bytes.length||view.getUint32(p,true)!==0x02014b50)throw Error('ZIP 中央目录错误');let flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),packed=view.getUint32(p+20,true),size=view.getUint32(p+24,true),nameLen=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);let name=DECODER.decode(bytes.slice(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;
  if(name.includes('..')||name.startsWith('/')||name.includes('\\'))throw Error('项目包含非法资源路径');if(flags&1)throw Error('加密项目暂不支持');totalSize+=size;if(totalSize>48*1024*1024)throw Error('项目总大小超过48MB');if(size>25*1024*1024)throw Error('项目单个文件超过25MB');
  if(view.getUint32(local,true)!==0x04034b50)throw Error('ZIP 文件头错误');let start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);if(start+packed>bytes.length)throw Error('ZIP 数据损坏');let compressed=bytes.slice(start,start+packed);
  let data;if(method===0)data=compressed;else if(method===8){if(typeof DecompressionStream==='undefined')throw Error('浏览器不支持 ZIP 压缩读取，请使用 Chrome / Edge');let stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));data=new Uint8Array(await new Response(stream).arrayBuffer())}else throw Error('暂不支持 ZIP 压缩方式 '+method);
  if(size!==data.length)throw Error('资源大小校验失败: '+name);if(crc32(data)!==view.getUint32(p-(46+nameLen+extra+comment)+16,true))throw Error('资源校验失败: '+name);result[name]=data;
 }return result
}
function bytesToBase64(bytes){let parts=[];for(let i=0;i<bytes.length;i+=8192)parts.push(String.fromCharCode(...bytes.subarray(i,i+8192)));return btoa(parts.join(''))}
function base64ToBytes(base64){let txt=atob(base64),out=new Uint8Array(txt.length);for(let i=0;i<txt.length;i++)out[i]=txt.charCodeAt(i);return out}
async function exportProject(p){let score={mode:p.score.mode,gridIntervalMs:p.score.gridIntervalMs,tuning:p.playback.tuning,events:scoreEvents(p)};
 let man={format:'skymusic-project',schemaVersion:1,id:p.id,title:p.title,subtitle:p.subtitle,author:p.author||'',favorite:!!p.favorite,createdAt:p.createdAt||0,lastOpened:p.lastOpened||0,description:p.description,durationMs:p.durationMs,keyCount:15,author:p.author||'',provenance:p.provenance,assets:[]};
 let scene={...p.theme},files={};
 if(p._imageBytes){files['assets/stage.webp']=p._imageBytes;man.assets.push('assets/stage.webp');scene.image='assets/stage.webp'}
 else if(p._imageUrl&&p._imageUrl.startsWith('data:image/')){let parts=p._imageUrl.split(',');files['assets/stage.webp']=base64ToBytes(parts[1]);man.assets.push('assets/stage.webp');scene.image='assets/stage.webp'}
 else if(p._imageUrl?.startsWith('data:image/')&&p._imageUrl.includes(';base64,')){files['assets/stage.webp']=base64ToBytes(p._imageUrl.split(';base64,')[1]);man.assets.push('assets/stage.webp');scene.image='assets/stage.webp'}
 else if(sceneId(p)==='christmas'&&SCENE_EMBEDS.christmas){files['assets/stage.webp']=base64ToBytes(SCENE_EMBEDS.christmas);man.assets.push('assets/stage.webp');scene.image='assets/stage.webp'}
 for(let [path,data] of Object.entries({'manifest.json':man,'score.json':score,'scene.json':scene,'playback.json':p.playback})){files[path]=JSON.stringify(data,null,2)}
 let zip=makeZip(files);downloadBytes(p.title.replace(/[\\/:*?"<>|]/g,'_')+'.skymusic',zip,'application/zip');toast('已导出 .skymusic：乐谱、调性及主题配置')
}
async function unpackProject(bytes){let files=await readZip(bytes);for(let name of ['manifest.json','score.json','scene.json','playback.json'])if(!files[name])throw Error('项目缺少 '+name);
 const read=name=>JSON.parse(DECODER.decode(files[name]));const man=read('manifest.json');if(man.schemaVersion!==1||man.format!=='skymusic-project')throw Error('不支持的项目格式版本');
 const p=normalize({...man,score:read('score.json'),theme:read('scene.json'),playback:read('playback.json')});
 const scene=read('scene.json');if(scene.image&&files[scene.image]&&files[scene.image].length<4*1024*1024){p._imageBytes=files[scene.image];p._imageUrl='data:image/webp;base64,'+bytesToBase64(p._imageBytes)}
 return p
}

// Standalone shareable theme package. No scripts and no remote references.
async function exportTheme(p){try{downloadBytes(escName(p.title)+'.skytheme',await themeResourceBytes(p),'application/zip');toast('已导出 .skytheme 主题及资源')}catch(error){toast('主题导出失败：'+error.message,6000)}}
async function unpackTheme(bytes){let files=await readZip(bytes);if(!files['manifest.json']||!files['scene.json'])throw Error('主题包缺少配置文件');let man=JSON.parse(DECODER.decode(files['manifest.json']));if(man.format!=='skytheme'||man.schemaVersion!==1)throw Error('主题包版本不支持');let t=JSON.parse(DECODER.decode(files['scene.json']));let data=null;if(t.image&&files[t.image]&&files[t.image].length<4*1024*1024)data=files[t.image];return {theme:t,imageBytes:data}}

/* 18-instruments.js */
// Shared instrument catalogue. Every bank supports the 15-key range in all 12 major keys.
const INSTRUMENTS=[
 {id:'offline',name:'经典钢琴',mode:'offline',gain:.23},
 {id:'offline-harp',name:'竖琴',mode:'offline',bank:'orchestral_harp',gain:.26},
 {id:'offline-music-box',name:'八音盒',mode:'offline',bank:'music_box',gain:.20},
 {id:'offline-flute',name:'长笛',mode:'offline',bank:'flute',gain:.16},
 {id:'offline-nylon-guitar',name:'尼龙吉他',mode:'offline',bank:'acoustic_guitar_nylon',gain:.26},
 {id:'salamander',name:'Yamaha C5',mode:'online',gain:.23},
 {id:'online-electric-piano',name:'电钢琴',mode:'online',bank:'electric_piano_1',gain:.23},
 {id:'online-violin',name:'小提琴',mode:'online',bank:'violin',gain:.16},
 {id:'online-cello',name:'大提琴',mode:'online',bank:'cello',gain:.18},
 {id:'online-strings',name:'弦乐合奏',mode:'online',bank:'string_ensemble_1',gain:.16},
 {id:'online-choir',name:'合唱',mode:'online',bank:'choir_aahs',gain:.16}
];
const instrumentSpec=id=>INSTRUMENTS.find(x=>x.id===id)||INSTRUMENTS[0];
const FLUID_REVISION='044fab8e1456bfafc5776e86dfd6bb8697149aef';
const FLUID_BASE=`https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${FLUID_REVISION}/FluidR3_GM/`;
const SAMPLE_NAMES=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const instrumentBanks=new Map(),instrumentLoads=new Map();
let activeInstrumentBuffers=null,activeInstrumentId='offline',instrumentRequest=0,instrumentSelection=0,instrumentResume=false;
function invalidateInstrumentChange(){instrumentRequest++;instrumentSelection++;instrumentResume=false}
async function fetchSample(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('音源 HTTP '+response.status);return await response.arrayBuffer()}finally{clearTimeout(timer)}
}
async function mapAudio(items,job){
 const results=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(6,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await job(items[index])}}));
 return results;
}
function audibleSample(buffer){
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const data=buffer.getChannelData(channel);for(let i=0;i<data.length;i++)if(Math.abs(data[i])>.00001)return true;
 }
 return false;
}
async function transposeBuffer(buffer,semitones){
 const rate=2**(semitones/12),length=Math.max(1,Math.ceil(buffer.length/rate)),C=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(C){const offline=new C(buffer.numberOfChannels,length,buffer.sampleRate),source=offline.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;source.connect(offline.destination);source.start();return offline.startRendering()}
 const output=getAudio().createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const input=buffer.getChannelData(channel),data=output.getChannelData(channel);
  for(let i=0;i<length;i++){const at=i*rate,index=Math.floor(at),fraction=at-index;data[i]=(input[index]||0)*(1-fraction)+(input[index+1]||0)*fraction}
 }
 return output;
}
async function loadInstrumentBank(id){
 const spec=instrumentSpec(id),ac=getAudio();
 if(spec.id==='offline'){await loadOfflinePiano();return state.pianoBuffers}
 if(instrumentBanks.has(spec.id))return instrumentBanks.get(spec.id);
 if(!instrumentLoads.has(spec.id)){
  const load=(async()=>{
   let items;
   if(spec.id==='salamander'){
    items=await mapAudio(ONLINE_PIANO_ROOTS,async([name,midi])=>[midi,await ac.decodeAudioData(await fetchSample(ONLINE_PIANO_BASE+name+'.mp3'))]);
   }else{
    const embedded=window.SKY_INSTRUMENT_SAMPLES?.[spec.bank];
    items=await mapAudio(Array.from({length:36},(_,i)=>i+60),async midi=>{
     let bytes;
     if(spec.mode==='offline'){
      if(!embedded?.[midi])throw Error('离线音色缺少采样 '+midi);
      bytes=base64ToBytes(embedded[midi]).buffer;
     }else{
      const note=SAMPLE_NAMES[midi%12]+(Math.floor(midi/12)-1);
      bytes=await fetchSample(FLUID_BASE+spec.bank+'-mp3/'+note+'.mp3');
     }
     return [midi,await ac.decodeAudioData(bytes)];
    });
   }
   const bank=new Map(items);
   if(bank.size!==(spec.id==='salamander'?12:36))throw Error('音源加载不完整');
   if([...bank.values()].some(buffer=>buffer.duration<.03))throw Error('音源采样无效');
   const valid=[...bank].filter(([,buffer])=>audibleSample(buffer));if(!valid.length)throw Error('音源没有有效声音');
   bank.repairedNotes=[];
   for(const [midi,buffer] of bank)if(!audibleSample(buffer)){
    const [root,reference]=valid.reduce((a,b)=>Math.abs(a[0]-midi)<=Math.abs(b[0]-midi)?a:b);
    bank.set(midi,await transposeBuffer(reference,midi-root));bank.repairedNotes.push(midi);
   }
   instrumentBanks.set(spec.id,bank);if(spec.id==='salamander')state.onlinePianoBuffers=bank;
   return bank;
  })().catch(error=>{instrumentLoads.delete(spec.id);throw error});
  instrumentLoads.set(spec.id,load);
 }
 return instrumentLoads.get(spec.id);
}
async function prepareInstrument(){
 try{if(window.navigator?.audioSession)window.navigator.audioSession.type='playback'}catch(error){console.warn('Audio session unavailable',error)}
 const ac=getAudio();await ac.resume();if(ac.state&&ac.state!=='running')throw Error('音频尚未启动，请再次点击播放');
 const project=state.project,spec=instrumentSpec(project?.playback?.instrument),request=++instrumentRequest;
 try{
  const bank=await loadInstrumentBank(spec.id);
  if(request!==instrumentRequest||project!==state.project)return false;
  activeInstrumentId=spec.id;activeInstrumentBuffers=bank;return true;
 }catch(error){
  if(request!==instrumentRequest||project!==state.project)return false;
  console.warn(spec.name+' 无法加载，将回退离线钢琴',error);
  await loadOfflinePiano();if(request!==instrumentRequest||project!==state.project)return false;
  activeInstrumentId='offline';activeInstrumentBuffers=state.pianoBuffers;
  if(project)project.playback.instrument='offline';$('instrumentSelect').value='offline';syncInstrumentPicker();saveLibrary();
  toast(spec.name+' 暂不可用，已切换经典钢琴',5200);return true;
 }
}

/* 20-audio.js */
const ONLINE_PIANO_ROOTS=[['C4',60],['Ds4',63],['Fs4',66],['A4',69],['C5',72],['Ds5',75],['Fs5',78],['A5',81],['C6',84],['Ds6',87],['Fs6',90],['A6',93]];
const ONLINE_PIANO_BASE='https://tonejs.github.io/audio/salamander/';
function makeRoomImpulse(ac){let length=Math.round(ac.sampleRate*1.85),b=ac.createBuffer(2,length,ac.sampleRate);for(let ch=0;ch<2;ch++){let data=b.getChannelData(ch);for(let i=0;i<length;i++){let t=i/ac.sampleRate;data[i]=(Math.random()*2-1)*Math.exp(-t*3.5)*Math.pow(Math.max(0,1-t/1.85),1.4)*.36}}return b}
function getAudio(){if(!state.audioCtx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('当前浏览器不支持 Web Audio');let ac=state.audioCtx=new C();state.master=ac.createDynamicsCompressor();state.master.threshold.value=-15;state.master.knee.value=18;state.master.ratio.value=3;state.volumeBus=ac.createGain();state.volumeBus.gain.value=normalizeVolume(state.volume)*PLAYER_RULES.volume.maxGain;state.master.connect(state.volumeBus);state.volumeBus.connect(ac.destination);
 state.dryBus=ac.createGain();state.dryBus.connect(state.master);state.reverbSend=ac.createGain();let convolution=ac.createConvolver();convolution.buffer=makeRoomImpulse(ac);state.wetBus=ac.createGain();state.reverbSend.connect(convolution);convolution.connect(state.wetBus);state.wetBus.connect(state.master);updateSustainAudio();}return state.audioCtx}
function updateVolumeAudio(){
 if(!state.audioCtx||!state.volumeBus)return;const now=state.audioCtx.currentTime,gain=state.volumeBus.gain;
 gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);gain.linearRampToValueAtTime(normalizeVolume(state.volume)*PLAYER_RULES.volume.maxGain,now+PLAYER_RULES.volume.rampSeconds);
}
function updateSustainAudio(){if(!state.audioCtx||!state.wetBus)return;state.wetBus.gain.setTargetAtTime(.012+state.sustain*.40,state.audioCtx.currentTime,.04)}
async function loadOfflinePiano(){const ac=getAudio();if(state.pianoBuffers.size>=15)return;if(!state.loadedSamplePromise){state.loadedSamplePromise=Promise.all(Object.entries(SAMPLES).map(async([midi,b64])=>{let bytes=base64ToBytes(b64);return [Number(midi),await ac.decodeAudioData(bytes.buffer)]})).then(items=>{for(let [m,b]of items)state.pianoBuffers.set(m,b)}).catch(err=>{state.loadedSamplePromise=null;throw err})}await state.loadedSamplePromise}
async function preloadPiano(){return prepareInstrument()}
function sampledKey(midi,buffers){let keys=[...buffers.keys()];if(!keys.length)return null;keys.sort((a,b)=>Math.abs(a-midi)-Math.abs(b-midi));return keys[0]}
function triggerSample(note,at,duration=190,poly=1,velocity=85){const ac=state.audioCtx;if(!ac)return;let midi=noteMidi(note),buffers=activeInstrumentBuffers||state.pianoBuffers,root=sampledKey(midi,buffers);if(root==null)return;
 let source=ac.createBufferSource();source.buffer=buffers.get(root);source.playbackRate.value=2**((midi-root)/12);let gain=ac.createGain();let attack=.008,noteSec=clamp(duration/1000,.06,2.8)/state.rate,release=(.16+state.sustain*1.6)/Math.sqrt(state.rate),volume=instrumentSpec(activeInstrumentId).gain/Math.sqrt(Math.max(1,poly))*Math.pow(clamp(velocity,1,127)/95,1.28);let end=at+noteSec+release;
 gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+attack);gain.gain.setValueAtTime(volume*.74,at+noteSec);gain.gain.exponentialRampToValueAtTime(.00013,end);source.connect(gain);gain.connect(state.dryBus);gain.connect(state.reverbSend);source.start(at);source.stop(Math.min(at+source.buffer.duration/Math.max(.01,source.playbackRate.value)-.02,end+.1));state.activeVoices.add(source);source.onended=()=>{state.activeVoices.delete(source);try{source.disconnect();gain.disconnect()}catch(e){}}
}
function stopVoices(){for(let source of [...state.activeVoices]){try{source.stop()}catch(e){}}state.activeVoices.clear()}
function realPosition(){if(!state.isPlaying||!state.audioCtx)return state.position;return state.mediaAnchor+(state.audioCtx.currentTime-state.clockAnchor)*1000*state.rate}
function beginClock(){let ac=state.audioCtx;state.mediaAnchor=state.position;state.clockAnchor=ac.currentTime;let ev=scoreEvents(state.project);state.scheduleIndex=lowerBound(ev,state.position-2);state.interval=setInterval(scheduleAudio,24);scheduleAudio()}
function lowerBound(arr,t){let l=0,r=arr.length;while(l<r){let m=(l+r)>>1;if(arr[m].timeMs<t)l=m+1;else r=m}return l}
function scheduleAudio(){if(!state.isPlaying)return;let events=scoreEvents(state.project),now=realPosition(),lookahead=Math.min(state.project.durationMs,now+170*state.rate);while(state.scheduleIndex<events.length&&events[state.scheduleIndex].timeMs<=lookahead){let e=events[state.scheduleIndex++];if(!e.notes.length||e.timeMs<now-35)continue;let at=state.audioCtx.currentTime+Math.max(0,(e.timeMs-now)/(1000*state.rate));for(let n of e.notes)triggerSample(n,at,e.durationMs,e.notes.length,e.velocity||85)}}
async function playPause(silent=false){
 cancelScoreEntrance();if(state.isPlaying){pauseSong();if(!silent)toast('已暂停演奏');return}if(!state.project)return;
 const project=state.project,revision=actionNoticeRevision;let loadingRevision=-1;cancelRollFinish();
 const waiting=silent?0:setTimeout(()=>{if(state.project===project&&state.mode==='player'){toast('正在准备音源…');loadingRevision=actionNoticeRevision}},PLAYER_RULES.notifications.slowOperationMs);
 try{if(!await preloadPiano())return}catch(err){console.error(err);toast('音源加载失败：'+err.message,6000);return}finally{clearTimeout(waiting)}
 if(state.project!==project||state.mode!=='player')return;
 if(state.position>=state.project.durationMs-80){state.position=0;state.rollPageStart=0}
 state.isPlaying=true;beginClock();setControlContent($('playBtn'),'pause','暂停');state.sceneBase=performance.now();state.raf=requestAnimationFrame(playFrame);
 if(!silent&&(revision===actionNoticeRevision||loadingRevision===actionNoticeRevision))toast('开始演奏');
}
function pauseSong(){if(!state.isPlaying)return;state.position=clamp(realPosition(),0,state.project.durationMs);state.isPlaying=false;clearInterval(state.interval);cancelAnimationFrame(state.raf);stopVoices();setControlContent($('playBtn'),'play','播放');updateVisual();$('stageStatus').dataset.playStatus='已暂停';$('stageStatus').textContent='已暂停'}
function seekTo(time,preserveRoll=false,rollView=null){
 resetPlaybackKeyFeedback();
 cancelScoreEntrance();
 if(!state.project)return;
 const was=state.isPlaying,frame=rollFrame(was?realPosition():state.position),fraction=frame.phase/frame.windowMs;
 cancelRollFinish();
 if(was){clearInterval(state.interval);stopVoices()}
 state.position=clamp(time,0,Math.max(0,state.project.durationMs));
 state.rollPageStart=rollView?rollView.begin:preserveRoll?rollSeekOrigin(state.position,fraction):Math.floor(Math.max(0,state.position-(state.position>=state.project.durationMs ? .001 : 0))/(state.windowSec*1000))*state.windowSec*1000;
 state.lastSelected=-1;
 // Re-anchor the running audio clock directly: rapid drag events never spawn async play calls.
 if(was)beginClock();
 updateVisual();
}
function playFrame(){if(!state.isPlaying)return;state.position=clamp(realPosition(),0,state.project.durationMs);if(state.position>=state.project.durationMs){if(state.project.playback.loop&&!state.editMode){clearInterval(state.interval);cancelRollFinish();state.position=0;state.rollPageStart=0;state.selected=0;state.lastSelected=-1;state.page=-1;resetPlaybackKeyFeedback();beginClock()}else{finishRollScan();return}}updateVisual();animateScene();state.raf=requestAnimationFrame(playFrame)}
function isSounding(timeMs){if(!state.isPlaying)return false;let ev=scoreEvents(state.project);let i=lowerBound(ev,timeMs);for(let k=Math.max(0,i-10);k<i;k++){let e=ev[k];if(e.notes.length&&timeMs>=e.timeMs&&timeMs<e.timeMs+e.durationMs+250+state.sustain*800)return true}return false}
function activeNotes(timeMs){let ev=scoreEvents(state.project),i=lowerBound(ev,timeMs),set=new Set();for(let k=Math.max(0,i-12);k<i;k++){let e=ev[k];if(e.notes.length&&timeMs>=e.timeMs&&timeMs<e.timeMs+e.durationMs+state.sustain*570){for(let n of e.notes)set.add(n)}}return set}

/* 30-import.js */
function parseCSV(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)throw Error('CSV 没有事件行');const cols=lines[0].split(',').map(s=>s.trim());
 const ti=cols.findIndex(c=>['song_time_ms','time_ms','timeMs','time'].includes(c));const ni=cols.findIndex(c=>['note_keys_1_to_15','notes','keys','note_keys'].includes(c));const si=cols.findIndex(c=>['step_1_to_1296','step'].includes(c));
 if(ti<0||ni<0)throw Error('CSV 需要 time_ms/song_time_ms 与 notes/note_keys_1_to_15 列');
 let events=lines.slice(1).map((line,i)=>{const fields=line.split(',');let raw=fields[ni]||'',notes=raw.split(/[+;\s]+/).filter(Boolean).map(Number).filter(n=>n>=1&&n<=15);return {timeMs:Number(fields[ti]),notes,durationMs:notes.length?190:0}}).filter(e=>Number.isFinite(e.timeMs));
 return normalize({title:'导入的 CSV 乐谱',subtitle:'CSV SCORE',id:'csv-'+Date.now(),score:{mode:si>=0?'grid':'free',events},durationMs:(events.at(-1)?.timeMs||0)+200,theme:{id:'starlight'},playback:{tuning:'C'}})
}
function readVarLen(bytes,ptr){let v=0,n=0;for(let k=0;k<4;k++){if(ptr.i>=bytes.length)throw Error('MIDI 读取超界');let c=bytes[ptr.i++];v=(v<<7)|(c&127);n++;if(!(c&128))break}return v}
function parseMIDI(arrayBuffer){const b=new Uint8Array(arrayBuffer),dv=new DataView(arrayBuffer);let p=0;const chunk=()=>{let s=String.fromCharCode(...b.slice(p,p+4));let n=dv.getUint32(p+4);p+=8;return [s,n]};let[h,hlen]=chunk();if(h!=='MThd'||hlen<6)throw Error('无效 MIDI 头');const format=dv.getUint16(p),tracks=dv.getUint16(p+2),tpq=dv.getUint16(p+4);p+=hlen;if(tpq&0x8000)throw Error('暂不支持 SMPTE MIDI 时间格式');if(tracks>64)throw Error('MIDI 轨道数量过多');
 let all=[],tempos=[{tick:0,us:500000}];for(let t=0;t<tracks;t++){let [name,length]=chunk();if(name!=='MTrk')throw Error('MIDI 轨道头错误');let end=p+length,at=0,run=0;while(p<end){let ptr={i:p},dt=readVarLen(b,ptr);p=ptr.i;at+=dt;let status=b[p];if(status&128){p++;run=status}else status=run;if(status===0xff){let kind=b[p++],pp={i:p},len=readVarLen(b,pp);p=pp.i;if(kind===0x51&&len===3)tempos.push({tick:at,us:(b[p]<<16)|(b[p+1]<<8)|b[p+2]});p+=len;continue}if(status===0xf0||status===0xf7){let pp={i:p},len=readVarLen(b,pp);p=pp.i+len;continue}let type=status&0xf0,ch=status&15;if(type===0x90||type===0x80){let key=b[p++],vel=b[p++];all.push({tick:at,type:type===0x90&&vel>0?'on':'off',midi:key,vel,ch});}else if([0xa0,0xb0,0xe0].includes(type))p+=2;else if([0xc0,0xd0].includes(type))p+=1;else throw Error('不支持的 MIDI 事件');}p=end}
 tempos.sort((a,b)=>a.tick-b.tick);let merged=[tempos[0]];for(let x of tempos.slice(1)){if(x.tick===merged.at(-1).tick)merged[merged.length-1]=x;else merged.push(x)}function tickMs(tick){let t=0,us=500000,base=0;for(let tm of merged){if(tm.tick>tick)break;t+=(tm.tick-base)/tpq*us/1000;base=tm.tick;us=tm.us}return t+(tick-base)/tpq*us/1000}
 all.sort((a,b)=>a.tick-b.tick||((a.type==='off')?-1:1));let active=new Map(),onsets=[];for(let e of all){let mm=e.midi;let time=Math.round(tickMs(e.tick));let key=e.ch+':'+mm;if(e.type==='on'){let item={timeMs:time,midi:mm,durationMs:220};active.set(key,item);onsets.push(item)}else if(active.has(key)){active.get(key).durationMs=clamp(time-active.get(key).timeMs,40,3000);active.delete(key)}}
 if(!onsets.length)throw Error('MIDI 未包含音符事件');let approximated=0,outOfRange=0;function toKey(m){let q=m;while(q<60){q+=12;outOfRange++}while(q>84){q-=12;outOfRange++}let d=SCALE.map((s,i)=>[Math.abs(60+s-q),i+1]).sort((a,b)=>a[0]-b[0]);if(d[0][0]!==0)approximated++;return d[0][1]}
 let groups=[];for(let e of onsets){let n=toKey(e.midi),last=groups.at(-1);if(last&&Math.abs(last.timeMs-e.timeMs)<=12){if(!last.notes.includes(n))last.notes.push(n);last.durationMs=Math.max(last.durationMs,e.durationMs)}else groups.push({timeMs:e.timeMs,notes:[n],durationMs:e.durationMs})}
 let pjt=normalize({title:'导入的 MIDI',subtitle:'MIDI · 15-KEY ADAPTATION',id:'midi-'+Date.now(),score:{mode:'free',events:groups},durationMs:Math.max(...groups.map(e=>e.timeMs+e.durationMs))+400,theme:{id:'starlight'},playback:{tuning:'C'},provenance:{source:'MIDI 导入',warning:'非自然音被近似映射，音域外音被八度折返',approximated,outOfRange}});
 return {project:pjt,warning:approximated||outOfRange?`已适配15键：约 ${approximated} 个半音近似，${outOfRange} 次八度折返。请试听校对。`:'MIDI 已按15键音阶导入'}
}
// Experimental automatic transcription: a single dominant pitch per onset, not reliable polyphonic transcription.
function pitchScore(samples,start,size,sr,freq){let step=2*Math.cos(2*Math.PI*freq/sr),q0=0,q1=0,q2=0;for(let i=0;i<size;i++){let x=samples[start+i]||0;let window=.5-.5*Math.cos(2*Math.PI*i/(size-1));q0=step*q1-q2+x*window;q2=q1;q1=q0}return q1*q1+q2*q2-step*q1*q2}
async function transcribeMonoAudio(file){if(file.size>20*1024*1024)throw Error('实验性音频转录仅支持20MB以内文件');const ac=getAudio(),buff=await ac.decodeAudioData(await file.arrayBuffer());let source=buff.getChannelData(0),stride=Math.max(1,Math.floor(buff.sampleRate/11025)),sr=buff.sampleRate/stride,secs=Math.min(60,buff.duration);let n=Math.floor(secs*sr),samples=new Float32Array(n);for(let i=0;i<n;i++)samples[i]=source[i*stride]||0;
 let frames=[],window=2048,hop=256;for(let pos=0;pos+window<samples.length;pos+=hop){let sum=0;for(let j=0;j<window;j+=4)sum+=samples[pos+j]**2;frames.push({t:pos/sr*1000,energy:Math.sqrt(sum/(window/4)),pos})}
 let sorted=frames.map(f=>f.energy).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length*.5)]||0,threshold=Math.max(.007,median*.75);let peaks=[];for(let i=2;i<frames.length-2;i++){let a=frames[i];if(a.energy<threshold)continue;let prev=frames[i-2].energy,flux=a.energy-prev;if(flux>Math.max(.012,prev*.28)&&flux>frames[i-1].energy-frames[i-3].energy&&(!peaks.length||a.t-peaks.at(-1).t>115))peaks.push(a)}
 if(!peaks.length){let strongest=frames.reduce((a,b)=>b.energy>a.energy?b:a,frames[0]);if(strongest&&strongest.energy>threshold)peaks=[strongest]}
 let events=[];for(let a of peaks.slice(0,400)){let pos=Math.min(samples.length-window,Math.floor(a.pos+sr*.035)),scores=[];for(let k=1;k<=15;k++){let freq=440*2**((noteMidi(k,'C')-69)/12);let val=pitchScore(samples,pos,window,sr,freq)+.2*pitchScore(samples,pos,window,sr,freq*2);scores.push([val,k])}scores.sort((a,b)=>b[0]-a[0]);events.push({timeMs:Math.round(a.t),notes:[scores[0][1]],durationMs:Math.max(120,Math.round(Math.min(480,(peaks.find(q=>q.t>a.t)?.t||a.t+420)-a.t)*.72)),confidence:'experimental-mono'})}
 if(!events.length)throw Error('未检测到清晰的单旋律起音');let p=normalize({id:'audio-'+Date.now(),title:file.name.replace(/\.[^.]+$/,''),subtitle:'EXPERIMENTAL AUDIO TRANSCRIPTION',description:'前60秒单主音起音识别实验。复杂伴奏/和弦、调性不同的音乐需要人工修正。',durationMs:Math.ceil(secs*1000),score:{mode:'free',events},theme:{id:'starlight'},playback:{tuning:'C'},provenance:{source:'实验音频自动分析',accuracy:'unverified',limits:'单主音，最多60秒，无法保证和弦和自由节奏'}});
 return {project:p,warning:`实验性音频分析：仅取前 ${Math.round(secs)} 秒，识别 ${events.length} 个候选主音；和弦与调性尚需人工校对。`}
}

// Parse a MusicXML score into timed 15-key events. Complex multi-voice scores remain approximate.
function parseMusicXML(text){let xml=new DOMParser().parseFromString(text,'application/xml');if(xml.getElementsByTagName('parsererror').length)throw Error('MusicXML XML结构错误');let parts=[...xml.getElementsByTagName('part')];if(!parts.length)throw Error('MusicXML 未包含乐谱 Part');let midiOf=n=>{let st=n.getElementsByTagName('step')[0]?.textContent||'C',oct=Number(n.getElementsByTagName('octave')[0]?.textContent||4),alter=Number(n.getElementsByTagName('alter')[0]?.textContent||0);return(oct+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[st]||0)+alter};let all=[],noteCount=0;for(let part of parts.slice(0,8)){let div=1,bpm=120,time=0,lastChord=0;for(let child of [...part.children]){if(child.tagName!=='measure')continue;for(let item of [...child.children]){if(item.tagName==='attributes'){div=Number(item.getElementsByTagName('divisions')[0]?.textContent||div)||div}if(item.tagName==='direction'){let t=item.getElementsByTagName('sound')[0]?.getAttribute('tempo');let per=item.getElementsByTagName('per-minute')[0]?.textContent;if(Number(t||per)>0)bpm=Number(t||per)}if(item.tagName==='backup')time=Math.max(0,time-Number(item.getElementsByTagName('duration')[0]?.textContent||0)/div*60000/bpm);if(item.tagName==='forward')time+=Number(item.getElementsByTagName('duration')[0]?.textContent||0)/div*60000/bpm;if(item.tagName!=='note')continue;let dur=Number(item.getElementsByTagName('duration')[0]?.textContent||0)/div*60000/bpm,rest=item.getElementsByTagName('rest').length>0,chord=item.getElementsByTagName('chord').length>0;if(!chord)lastChord=time;if(!rest){let pitch=item.getElementsByTagName('pitch')[0];if(pitch){all.push({timeMs:Math.round(chord?lastChord:time),midi:midiOf(pitch),durationMs:Math.round(Math.max(60,dur)),velocity:85});noteCount++}}if(!chord)time+=dur}}}
 if(!all.length)throw Error('MusicXML 未包含可识别音符');all.sort((a,b)=>a.timeMs-b.timeMs);const adapted=adaptMidiEvents(all);let p=normalize({title:'导入 MusicXML',id:nextId('xml'),subtitle:'MUSICXML · 15-KEY SCORE',durationMs:Math.max(...adapted.events.map(e=>e.timeMs+e.durationMs))+500,score:{mode:'free',events:adapted.events},theme:{id:'starlight'},playback:{tuning:'C'},provenance:{source:'MusicXML 导入',approximated:adapted.approximated,outOfRange:adapted.outOfRange,notes:noteCount}});return {project:p,warning:`MusicXML 已读取 ${noteCount} 个原始音符。${adapted.approximated} 个半音近似，${adapted.outOfRange} 次音域折返，需人工核对。`}}
function adaptMidiEvents(items){let approximated=0,outOfRange=0,groups=[];for(let e of items){let m=e.midi,q=m;while(q<60){q+=12;outOfRange++}while(q>84){q-=12;outOfRange++}let choices=SCALE.map((s,i)=>[Math.abs(60+s-q),i+1]).sort((a,b)=>a[0]-b[0]);let key=choices[0][1];if(choices[0][0])approximated++;let last=groups.at(-1);if(last&&Math.abs(last.timeMs-e.timeMs)<12){if(!last.notes.includes(key))last.notes.push(key);last.durationMs=Math.max(last.durationMs,e.durationMs);last.velocity=Math.max(last.velocity,e.velocity||85)}else groups.push({timeMs:e.timeMs,notes:[key],durationMs:e.durationMs,velocity:e.velocity||85,confidence:'imported'})}return{events:groups,approximated,outOfRange}}

async function importFile(file,companions=[]){let name=file.name.toLowerCase();if(file.type.startsWith('video/')||/\.(mp4|mov|webm)$/.test(name)){openVideoDialog(file);$('importDialog').close();return}if(state.importBusy)throw Error('另一个导入仍在处理中');state.importBusy=true;try{let item,warning='';
 if(name.endsWith('.skytheme')){const pack=await readThemeResource(await file.arrayBuffer());savePlatformTheme(pack);if(state.project&&state.editMode){rememberEdit();state.project.theme=normalize({score:{events:[]},theme:{id:pack.theme.id,...pack.theme}}).theme;delete state.project.theme.definition;delete state.project.theme.assets;state.project._imageUrl=null;state.project._imageBytes=null;applyTheme();saveLibrary()}toast('主题已录入平台：'+pack.theme.name);return}
 if(name.endsWith('.skymusic')){item=await importPlatformFile(file);warning='已载入完整单曲，三个谱面视图已同步'}
 else if(name.endsWith('.skytrack')){item=await readMusicResource(await file.arrayBuffer());warning='已载入纯数字谱'}
 else if(name.endsWith('.json')){item=normalize(JSON.parse(await file.text()));warning='已导入 JSON 数字乐谱'}
 else if(name.endsWith('.csv')){item=parseCSV(await file.text());warning='已导入 CSV；请核对节奏'}
 else if(name.endsWith('.musicxml')||name.endsWith('.xml')){let m=parseMusicXML(await file.text());item=m.project;warning=m.warning}
 else if(name.endsWith('.mid')||name.endsWith('.midi')){let m=parseMIDI(await file.arrayBuffer());item=m.project;warning=m.warning}
 else if(/\.(mp3|wav|ogg)$/.test(name)){let a=await transcribeMonoAudio(file);item=a.project;warning=a.warning}
 else throw Error('不支持的文件格式');
 item.id=nextId('imported');item.originKind='imported';state.library.unshift(item);saveLibrary();renderLibrary();if($('importDialog').open)$('importDialog').close();openSong(item.id);toast(warning,6500)
}finally{state.importBusy=false}}


/* 35-video.js */
// Browser-only assisted transcription for the 4x8 Sky tutorial grid.
// Experimental: reads a user-calibrated region; no claim of universal video recognition.
let videoUrl=null,videoROI={x:.17,y:.055,w:.66,h:.445},videoDrag=null;
function videoCanvas(){return $('videoOverlay')}
function videoRect(){let v=$('videoSource'),cv=videoCanvas(),w=cv.clientWidth,h=cv.clientHeight,vr=v.videoWidth&&v.videoHeight?v.videoWidth/v.videoHeight:w/h,r=w/h;if(vr>r){let dh=w/vr;return{x:0,y:(h-dh)/2,w,h:dh}}let dw=h*vr;return{x:(w-dw)/2,y:0,w:dw,h}}
function drawVideoROI(){let cv=videoCanvas(),w=cv.clientWidth,h=cv.clientHeight;if(w<20||h<20)return;let dpr=Math.min(2,devicePixelRatio||1);cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);let c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);let r=videoRect(),x=r.x+videoROI.x*r.w,y=r.y+videoROI.y*r.h,ww=videoROI.w*r.w,hh=videoROI.h*r.h;c.fillStyle='#ffd8a313';c.fillRect(x,y,ww,hh);c.strokeStyle='#ffdda6';c.lineWidth=2;c.strokeRect(x,y,ww,hh);c.lineWidth=1;c.strokeStyle='#ffddaa55';for(let col=1;col<8;col++){let xx=x+col*ww/8;c.beginPath();c.moveTo(xx,y);c.lineTo(xx,y+hh);c.stroke()}for(let row=1;row<4;row++){let yy=y+row*hh/4;c.beginPath();c.moveTo(x,yy);c.lineTo(x+ww,yy);c.stroke()}$('videoRoi').textContent=`标定区域 ${Math.round(videoROI.x*100)}%, ${Math.round(videoROI.y*100)}% · ${Math.round(videoROI.w*100)}% × ${Math.round(videoROI.h*100)}%`}
function setVideoFile(file){if(videoUrl){URL.revokeObjectURL(videoUrl);videoUrl=null}state.videoFile=file;let v=$('videoSource');v.pause();videoUrl=URL.createObjectURL(file);v.src=videoUrl;v.onloadedmetadata=()=>{let dur=v.duration||0;let st=dur>240?Math.max(0,dur/2):0;$('videoStart').value=st.toFixed(2);$('videoEnd').value=Math.min(dur,st+216).toFixed(2);v.currentTime=Math.min(st+.2,dur);drawVideoROI();$('videoProgress').textContent=`视频 ${durationFmt(dur*1000)} 已就绪`};v.onseeked=drawVideoROI}
function openVideoDialog(file){if(file)setVideoFile(file);$('videoDialog').showModal();videoCanvas().style.pointerEvents='none';$('videoSelectArea').textContent='框选谱面区域';requestAnimationFrame(drawVideoROI)}
function videoPointer(ev){let cv=videoCanvas(),r=cv.getBoundingClientRect(),box=videoRect();return{x:clamp((ev.clientX-r.left-box.x)/box.w,0,1),y:clamp((ev.clientY-r.top-box.y)/box.h,0,1)}}
async function seekVideo(v,time){if(Math.abs(v.currentTime-time)<.012&&v.readyState>=2)return;await new Promise((resolve,reject)=>{let timer=setTimeout(()=>{cleanup();reject(Error('视频解码超时；可尝试转换为 H.264 MP4'))},6000);let cleanup=()=>{clearTimeout(timer);v.removeEventListener('seeked',onDone);v.removeEventListener('error',onErr)};let onDone=()=>{cleanup();resolve()};let onErr=()=>{cleanup();reject(Error('视频帧读取失败'))};v.addEventListener('seeked',onDone,{once:true});v.addEventListener('error',onErr,{once:true});try{v.currentTime=time}catch(err){cleanup();reject(err)}})}
function analyseSkyGrid(pixels,width,height,thresh){const pix=(x,y)=>{let o=(Math.min(height-1,Math.max(0,Math.round(y)))*width+Math.min(width-1,Math.max(0,Math.round(x))))*4;return[pixels[o],pixels[o+1],pixels[o+2]]};let rank=[];for(let cell=0;cell<32;cell++){let col=cell%8,row=Math.floor(cell/8),bx=col*width/8,by=row*height/4,cw=width/8,ch=height/4,acc=0,count=0;for(let yy=0.2;yy<=.82;yy+=.12)for(let xx=.18;xx<=.82;xx+=.12){let [r,g,b]=pix(bx+cw*xx,by+ch*yy);acc+=Math.max(0,r-(g+b)/2-9);count++}rank.push({index:cell,red:acc/count})}rank.sort((a,b)=>b.red-a.red);let best=rank[0],solid=best.red>14&&best.red>rank[1].red*1.25;let index=best.index,cellCol=index%8,cellRow=Math.floor(index/8),bx=cellCol*width/8,by=cellRow*height/4,cw=width/8,ch=height/4;let notes=[];
 // 5×3 keys are at the centers of a standard 5×3 logical grid; sample a small patch to tolerate glow.
 for(let r=0;r<3;r++)for(let c=0;c<5;c++){let cx=bx+cw*(.1+.2*c),cy=by+ch*(.167+r/3),bright=0;for(let dy=-2;dy<=2;dy+=2)for(let dx=-2;dx<=2;dx+=2){let [rr,gg,bb]=pix(cx+dx,cy+dy);bright+=Math.min(rr,gg,bb)}bright/=9;if(bright>=thresh)notes.push(r*5+c+1)}return{active:index,redScore:best.red,stable:solid,notes}}
async function scanVideo(){const v=$('videoSource');if(!state.videoFile||!v.videoWidth){toast('请先选择视频文件',5000);return}let start=Number($('videoStart').value),end=Number($('videoEnd').value),interval=Number($('videoBeat').value),thresh=Number($('videoThreshold').value);if(![start,end,interval].every(Number.isFinite)||start<0||end<=start||end>v.duration+.01||interval<50||interval>3000){toast('请检查开始、结束和基础格间隔',6000);return}const total=Math.ceil((end-start)*1000/interval);if(total>2000){toast('本次最多扫描2000格，可缩短片段',6000);return}let cv=document.createElement('canvas'),W=768,H=256;cv.width=W;cv.height=H;let ctx=cv.getContext('2d',{willReadFrequently:true});state.videoScanAbort=false;$('videoScanBtn').disabled=true;let results=[],bad=0,redHits=0;v.pause();try{for(let i=0;i<total;i++){if(state.videoScanAbort)break;let time=Math.min(end-.01,start+(i+.45)*interval/1000);await seekVideo(v,time);ctx.clearRect(0,0,W,H);ctx.drawImage(v,videoROI.x*v.videoWidth,videoROI.y*v.videoHeight,videoROI.w*v.videoWidth,videoROI.h*v.videoHeight,0,0,W,H);let image=ctx.getImageData(0,0,W,H);let a=analyseSkyGrid(image.data,W,H,thresh);if(a.stable)redHits++;else bad++;results.push({timeMs:Math.round(i*interval),notes:a.notes,durationMs:a.notes.length?Math.min(200,Math.round(interval*.8)):0,velocity:85,confidence:a.stable?'video-auto':'review-required'});if(i%15===0){$('videoProgress').textContent=`正在识别 ${i+1} / ${total} 格 · 高亮明确 ${redHits}`;await new Promise(res=>setTimeout(res,0))}}
 if(state.videoScanAbort){toast('已停止视频扫描，未导入不完整结果',5000);return}let notes=results.reduce((s,e)=>s+e.notes.length,0);if(!results.length||notes===0)throw Error('未识别到亮点。请调整框选区域/亮点阈值并重新扫描');let p=normalize({id:nextId('video'),title:state.videoFile.name.replace(/\.[^.]+$/,''),subtitle:'VIDEO GRID · NEEDS REVIEW',description:'基于视频顶部4×8逐拍点阵进行实验性扫描，结果未经人工校验。',durationMs:Math.round(total*interval),score:{mode:'grid',gridIntervalMs:interval,events:results},playback:{tuning:'C'},theme:{id:'starlight'},provenance:{source:'视频4×8网格扫描',sourceFile:state.videoFile.name,videoStart:start,videoEnd:end,redConfidence:redHits/total,unverified:true}});state.library.unshift(p);saveLibrary();$('videoDialog').close();renderLibrary();openSong(p.id);toast(`视频候选谱已生成：${total} 格 / ${notes} 个候选音符；${bad} 格需重点核查。`,8500)
 }catch(err){console.error(err);toast('视频扫描失败：'+err.message,8500)}finally{$('videoScanBtn').disabled=false;$('videoProgress').textContent=`结束：${results.length} 格，高亮可靠 ${redHits} 格`}}
function bindVideo(){const cv=videoCanvas();$('videoChooseFile').onclick=()=>{$('videoDialog').close();$('fileInput').click()};$('videoJumpToStart').onclick=()=>{let v=$('videoSource');if(!v.videoWidth)return toast('先选择视频');v.currentTime=clamp(Number($('videoStart').value)||0,0,v.duration-.02);drawVideoROI()};$('videoSelectArea').onclick=()=>{videoCanvas().style.pointerEvents='auto';toast('在视频上拖动框选整个4×8谱面',2200)};cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);videoDrag={start:videoPointer(e)}});cv.addEventListener('pointermove',e=>{if(!videoDrag)return;const p=videoPointer(e),s=videoDrag.start;videoROI={x:Math.min(s.x,p.x),y:Math.min(s.y,p.y),w:Math.max(.01,Math.abs(s.x-p.x)),h:Math.max(.01,Math.abs(s.y-p.y))};drawVideoROI()});cv.addEventListener('pointerup',()=>{videoDrag=null;cv.style.pointerEvents='none';$('videoSelectArea').textContent='重新框选谱面';});$('videoResetRoi').onclick=()=>{videoROI={x:.17,y:.055,w:.66,h:.445};drawVideoROI()};$('videoScanBtn').onclick=scanVideo;$('videoCancelScan').onclick=()=>{state.videoScanAbort=true};$('videoDialog').addEventListener('close',()=>{state.videoScanAbort=true;$('videoSource').pause()});window.addEventListener('resize',()=>{if($('videoDialog').open)drawVideoROI()})}

/* 36-platform-controller.js */
// The platform mounts one score + one theme under one shared interaction controller.
function safeResourcePath(path,extension){
 if(typeof path!=='string'||path.length>240||path.startsWith('/')||path.includes('\\')||path.includes(':')||path.split('/').includes('..')||!path.toLowerCase().endsWith(extension))throw Error('无效的资源引用：'+String(path));
 return path;
}
function validateEntry(entry){
 if(!entry||entry.format!=='skymusic'||entry.schemaVersion!==2)throw Error('不是受支持的 .skymusic 单曲文件');
 if(typeof entry.id!=='string'||!entry.id||entry.id.length>100)throw Error('缺少有效单曲 ID');
 if(!entry.music||entry.music.format!=='skytrack'||entry.music.schemaVersion!==1||entry.music.keyCount!==15||!Array.isArray(entry.music.events))throw Error('单曲必须内嵌完整 .skytrack 谱面');
 if(entry.music.timeUnit!=='ms')throw Error('谱面时间单位需要为 ms');
 if(!entry.theme||Object.keys(entry.theme).some(key=>key!=='id')||!Object.hasOwn(THEME_DEFINITIONS,entry.theme.id))throw Error('主题未录入平台，请先导入对应 .skytheme：'+(entry.theme?.id||''));
 for(const event of entry.music.events)if(!Number.isFinite(event.timeMs)||event.timeMs<0||!Array.isArray(event.notes)||event.notes.some(n=>!Number.isInteger(n)||n<1||n>15)||!Number.isFinite(event.durationMs)||event.durationMs<0||event.durationMs>10000||event.timeMs>36000000)throw Error('谱面事件无效');
 return entry;
}
function scoreDocument(project){return {format:'skytrack',schemaVersion:1,keyCount:15,timeUnit:'ms',durationMs:project.durationMs,mode:project.score.mode,gridIntervalMs:project.score.gridIntervalMs,tuning:project.playback.tuning,events:copy(scoreEvents(project))}}
function projectEntry(project){
 return {format:'skymusic',schemaVersion:2,id:project.id,title:project.title,subtitle:project.subtitle,description:project.description,
  music:scoreDocument(project),theme:{id:sceneId(project)},
  card:copy(project.card||{}),playback:copy(project.playback),provenance:copy(project.provenance||{})};
}
const PLATFORM_THEME_KEY='sky-music-studio-themes-v1';
const PLATFORM_THEME_ASSETS={};
const PLATFORM_BUILTIN_THEMES=new Set(Object.keys(THEME_DEFINITIONS));
function restorePlatformThemes(){
 try{const records=JSON.parse(localStorage.getItem(PLATFORM_THEME_KEY)||'[]');for(const record of records){const definition=sanitizeThemeDefinition(record.definition);registerThemeDefinition(definition);PLATFORM_THEME_ASSETS[definition.id]=record.assets||{}}}catch(error){console.warn('主题库恢复失败',error)}
}
function savePlatformTheme(pack){
 const definition=pack.theme.definition;if(!definition)throw Error('旧主题请先在编辑器中升级导出为新版 .skytheme');
 const existing=THEME_DEFINITIONS[definition.id];
 if(existing&&JSON.stringify(sanitizeThemeDefinition(existing))!==JSON.stringify(definition))throw Error('主题 ID 已存在且内容不同，请使用新的主题 ID');
 const records=JSON.parse(localStorage.getItem(PLATFORM_THEME_KEY)||'[]').filter(item=>item.definition.id!==definition.id);
 records.push({definition,assets:pack.assets||{}});
 localStorage.setItem(PLATFORM_THEME_KEY,JSON.stringify(records));
 registerThemeDefinition(definition);PLATFORM_THEME_ASSETS[definition.id]=pack.assets||{};populateThemeChoices();if($('themeRepositoryDialog').open)renderThemeRepository();
}
function sanitizeThemeDefinition(raw){
 if(!raw||typeof raw!=='object'||!/^[-a-zA-Z0-9_]{1,80}$/.test(raw.id||''))throw Error('主题定义缺少有效 ID');
 if(['score','events','interaction','player','songs','script','handlers'].some(key=>Object.hasOwn(raw,key)))throw Error('主题只能包含外观参数和素材，不能包含谱面或交互处理器');
 raw=copy(raw);
 if(raw.elementRefs){
  const refs=raw.elementRefs,elements=raw.elements||{},element=id=>{if(!elements[id])throw Error('主题缺少元素 '+id);return elements[id]};
  const identity=element(refs.identity),scene=element(refs.stage);
  raw.decorations={...raw.decorations,identity:{image:identity.path||null,glyph:identity.glyph||'✧'},cover:refs.cover?element(refs.cover).path:null,treeImage:refs.tree?element(refs.tree).path:null,
   scene:{type:scene.kind,frameCount:scene.count||0,framePattern:scene.pattern||null,periodMs:scene.periodMs||6000,...(scene.kind==='image'?{image:scene.path}:{})},companion:refs.companion?element(refs.companion).path:null,ornaments:(refs.ornaments||[]).map(id=>element(id).path),effects:(refs.effects||[]).map(id=>element(id).type)};
  if(refs.palette)raw.appearance={...element(refs.palette).colors,...(raw.appearanceOverrides||raw.appearance)};
 }
 const base=THEME_DEFINITIONS[raw.id]||THEME_DEFINITIONS[APP_CONFIG.defaultTheme],definition=copy(base),input=raw.decorations||{};
 definition.elementRefs=raw.elementRefs||{};definition.appearanceOverrides=raw.appearanceOverrides||{};definition.id=raw.id;definition.name=String(raw.name||base.name).slice(0,100);definition.displayName=String(raw.displayName||definition.name).slice(0,60);
 definition.description=String(raw.description||'').slice(0,160);definition.legacyNames=(raw.legacyNames||[]).filter(value=>typeof value==='string').slice(0,8);
 definition.appearance={...base.appearance,...sanitizePlayerAppearance(raw.appearance)};
 definition.materials=sanitizeThemeMaterials(raw.materials);const feedback={...raw.keyFeedback};if(feedback.element&&raw.elements?.[feedback.element]?.kind==='particle')feedback.shape=raw.elements[feedback.element].shape;definition.keyFeedback=sanitizeKeyFeedback(feedback,definition.appearance);
 definition.defaults={...base.defaults,...raw.defaults};definition.initialOverrides=Object.fromEntries(Object.entries(raw.initialOverrides||{}).filter(([key])=>['accent','backgroundColor','snow','glow','motion','name','customStage'].includes(key)));
 const image=path=>{if(path!=null)safeResourcePath(path,path.slice(path.lastIndexOf('.')));if(path&&!path.startsWith('assets/'))throw Error('主题资源必须位于 assets/');return path||null};
 const scene=input.scene||base.decorations.scene;
 if(!['frames','symbol','image'].includes(scene.type))throw Error('不支持的主题舞台类型');
 if(scene.type==='frames'&&(!Number.isInteger(scene.frameCount)||scene.frameCount<1||scene.frameCount>48))throw Error('主题帧数超出范围');
 const classes=(input.classes||base.decorations.classes).filter(name=>['theme-starlight','theme-citylights'].includes(name));
 definition.decorations={classes,layout:sanitizeThemeLayout(input.layout),identity:{image:image(input.identity?.image),glyph:String(input.identity?.glyph||'✧').slice(0,8)},
  companion:image(input.companion),ornaments:(input.ornaments||[]).slice(0,3).map(image),tree:Boolean(input.tree),treeImage:image(input.treeImage),motif:Boolean(input.motif),cover:image(input.cover),choiceGlyph:String(input.choiceGlyph||'✧').slice(0,8),
  effects:(input.effects||['snow','glow','lights']).filter(type=>['snow','glow','lights'].includes(type)),scene:{type:scene.type,frameCount:scene.type==='frames'?scene.frameCount:0,framePattern:scene.type==='frames'?image(scene.framePattern):null,periodMs:clamp(Number(scene.periodMs)||6000,100,60000),...(scene.type==='image'?{image:image(scene.image)}:{})}};
 definition.elements={};for(const [id,element] of Object.entries(raw.elements||{})){
  if(element.kind==='particle'&&['snowflake','star','spark','butterfly','drop','diamond'].includes(element.shape))definition.elements[id]={kind:'particle',shape:element.shape};
  if(element.kind==='image')definition.elements[id]={kind:'image',path:image(element.path)};
  if(element.kind==='symbol')definition.elements[id]={kind:'symbol',glyph:String(element.glyph||'✧').slice(0,8)};
  if(element.kind==='frames'&&Number.isInteger(element.count)&&element.count>=1&&element.count<=48)definition.elements[id]={kind:'frames',pattern:image(element.pattern),count:element.count,periodMs:clamp(Number(element.periodMs)||6000,100,60000)};
  if(element.kind==='palette')definition.elements[id]={kind:'palette',colors:sanitizePlayerAppearance(element.colors)};
  if(element.kind==='effect'&&['snow','glow','lights'].includes(element.type))definition.elements[id]={kind:'effect',type:element.type};
 }
 definition.rollPalette=rollPaletteForTheme({},definition.appearance);for(const key of Object.keys(definition.rollPalette))if(/^#[0-9a-f]{6}$/i.test(raw.rollPalette?.[key]||''))definition.rollPalette[key]=raw.rollPalette[key];
 return definition;
}
function registerThemeDefinition(definition){
 if(!THEME_DEFINITIONS[definition.id]){
  THEME_DEFINITIONS[definition.id]=definition;PRESETS[definition.id]={id:definition.id,name:definition.name,accent:definition.defaults.accent||definition.appearance.accent,stage:definition.id};
  PLAYER_APPEARANCE[definition.id]=definition.appearance;
 }
}
async function readMusicResource(bytes){
 const data=asBytes(bytes);
 if(data[0]===0x50&&data[1]===0x4b)return unpackProject(data);
 const document=JSON.parse(DECODER.decode(data));
 if(!((document.format==='skytrack'&&document.schemaVersion===1)||(document.format==='skymusic-score'&&document.schemaVersion===2))||document.keyCount!==15)throw Error('不是受支持的 .skytrack 谱面');
 if(document.timeUnit&&document.timeUnit!=='ms')throw Error('谱面时间单位需要为 ms');
 return normalize({title:'导入的数字谱',durationMs:document.durationMs,score:document,playback:{tuning:document.tuning},theme:{id:APP_CONFIG.defaultTheme}});
}
async function readThemeResource(bytes){
 const data=asBytes(bytes);let raw,assets={};
 if(data[0]===0x50&&data[1]===0x4b){
  const files=await readZip(data),manifest=files['manifest.json']&&JSON.parse(DECODER.decode(files['manifest.json']));
  if(manifest?.schemaVersion===1){
   const legacy=await unpackTheme(data),base=copy(THEME_DEFINITIONS[legacy.theme.id]||THEME_DEFINITIONS[APP_CONFIG.defaultTheme]);
   base.id='legacy-'+Date.now();base.name=String(legacy.theme.name||base.name);base.displayName=base.name;base.appearanceOverrides=sanitizePlayerAppearance(legacy.theme.appearance);base.appearance={...base.appearance,...base.appearanceOverrides};base.initialOverrides={...legacy.theme};delete base.initialOverrides.id;
   const definition=sanitizeThemeDefinition(base);return {...legacy,theme:{...legacy.theme,id:definition.id,definition},assets:{}};
  }
  if(manifest?.format!=='skytheme'||manifest.schemaVersion!==2||!files['theme.json'])throw Error('不是受支持的 .skytheme 主题');
  raw=JSON.parse(DECODER.decode(files['theme.json']));
  for(const [path,payload] of Object.entries(files))if(path.startsWith('assets/')){
   const mime=path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':path.endsWith('.jpg')||path.endsWith('.jpeg')?'image/jpeg':'image/webp';
   assets[path]='data:'+mime+';base64,'+bytesToBase64(payload);
  }
 }else{
  const document=JSON.parse(DECODER.decode(data));
  if(document.format!=='skytheme'||document.schemaVersion!==2)throw Error('不是受支持的 .skytheme 主题');
  raw=document.definition;
 }
 const definition=sanitizeThemeDefinition(raw);
 return {theme:{id:definition.id,name:definition.name,...definition.defaults,...definition.initialOverrides,appearance:definition.appearance,definition},assets};
}
const platformController={
 events:()=>scoreEvents(state.project),
 event:index=>scoreEvents(state.project)[index],
 enter(id){const project=state.library.find(p=>p.id===id);if(!project)return toast('找不到歌曲');if(project.entry)validateEntry(project.entry);mountPlatformProject(id);setTuningButtons();updateEditButton()},
 compose(entry){
  validateEntry(entry);const definition=THEME_DEFINITIONS[entry.theme.id];
  return normalize({...entry,format:'skymusic-project',schemaVersion:1,durationMs:entry.music.durationMs,score:entry.music,
   theme:{id:definition.id,...definition.defaults,...definition.initialOverrides},playback:{tuning:entry.music.tuning,...entry.playback}});
 }
};
function openSong(id){return platformController.enter(id)}
async function importPlatformFile(file){
 const bytes=asBytes(await file.arrayBuffer());
 if(bytes[0]===0x50&&bytes[1]===0x4b)return unpackProject(bytes);
 const document=JSON.parse(DECODER.decode(bytes));
 if(document.format==='skymusic-score')return readMusicResource(bytes);
 return platformController.compose(document);
}
async function importFiles(files){const list=[...files],entry=list.find(file=>file.name.toLowerCase().endsWith('.skymusic'));return importFile(entry||list[0],list)}
function customThemeChanged(project){
 const definition=THEME_DEFINITIONS[sceneId(project)],canonical=normalize({score:{events:[]},theme:{id:definition.id,...definition.defaults,...definition.initialOverrides}}).theme;
 const theme=project.theme;
 return Boolean(project._imageUrl)||['accent','backgroundColor','snow','glow','motion','name'].some(key=>theme[key]!==canonical[key])||Object.entries(theme.appearance||{}).some(([key,value])=>value!==definition.appearance[key]);
}
async function themeResourceBytes(project){
 const definition=copy(themeDefinition(project));definition.appearanceOverrides={...(definition.appearanceOverrides||{}),...Object.fromEntries(Object.entries(sanitizePlayerAppearance(project.theme.appearance)).filter(([key,value])=>value!==definition.appearance[key]))};definition.appearance={...definition.appearance,...definition.appearanceOverrides};definition.initialOverrides=copy(project.theme);delete definition.initialOverrides.id;delete definition.initialOverrides.definition;delete definition.initialOverrides.assets;
 if(customThemeChanged(project)){definition.id='custom-'+Date.now();definition.name=project.theme.name||definition.name;definition.displayName=definition.name;}
 const files={'manifest.json':JSON.stringify({format:'skytheme',schemaVersion:2}),'theme.json':JSON.stringify(definition),'scene.json':JSON.stringify(project.theme)};
 if(project._imageUrl?.startsWith('data:image/')){definition.decorations.scene={type:'image',image:'assets/custom-stage.webp',frameCount:0,framePattern:null,periodMs:6000};definition.decorations.cover='assets/custom-stage.webp';definition.elements['custom.cover']={kind:'image',path:'assets/custom-stage.webp'};definition.decorations.companion=null;delete definition.elementRefs;files['assets/custom-stage.webp']=base64ToBytes(project._imageUrl.split(',')[1]);files['theme.json']=JSON.stringify(definition);}
 const decor=definition.decorations,paths=new Set([decor.identity.image,decor.treeImage,decor.cover,decor.scene.image,decor.companion,...(decor.ornaments||[])]);
 if(decor.scene.type==='frames')for(let i=0;i<decor.scene.frameCount;i++)paths.add(decor.scene.framePattern.replace('{index}',String(i).padStart(2,'0')));
 const cover=(definition.elements||APP_CONFIG.elements)[project.card?.coverElement];if(cover?.kind==='image')paths.add(cover.path);
 for(const path of paths)if(path&&!files[path]){safeResourcePath(path,path.slice(path.lastIndexOf('.')));const uri=themeAsset(path,project);if(uri.startsWith('data:image/'))files[path]=base64ToBytes(uri.split(',')[1]);else{const response=await fetch(uri);if(!response.ok)throw Error('无法打包主题资源 '+path);files[path]=new Uint8Array(await response.arrayBuffer())}}
 return makeZip(files);
}
async function exportPlatformEntry(project){
 try{if(customThemeChanged(project))throw Error('当前外观有自定义修改，请先导出 .skytheme 并通过平台录入，再导出单曲');const entry=projectEntry(project);validateEntry(entry);downloadBytes(escName(project.title)+'.skymusic',ENCODER.encode(JSON.stringify(entry,null,2)),'application/json');toast('已导出单曲：完整谱面及平台主题引用')}catch(error){toast('导出失败：'+error.message,6000)}
}
function exportTrack(project){downloadBytes(escName(project.title)+'.skytrack',ENCODER.encode(JSON.stringify(scoreDocument(project),null,2)),'application/json')}
function platformCover(project){
 const id=project.card?.coverElement,element=project.theme?.definition?.elements?.[id]||APP_CONFIG.elements[id];
 return element?.kind==='image'?themeAsset(element.path,project):null;
}

/* 37-theme-scenes.js */
// Theme scene renderer; receives playback position without owning score data.
function animateScene(){const sounding=isSounding(state.position);const status=state.isPlaying?(sounding?'演奏中':'休止'):'已暂停',label=$('stageStatus');if(label.dataset.playStatus!==status){label.dataset.playStatus=status;if(status==='演奏中')setControlContent(label,'note',status);else label.textContent=status}if(themeDefinition().decorations.scene.type!=='frames'||$('playerView').classList.contains('motion-off'))return;let now=performance.now();if(!state.stageImages?.length)return;if(sounding){if(!state.sceneTick)state.sceneTick=now;let dt=Math.min(65,now-state.sceneTick);state.sceneFrame=(state.sceneFrame+dt/themeDefinition().decorations.scene.periodMs*state.stageImages.length)%state.stageImages.length;}state.sceneTick=now;
 const a=state.stageImages[Math.floor(state.sceneFrame)%state.stageImages.length],b=state.stageImages[(Math.floor(state.sceneFrame)+1)%state.stageImages.length];const f=state.sceneFrame%1;
 const c=$('sceneCanvas'),ctx=c?.getContext('2d');if(!ctx)return;let box=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);let width=Math.max(1,Math.round(box.width*dpr)),height=Math.max(1,Math.round(box.height*dpr));if(c.width!==width||c.height!==height){c.width=width;c.height=height}ctx.clearRect(0,0,width,height);let scale=Math.min(width/a.width,height/a.height);let w=a.width*scale,h=a.height*scale,x=(width-w)/2,y=(height-h)/2;ctx.globalAlpha=1;ctx.drawImage(a,x,y,w,h);if(b&&f>0){ctx.globalAlpha=f;ctx.drawImage(b,x,y,w,h);ctx.globalAlpha=1}
}
function initializeScene(){if(!state.project||state.mode!=='player')return;let pane=$('stagePane');const definition=themeDefinition();applyThemeClasses(pane,definition);pane.classList.toggle('has-custom-image',Boolean(state.project._imageUrl));$('sceneName').textContent=themeCaption();
 let stage=$('stageArt');const extra=state.project._imageUrl;if(extra&&(definition.decorations.scene.type!=='frames'||state.project.theme?.customStage)){stage.src=extra;stage.style.display='block';$('sceneCanvas')?.remove();return}
 if(definition.decorations.scene.type==='image'){stage.src=themeAsset(definition.decorations.scene.image);stage.style.display='block';$('sceneCanvas')?.remove();return}
 if(definition.decorations.scene.type!=='frames'){stage.style.display='none';$('sceneCanvas')?.remove();return}
 if(!state.stageImages.length||state.stageThemeId!==definition.id){state.stageThemeId=definition.id;state.stageImages=Array.from({length:definition.decorations.scene.frameCount},(_,i)=>{let im=new Image();const path=definition.decorations.scene.framePattern.replace('{index}',String(i).padStart(2,'0'));im.src=themeAsset(path);return im})}
 stage.style.display='none';if(!$('sceneCanvas')){let canvas=document.createElement('canvas');canvas.id='sceneCanvas';canvas.style.cssText='width:100%;height:100%;object-fit:contain;display:block';stage.parentNode.append(canvas)}state.sceneTick=performance.now();state.sceneFrame=0;const c=$('sceneCanvas');function firstDraw(){const img=state.stageImages[0];if(!img.complete||!img.naturalWidth){img.onload=firstDraw;return}let rect=c.getBoundingClientRect(),dpr=devicePixelRatio||1;c.width=rect.width*dpr;c.height=rect.height*dpr;let ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);let scale=Math.min(c.width/img.width,c.height/img.height);ctx.drawImage(img,(c.width-img.width*scale)/2,(c.height-img.height*scale)/2,img.width*scale,img.height*scale)}requestAnimationFrame(firstDraw)
}

// A visual subscriber only: particles never write musical, navigation or edit state.
function renderKeyFeedback(button){
 if(state.mode!=='player'||state.editMode||$('scoreConsole').open||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 const feedback=sanitizeKeyFeedback(themeDefinition().keyFeedback,state.playerColors);if(!feedback.enabled||!feedback.colors.length||!button.getBoundingClientRect)return;
 const shapes={snowflake:'<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/>',star:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',spark:'<path d="m12 1 2 9 9 2-9 2-2 9-2-9-9-2 9-2Z"/>',butterfly:'<path d="M12 11Q1-1 3 12q0 8 9 2 9 6 9-2 2-13-9-1Zm0 0v9"/>',drop:'<path d="M12 2Q1 15 7 20q5 5 10 0 6-5-5-18Z"/>',diamond:'<path d="m12 2 8 10-8 10-8-10Z"/><path d="m6 12 6-3 6 3-6 3Z"/>'};
 const layer=$('keyFeedbackLayer'),rect=button.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
 while(layer.children.length>72)layer.firstElementChild.remove();
 for(let i=0;i<feedback.count;i++){const particle=document.createElement('span'),color=feedback.colors[i%feedback.colors.length],dx=(Math.random()-.5)*feedback.spreadPx*2,dy=-feedback.risePx*(.45+Math.random()*.55),rotation=(Math.random()-.5)*100;
  particle.className='key-particle';particle.dataset.shape=feedback.shape;particle.style.cssText=`left:${x}px;top:${y}px;width:${feedback.sizePx}px;height:${feedback.sizePx}px;color:${color}`;
  particle.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'+shapes[feedback.shape]+'</svg>';layer.append(particle);
  if(particle.animate){const animation=particle.animate([{transform:'translate(-50%,-50%) scale(.45)',opacity:0},{transform:`translate(calc(-50% + ${dx*.4}px),calc(-50% + ${dy*.45}px)) rotate(${rotation*.4}deg) scale(1)`,opacity:.85,offset:.35},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${rotation}deg) scale(.65)`,opacity:0}],{duration:feedback.durationMs,delay:i*14,easing:'cubic-bezier(.2,.65,.3,1)',fill:'both'});animation.onfinish=()=>particle.remove();animation.oncancel=()=>particle.remove()}else setTimeout(()=>particle.remove(),feedback.durationMs);
 }
}

// Subscribe to note onsets, including repeated pitches; never change playback or score data.
const playbackKeyFeedback={project:null,index:0,time:-1};
function resetPlaybackKeyFeedback(){playbackKeyFeedback.project=null;playbackKeyFeedback.index=0;playbackKeyFeedback.time=-1}
function syncPlaybackKeyFeedback(time){
 const view=playbackKeyFeedback;if(!state.isPlaying||state.editMode||$('scoreConsole').open){resetPlaybackKeyFeedback();return}
 const events=scoreEvents(state.project);
 if(view.project!==state.project||time<view.time||time-view.time>240){view.project=state.project;view.index=lowerBound(events,Math.max(0,time-50))}
 while(view.index<events.length&&events[view.index].timeMs<=time){for(const note of events[view.index].notes){const key=[...$('keyBoard').children].find(key=>Number(key.dataset.note)===note);if(key)renderKeyFeedback(key)}view.index++}view.time=time;
}

/* 38-player-template.js */
// One player shell, one interaction model. Themes provide data, never duplicate markup.
const PLAYER_TEMPLATE_ID=PLAYER_RULES.templateId;
const PLAYER_APPEARANCE=Object.fromEntries(Object.entries(THEME_DEFINITIONS).map(([id,t])=>[id,t.appearance]));
function themeDefinition(project=state.project){return project?.theme?.definition||THEME_DEFINITIONS[sceneId(project)]}
function themeAsset(path,project=state.project){return project?.theme?.assets?.[path]||PLATFORM_THEME_ASSETS[sceneId(project)]?.[path]||window.SKY_THEME_ASSETS?.[path]||path}
function applyThemeClasses(host,definition){const classes=new Set(Object.values(THEME_DEFINITIONS).flatMap(t=>t.decorations.classes));for(const name of classes)host.classList.toggle(name,definition.decorations.classes.includes(name))}
function rollPaletteForTheme(definition,colors){return {base:colors.surfaceEnd,light:colors.gridStart,medium:colors.gridEnd,dark:colors.rest,label:colors.muted,anchor:colors.accent,...definition.rollPalette}}
function themeCaption(project=state.project){const definition=themeDefinition(project),name=project?.theme?.name;return !name||definition.legacyNames?.includes(name)?definition.name:name}
function sanitizeThemeMaterials(raw={}){const base=APP_CONFIG.themeTemplate.materials,result={surfaceGradient:typeof raw.surfaceGradient==='boolean'?raw.surfaceGradient:base.surfaceGradient,activeGradient:typeof raw.activeGradient==='boolean'?raw.activeGradient:base.activeGradient,surfaceAngle:clamp(Number(raw.surfaceAngle)||base.surfaceAngle,0,360),activeAngle:clamp(Number(raw.activeAngle)||base.activeAngle,0,360)};for(const key of ['backdropGlowOpacity','panelShadowOpacity','panelEdgeOpacity'])result[key]=clamp(Number.isFinite(raw[key])?raw[key]:base[key],0,1);return result}
function sanitizeThemeLayout(raw={}){const result={sceneFit:raw.sceneFit==='cover'?'cover':'contain'};for(const [key,fallback,min,max]of [['companionWidth',28,12,60],['companionHeight',64,20,95],['companionLeft',8,0,70],['companionBottom',9,0,60],['ornamentWidth',14,4,25],['ornamentHeight',32,8,50],['ornamentRight',3,0,40],['ornamentBottom',11,0,60]])result[key]=clamp(Number.isFinite(raw[key])?raw[key]:fallback,min,max);return result}
function sanitizeKeyFeedback(raw={},colors={}){const base=APP_CONFIG.themeTemplate.keyFeedback,shapes=['snowflake','star','spark','butterfly','drop','diamond'];return {enabled:raw.enabled===true,shape:shapes.includes(raw.shape)?raw.shape:'star',element:typeof raw.element==='string'?raw.element:null,count:clamp(Math.round(Number(raw.count)||base.count),1,16),durationMs:clamp(Number(raw.durationMs)||base.durationMs,180,1500),spreadPx:clamp(Number(raw.spreadPx)||base.spreadPx,8,100),risePx:clamp(Number(raw.risePx)||base.risePx,8,100),sizePx:clamp(Number(raw.sizePx)||base.sizePx,6,24),colors:(raw.colors||[colors.accent,colors.note]).filter(color=>/^#[0-9a-f]{6}$/i.test(color)).slice(0,4)}}
function sanitizePlayerAppearance(raw){let result={};if(!raw||typeof raw!=='object')return result;for(let key of Object.keys(PLAYER_APPEARANCE.christmas))if(/^#[0-9a-f]{6}$/i.test(raw[key]||''))result[key]=raw[key];return result}
function resolvedPlayerColors(project){
 const definition=themeDefinition(project),theme=project?.theme||{},colors={...definition.appearance,...sanitizePlayerAppearance(theme.appearance)};
 if(/^#[0-9a-f]{6}$/i.test(theme.accent||''))colors.accent=theme.accent;
 if(/^#[0-9a-f]{6}$/i.test(theme.backgroundColor||''))colors.stageEnd=colors.backdrop=theme.backgroundColor;
 return colors;
}
// Surface tokens are shared by the page and top-layer dialogs, without binding interactions.
const PLATFORM_DIALOG_COLORS={surfaceStart:'#132a3b',surfaceEnd:'#0d1c2c',text:'#edf6ff',muted:'#b9d1e1',border:'#718ba3',accent:'#d8eaf8',button:'#203c50',hover:'#2d4c61',activeStart:'#38566d',activeEnd:'#29465b',backdrop:'#0d1c2c'};
function applySurfaceTokens(host,colors,material={surfaceGradient:true,surfaceAngle:135,activeGradient:true,activeAngle:145}){
 for(const [name,value]of Object.entries(colors))host.style.setProperty('--player-'+name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);
 host.style.setProperty('--player-surface-paint',material.surfaceGradient?`linear-gradient(${material.surfaceAngle}deg,${colors.surfaceStart},${colors.surfaceEnd})`:colors.surfaceEnd);
 host.style.setProperty('--player-active-paint',material.activeGradient?`linear-gradient(${material.activeAngle}deg,${colors.activeStart},${colors.activeEnd})`:colors.activeEnd);
}
function syncDialogAppearance(){
 const project=state.mode==='player'?state.project:null,colors=project?resolvedPlayerColors(project):PLATFORM_DIALOG_COLORS,material=project?sanitizeThemeMaterials(themeDefinition(project).materials):undefined;
 for(const dialog of document.querySelectorAll('.work-dialog:not(.platform-dialog)')){
  dialog.classList.add('context-dialog');dialog.dataset.theme=project?sceneId(project):'platform';applySurfaceTokens(dialog,colors,material);
 }
}
function syncStatusNotificationAppearance(){
 const el=$('toast');if(!el?.style?.setProperty)return;
 const preview=$('homeThemeDialog')?.open?homeExperience.preview?.project:null,project=preview||(state.mode==='player'?state.project:null);
 const colors=project?resolvedPlayerColors(project):{surfaceStart:'#273e56',surfaceEnd:'#172b42',text:'#edf6ff',border:'#718ba3',accent:'#d8eaf8'};
 document.body.style.setProperty('--control-focus-accent',colors.accent);syncDialogAppearance();
 for(const key of ['surfaceStart','surfaceEnd','text','border','accent'])el.style.setProperty('--notice-'+key,colors[key]);el.dataset.theme=project?sceneId(project):'platform';
}
function applyPlayerTemplate(project,host){
 const id=sceneId(project),definition=themeDefinition(project),decor=definition.decorations,theme=project.theme||{},colors=resolvedPlayerColors(project);
 state.playerColors=colors;applyThemeClasses(host,definition);
 host.dataset.template=PLAYER_TEMPLATE_ID;host.dataset.theme=id;
 applySurfaceTokens(host,colors,sanitizeThemeMaterials(definition.materials));
 const depth=sanitizeThemeMaterials(definition.materials);for(const key of ['backdropGlowOpacity','panelShadowOpacity','panelEdgeOpacity'])host.style.setProperty('--player-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),`${depth[key]*100}%`);
 host.style.setProperty('--gold',colors.accent);host.style.setProperty('--theme-accent',colors.accent);host.style.setProperty('--note',colors.note);host.style.setProperty('--chord',colors.chord);
 host.style.setProperty('--glow-strength',String((theme.glow??58)/100));
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 host.classList.toggle('motion-off',theme.motion==='off'||Boolean(reduced));
 $('stageSnow').hidden=decor.effects&&!decor.effects.includes('snow');const lights=document.querySelector('.stage-lights');if(lights)lights.hidden=decor.effects&&!decor.effects.includes('lights');
 $('stageSnow').style.opacity=String(clamp(Number(theme.snow??40),0,100)/100);
 $('identitySnow').hidden=!decor.identity.image;if(decor.identity.image)$('identitySnow').src=themeAsset(decor.identity.image);$('identityGlyph').hidden=Boolean(decor.identity.image);$('identityGlyph').textContent=decor.identity.glyph;
 const tree=document.querySelector('.stage-tree');if(tree){tree.hidden=!decor.tree||Boolean(project._imageUrl);tree.style.display=tree.hidden?'none':'block';if(decor.treeImage)tree.src=themeAsset(decor.treeImage)}
 const motif=document.querySelector('.stage-motif');if(motif)motif.hidden=!decor.motif;$('stagePane').dataset.motif=decor.motif?'on':'off';
 const layout=sanitizeThemeLayout(decor.layout);$('stagePane').dataset.sceneFit=project._imageUrl?'contain':layout.sceneFit;for(const [key,value]of Object.entries(layout))if(typeof value==='number')$('stagePane').style.setProperty('--art-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value+'%');
 const companion=document.querySelector('.stage-companion');if(companion){companion.hidden=!decor.companion||Boolean(project._imageUrl);if(decor.companion)companion.src=themeAsset(decor.companion,project)}
 for(const image of document.querySelectorAll('[data-theme-decoration]')){const path=decor.ornaments?.[0];image.hidden=!path;if(path)image.src=themeAsset(path,project)}
 $('sceneName').textContent=themeCaption(project);syncStatusNotificationAppearance();
}

function populateThemeChoices(){
 const selected=$('createTheme').value;
 $('themeChoices').innerHTML='';$('createTheme').innerHTML='';
 for(const definition of Object.values(THEME_DEFINITIONS)){
  const button=document.createElement('button');button.dataset.scene=definition.id;button.onclick=()=>chooseTheme(definition.id);button.textContent=definition.displayName;const description=document.createElement('small');description.textContent=definition.description||definition.name;button.append(description);$('themeChoices').append(button);
  const option=document.createElement('option');option.value=definition.id;option.textContent=definition.displayName;$('createTheme').append(option);
 }
 $('createTheme').value=THEME_DEFINITIONS[selected]?selected:APP_CONFIG.defaultTheme;syncCreateThemePicker();
}

// UI pictograms use the same vector geometry on every platform. Legacy theme glyphs
// are accepted as data, then mapped to this registry before the browser paints them.
const APP_ICON_PATHS={
 play:'<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
 restart:'<path d="M4 10a8 8 0 1 1 2 9M4 4v6h6"/>',
 'repeat-one':'<path d="M4 10V7a2 2 0 0 1 2-2h14m-3-3 3 3-3 3M20 14v3a2 2 0 0 1-2 2H4m3 3-3-3 3-3"/><path d="m11 10 2-1v7m-2 0h4"/>',
 edit:'<path d="m4 16-1 5 5-1L20 8l-4-4Zm10-10 4 4M3 21l5-1"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r=".7" fill="currentColor"/>',
 left:'<path d="m15 5-7 7 7 7"/>',right:'<path d="m9 5 7 7-7 7"/>',down:'<path d="m5 8 7 7 7-7"/>',plus:'<path d="M12 4v16M4 12h16"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
 favorite:'<path d="m12 2 3 6.5 7 .9-5 5 1.3 7-6.3-3.3-6.3 3.3 1.3-7-5-5 7-.9Z"/>',
 'favorite-filled':'<path d="m12 2 3 6.5 7 .9-5 5 1.3 7-6.3-3.3-6.3 3.3 1.3-7-5-5 7-.9Z" fill="currentColor"/>',
 spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
 note:'<path d="M9 18V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>',
 scene:'<path d="M12 3a9 9 0 1 0 0 18Z" fill="currentColor"/><circle cx="12" cy="12" r="9"/>',check:'<path d="m4 12 5 5L20 6"/>'
};
function appIcon(name){const weight=['restart','repeat-one','info'].includes(name)?2.5:1.8;return '<svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="'+weight+'" stroke-linecap="round" stroke-linejoin="round">'+(APP_ICON_PATHS[name]||APP_ICON_PATHS.spark)+'</svg>'}
function setControlContent(el,name,label=''){el.innerHTML=appIcon(name);if(label){const text=document.createElement('span');text.textContent=label;el.append(text)}}
function bindAppIcons(){
 if(!document.createTreeWalker)return;
 const symbols={'▶':'play','Ⅱ':'pause','↶':'restart','⇩':'download','↥':'upload','✎':'edit','◐':'scene','⌄':'down','⧉':'copy','★':'favorite-filled','☆':'favorite','×':'close','‹':'left','›':'right','＋':'plus','✧':'spark','♬':'note','✓':'check'};
 const scope='button,.plus,.import-symbol,.entry-orbit,#identityGlyph,.stage-motif';
 function hydrate(root){
  for(const button of [...(root.matches?.('[data-icon]')?[root]:[]),...(root.querySelectorAll?.('[data-icon]')||[])])if(!button.querySelector('svg'))button.innerHTML=appIcon(button.dataset.icon);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){const parent=node.parentElement;if(!parent||parent.closest('svg')||!parent.closest(scope))continue;const value=node.nodeValue;if(![...value].some(char=>(symbols[char]&&(char!=='×'||value.trim()==='×'))||(char==='!'&&parent.closest('#songInfoBtn'))))continue;
   const button=parent.closest('button');if(button&&!button.getAttribute('aria-label')&&!button.title&&value.trim().length===1)button.setAttribute('aria-label',button.dataset.close?'关闭窗口':symbols[value.trim()]||'操作');
   const fragment=document.createDocumentFragment();let text='';const flush=()=>{if(text){fragment.append(document.createTextNode(text));text=''}};
   for(const char of value){const icon=char==='!'&&parent.closest('#songInfoBtn')?'info':char==='×'&&value.trim()!=='×'?null:symbols[char];if(icon){flush();const holder=document.createElement('span');holder.innerHTML=appIcon(icon);fragment.append(holder.firstElementChild)}else text+=char}flush();node.replaceWith(fragment);
  }
 }
 hydrate(document.body);
 new MutationObserver(records=>{const roots=new Set();for(const record of records){const target=record.target.nodeType===1?record.target:record.target.parentElement,control=target?.closest?.(scope);if(control)roots.add(control);else for(const added of record.addedNodes||[])if(added.nodeType===1&&(added.matches(scope)||added.querySelector(scope)||added.querySelector('[data-icon]')))roots.add(added)}for(const root of roots)hydrate(root)}).observe(document.body,{childList:true,characterData:true,subtree:true});
}

/* 39-player-interactions.js */
// One player interaction entry for every score and theme.
// Notification timing belongs to the interaction layer; colors belong to the template.
let actionNoticeRevision=0;
function toast(text,ms=PLAYER_RULES.notifications.durationMs){
 actionNoticeRevision++;
 const el=$(PLAYER_RULES.notifications.controlId);clearTimeout(state.toastTimer);
 syncStatusNotificationAppearance();el.textContent=text;el.hidden=false;
 if(el.showPopover&&!el.matches(':popover-open'))el.showPopover();
 state.toastTimer=setTimeout(()=>{if(el.hidePopover&&el.matches(':popover-open'))el.hidePopover();el.hidden=true},ms);
}
const playerValuePickers=new Map();
function cancelPlayerValueScroll(){for(const picker of playerValuePickers.values())picker.cancel();instrumentPicker?.close()}
function syncPlayerValue(kind){
 const el=$(PLAYER_RULES[kind].controlId),percent=Math.round(state[kind]*100);
 el.value=String(percent);el.setAttribute('aria-valuenow',String(percent));el.setAttribute('aria-valuetext',kind==='volume'&&percent===0?'静音':percent+'%');
 playerValuePickers.get(kind)?.sync(percent);
}
function syncVolumeControl(){syncPlayerValue('volume');updateVolumeAudio()}
function syncSustainControl(){syncPlayerValue('sustain');updateSustainAudio()}
function createVerticalChoiceStrip(el,items,options){
 const row=PLAYER_RULES.valuePicker.rowHeightPx,track=el.querySelector('.value-picker-track'),count=items.length;let position=options.selected()*row,drag=null,settle=0;
 const wrap=index=>((index%count)+count)%count,bound=index=>options.loop?wrap(index):clamp(index,0,count-1);
 track.innerHTML='';for(const item of items){const cell=document.createElement('span'),label=document.createElement('b');label.textContent=item.label;label.title=item.title||item.label;cell.append(label);track.append(cell)}
 el.classList.toggle('circular-choice',Boolean(options.loop));
 const indexAt=value=>bound(Math.round(value/row));
 const commit=index=>options.choose(index);
 function render(){if(options.loop){track.style.transform='none';[...track.children].forEach((cell,index)=>{const offset=wrap(index-position/row+count/2)-count/2;cell.style.transform='translateY('+(offset*row)+'px)'})}else track.style.transform='translateY('+(-position)+'px)';el.dataset.position=String(position/row)}
 const paint=value=>{position=value;render();const index=indexAt(value);options.preview?.(index);if(options.live)commit(index);else{clearTimeout(settle);settle=setTimeout(()=>commit(indexAt(position)),150)}};
 const wheel=bindSmoothWheel(track,el,'y',PLAYER_RULES.valuePicker.wheelMaxStepPx,{loop:options.loop,read:()=>position,write:paint,max:()=>(count-1)*row,snap:value=>Math.round(value/row)*row,wheelGain:PLAYER_RULES.valuePicker.wheelGain});
 function cancel(){wheel();clearTimeout(settle);const active=drag;drag=null;if(active&&el.hasPointerCapture(active.id))el.releasePointerCapture(active.id)}
 function sync(index){cancel();position=bound(index)*row;render();options.preview?.(indexAt(position))}
 el.onkeydown=event=>{let index=indexAt(position);if(event.key==='ArrowUp')index--;else if(event.key==='ArrowDown')index++;else if(event.key==='ArrowRight')index+=options.numeric?-1:1;else if(event.key==='ArrowLeft')index+=options.numeric?1:-1;else if(event.key==='Home')index=options.numeric?count-1:0;else if(event.key==='End')index=options.numeric?0:count-1;else return;event.preventDefault();event.stopPropagation();index=bound(index);cancel();commit(index);sync(index)};
 el.addEventListener('pointerdown',event=>{if(event.button!==0)return;cancel();el.focus();drag={id:event.pointerId,y:event.clientY,start:position};el.setPointerCapture(event.pointerId)});
 el.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId){event.preventDefault();const value=drag.start+drag.y-event.clientY;paint(options.loop?value:clamp(value,0,(count-1)*row))}});
 const stop=event=>{if(drag?.id!==event.pointerId)return;drag=null;if(el.hasPointerCapture(event.pointerId))el.releasePointerCapture(event.pointerId);wheel.to(Math.round(position/row)*row)};
 el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);sync(options.selected());return {sync,cancel};
}
function bindPlayerValuePicker(kind){
 const el=$(PLAYER_RULES[kind].controlId);
 const commit=percent=>{const value=clamp(Math.round(Number.isFinite(percent)?percent:state[kind]*100),0,100);if(state[kind]===value/100)return;state[kind]=value/100;el.value=String(value);el.setAttribute('aria-valuenow',String(value));el.setAttribute('aria-valuetext',kind==='volume'&&value===0?'静音':value+'%');if(state.project){state.project.playback[kind]=state[kind];saveLibrary()}if(kind==='volume')updateVolumeAudio();else updateSustainAudio()};
 el.oninput=()=>{commit(Number(el.value));playerValuePickers.get(kind)?.sync(Math.round(state[kind]*100))};
 if(!document.createComment)return;
 const strip=createVerticalChoiceStrip(el,Array.from({length:101},(_,i)=>({label:String(100-i)})),{numeric:true,live:true,selected:()=>100-Math.round(state[kind]*100),choose:index=>commit(100-index)});
 playerValuePickers.set(kind,{sync:value=>strip.sync(100-value),cancel:strip.cancel});
}
let cancelRollDrag=()=>{};
function bindRollPointerSeek(){
 const canvas=$('rollCanvas');let drag=null;
 const stop=()=>{const pointerId=drag?.pointerId;drag=null;if(pointerId!==undefined&&canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId)};
 cancelRollDrag=stop;
 const move=event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  if(state.project!==drag.project||state.mode!=='player'){stop();return}
  const fraction=clamp((event.clientX-drag.rectLeft-drag.left)/drag.plotW,0,1);
  const end=drag.end<state.project.durationMs?drag.end-.001:drag.end;
  seekTo(clamp(drag.begin+fraction*drag.windowMs,0,end),false,drag);
 };
 canvas.addEventListener('pointerdown',event=>{
  if(!PLAYER_RULES.roll.pointerSeek||!state.project||event.button!==0||event.isPrimary===false)return;
  if(beginFineNoteDrag(event,canvas))return;
  const rect=canvas.getBoundingClientRect(),frame=rollFrame(),geometry=rollPlotGeometry(rect,frame),x=event.clientX-rect.left,y=event.clientY-rect.top;
  if(geometry.plotW<=0||x<geometry.left||x>geometry.left+geometry.plotW||y<geometry.top-6||y>rect.height-geometry.bottom+6)return;
  event.preventDefault();pauseSong();cancelRollFinish();
  drag={...frame,...geometry,rectLeft:rect.left,pointerId:event.pointerId,project:state.project};canvas.setPointerCapture(event.pointerId);move(event);
 });
 canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointerId){move(event);stop()}});
 canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',()=>{drag=null});
 window.addEventListener('blur',stop);
}
function bindPlayerInteractions(){
 bindScoreEntranceInterrupts();
 bindPlayerValuePicker('volume');bindPlayerValuePicker('sustain');

 bindRollPointerSeek();
 $('backLibrary').onclick=returnHomeFromPlayer;
 $('rollWindow').innerHTML='';for(const seconds of PLAYER_RULES.roll.windowsSeconds){const option=document.createElement('option');option.value=String(seconds);option.textContent=seconds+'秒';$('rollWindow').append(option)}
 $('playBtn').onclick=()=>playPause();$('restartBtn').onclick=()=>{seekTo(0);toast('已重置到开头')};$('loopOneBtn').onclick=()=>{if(!state.project)return;state.project.playback.loop=!state.project.playback.loop;saveLibrary();syncLoopControl();toast(state.project.playback.loop?'已开启单曲循环':'已关闭单曲循环')};

 $('speedSelect').onchange=ev=>{const previous=state.rate;let was=state.isPlaying;if(was)pauseSong();state.rate=Number(ev.target.value);syncSpeedPicker();if(state.project){state.project.playback.rate=state.rate;saveLibrary()}if(previous!==state.rate)toast('倍速：'+state.rate.toFixed(2)+'×');if(was)playPause(true)};
 $('rollWindow').onchange=ev=>{const finishing=Boolean(state.rollFinish),frame=rollFrame(),fraction=frame.phase/frame.windowMs;cancelRollFinish();state.windowSec=Number(ev.target.value);state.rollPageStart=rollSeekOrigin(state.position,fraction);if(finishing)finishRollScan();else drawRoll()};
 $('rollWindow').value=String(state.windowSec);$('stepPrev').onclick=()=>stepEvent(-1);$('stepNext').onclick=()=>stepEvent(1);
 $('seekSlider').oninput=ev=>seekTo(Number(ev.target.value));
 $('rollSeekSlider').oninput=ev=>seekTo(Number(ev.target.value),true);
 $('pagePrev').onclick=()=>seekBeatPage(-1);
 $('pageNext').onclick=()=>seekBeatPage(1);
 $('resetKeyEdit').onclick=()=>{if(!canEditScore())return;const view=rollFrame();let p=state.project;let original=BUILTINS.find(x=>x.id===(p.provenance?.derivedFrom||p.id));let e=scoreEvents(p)[state.selected],reference=original&&scoreEvents(original)[state.selected];if(!e)return;if(reference){rememberEdit();e.notes=[...reference.notes];e.durationMs=reference.durationMs;e.confidence='source';settleFineRollView(view,e);renderKeyBoard();renderBeatGrid(true);updateVisual();toast('已恢复此格的原始琴键')}else toast('导入曲目无内置原谱，请通过导入文件恢复')};
 $('keySelect').onchange=ev=>{if(!state.project)return;const previous=state.tuning;let was=state.isPlaying;if(was)pauseSong();state.tuning=ev.target.value;state.project.playback.tuning=state.tuning;saveLibrary();setTuningButtons();renderKeyBoard();renderBeatGrid(true);updateVisual();if(state.editMode)syncEditorFields();if(previous!==state.tuning)toast('音域：'+$('keyRangeValue').textContent);if(was)playPause(true)};
 $('instrumentSelect').onchange=ev=>chooseInstrument(ev.target.value);
 document.addEventListener('keydown',e=>{if(MusicWorkbench.active||state.mode!=='player'||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea,button'))return;if(e.code===PLAYER_RULES.keyboard.playPause){e.preventDefault();playPause()}else if(e.code===PLAYER_RULES.keyboard.nextEvent){e.preventDefault();stepEvent(1)}else if(e.code===PLAYER_RULES.keyboard.previousEvent){e.preventDefault();stepEvent(-1)}});
 window.addEventListener('resize',()=>{if(state.mode==='player')requestAnimationFrame(()=>{drawRoll();if(!state.isPlaying)initializeScene()})});
}
function setTuningButtons(){
 const key=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';
 $('keySelect').value=key;$('keyRangeValue').textContent=key==='sky-original'?'光遇原调':KEY_DEGREES[key][0]+' 大调';syncInstrumentPicker();
 for(const button of document.querySelectorAll('#keyRangeMenu [data-key]'))button.setAttribute('aria-selected',String(button.dataset.key===key));
 syncConsoleRangePicker();
}
let cancelRangeWheel=()=>{},rangeTrack=null;
function cancelRangeScroll(){cancelRangeWheel()}
function closeRangePicker(returnFocus=false){cancelRangeScroll();$('keyRangeMenu').hidden=true;$('keyRangeToggle').setAttribute('aria-expanded','false');if(returnFocus)$('keyRangeToggle').focus()}
function positionRangePicker(){
 const trigger=$('keyRangeToggle'),menu=$('keyRangeMenu'),rect=trigger.getBoundingClientRect();
 let width=Math.min(272,Math.max(0,rect.left-20)),left=rect.left-width-8;
 // Narrow screens retain one horizontal strip; never fall back to a downward menu.
 if(width<120){width=Math.min(272,innerWidth-24);left=12}
 menu.style.width=width+'px';menu.style.left=left+'px';menu.style.top=Math.max(8,Math.min(innerHeight-46,rect.top+(rect.height-42)/2))+'px';
}
function openRangePicker(){
 closeInstrumentPicker();closeSpeedPicker();setTuningButtons();$('keyRangeMenu').hidden=false;$('keyRangeToggle').setAttribute('aria-expanded','true');positionRangePicker();
 rangeTrack.center(state.tuning);
}
function bindRangePicker(){
 const trigger=$('keyRangeToggle'),menu=$('keyRangeMenu'),track=$('keyRangeTrack');
 trigger.onclick=()=>menu.hidden?openRangePicker():closeRangePicker();
 rangeTrack=createCircularRangeTrack(track,menu,key=>{$('keySelect').value=key;$('keySelect').onchange({target:$('keySelect')});closeRangePicker(true)},closeRangePicker);
 cancelRangeWheel=()=>rangeTrack.cancel();
 trigger.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openRangePicker()}};
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))closeRangePicker()});
 window.addEventListener('resize',()=>{if(!menu.hidden)positionRangePicker()});
 window.addEventListener('scroll',event=>{if(!menu.hidden&&event.target!==menu&&!menu.contains(event.target))closeRangePicker()},true);
}

// Shared wheel easing; circular models keep a continuous, unbounded position.
function bindSmoothWheel(track,host,axis='x',limit=24,model=null){
 let raf=0,target=0,position=0,last=0,snapTimer=0;
 const read=()=>model?model.read():(axis==='x'?track.scrollLeft:track.scrollTop);
 const write=value=>{if(model)model.write(value);else if(axis==='x')track.scrollLeft=value;else track.scrollTop=value};
 const maximum=()=>Math.max(0,model?model.max():(axis==='x'?track.scrollWidth-track.clientWidth:track.scrollHeight-track.clientHeight));
 const bound=value=>model?.loop?value:clamp(value,0,maximum());
 const cancel=()=>{cancelAnimationFrame(raf);clearTimeout(snapTimer);raf=0};
 const animate=now=>{
  if(host.hidden){cancel();return}const dt=Math.min(40,now-last);last=now;
  position+=(target-position)*(1-Math.exp(-dt/PLAYER_RULES.selectors.smoothingMs));
  if(Math.abs(target-position)<.5){write(target);raf=0;return}
  write(position);raf=requestAnimationFrame(animate);
 };
 const start=()=>{if(!raf){position=read();last=performance.now();raf=requestAnimationFrame(animate)}};
 cancel.to=value=>{cancel();target=bound(value);start()};
 host.addEventListener('wheel',event=>{
  event.preventDefault();let delta=event.deltaY+event.deltaX;
  if(event.deltaMode===1)delta*=16;if(event.deltaMode===2)delta*=axis==='x'?track.clientWidth:track.clientHeight;
  if(!delta)return;if(!raf)target=read();
  target=bound(target+Math.sign(delta)*Math.min(limit,Math.abs(delta)*(model?.wheelGain??PLAYER_RULES.selectors.wheelGain)));start();
  clearTimeout(snapTimer);
  if(model?.snap)snapTimer=setTimeout(()=>{target=bound(model.snap(target));start()},PLAYER_RULES.selectors.instrumentSnapDelayMs);
 },{passive:false});
 host.addEventListener('pointerdown',cancel);host.addEventListener('keydown',cancel);
 return cancel;
}
// Both range pickers share one circular strip; only their opening layout differs.
function createCircularRangeTrack(track,menu,choose,close){
 const buttons=[...track.querySelectorAll('[data-key]')],step=49,count=buttons.length,wrap=n=>((n%count)+count)%count;
 const view={position:0,touch:null,suppressClick:false};
 function render(){for(let index=0;index<count;index++){const offset=wrap(index-view.position/step+count/2)-count/2;buttons[index].style.transform='translateX('+(offset*step)+'px)'}menu.dataset.position=String(view.position/step)}
 const cancelWheel=bindSmoothWheel(track,menu,'x',PLAYER_RULES.selectors.rangeMaxStepPx,{loop:true,read:()=>view.position,write:value=>{view.position=value;render()}});
 function cancel(){cancelWheel();const drag=view.touch;view.touch=null;if(drag&&menu.hasPointerCapture(drag.id))menu.releasePointerCapture(drag.id)}
 function center(key){cancel();view.suppressClick=false;const index=Math.max(0,buttons.findIndex(button=>button.dataset.key===key));view.position=index*step;render();buttons[index].focus({preventScroll:true})}
 for(const button of buttons)button.onclick=()=>{if(view.suppressClick){view.suppressClick=false;return}choose(button.dataset.key)};
 menu.onkeydown=event=>{view.suppressClick=false;let index=buttons.indexOf(document.activeElement),next;
  if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=wrap(index-1);if(event.key==='ArrowRight'||event.key==='ArrowDown')next=wrap(index+1);if(event.key==='Home')next=0;if(event.key==='End')next=count-1;
  if(next!==undefined){event.preventDefault();event.stopPropagation();cancel();const current=Math.round(view.position/step);let delta=wrap(next-wrap(current));if(delta>count/2)delta-=count;view.position=(current+delta)*step;render();buttons[next].focus({preventScroll:true})}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true)}if(event.key==='Tab')close(true);
 };
 menu.addEventListener('pointerdown',event=>{if(event.button!==0)return;view.suppressClick=false;view.touch={id:event.pointerId,x:event.clientX,y:event.clientY,start:view.position,moved:false}});
 menu.addEventListener('pointermove',event=>{const drag=view.touch;if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.abs(dy)>Math.abs(dx)+4){view.touch=null;return}if(!drag.moved&&Math.abs(dx)<4)return;drag.moved=true;view.suppressClick=true;menu.setPointerCapture(event.pointerId);view.position=drag.start-dx;render();event.preventDefault()});
 const endDrag=event=>{if(view.touch?.id!==event.pointerId)return;view.touch=null;if(menu.hasPointerCapture(event.pointerId))menu.releasePointerCapture(event.pointerId)};menu.addEventListener('pointerup',endDrag);menu.addEventListener('pointercancel',endDrag);
 return {center,cancel};
}
let consoleRangePicker=null;
function syncConsoleRangePicker(){consoleRangePicker?.sync()}
function closeConsoleRangePicker(returnFocus=false){consoleRangePicker?.close(returnFocus)}
function bindConsoleRangePicker(){
 const trigger=$('consoleRangeToggle'),menu=$('consoleRangeMenu'),track=$('consoleRangeTrack');
 const items=[...$('keySelect').options].map(option=>({key:option.value,label:option.textContent}));
 for(const item of items){const button=document.createElement('button');button.type='button';button.dataset.key=item.key;button.textContent=item.key==='sky-original'?'光遇':KEY_DEGREES[item.key][0];button.title=item.label;button.setAttribute('role','option');button.tabIndex=-1;track.append(button)}
 const ring=createCircularRangeTrack(track,menu,key=>{if(!canEditScore())return;$('consoleTuning').value=key;$('consoleTuning').onchange({target:$('consoleTuning')});close(true)},close);
 function sync(){const selected=items.find(item=>item.key===state.tuning)||items[1];$('consoleRangeValue').textContent=selected.label;for(const button of track.querySelectorAll('[data-key]'))button.setAttribute('aria-selected',String(button.dataset.key===selected.key))}
 function close(returnFocus=false){ring.cancel();menu.hidden=true;trigger.hidden=false;trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus()}
 function open(){if(!canEditScore())return;closeRangePicker();sync();trigger.hidden=true;menu.hidden=false;trigger.setAttribute('aria-expanded','true');ring.center(state.tuning)}
 trigger.onclick=open;trigger.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();open()}};
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))close()});
 consoleRangePicker={sync,close};sync();
}
// Playback speed retains a bounded downward picker.
function createDownwardPicker(config){
 const trigger=$(config.trigger),menu=$(config.menu),options=$(config.options),focus=$(config.focus),items=config.items;
 const view={position:0,row:31,step:36,touch:null,suppressClick:false};let cancelWheel=()=>{};
 const buttons=items.map(item=>{const button=document.createElement('button');button.type='button';button.dataset.value=item.value;button.dataset[config.attribute]=item.value;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;button.textContent=item.label;button.onclick=()=>{if(view.suppressClick){view.suppressClick=false;return}config.choose(item.value)};options.append(button);return button});
 function sync(){for(const button of buttons)button.setAttribute('aria-selected',String(button.dataset.value===config.selected()))}
 function close(returnFocus=false){cancelWheel();menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus()}
 function position(){
  const rect=trigger.getBoundingClientRect();view.row=rect.height;view.step=rect.height+PLAYER_RULES.selectors.instrumentRowGapPx;
  // minimumRows includes the baseline row: keep both lower hit targets at the end.
  const visibleRows=Math.min(items.length,Math.max(config.minimumRows||1,config.rowsBelow()+1));
  const origin=Math.min(view.position,Math.max(0,items.length-visibleRows));
  const below=Math.min((visibleRows-1)*view.step,Math.max(0,innerHeight-rect.bottom-8));
  menu.style.width=rect.width+'px';menu.style.left=rect.left+'px';menu.style.top=rect.top+'px';menu.style.height=(rect.height+below)+'px';focus.style.top=((view.position-origin)*view.step)+'px';focus.style.height=rect.height+'px';
  buttons.forEach((button,i)=>{const y=(i-origin)*view.step;button.style.top=y+'px';button.style.height=view.row+'px';button.style.visibility=y+view.row>0&&y<view.row+below?'visible':'hidden'});menu.dataset.position=String(view.position);
 }
 function move(value){view.position=clamp(value,0,items.length-1);position();if(options.contains(document.activeElement)&&document.activeElement.style.visibility==='hidden')menu.focus({preventScroll:true})}
 function open(){config.beforeOpen();sync();cancelWheel();view.position=Math.max(0,items.findIndex(item=>item.value===config.selected()));menu.hidden=false;trigger.setAttribute('aria-expanded','true');position();buttons.find(button=>button.dataset.value===config.selected())?.focus({preventScroll:true})}
 menu.tabIndex=-1;
 cancelWheel=bindSmoothWheel(options,menu,'y',config.maxStepPx||PLAYER_RULES.selectors.instrumentMaxStepPx,{read:()=>view.position*view.step,write:pixels=>move(pixels/view.step),max:()=>(items.length-1)*view.step,snap:pixels=>Math.round(pixels/view.step)*view.step});
 trigger.onclick=()=>menu.hidden?open():close();trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open()}};
 menu.onkeydown=event=>{
  const focused=buttons.indexOf(document.activeElement),index=focused>=0?focused:Math.round(view.position);let next;
  if(event.key==='ArrowDown')next=Math.min(buttons.length-1,index+1);if(event.key==='ArrowUp')next=Math.max(0,index-1);if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
  if(next!==undefined){event.preventDefault();cancelWheel();move(next);buttons[next].focus({preventScroll:true})}
  if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();config.choose(items[index].value)}
  if(event.key==='Escape'){event.preventDefault();close(true)}if(event.key==='Tab')close();
 };
 menu.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'){view.touch={id:event.pointerId,y:event.clientY,position:view.position};view.suppressClick=false}});
 menu.addEventListener('pointermove',event=>{if(!view.touch||view.touch.id!==event.pointerId)return;const dy=event.clientY-view.touch.y;if(Math.abs(dy)>6){view.suppressClick=true;menu.setPointerCapture(event.pointerId);move(view.touch.position-dy/view.step)}});
 const endTouch=()=>{if(view.touch&&view.suppressClick)cancelWheel.to(Math.round(view.position)*view.step);view.touch=null;setTimeout(()=>view.suppressClick=false,0)};
 menu.addEventListener('pointerup',endTouch);menu.addEventListener('pointercancel',endTouch);
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))close()});
 window.addEventListener('resize',()=>{if(!menu.hidden){cancelWheel();position()}});window.addEventListener('scroll',event=>{if(!menu.hidden&&event.target!==menu&&!menu.contains(event.target))close()},true);
 return {open,close,sync};
}
let instrumentPicker=null,speedPicker=null;
function closeInstrumentPicker(returnFocus=false){instrumentPicker?.close(returnFocus)}
function closeSpeedPicker(returnFocus=false){speedPicker?.close(returnFocus)}
function syncInstrumentPicker(){const spec=instrumentSpec(state.project?.playback?.instrument),host=$('instrumentPicker');$('instrumentSelect').value=spec.id;host.value=spec.id;host.setAttribute('aria-valuenow',String(INSTRUMENTS.indexOf(spec)+1));host.setAttribute('aria-valuetext',spec.name+' · '+(spec.mode==='offline'?'离线':'在线'));instrumentPicker?.sync()}
function syncSpeedPicker(){$('speedSelect').value=String(state.rate);$('speedValue').textContent=state.rate.toFixed(2)+'×';speedPicker?.sync()}
async function chooseInstrument(id){
 if(!state.project)return;const project=state.project,selection=++instrumentSelection,was=state.isPlaying||instrumentResume;
 instrumentResume=was;if(state.isPlaying)pauseSong();project.playback.instrument=instrumentSpec(id).id;saveLibrary();syncInstrumentPicker();closeInstrumentPicker(true);
 const revision=actionNoticeRevision;let loadingRevision=-1;
 const waiting=setTimeout(()=>{if(selection===instrumentSelection&&project===state.project&&state.mode==='player'){toast('正在加载音色…');loadingRevision=actionNoticeRevision}},PLAYER_RULES.notifications.slowOperationMs);
 try{const ready=await preloadPiano();clearTimeout(waiting);if(selection!==instrumentSelection||project!==state.project||state.mode!=='player')return;instrumentResume=false;if(ready&&was&&!state.isPlaying)await playPause(true);if(ready&&selection===instrumentSelection&&project===state.project&&(revision===actionNoticeRevision||loadingRevision===actionNoticeRevision))toast('音色：'+instrumentSpec(project.playback.instrument).name)}catch(error){if(selection===instrumentSelection&&project===state.project){instrumentResume=false;console.warn(error);toast('音源加载异常：'+error.message,5000)}}finally{clearTimeout(waiting)}
}

function bindInstrumentPicker(){
 const host=$('instrumentPicker');host.oninput=()=>chooseInstrument(host.value);
 if(!document.createComment)return;
 const strip=createVerticalChoiceStrip(host,INSTRUMENTS.map(spec=>({label:spec.name,title:spec.name+' · '+(spec.mode==='offline'?'离线':'在线')})),{loop:true,selected:()=>Math.max(0,INSTRUMENTS.findIndex(spec=>spec.id===state.project?.playback.instrument)),preview:index=>{host.value=INSTRUMENTS[index].id;host.setAttribute('aria-valuenow',String(index+1));host.setAttribute('aria-valuetext',INSTRUMENTS[index].name)},choose:index=>{if(state.project&&state.project.playback.instrument!==INSTRUMENTS[index].id)chooseInstrument(INSTRUMENTS[index].id)}});
 instrumentPicker={sync:()=>strip.sync(Math.max(0,INSTRUMENTS.findIndex(spec=>spec.id===state.project?.playback.instrument))),close:()=>strip.cancel()};
 const closeOthers=()=>{closeRangePicker();closeSpeedPicker()};host.addEventListener('pointerdown',closeOthers,true);host.addEventListener('wheel',closeOthers,{capture:true,passive:true});
}
function bindSpeedPicker(){
 $('speedSelect').innerHTML='';for(const rate of PLAYER_RULES.playbackRates){const option=document.createElement('option');option.value=String(rate);option.textContent=rate.toFixed(2)+'×';$('speedSelect').append(option)}
 speedPicker=createDownwardPicker({trigger:'speedToggle',menu:'speedMenu',options:'speedOptions',focus:'speedCurrent',attribute:'speed',maxStepPx:PLAYER_RULES.selectors.speedMaxStepPx,minimumRows:PLAYER_RULES.selectors.speedMinimumRows,items:PLAYER_RULES.playbackRates.map(rate=>({value:String(rate),label:rate.toFixed(2)+'×'})),selected:()=>String(state.rate),rowsBelow:()=>PLAYER_RULES.selectors.speedRowsBelow,beforeOpen:()=>{closeRangePicker();closeInstrumentPicker()},choose:value=>{$('speedSelect').value=value;$('speedSelect').onchange({target:$('speedSelect')});closeSpeedPicker(true)}});
}

function seekBeatPage(direction){if(!state.project)return;pauseSong();const layout=beatLayout(),size=beatPageSize(),slot=clamp((Math.floor(beatDisplayIndex()/size)+direction)*size,0,layout.count-1);seekTo(layout.grid?Math.round(slot*layout.step):scoreEvents(state.project)[slot].timeMs)}

// A single visual-only arrival sequence for every song and theme.
const scoreEntrance={current:null};
function currentScoreEntrance(){const a=scoreEntrance.current;return a&&a.project===state.project&&!state.editMode?a:null}
function scoreEntranceHidesKeys(){return Boolean(currentScoreEntrance())}
function scoreEntranceHidesKey(key){return Boolean(currentScoreEntrance()&&!key.classList.contains('score-stamped'))}
function scoreEntranceShowsBeat(beat){return !currentScoreEntrance()||beat.classList.contains('score-grown')}
function scoreEntranceRollProgress(time,begin,windowMs){
 const a=currentScoreEntrance();if(!a)return 1;if(a.started===null)return 0;
 const cfg=PLAYER_RULES.scoreEntrance,span=cfg.durationMs-cfg.blankMs,scale=span/(cfg.rollSpreadMs+cfg.rollFloatMs),elapsed=performance.now()-a.started-cfg.blankMs-clamp((time-begin)/windowMs,0,1)*cfg.rollSpreadMs*scale;
 const t=clamp(elapsed/(cfg.rollFloatMs*scale),0,1);return 1-(1-t)**3;
}
function prepareScoreEntrance(){
 if(!document.createComment||homeReducedMotion())return;
 cancelScoreEntrance();scoreEntrance.current={project:state.project,started:null,animations:[],overlays:[],raf:0,beats:[],keys:[]};
 const host=$('playerView');host.classList.add('score-arriving');host.dataset.scoreEntrance='armed';
}
function finishScoreEntrance(phase='done'){
 const a=scoreEntrance.current;if(!a)return;scoreEntrance.current=null;cancelAnimationFrame(a.raf);
 for(const animation of a.animations)animation.cancel();
 for(const overlay of a.overlays)overlay.remove();
 const host=$('playerView');host.classList.remove('score-arriving');host.dataset.scoreEntrance=phase;
 for(const el of [...$('beatGrid').children,...$('keyBoard').children]){el.classList.remove('score-grown','score-settled','score-stamped');el.style.removeProperty('z-index');el.style.removeProperty('transform-origin')}
 if(state.mode==='player'&&state.project===a.project)updateVisual();
}
function cancelScoreEntrance(){finishScoreEntrance('cancelled')}
function startScoreEntrance(){
 const a=currentScoreEntrance();if(!a||a.started!==null)return;
 if(state.mode!=='player'||state.isPlaying||homeReducedMotion()){cancelScoreEntrance();return}
 const cfg=PLAYER_RULES.scoreEntrance,columns=PLAYER_RULES.grid.columns,colors=resolvedPlayerColors(state.project),blank=cfg.blankMs;
 a.started=performance.now();$('playerView').dataset.scoreEntrance='running';
 const animate=(el,frames,delay,duration,fill='both')=>{const animation=el.animate(frames,{delay,duration,fill,easing:'cubic-bezier(.2,.65,.25,1)'});animation.startTime=a.started;a.animations.push(animation)};
 const cells=[...$('beatGrid').children],rowStride=(columns-1)*cfg.beatStepMs+cfg.beatGrowMs+cfg.rowGapMs,span=cfg.durationMs-blank,beatScale=span/(Math.floor((cells.length-1)/columns)*rowStride+((cells.length-1)%columns)*cfg.beatStepMs+cfg.beatGrowMs),beatGrowMs=cfg.beatGrowMs*beatScale;
 cells.forEach((cell,index)=>{
  const delay=blank+(Math.floor(index/columns)*rowStride+(index%columns)*cfg.beatStepMs)*beatScale;a.beats.push({el:cell,delay,duration:beatGrowMs});
  if(index===beatDisplayIndex())animate(cell,[{boxShadow:'0 0 0 transparent'},{offset:.48,boxShadow:'0 0 20px '+colors.accent+'88, inset 0 0 0 1px '+colors.accent},{boxShadow:'0 0 0 transparent'}],delay,beatGrowMs);
  const pattern=cell.querySelector('.mini-keys'),name=cell.querySelector('.beat-name');
  if(pattern){const rect=pattern.getBoundingClientRect(),box=cell.getBoundingClientRect(),overlay=pattern.cloneNode(true);overlay.classList.add('score-arrival-pattern');overlay.style.cssText='left:'+(rect.left-box.left-cell.clientLeft)+'px;top:'+(rect.top-box.top-cell.clientTop)+'px;width:'+rect.width+'px;height:'+rect.height+'px';cell.append(overlay);a.overlays.push(overlay);
   animate(overlay,[{opacity:0,transform:'translateY(10px) scale(.72)'},{offset:.48,opacity:1,transform:'translateY(-2px) scale(1.08)'},{opacity:1,transform:'none'}],delay,beatGrowMs);
  }
  if(name)animate(name,[{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none'}],delay,beatGrowMs);
 });
 const notes=displayedBeat().notes,stampScaleTime=span/(cfg.stampDelayMs+Math.max(0,notes.length-1)*cfg.stampStepMs+cfg.stampMs),stampMs=cfg.stampMs*stampScaleTime;
 [...$('keyBoard').children].filter(key=>notes.includes(Number(key.dataset.note))).forEach((key,index)=>{
  const delay=blank+(cfg.stampDelayMs+index*cfg.stampStepMs)*stampScaleTime;a.keys.push({el:key,delay});key.style.zIndex='3';key.style.transformOrigin='center center';
  animate(key,[{opacity:0,transform:'translateY(0px) scale(1)',boxShadow:'0 0 0 '+colors.accent+'00',easing:'cubic-bezier(.16,.8,.3,1)'},{offset:cfg.stampGrowEnd,opacity:1,transform:'translateY(-'+cfg.stampRisePx+'px) scale('+cfg.stampScale+')',boxShadow:'0 0 28px '+colors.accent+'99',easing:'cubic-bezier(.2,.6,.3,1)'},{offset:cfg.stampHighlightEnd,opacity:1,transform:'translateY(-'+cfg.stampRisePx+'px) scale('+cfg.stampScale+')',boxShadow:'0 0 20px '+colors.accent+'77',easing:'cubic-bezier(.3,.05,.35,1)'},{opacity:1,transform:'translateY(0px) scale(1)',boxShadow:'0 0 10px '+colors.accent+'33'}],delay,stampMs,'forwards');
 });
 const duration=cfg.durationMs;
 // Start one shared clock after layout work, preserving the blank opening on slower devices.
 a.started=performance.now();for(const animation of a.animations)animation.startTime=a.started;
 const frame=()=>{
  if(scoreEntrance.current!==a)return;
  if(state.project!==a.project||state.mode!=='player'||state.editMode||state.isPlaying){cancelScoreEntrance();return}
  const elapsed=performance.now()-a.started;
  for(const item of a.beats){if(elapsed>=item.delay&&!item.el.classList.contains('score-grown')){item.el.classList.add('score-grown');if(Number(item.el.dataset.index)===beatDisplayIndex())item.el.classList.add('active','select')}if(elapsed>=item.delay+item.duration&&!item.settled){item.settled=true;item.el.classList.add('score-settled')}}
  for(const item of a.keys)if(elapsed>=item.delay&&!item.el.classList.contains('score-stamped'))item.el.classList.add('score-stamped','active');
  drawRoll();if(elapsed>=duration&&a.animations.every(animation=>animation.effect.getComputedTiming().progress===1)){finishScoreEntrance();return}a.raf=requestAnimationFrame(frame);
 };
 a.raf=requestAnimationFrame(frame);
}
function bindScoreEntranceInterrupts(){
 const interrupt=event=>{if(scoreEntrance.current&&((event.type==='keydown'&&state.mode==='player')||$('playerView').contains(event.target))){const input=(event.type==='input'||event.type==='change')&&'value'in event.target,value=input?event.target.value:null;cancelScoreEntrance();if(input)event.target.value=value}};
 for(const type of ['pointerdown','keydown','wheel','input','change'])document.addEventListener(type,interrupt,true);
 window.addEventListener('resize',cancelScoreEntrance);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelScoreEntrance()});
}

function syncLoopControl(){const on=state.project?.playback.loop===true;$('loopOneBtn').setAttribute('aria-pressed',String(on));$('loopOneBtn').title=on?'关闭单曲循环':'开启单曲循环'}

/* 40-ui.js */
function snowPopulate(element,count,scope='world'){element.innerHTML='';for(let i=0;i<count;i++){let dot=document.createElement('i');dot.className='snow-dot';let size=1+Math.random()*3.3;dot.style.cssText=`left:${Math.random()*100}%;width:${size.toFixed(2)}px;height:${size.toFixed(2)}px;opacity:${(.18+Math.random()*.38).toFixed(2)};animation-duration:${(scope==='world'?16:9)+Math.random()*15}s;animation-delay:-${Math.random()*30}s;--dx:${Math.round((Math.random()-.5)*170)}px`;element.append(dot)}}
function renderLibrary(){
 syncStatusNotificationAppearance();syncLibraryFilterPicker(); clearHomeCardPhysics();const q=$('songSearch').value.trim().toLowerCase(),container=$('libraryCards'),filter=$('libraryFilter').value;container.innerHTML='';
 const visible=state.library.filter(song=>(song.title+' '+song.subtitle+' '+(song.author||'')).toLowerCase().includes(q)).filter(song=>filter==='favorite'?song.favorite:filter==='recent'?song.lastOpened>0:true);
 if(filter==='recent')visible.sort((a,b)=>b.lastOpened-a.lastOpened);$('libraryCount').textContent=state.library.length+' 首乐曲';
 for(const song of visible){
  const card=document.createElement('article'),definition=themeDefinition(song),palette=definition.appearance;card.className='song-card light-cone';card.dataset.songId=song.id;
  for(const key of ['stageStart','stageEnd','accent'])card.style.setProperty('--card-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),palette[key]);
  card.innerHTML='<div class="cone-tilt"><div class="cone-flip"><div class="cone-face cone-front"><div class="song-cover"><span class="cover-tag"></span></div><div class="song-details"><div><h3></h3><p></p></div></div></div><div class="cone-face cone-back" aria-hidden="true"><span class="cone-back-label">SCORE ARCHIVE</span><h3></h3><dl class="cone-info"></dl></div></div><button class="cone-flip-trigger" type="button" aria-pressed="false"></button><div class="cone-foil" aria-hidden="true"></div><div class="cone-sheen" aria-hidden="true"></div><div class="cone-etch" aria-hidden="true"></div><div class="cone-edge" aria-hidden="true"></div><button class="card-play" type="button">'+appIcon('play')+'</button><div class="song-card-actions"></div></div>';
  for(const decoration of card.querySelectorAll('.cone-foil,.cone-sheen,.cone-etch,.cone-edge')){card.querySelector('.cone-back').append(decoration.cloneNode(true));card.querySelector('.cone-front').append(decoration)}
  card.querySelector('.cone-front h3').textContent=song.card?.title||song.title;card.querySelector('.cone-back h3').textContent=song.title;
  card.querySelector('.song-details p').textContent=definition.displayName+' · '+durationFmt(song.durationMs);
  card.querySelector('.cover-tag').textContent=song.originKind==='builtin'?'内置曲谱':song.originKind==='imported'?'导入曲谱':'我的曲谱';
  const coverPath=platformCover(song)||song._imageUrl||definition.decorations.cover;if(coverPath){const image=document.createElement('img');image.alt='';image.src=coverPath.startsWith('data:')?coverPath:themeAsset(coverPath,song);card.querySelector('.song-cover').append(image)}
  const tuning=song.composition?.key||song.playback?.tuning||'C',details=[['音符数',String(songNotes(song))],['音域',tuning==='sky-original'?'光遇原调':(KEY_DEGREES[tuning]||KEY_DEGREES.C)[0]+' 大调'],['作者',song.author||'未署名']];
  for(const [label,value]of details){const group=document.createElement('div'),term=document.createElement('dt'),content=document.createElement('dd');term.textContent=label;content.textContent=value;content.title=value;group.append(term,content);card.querySelector('.cone-info').append(group)}
  const play=card.querySelector('.card-play');play.setAttribute('aria-label','演奏'+song.title);play.onclick=event=>{event.stopPropagation();enterSongFromCard(song.id,card)};
  const actions=card.querySelector('.song-card-actions');for(const [label,action,title]of [[song.favorite?'favorite-filled':'favorite',()=>favoriteSong(song.id),'收藏'],['edit',()=>renameSong(song.id),'重命名'],['copy',()=>duplicateSong(song.id),'制作副本'],['close',()=>deleteSong(song.id),'删除项目']]){const button=document.createElement('button');button.innerHTML=appIcon(label);button.dataset.homeTooltip=title;button.setAttribute('aria-label',title);button.onclick=event=>{event.stopPropagation();action()};actions.append(button)}
  attachHomeCard(card,song);container.append(card);
 }
 const add=document.createElement('button');add.className='song-card add-card';add.innerHTML='<span class="plus">'+appIcon('plus')+'</span><strong>导入新的乐曲</strong>';add.onclick=openImport;container.append(add);resumeHomePresentation();
}
function openImport(){$('importDialog').showModal()}
function mountPlatformProject(id){cancelScoreEntrance();if(!homeExperience.entry?.mounting)cancelSongEntry();cancelPlayerValueScroll();pauseHomePresentation();cancelRollDrag();invalidateInstrumentChange();closeInstrumentPicker();closeSpeedPicker();closeRangePicker();cancelRollFinish();pauseSong();let p=state.library.find(p=>p.id===id);if(!p){toast('找不到歌曲');return}state.project=p;state.editMode=false;state.editDirty=false;state.editSource=null;state.editBaseline=null;updateEditButton();p.lastOpened=Date.now();if(PLAYER_RULES.sustain.resetOnSongEntry)p.playback.sustain=PLAYER_RULES.sustain.default;saveLibrary();state.position=0;state.rollPageStart=0;state.windowSec=PLAYER_RULES.roll.initialSeconds;$('rollWindow').value=String(state.windowSec);scoreConsole.views.delete(id);scoreConsole.mode=PLAYER_RULES.editor.initialMode;state.selected=0;state.lastSelected=-1;state.page=-1;state.rate=p.playback.rate||1;state.tuning=p.playback.tuning||'C';state.sustain=Number.isFinite(p.playback.sustain)?p.playback.sustain:PLAYER_RULES.sustain.default;state.volume=normalizeVolume(p.playback.volume);syncVolumeControl();$('homeView').hidden=true;$('playerView').hidden=false;state.mode='player';if(homeExperience.entry?.mounting)prepareScoreEntrance();setControlContent($('playBtn'),'play','播放');$('songTitle').textContent=p.title;$('songSubtitle').textContent=p.subtitle;$('durationHeader').textContent=durationFmt(p.durationMs);$('noteCountHeader').textContent=songNotes(p)+' NOTES';syncSpeedPicker();syncLoopControl();syncSustainControl();$('instrumentSelect').value=p.playback.instrument||'offline';$('keySelect').value=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';$('seekSlider').max=p.durationMs;$('seekMax').textContent=durationFmt(p.durationMs);$('playBtn').disabled=false;applyTheme();initializeScene();renderKeyBoard();renderBeatGrid(true);updateVisual();refreshHistoryButtons();try{localStorage.setItem('sky-last-song',id)}catch(e){console.warn('最近播放缓存不可用',e)}requestAnimationFrame(drawRoll);try{history.replaceState(null,'','#song='+encodeURIComponent(id))}catch(e){}}
function goHome(){cancelScoreEntrance();if(!homeExperience.entry?.mounting)cancelSongEntry();cancelPlayerValueScroll();cancelRollDrag();invalidateInstrumentChange();closeInstrumentPicker();closeSpeedPicker();closeRangePicker();cancelRollFinish();if(state.editMode){requestFinishEdit('home');return}pauseSong();state.mode='home';$('playerView').hidden=true;$('homeView').hidden=false;resetHomePresentation();$('songSearch').value='';$('libraryFilter').value='all';$('homeView').scrollTop=0;try{history.replaceState(null,'',location.pathname)}catch(e){};renderLibrary();toast('已返回音乐馆',1000)}
function applyTheme(){let p=state.project;if(!p)return;let theme=sceneId(p),host=$('playerView');applyPlayerTemplate(p,host);if($('scoreConsole')?.open)applyPlayerTemplate(p,$('scoreConsole'));applyPlayerTemplate(p,$('sceneDialog'));$('keyFeedbackLayer').innerHTML='';initializeScene();requestAnimationFrame(drawRoll)}
function beatIndex(time){let events=scoreEvents(state.project);return clamp(lowerBound(events,time+1)-1,0,Math.max(events.length-1,0))}
// A grid cell represents a time slot, not one independently editable audio event.
function editingNoteSelection(){
 if(!state.editMode)return null;const events=scoreEvents(state.project);let selection=scoreConsole.selection;
 if(!selection||selection.project!==state.project||!events.includes(selection.event)){const event=events[state.selected];if(!event?.notes.length)return null;selection=scoreConsole.selection={project:state.project,event,note:event.notes.includes(scoreConsole.selectedNote)?scoreConsole.selectedNote:event.notes[0]}}
 const event=selection.event;if(!event.notes.length)return null;const note=event.notes.includes(selection.note)?selection.note:event.notes[0];selection.note=note;const layout=beatLayout();
 return {event,note,slot:layout.grid?Math.max(0,Math.floor((event.timeMs+1)/layout.step)):events.indexOf(event)};
}
function beatLayout(){
 const p=state.project,events=scoreEvents(p),step=p.score.gridIntervalMs,cached=state.beatLayoutCache;
 if(cached&&cached.project===p&&cached.events===events&&cached.length===events.length&&cached.step===step)return cached;
 const grid=p.score.mode==='grid',cells=new Map();let count=grid?1:events.length;
 events.forEach((event,index)=>{const slot=grid?Math.max(0,Math.floor((event.timeMs+1)/step)):index;let cell=cells.get(slot);if(!cell){cell={timeMs:grid?Math.round(slot*step):event.timeMs,notes:[],indices:[],durationMs:0,confidence:event.confidence};cells.set(slot,cell)}cell.indices.push(index);cell.notes=[...new Set([...cell.notes,...event.notes])].sort((a,b)=>a-b);cell.durationMs=Math.max(cell.durationMs,event.durationMs);count=Math.max(count,slot+1)});
 return state.beatLayoutCache={project:p,events,length:events.length,step,grid,cells,count};
}
function beatDisplayIndex(){const layout=beatLayout();return layout.grid?clamp(Math.floor((state.position+1)/layout.step),0,layout.count-1):Math.max(0,state.selected)}
function displayedBeat(){return beatLayout().cells.get(beatDisplayIndex())||{timeMs:state.position,notes:[],indices:[]}}
function stepEvent(direction){if(!state.project)return;pauseSong();const layout=beatLayout();if(layout.grid){const slot=clamp(beatDisplayIndex()+direction,0,layout.count-1);seekTo(Math.round(slot*layout.step))}else{const events=scoreEvents(state.project),index=clamp(state.selected+direction,0,events.length-1);if(events[index])seekTo(events[index].timeMs)}}
function beatPageSize(){return $('scoreConsole')?.open?PLAYER_RULES.grid.columns*PLAYER_RULES.editor.beatRowsPerSection:BEATS_PER_PAGE}
function renderBeatGrid(force=false){
 if(force)state.beatLayoutCache=null;const layout=beatLayout(),size=beatPageSize(),pg=Math.floor(beatDisplayIndex()/size);if(pg===state.page&&!force)return;state.page=pg;
 const grid=$('beatGrid');grid.innerHTML='';const frag=document.createDocumentFragment();
 for(let slot=pg*size;slot<Math.min(layout.count,(pg+1)*size);slot++){
  const e=layout.cells.get(slot)||{timeMs:Math.round(slot*layout.step),notes:[],indices:[]},btn=document.createElement('button');btn.className='beat'+(e.notes.length===2?' poly2':e.notes.length>=3?' poly3':'')+(e.notes.length?'':' empty')+(e.confidence==='unverified'?' uncertain':'');btn.dataset.index=slot;btn.dataset.timeMs=e.timeMs;btn.disabled=!e.indices.length;btn.title=`${positionFmt(e.timeMs)} · ${eventLabel(e)}`;btn.setAttribute('aria-label',`第 ${String(slot+1).padStart(3,'0')} 格 · ${btn.title}`);
  const label=document.createElement('span');label.className='beat-number';label.textContent=String(slot+1).padStart(3,'0');const dots=document.createElement('div');dots.className='mini-keys';dots.setAttribute('aria-hidden','true');for(let n=1;n<=15;n++){const dot=document.createElement('span');dot.className='mini-dot'+(e.notes.includes(n)?' on':'');dot.dataset.note=n;dots.append(dot)}const name=document.createElement('span');name.className='beat-name';name.textContent=e.notes.length?e.notes.map(noteName).join('·'):'·';btn.append(label,dots,name);
  btn.onclick=click=>{pauseSong();seekTo(e.timeMs);if(e.indices.length){const note=Number(click.target.closest('[data-note]')?.dataset.note);state.selected=e.indices.find(index=>scoreEvents(state.project)[index].notes.includes(note))??e.indices[0];scoreConsole.selectedNote=note||scoreEvents(state.project)[state.selected].notes[0];scoreConsole.selection={project:state.project,event:scoreEvents(state.project)[state.selected],note:scoreConsole.selectedNote};state.lastSelected=state.selected}renderKeyBoard();updateVisual();if(state.editMode)syncEditorFields()};frag.append(btn);
 }
 for(let i=Math.min(layout.count-pg*size,size);i<size;i++){const tile=document.createElement('div');tile.className='beat empty beat-placeholder';tile.setAttribute('aria-hidden','true');frag.append(tile)}grid.append(frag);
 const split=size!==BEATS_PER_PAGE,total=Math.max(1,Math.ceil(layout.count/BEATS_PER_PAGE));$('pageLabel').textContent=(split?String(Math.floor(pg/2)+1)+(pg%2?'B':'A'):String(pg+1).padStart(2,'0'))+' / '+String(total).padStart(2,'0');grid.dataset.section=split?(pg%2?'B':'A'):'full';grid.setAttribute('aria-label',split?'第 '+(Math.floor(pg/2)+1)+' 组 '+(pg%2?'B':'A')+' 段，8列2行逐拍谱':'逐拍谱，8列4行');$('pagePrev').disabled=pg===0;$('pageNext').disabled=pg===Math.max(1,Math.ceil(layout.count/size))-1;
}
function renderKeyBoard(){let c=$('keyBoard');c.innerHTML='';let active=displayedBeat().notes;for(let n=1;n<=15;n++){let b=document.createElement('button');b.className='key-tile'+(active.includes(n)&&!scoreEntranceHidesKeys()?' active':'');b.dataset.note=n;b.setAttribute('aria-label',(canEditScore()?'切换琴键 ':'试听琴键 ')+n+' '+noteName(n));b.innerHTML=`<span class="key-no">${String(n).padStart(2,'0')}</span><span class="key-name">${noteName(n)}</span>`;b.onclick=()=>{renderKeyFeedback(b);toggleNote(n)};c.append(b)}}
async function toggleNote(n){if(!state.project)return;if(scoreConsoleCapture(n))return;if(!canEditScore()){try{await preloadPiano();triggerSample(n,state.audioCtx.currentTime+.02,280)}catch(e){toast('音源尚未就绪',2500)}return}let item=scoreEvents(state.project)[state.selected];if(!item)return;let exists=item.notes.includes(n);rememberEdit({index:state.selected,note:n,position:state.position});item.notes=exists?item.notes.filter(v=>v!==n):[...item.notes,n].sort((a,b)=>a-b);if(item.notes.length&&item.durationMs<70)item.durationMs=190;if(!item.notes.length)item.durationMs=0;item.confidence='user-corrected';scoreConsole.selectedNote=exists?item.notes[0]:n;scoreConsole.selection={project:state.project,event:item,note:scoreConsole.selectedNote};saveLibrary();renderKeyBoard();renderBeatGrid(true);updateVisual();refreshHistoryButtons();if(state.editMode)syncEditorFields();$('noteCountHeader').textContent=songNotes(state.project)+' NOTES';if(!exists){try{await preloadPiano();triggerSample(n,state.audioCtx.currentTime+.015,300)}catch(e){console.warn(e)}}}
function updateVisual(){let p=state.project;if(!p)return;let pos=state.position,events=scoreEvents(p),now=beatIndex(pos);let changed=now!==state.selected;if(state.isPlaying||state.lastSelected!==state.selected){state.selected=now;if(Math.floor(beatDisplayIndex()/beatPageSize())!==state.page)renderBeatGrid();if(changed)renderKeyBoard()}
 state.lastSelected=state.selected;const displayIndex=beatDisplayIndex();if(Math.floor(displayIndex/beatPageSize())!==state.page)renderBeatGrid();if(!state.editMode){$('timeClock').textContent=positionFmt(pos);$('seekSlider').value=Math.round(pos)}$('rollSeekSlider').max=p.durationMs;$('rollSeekSlider').value=Math.round(pos);$('rollPosition').textContent=String(state.selected+1).padStart(4,'0')+' / '+events.length;
 const e=displayedBeat();$('selectedSummary').textContent=eventLabel(e);$('currentBeatIndex').textContent='第 '+String(displayIndex+1).padStart(3,'0')+' 格';$('currentBeatNotes').textContent=eventLabel(e);
 let keys=state.isPlaying?activeNotes(pos):new Set();const editing=editingNoteSelection();
 for(let el of $('beatGrid').children){let index=+el.dataset.index,on=index===displayIndex&&scoreEntranceShowsBeat(el);el.classList.toggle('active',on);el.classList.toggle('select',on);const editingCell=editing&&index===editing.slot;el.classList.toggle('editor-selected',Boolean(editingCell));el.dataset.editingNote=editingCell?String(editing.note):'';el.setAttribute('aria-description',editingCell?'正在编辑音符 '+editing.note+' '+noteName(editing.note):'');el.classList.toggle('echo',state.isPlaying&&index<displayIndex&&index>=displayIndex-8&&beatLayout().cells.get(index)?.notes.length>0);el.setAttribute('aria-current',on?'step':'false');for(let dot of el.querySelectorAll('.mini-dot')){dot.classList.toggle('resonance',on&&keys.has(+dot.dataset.note)&&!e?.notes?.includes(+dot.dataset.note));dot.classList.toggle('editor-note',Boolean(editingCell&&+dot.dataset.note===editing.note))}}
 if(state.isPlaying&&!e?.notes.length&&keys.size){let names=[...keys].sort((a,b)=>a-b).map(noteName).join(' · ');$('currentBeatNotes').textContent='余音 '+names;$('selectedSummary').textContent=names}
 for(let k of $('keyBoard').children){let n=Number(k.dataset.note);k.classList.toggle('ringing',state.isPlaying&&keys.has(n));k.classList.toggle('active',e?.notes?.includes(n)&&!scoreEntranceHidesKey(k))}drawRoll();syncPlaybackKeyFeedback(pos);updateScoreConsole()
}
// Page origin may move independently of the scan phase when the score is scrubbed.
function rollSeekOrigin(position,fraction,windowMs=state.windowSec*1000){
 const span=Math.min(windowMs,state.project.durationMs),lastBegin=Math.max(0,state.project.durationMs-span);
 // Keep the last window fixed in both scrub directions, with no time-scale change.
 if(position>=lastBegin)return lastBegin;
 return Math.min(position-fraction*span,lastBegin);
}
function rollFrame(position=state.position){
 if(typeof scoreConsole!=='undefined'&&scoreConsole.fine){const f=scoreConsole.fine.frame;return {...f,phase:clamp(position-f.begin,0,f.windowMs)}}
 const nominal=state.windowSec*1000,duration=state.project.durationMs,windowMs=Math.max(1,Math.min(nominal,duration)),lastBegin=Math.max(0,duration-windowMs);
 if(state.rollFinish){const f=state.rollFinish;return {begin:f.begin,end:f.begin+f.windowMs,windowMs:f.windowMs,phase:Math.min(f.windowMs,f.phase+(performance.now()-f.at)*f.rate)}}
 let begin=state.rollPageStart,phase=position-begin;
 if(phase<0||phase>=nominal){
  // Exact page-boundary endings belong to the previous page, never a new blank page.
  const pagePosition=position>=duration?Math.max(0,position-.001):position;
  begin+=Math.floor((pagePosition-begin)/nominal)*nominal;
 }
 // Every entry path (playback, global seek, page arrows, editor and roll scrub)
 // shares one full-sized final window. Never magnify a short remainder page.
 begin=Math.min(begin,lastBegin);
 state.rollPageStart=begin;
 return {begin,end:begin+windowMs,windowMs,phase:clamp(position-begin,0,windowMs)};
}
function cancelRollFinish(){cancelAnimationFrame(state.rollFinishRaf);state.rollFinishRaf=0;state.rollFinish=null}
function finishRollScan(){
 const frame=rollFrame(state.project.durationMs);
 state.rollFinish={begin:frame.begin,windowMs:frame.windowMs,phase:frame.windowMs,at:performance.now(),rate:state.rate};
 pauseSong();drawRoll();
}
function rollTimeLabels(frame=rollFrame()){
 const {begin,end}=frame,step=PLAYER_RULES.roll.labelIntervalSecondsByWindow[state.windowSec]*1000,labels=[];
 for(let timeMs=Math.max(0,Math.ceil(begin/step)*step);timeMs<=end;timeMs+=step)labels.push({timeMs,terminal:false});
 const events=platformController.events();let last=null;for(let i=events.length-1;i>=0;i--)if(events[i].notes.length){last=events[i];break}
 if(last&&last.timeMs>=begin&&last.timeMs<=end){
  let timeMs=Math.max(Math.ceil(begin/1000)*1000,Math.min(Math.floor(end/1000)*1000,Math.round(last.timeMs/1000)*1000));
  if(timeMs<begin||timeMs>end)timeMs=last.timeMs;
  const existing=labels.find(label=>label.timeMs===timeMs);if(existing)existing.terminal=true;else labels.push({timeMs,terminal:true});
 }
 return labels.sort((a,b)=>a.timeMs-b.timeMs);
}
function rollTimeText(timeMs){return Number((timeMs/1000).toFixed(3))+'s'}
function rollPlotGeometry(rect,frame=rollFrame(),context=$('rollCanvas').getContext('2d')){
 context.save();context.font='10px ui-monospace,monospace';const right=Math.max(13,context.measureText(rollTimeText(frame.end)).width/2+4);context.restore();
 return {left:59,top:25,bottom:23,right,plotW:rect.width-59-right};
}
function drawRoll(){if(!state.project||state.mode!=='player')return;let cv=$('rollCanvas'),rect=cv.getBoundingClientRect();if(rect.width<30||rect.height<30)return;let dpr=Math.min(2,devicePixelRatio||1);if(cv.width!==Math.round(rect.width*dpr)||cv.height!==Math.round(rect.height*dpr)){cv.width=Math.round(rect.width*dpr);cv.height=Math.round(rect.height*dpr)}const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);let W=rect.width,H=rect.height,left=59,top=25,bottom=23,sec=state.windowSec,{begin,end,windowMs,phase}=rollFrame();const {plotW}=rollPlotGeometry(rect,{begin,end},c),rowH=(H-top-bottom)/15;
 const colors=state.playerColors||PLAYER_APPEARANCE[APP_CONFIG.defaultTheme];
 const paper=rollPaletteForTheme(themeDefinition(),colors);
 c.clearRect(0,0,W,H);c.fillStyle=paper.base;c.fillRect(0,0,W,H);
 const cellGrid=true;
 // Three five-lane groups preserve the requested light / mid / dark / mid / light rhythm.
 for(let row=0;row<15;row++){let n=15-row,y=top+row*rowH,anchor=n===1||n===8||n===15;c.fillStyle=paper[['light','medium','dark','medium','light'][row%5]];c.fillRect(left,y,plotW,rowH);c.fillStyle=anchor?paper.anchor:paper.label;c.font=`600 ${Math.min(11,Math.max(9,rowH*.54))}px Georgia,serif`;c.textAlign='right';c.textBaseline='middle';c.fillText(n+' '+noteName(n),left-7,y+rowH/2)}
 // Draw subdivisions after opaque lane fills in every supported window.
 if(cellGrid){const divisions=PLAYER_RULES.roll.subdivisionsPerSecond,stepMs=1000/divisions;for(let i=Math.ceil(begin/stepMs);i*stepMs<=end;i++){if(i%divisions===0)continue;let x=left+(i*stepMs-begin)/windowMs*plotW;c.strokeStyle=i%3===0?paper.label+'40':paper.label+'20';c.lineWidth=.6;c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}c.lineWidth=1;for(let row=0;row<=15;row++){let y=top+row*rowH;c.strokeStyle=paper.label+'20';c.beginPath();c.moveTo(left,y);c.lineTo(left+plotW,y);c.stroke()}}
 // Keep second grid lines independent of the sparser time labels.
 for(let t=Math.max(0,Math.ceil(begin/1000)*1000);t<=end;t+=1000){const x=left+(t-begin)/windowMs*plotW;c.strokeStyle=cellGrid?paper.anchor+'55':paper.label+'20';c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}
 c.textAlign='center';c.textBaseline='middle';c.fillStyle=paper.anchor;c.font='10px ui-monospace,monospace';
 const labels=rollTimeLabels({begin,end}),terminal=labels.find(label=>label.terminal),labelX=label=>left+(label.timeMs-begin)/windowMs*plotW;
 for(const label of labels){
  const text=rollTimeText(label.timeMs),x=labelX(label);
  // Preserve the final-note label when a short last page would crowd a regular tick.
  if(terminal&&label!==terminal&&Math.abs(x-labelX(terminal))<(c.measureText(text).width+c.measureText(rollTimeText(terminal.timeMs)).width)/2+6)continue;
  if(label.timeMs%1000!==0){c.strokeStyle='#79927b88';c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}
  c.fillText(text,x,12);
 }
 c.save();c.beginPath();c.rect(left,top,plotW,H-top-bottom);c.clip();const editing=editingNoteSelection(),ev=platformController.events(),start=lowerBound(ev,begin-10000);for(let i=start;i<ev.length;i++){let e=ev[i];if(e.timeMs>end)break;if(!e.notes.length)continue;let x=left+(e.timeMs-begin)/windowMs*plotW;let width=Math.max(3,Math.min($('scoreConsole')?.open&&scoreConsole.mode==='fine'?Infinity:22,(e.durationMs||180)/windowMs*plotW));for(let n of e.notes){const arrival=scoreEntranceRollProgress(e.timeMs,begin,windowMs);if(arrival<=0)continue;c.save();c.globalAlpha=arrival;let tileWidth=Math.max(2,width-1.8),tileHeight=Math.max(3,rowH*.5),tileX=x+.8,y=top+(15-n)*rowH+(rowH-tileHeight)/2+(1-arrival)*PLAYER_RULES.scoreEntrance.rollRisePx;
 // Keep repeated notes distinct even when their sounding durations overlap.
 for(let j=i+1;j<ev.length&&ev[j].timeMs<e.timeMs+(width+2)/plotW*windowMs;j++){if(ev[j].notes.includes(n)){tileWidth=Math.min(tileWidth,Math.max(.8,(ev[j].timeMs-e.timeMs)/windowMs*plotW-1.8));break}}
 c.fillStyle=e.notes.length>=3?colors.poly:e.notes.length===2?colors.chord:colors.note;c.shadowColor='rgba(0,0,0,.65)';c.shadowBlur=3;c.shadowOffsetY=1;c.beginPath();c.roundRect(tileX,y,tileWidth,tileHeight,Math.min(2,tileWidth/2,tileHeight/2));c.fill();c.save();c.shadowBlur=0;c.shadowOffsetY=0;c.lineWidth=.75;c.strokeStyle=paper.base;c.stroke();c.restore();if(editing&&editing.event===e&&editing.note===n){const boxLeft=Math.max(left+1,tileX-2),boxRight=Math.min(left+plotW-1,tileX+tileWidth+2);if(boxRight>boxLeft){c.save();c.strokeStyle=PLAYER_RULES.editor.selectionOutline;c.lineWidth=2;c.shadowColor=PLAYER_RULES.editor.selectionOutline;c.shadowBlur=5;c.shadowOffsetY=0;c.beginPath();c.roundRect(boxLeft,y-2,boxRight-boxLeft,tileHeight+4,3);c.stroke();c.restore()}}c.restore()}}
 c.restore();let cursorX=left+phase/windowMs*plotW;c.strokeStyle='#ffd89c';c.lineWidth=1.5;c.beginPath();c.moveTo(cursorX,top);c.lineTo(cursorX,H-bottom);c.stroke();c.fillStyle='#ffe0ac';c.beginPath();c.arc(cursorX,top,3.6,0,Math.PI*2);c.fill();c.beginPath();c.arc(cursorX,H-bottom,3.6,0,Math.PI*2);c.fill();c.lineWidth=1
}

/* 41-home-experience.js */
// Homepage presentation is separate from the player, score and theme controllers.
const homeExperience={cards:new Set(),views:new Set(),flipped:new Set(),flips:new Map(),raf:0,last:0,carousel:null,flow:null,preview:null,entry:null};
const homeReducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

function clearHomeCardPhysics(){
 hideHomeControlTooltip();
 cancelAnimationFrame(homeExperience.raf);homeExperience.raf=0;
 for(const [el,animation]of homeExperience.flips){animation.cancel();el.classList.remove('is-turning')}homeExperience.flips.clear();
 for(const card of homeExperience.views){card.x=card.y=card.vx=card.vy=card.tx=card.ty=card.glow=card.flash=0;paintHomeCard(card)}
 homeExperience.cards.clear();homeExperience.views.clear();
}
function paintHomeCard(card){
 card.el.style.setProperty('--tilt-x',card.x.toFixed(3)+'deg');card.el.style.setProperty('--tilt-y',card.y.toFixed(3)+'deg');
 card.el.style.setProperty('--shine-x',card.lightX.toFixed(2)+'%');card.el.style.setProperty('--shine-y',card.lightY.toFixed(2)+'%');
 card.el.style.setProperty('--shine-opacity',Math.min(.6,card.glow*.32+card.flash*.18).toFixed(3));
 const depth=APP_CONFIG.home.cardPhysics.parallaxPx;
 card.el.style.setProperty('--art-x',(-card.y/6*depth).toFixed(2)+'px');card.el.style.setProperty('--art-y',(card.x/6*depth).toFixed(2)+'px');
 card.el.style.setProperty('--foil-angle',(118+card.y*4-card.x*2).toFixed(2)+'deg');card.el.style.setProperty('--foil-position',(40+card.y*5).toFixed(2)+'%');
 card.el.style.setProperty('--card-lift',(-card.glow*4).toFixed(2)+'px');card.el.style.setProperty('--card-scale',(1+card.glow*.012).toFixed(4));
 card.el.dataset.tiltX=card.x.toFixed(3);card.el.dataset.tiltY=card.y.toFixed(3);
}
function tickHomeCards(now){
 const physics=APP_CONFIG.home.cardPhysics,dt=Math.min(physics.maxFrameSeconds,Math.max(.001,(now-homeExperience.last)/1000));homeExperience.last=now;
 for(const card of homeExperience.cards){
  if(!card.el.isConnected){homeExperience.cards.delete(card);continue}
  for(const [angle,velocity,target]of [['x','vx','tx'],['y','vy','ty']]){
   const force=physics.stiffness*(card[target]-card[angle])-physics.damping*card[velocity];
   card[velocity]=clamp(card[velocity]+force/physics.mass*dt,-physics.maxVelocityDegPerSec,physics.maxVelocityDegPerSec);
   card[angle]=clamp(card[angle]+card[velocity]*dt,-physics.maxTiltDeg*1.1,physics.maxTiltDeg*1.1);
  }
  const ease=1-Math.exp(-dt*12);card.lightX+=(card.targetLightX-card.lightX)*ease;card.lightY+=(card.targetLightY-card.lightY)*ease;
  card.glow+=((card.hover?1:0)-card.glow)*ease;card.flash*=Math.exp(-dt*5);paintHomeCard(card);
  const resting=Math.abs(card.tx-card.x)<physics.restAngleDeg&&Math.abs(card.ty-card.y)<physics.restAngleDeg&&Math.abs(card.vx)<physics.restVelocityDegPerSec&&Math.abs(card.vy)<physics.restVelocityDegPerSec&&card.flash<.004&&Math.abs(card.glow-(card.hover?1:0))<.004;
  if(resting){card.x=card.tx;card.y=card.ty;card.vx=card.vy=0;card.glow=card.hover?1:0;card.flash=0;paintHomeCard(card);homeExperience.cards.delete(card)}
 }
 homeExperience.raf=homeExperience.cards.size?requestAnimationFrame(tickHomeCards):0;
}
function wakeHomeCard(card){
 homeExperience.cards.add(card);homeExperience.views.add(card);
 if(!homeExperience.raf){homeExperience.last=performance.now();homeExperience.raf=requestAnimationFrame(tickHomeCards)}
}
function setHomeCardFlip(el,song,flipped,animate=false){
 const face=el.querySelector('.cone-flip'),current=getComputedStyle(face).transform,old=homeExperience.flips.get(el);old?.cancel();homeExperience.flips.delete(el);el.classList.remove('is-turning');
 el.classList.toggle('is-flipped',flipped);el.dataset.face=flipped?'back':'front';
 const trigger=el.querySelector('.cone-flip-trigger');trigger.setAttribute('aria-pressed',String(flipped));trigger.setAttribute('aria-label',(flipped?'返回封面：':'查看歌曲信息：')+song.title);
 el.querySelector('.cone-front').setAttribute('aria-hidden',String(flipped));el.querySelector('.cone-back').setAttribute('aria-hidden',String(!flipped));
 if(flipped)homeExperience.flipped.add(song.id);else homeExperience.flipped.delete(song.id);
 if(animate&&!homeReducedMotion()&&face.animate){
  const end=flipped?180:0,sign=flipped?1:-1,matrix=current&&current!=='none'?new DOMMatrixReadOnly(current):null;
  let start=matrix?Math.atan2(-matrix.m13,matrix.m11)*180/Math.PI:0;if(start<0)start+=360;
  el.classList.add('is-turning');
  const animation=face.animate([{transform:current==='none'?'rotateY(0deg)':current,easing:'cubic-bezier(.42,0,.58,1)'},{offset:.46,transform:'translateZ(10px) rotateY('+((start+end)/2)+'deg) rotateZ('+(-sign*.35)+'deg)',easing:'cubic-bezier(.18,.55,.3,1)'},{offset:.88,transform:'translateZ(2px) rotateY('+(end+sign*2)+'deg)',easing:'ease-out'},{transform:'rotateY('+end+'deg)'}],{duration:Math.max(140,APP_CONFIG.home.cardPhysics.flipMs*Math.min(1,Math.abs(end-start)/180)),easing:'linear'});
  homeExperience.flips.set(el,animation);animation.onfinish=()=>{if(homeExperience.flips.get(el)===animation){homeExperience.flips.delete(el);el.classList.remove('is-turning')}};
 }
}
function attachHomeCard(el,song){
 if(!document.createComment)return;
 const card={el,x:0,y:0,vx:0,vy:0,tx:0,ty:0,glow:0,flash:0,hover:false,lightX:50,lightY:50,targetLightX:50,targetLightY:50};
 homeExperience.views.add(card);setHomeCardFlip(el,song,homeExperience.flipped.has(song.id));
 for(const button of el.querySelectorAll('[data-home-tooltip]')){button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showHomeControlTooltip(button)});button.addEventListener('pointerleave',hideHomeControlTooltip);button.addEventListener('focus',()=>showHomeControlTooltip(button));button.addEventListener('blur',hideHomeControlTooltip);button.addEventListener('click',hideHomeControlTooltip)}
 el.querySelector('.cone-flip-trigger').onclick=()=>setHomeCardFlip(el,song,el.dataset.face!=='back',true);
 const point=event=>{const rect=el.getBoundingClientRect(),x=clamp((event.clientX-rect.left)/rect.width,0,1),y=clamp((event.clientY-rect.top)/rect.height,0,1),limit=APP_CONFIG.home.cardPhysics.maxTiltDeg;card.tx=(.5-y)*2*limit;card.ty=(x-.5)*2*limit;card.targetLightX=x*100;card.targetLightY=y*100;wakeHomeCard(card)};
 el.addEventListener('pointerenter',event=>{if(event.pointerType==='touch'||homeReducedMotion())return;card.hover=true;card.flash=1;point(event)});
 el.addEventListener('pointermove',event=>{if(event.pointerType==='touch'||homeReducedMotion())return;point(event)});
 const leave=()=>{card.hover=false;card.tx=card.ty=0;card.targetLightX=card.targetLightY=50;if(!homeReducedMotion())wakeHomeCard(card)};
 el.addEventListener('pointerleave',leave);el.addEventListener('pointercancel',leave);
}

// One platform tooltip lives in the top layer, outside clipped and tilted cards.
let homeControlTooltip=null,homeTooltipAnchor=null;
function hideHomeControlTooltip(){if(!homeControlTooltip)return;homeTooltipAnchor?.removeAttribute('aria-describedby');homeTooltipAnchor=null;if(homeControlTooltip.matches(':popover-open'))homeControlTooltip.hidePopover()}
function showHomeControlTooltip(button){
 if(!homeControlTooltip){homeControlTooltip=document.createElement('div');homeControlTooltip.id='homeControlTooltip';homeControlTooltip.className='home-control-tooltip';homeControlTooltip.setAttribute('role','tooltip');homeControlTooltip.setAttribute('popover','manual');document.body.append(homeControlTooltip);$('homeView').addEventListener('scroll',hideHomeControlTooltip,{passive:true});window.addEventListener('resize',hideHomeControlTooltip);document.addEventListener('pointerdown',hideHomeControlTooltip);document.addEventListener('keydown',e=>{if(e.key==='Escape')hideHomeControlTooltip()})}
 hideHomeControlTooltip();homeTooltipAnchor=button;homeControlTooltip.textContent=button.dataset.homeTooltip;button.setAttribute('aria-describedby',homeControlTooltip.id);homeControlTooltip.showPopover();
 const r=button.getBoundingClientRect(),t=homeControlTooltip.getBoundingClientRect();homeControlTooltip.style.left=clamp(r.left+r.width/2-t.width/2,8,innerWidth-t.width-8)+'px';homeControlTooltip.style.top=(r.top>=t.height+16?r.top-t.height-8:r.bottom+8)+'px';
}

function stopHomeCarousel(){const c=homeExperience.carousel;if(c){clearTimeout(c.timer);c.timer=0}}
function scheduleHomeCarousel(){
 stopHomeCarousel();const c=homeExperience.carousel;
 if(!c||c.busy||c.hover||c.focus||$('homeThemeDialog')?.open||$('themeRepositoryDialog')?.open||document.hidden||state.mode!=='home'||$('homeView').hidden||homeReducedMotion())return;
 c.timer=setTimeout(()=>{c.timer=0;if(!document.hidden&&state.mode==='home'&&!c.hover&&!c.focus)moveHomeTheme(1,false)},APP_CONFIG.home.carousel.intervalMs);
}
function paintHomeCarousel(animate=true){
 const c=homeExperience.carousel;if(!c)return;
 c.track.style.transitionDuration=animate&&!homeReducedMotion()?APP_CONFIG.home.carousel.transitionMs+'ms':'0ms';
 c.track.style.transform='translate3d('+(-100*c.physical)+'%,0,0)';
 c.artTrack.style.transitionDuration=c.track.style.transitionDuration;c.artTrack.style.transform=c.track.style.transform;
 c.track.dataset.index=String(c.index);c.track.dataset.physical=String(c.physical);
 for(const [index,slide]of c.slides.entries()){const active=index===c.index;slide.setAttribute('aria-hidden',String(!active));slide.inert=!active}
 for(const [index,dot]of c.dots.entries()){dot.setAttribute('aria-current',String(index===c.index));dot.classList.toggle('is-active',index===c.index)}
}
function finishHomeThemeMove(){
 const c=homeExperience.carousel;if(!c||!c.busy)return;
 clearTimeout(c.settleTimer);c.busy=false;
 if(c.physical===0||c.physical===c.count+1){c.physical=c.index+1;paintHomeCarousel(false);void c.track.offsetWidth}
 if(c.pending!==null){const next=c.pending;c.pending=null;if(next.index!==c.index){requestAnimationFrame(()=>goHomeTheme(next.index,next.manual,next.direction));return}}
 scheduleHomeCarousel();
}
function goHomeTheme(index,manual=true,direction=0){
 const c=homeExperience.carousel;if(!c)return;index=(index+c.count)%c.count;stopHomeCarousel();
 if(c.busy){c.pending={index,manual,direction};return}
 if(index===c.index){scheduleHomeCarousel();return}
 const old=c.index;c.index=index;
 c.physical=direction===1&&old===c.count-1&&index===0?c.count+1:direction===-1&&old===0&&index===c.count-1?0:index+1;
 c.busy=!homeReducedMotion();paintHomeCarousel(c.busy);
 if(manual)$('homeThemeAnnouncement').textContent=c.definitions[index].displayName+'，第 '+(index+1)+' / '+c.count+' 个主题';
 if(c.busy)c.settleTimer=setTimeout(finishHomeThemeMove,APP_CONFIG.home.carousel.transitionMs+80);else scheduleHomeCarousel();
}
function moveHomeTheme(direction,manual=true){const c=homeExperience.carousel;if(c)goHomeTheme(c.index+direction,manual,direction)}
function resetHomePresentation(){
 clearHomeCardPhysics();homeExperience.flipped.clear();const c=homeExperience.carousel;if(!c)return;stopHomeCarousel();clearTimeout(c.settleTimer);c.index=0;c.physical=1;c.busy=false;c.pending=null;c.hover=false;c.focus=false;paintHomeCarousel(false);scheduleHomeCarousel();
}
function pauseHomePresentation(){stopHomeCarousel();clearHomeCardPhysics();stopHomeFlow()}
function resumeHomePresentation(){scheduleHomeCarousel();startHomeFlow()}
function bindHomeExperience(){
 bindHomeScrollChrome();bindLibraryFilterPicker();
 if(!document.createComment)return;
 const track=$('homeThemeTrack'),artTrack=$('homeThemeArtTrack'),dotHost=$('homeThemeDots');
 const definitions=Object.values(APP_CONFIG.platform.themes).map(pack=>pack.definition);
 const c=homeExperience.carousel={track,artTrack,definitions,count:definitions.length,index:0,physical:1,busy:false,pending:null,timer:0,settleTimer:0,hover:false,focus:false,slides:[],dots:[]};
 for(const [index,definition]of definitions.entries()){
  const slide=document.createElement('article');slide.className='home-theme-slide';slide.dataset.theme=definition.id;slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','幻灯片');slide.setAttribute('aria-label',(index+1)+' / '+c.count+' '+definition.displayName);
  slide.style.setProperty('--preview-start',definition.appearance.stageStart);slide.style.setProperty('--preview-accent',definition.appearance.accent);
  slide.innerHTML='<div class="home-theme-art"><img class="preview-landscape" alt=""><img class="preview-companion" alt=""></div><div class="home-theme-copy"><span class="eyebrow">THEME COLLECTION</span><h1></h1><p></p></div><div class="home-carousel-action"><button class="btn-primary theme-preview-open" type="button">设置主题</button></div>';
  slide.querySelector('.theme-preview-open').dataset.previewTheme=definition.id;
  slide.querySelector('h1').textContent=definition.displayName;slide.querySelector('p').textContent=definition.description||definition.name;
  const project={theme:{id:definition.id}},decor=definition.decorations,scene=decor.scene,path=decor.cover||(scene.type==='image'?scene.image:scene.type==='frames'?scene.framePattern.replace('{index}','00'):null),image=slide.querySelector('.preview-landscape');
  image.hidden=!path;if(path)image.src=themeAsset(path,project);
  const companion=slide.querySelector('.preview-companion');companion.hidden=!decor.companion;if(decor.companion)companion.src=themeAsset(decor.companion,project);
  const artSlide=document.createElement('div');artSlide.className='home-theme-art-slide';artSlide.dataset.theme=definition.id;artSlide.append(slide.querySelector('.home-theme-art'));artTrack.append(artSlide);
  track.append(slide);c.slides.push(slide);
  const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label','展示'+definition.displayName);dot.onclick=()=>goHomeTheme(index,true);dotHost.append(dot);c.dots.push(dot);
 }
 for(const [slide,where]of [[c.slides[c.count-1],'before'],[c.slides[0],'after']]){const clone=slide.cloneNode(true);clone.dataset.clone='true';clone.setAttribute('aria-hidden','true');clone.inert=true;if(where==='before')track.prepend(clone);else track.append(clone)}
 const artSlides=[...artTrack.children];artTrack.prepend(artSlides[artSlides.length-1].cloneNode(true));artTrack.append(artSlides[0].cloneNode(true));
 track.addEventListener('transitionend',event=>{if(event.target===track&&event.propertyName==='transform')finishHomeThemeMove()});
 track.addEventListener('click',event=>{const button=event.target.closest('[data-preview-theme]');if(button&&!button.closest('[data-clone]'))openHomeThemePreview(button.dataset.previewTheme)});
 $('homeThemePrev').onclick=()=>moveHomeTheme(-1);$('homeThemeNext').onclick=()=>moveHomeTheme(1);
 const hero=document.querySelector('.theme-carousel');
 hero.addEventListener('pointerenter',()=>{if(APP_CONFIG.home.carousel.pauseOnHover){c.hover=true;stopHomeCarousel()}});hero.addEventListener('pointerleave',()=>{c.hover=false;scheduleHomeCarousel()});
 for(const host of [hero]){
  host.addEventListener('focusin',()=>{c.focus=true;stopHomeCarousel()});
  host.addEventListener('focusout',event=>{if(!hero.contains(event.relatedTarget)&&!dotHost.contains(event.relatedTarget)){c.focus=false;scheduleHomeCarousel()}});
  host.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();moveHomeTheme(event.key==='ArrowRight'?1:-1)}});
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseHomePresentation();else resumeHomePresentation()});
 window.addEventListener('pagehide',cancelSongEntry);window.addEventListener('resize',()=>{if(homeExperience.entry)cancelSongEntry()});
 window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change',()=>{cancelSongEntry();clearHomeCardPhysics();if(homeReducedMotion()){stopHomeCarousel();finishHomeThemeMove();stopHomeFlow()}else resumeHomePresentation()});
 bindHomeThemePreview();paintHomeCarousel(false);resumeHomePresentation();
}

// A low-resolution, domain-warped noise field creates local eddies instead of sweeping bands.
function homeNoise(x,y){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 const hash=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295};
 const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
function homeFbm(x,y){return homeNoise(x,y)*.64+homeNoise(x*2.07+17,y*2.07-11)*.25+homeNoise(x*4.13-8,y*4.13+23)*.11}
function renderHomeFlow(now){
 const f=homeExperience.flow;if(!f)return;
 if(now-f.last>=1000/APP_CONFIG.home.atmosphere.fps){
  const cfg=APP_CONFIG.home.atmosphere,aspect=innerWidth/innerHeight,w=Math.max(80,Math.round(cfg.maxWidth*Math.min(1,aspect))),h=Math.max(60,Math.round(cfg.maxWidth*Math.min(1,1/aspect)));
  if(f.canvas.width!==w||f.canvas.height!==h){f.canvas.width=w;f.canvas.height=h;f.image=f.ctx.createImageData(w,h)}
  f.time+=Math.min((now-f.last)/1000,.15)*cfg.speed;f.last=now;const data=f.image.data,t=f.time,ratio=w/h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const px=x/w*3.2*ratio,py=y/h*3.2,a=homeNoise(px*.65+t*.4,py*.65-t*.18),b=homeNoise(px*.7-t*.23+31,py*.7+t*.32+13);
   const field=homeFbm(px+a*1.7+t*.17,py+b*1.7-t*.11),filament=Math.pow(Math.max(0,1-Math.abs(field-.54)*7),3),cloud=Math.max(0,field-.35);
   const i=(y*w+x)*4;data[i]=172+Math.round(a*35);data[i+1]=218+Math.round(b*20);data[i+2]=232;data[i+3]=Math.round((filament*82+cloud*76)*cfg.opacity);
  }
  f.ctx.putImageData(f.image,0,0);f.canvas.dataset.frames=String(++f.frames);
 }
 f.raf=requestAnimationFrame(renderHomeFlow);
}
function stopHomeFlow(){const f=homeExperience.flow;if(f){cancelAnimationFrame(f.raf);f.raf=0}}
function startHomeFlow(){
 if(!document.createComment||document.hidden||state.mode!=='home'||homeReducedMotion())return;
 let f=homeExperience.flow;if(!f){const canvas=$('homeFlowCanvas');if(!canvas)return;f=homeExperience.flow={canvas,ctx:canvas.getContext('2d'),time:8.3,last:0,frames:0,raf:0,image:null}}
 if(!f.raf){f.last=performance.now()-100;f.raf=requestAnimationFrame(renderHomeFlow)}
}

function openHomeThemePreview(id){
 const definition=THEME_DEFINITIONS[id];if(!definition)return;
 stopHomeCarousel();homeExperience.preview={id,project:{title:definition.displayName,theme:{id,...copy(definition.defaults),...copy(definition.initialOverrides)},card:{}}};
 resetHomeThemePreview();$('homeThemeDialog').showModal();syncStatusNotificationAppearance();
}
function resetHomeThemePreview(){
 const preview=homeExperience.preview;if(!preview)return;const d=THEME_DEFINITIONS[preview.id];preview.project.theme={id:d.id,...copy(d.defaults),...copy(d.initialOverrides)};
 $('homePreviewName').value=preview.project.theme.name||d.name;$('homePreviewAccent').value=preview.project.theme.accent||d.appearance.accent;$('homePreviewBackground').value=preview.project.theme.backgroundColor||d.appearance.stageEnd;$('homePreviewGlow').value=preview.project.theme.glow??50;$('homePreviewMotion').value=preview.project.theme.motion==='off'?'off':'ambient';paintHomeThemePreview();
}
function paintHomeThemePreview(){
 const preview=homeExperience.preview;if(!preview)return;const d=THEME_DEFINITIONS[preview.id],p=preview.project,t=p.theme;
 t.name=$('homePreviewName').value.slice(0,60);t.accent=$('homePreviewAccent').value;t.backgroundColor=$('homePreviewBackground').value;t.glow=Number($('homePreviewGlow').value);t.motion=$('homePreviewMotion').value;
 const host=$('homeThemeSample'),colors={...d.appearance,accent:t.accent,stageEnd:t.backgroundColor};
 for(const [key,value]of Object.entries(colors))host.style.setProperty('--sample-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);
 host.style.setProperty('--sample-glow',String(t.glow/100));host.dataset.motion=t.motion;host.dataset.theme=d.id;$('homePreviewGlowValue').textContent=t.glow+'%';$('homeThemeSampleName').textContent=t.name;
 const decor=d.decorations,path=decor.cover||decor.scene.image||(decor.scene.type==='frames'?decor.scene.framePattern.replace('{index}','00'):null),image=$('homeThemeSampleImage');image.hidden=!path;if(path)image.src=themeAsset(path,p);
 for(const [id,path]of [['homeThemeSampleCompanion',decor.companion],['homeThemeSampleCharm',decor.ornaments?.[0]]]){const img=$(id);img.hidden=!path;if(path)img.src=themeAsset(path,p)}
 $('homeThemeSampleRoll').style.backgroundImage='linear-gradient(90deg,transparent calc(25% - 1px),#ffffff14 25%,transparent calc(25% + 1px)),linear-gradient(180deg,'+Array.from({length:15},(_,i)=>{const color=d.rollPalette[['light','medium','dark','medium','light'][i%5]];return color+' '+(i/15*100)+'%,'+color+' '+((i+1)/15*100)+'%'}).join(',')+')';
 syncStatusNotificationAppearance();
}
function bindHomeThemePreview(){
 const roll=$('homeThemeSampleRoll');for(const [left,top,width]of [[9,13,14],[24,40,10],[41,27,18],[63,60,12],[78,80,14]]){const note=document.createElement('i');note.style.cssText='left:'+left+'%;top:'+top+'%;width:'+width+'%';roll.append(note)}
 for(let i=0;i<15;i++){const key=document.createElement('span');key.textContent=String(i%5+1);if([2,6,10].includes(i))key.className='sample-active';$('homeThemeSampleKeys').append(key)}
 for(const id of ['homePreviewName','homePreviewAccent','homePreviewBackground','homePreviewGlow','homePreviewMotion'])$(id).addEventListener('input',paintHomeThemePreview);
 $('homePreviewReset').onclick=resetHomeThemePreview;$('homePreviewExport').onclick=()=>{if(homeExperience.preview)exportTheme(homeExperience.preview.project)};
 $('homeThemeDialog').addEventListener('close',()=>{homeExperience.preview=null;syncStatusNotificationAppearance();scheduleHomeCarousel()});
}

// Card entry is presentation only; the shared platform controller still mounts every song.
function cancelSongEntry(completed=false){
 if(completed!==true)cancelScoreEntrance();
 const entry=homeExperience.entry;if(!entry)return;homeExperience.entry=null;
 for(const animation of entry.animations)animation.cancel();
 $('songEntryTransition').hidden=true;$('songEntryTransition').dataset.phase='idle';
 document.querySelector('.site-wrap').classList.remove('song-entry-reveal');
 $('homeView').inert=false;$('playerView').inert=false;if($('musicWorkbench')){$('musicWorkbench').inert=false;$('musicWorkbench').removeAttribute('aria-busy')}$('playerView').removeAttribute('aria-busy');
 if(state.mode==='home'&&!document.hidden)resumeHomePresentation();
}
async function enterSongFromCard(id,card){
 if(homeExperience.entry)return;
 const project=state.library.find(song=>song.id===id);if(!project)return toast('找不到歌曲');
 const overlay=$('songEntryTransition');
 if(homeReducedMotion()||!overlay.animate){openSong(id);$('songTitle').focus?.({preventScroll:true});return}
 const entry={animations:[],mounting:false};homeExperience.entry=entry;
 const active=()=>homeExperience.entry===entry,animate=(el,frames,duration)=>animateSongTransition(entry,el,frames,duration);
 const colors=resolvedPlayerColors(project),rect=card.getBoundingClientRect(),rules=APP_CONFIG.home.songEntry;
 for(const [name,value]of [['start',colors.surfaceStart],['end',colors.backdrop],['accent',colors.accent]])overlay.style.setProperty('--entry-'+name,value);
 $('songEntryTitle').textContent=project.title;$('songEntryMessage').textContent='正在展开谱面';const art=platformCover(project)||themeDefinition(project).decorations.cover;
 $('songEntryArt').hidden=!art;if(art)$('songEntryArt').src=themeAsset(art,project);
 overlay.setAttribute('aria-label','正在打开单曲');$('homeView').inert=true;pauseHomePresentation();overlay.hidden=false;overlay.dataset.phase='expand';
 try{
  await animate(overlay,[{clipPath:`inset(${Math.max(0,rect.top)}px ${Math.max(0,innerWidth-rect.right)}px ${Math.max(0,innerHeight-rect.bottom)}px ${Math.max(0,rect.left)}px round 16px)`,opacity:.7},{clipPath:'inset(0px 0px 0px 0px round 0px)',opacity:1}],rules.expandMs);
  if(!active())return;
  overlay.dataset.phase='loading';entry.mounting=true;openSong(id);entry.mounting=false;
  const player=activePlayerSurface();player.inert=true;player.setAttribute('aria-busy','true');
  // Paint the assembled roll and grid under the cover before revealing the real player.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(!active())return;
  overlay.dataset.phase='reveal';document.querySelector('.site-wrap').classList.add('song-entry-reveal');
  await animate(player,songRevealFrames(player),rules.revealMs);
  if(!active())return;cancelSongEntry(true);if(!MusicWorkbench.active)startScoreEntrance();(MusicWorkbench.active?$('musicTitle'):$('songTitle')).focus({preventScroll:true});
 }catch(error){if(active()){cancelSongEntry();toast('打开单曲失败：'+error.message,5000)}}
}

async function animateSongTransition(entry,el,frames,duration){
 const animation=el.animate(frames,{duration,easing:'cubic-bezier(.22,.65,.25,1)',fill:'forwards'});entry.animations.push(animation);await animation.finished.catch(()=>{});
}
function songRevealFrames(el,opening=true){
 const bounds=el.getBoundingClientRect(),cx=clamp(innerWidth/2-bounds.left,0,el.clientWidth),cy=clamp(innerHeight/2-bounds.top,0,el.clientHeight),radius=Math.ceil(Math.hypot(Math.max(cx,el.clientWidth-cx),Math.max(cy,el.clientHeight-cy)));
 const frames=[{clipPath:`circle(0px at ${cx}px ${cy}px)`},{clipPath:`circle(${radius}px at ${cx}px ${cy}px)`}];return opening?frames:frames.reverse();
}
async function returnHomeFromPlayer(){
 cancelScoreEntrance();
 if(homeExperience.entry)return;
 const overlay=$('songEntryTransition');
 if(state.mode!=='player'||state.editMode||homeReducedMotion()||!overlay.animate){goHome();return}
 const entry={animations:[],mounting:false};homeExperience.entry=entry;
 const active=()=>homeExperience.entry===entry,colors=resolvedPlayerColors(state.project),rules=APP_CONFIG.home.songReturn;
 for(const [name,value]of [['start',colors.surfaceStart],['end',colors.backdrop],['accent',colors.accent]])overlay.style.setProperty('--entry-'+name,value);
 $('songEntryTitle').textContent='星光音乐馆';$('songEntryMessage').textContent='正在返回音乐馆';$('songEntryArt').hidden=true;overlay.setAttribute('aria-label','正在返回音乐馆');
 pauseSong();cancelRollDrag();cancelRollFinish();cancelPlayerValueScroll();closeRangePicker();closeInstrumentPicker();closeSpeedPicker();
 $('homeView').inert=true;activePlayerSurface().inert=true;overlay.hidden=false;overlay.dataset.phase='return-cover';
 document.querySelector('.site-wrap').classList.add('song-entry-reveal');
 try{
  await animateSongTransition(entry,activePlayerSurface(),songRevealFrames(activePlayerSurface(),false),rules.coverMs);if(!active())return;
  document.querySelector('.site-wrap').classList.remove('song-entry-reveal');
  overlay.dataset.phase='return-loading';entry.mounting=true;goHome();entry.mounting=false;$('homeView').inert=true;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(!active())return;
  // Shrink the preparation cover too, exposing the home from the edges inward.
  overlay.dataset.phase='return-reveal';
  await animateSongTransition(entry,overlay,songRevealFrames(overlay,false),rules.revealMs);if(!active())return;
  cancelSongEntry();$('libraryTitle').focus({preventScroll:true});
 }catch(error){if(active()){cancelSongEntry();goHome()}}
}

// A platform-owned theme shelf; registry mutations never alter scores or player handlers.
let pendingThemeRemoval=null;
function themeUsage(id){return state.library.filter(p=>sceneId(p)===id)}
function renderThemeRepository(){
 const grid=$('themeRepositoryGrid');grid.replaceChildren();const definitions=Object.values(THEME_DEFINITIONS);$('themeRepositoryCount').textContent=`已加载 ${definitions.length} 款主题`;
 for(const d of definitions){
  const builtin=PLATFORM_BUILTIN_THEMES.has(d.id),usage=themeUsage(d.id),card=document.createElement('article');card.className='theme-repository-card';card.dataset.themeId=d.id;
  const image=document.createElement('img'),path=d.decorations.cover||d.decorations.scene.image;image.alt='';image.loading='lazy';if(path)image.src=themeAsset(path,{theme:{id:d.id}});else image.hidden=true;
  const body=document.createElement('div'),title=document.createElement('h3'),badge=document.createElement('small'),desc=document.createElement('p'),actions=document.createElement('div');title.textContent=d.displayName;badge.textContent=(builtin?'内置主题':'已添加')+' · '+usage.length+' 首乐曲使用';desc.textContent=d.description||d.name;actions.className='theme-repository-actions';
  const preview=document.createElement('button');preview.className='btn-outline';preview.textContent='预览';preview.onclick=()=>openHomeThemePreview(d.id);actions.append(preview);
  const backup=document.createElement('button');backup.className='btn-outline';backup.textContent='导出';backup.onclick=()=>exportTheme({title:d.displayName,theme:{id:d.id,...copy(d.defaults),...copy(d.initialOverrides)}});actions.append(backup);
  const remove=document.createElement('button');remove.className='btn-outline';remove.textContent=builtin?'内置保留':'移除';remove.disabled=builtin||usage.length>0;remove.title=builtin?'平台内置主题':usage.length?'请先为使用此主题的乐曲更换主题':'';remove.onclick=()=>{pendingThemeRemoval=d.id;$('themeRemoveMessage').textContent=`移除「${d.displayName}」？你可以先导出备份，之后再重新添加。`;$('themeRemoveDialog').showModal()};actions.append(remove);
  body.append(title,badge,desc,actions);card.append(image,body);grid.append(card);
 }
}
function openThemeRepository(){stopHomeCarousel();renderThemeRepository();$('themeRepositoryDialog').showModal()}
function bindThemeRepository(){
 if(!document.createComment)return;
 $('themeRepositoryAdd').onclick=()=>$('themeLibraryInput').click();$('themeRepositoryDialog').addEventListener('close',scheduleHomeCarousel);
 $('confirmThemeRemoval').onclick=()=>{
  const id=pendingThemeRemoval,d=THEME_DEFINITIONS[id];if(!d)return;
  if(PLATFORM_BUILTIN_THEMES.has(id)||themeUsage(id).length||(state.editMode&&sceneId(state.project)===id)){toast('此主题仍被乐曲使用，不能移除');return}
  try{const records=JSON.parse(localStorage.getItem(PLATFORM_THEME_KEY)||'[]').filter(item=>item.definition.id!==id);localStorage.setItem(PLATFORM_THEME_KEY,JSON.stringify(records))}catch(error){toast('主题移除失败：'+error.message,6000);return}
  delete THEME_DEFINITIONS[id];delete PRESETS[id];delete PLAYER_APPEARANCE[id];delete PLATFORM_THEME_ASSETS[id];populateThemeChoices();renderThemeRepository();$('themeRemoveDialog').close();toast('已移除主题「'+d.displayName+'」');
 };$('themeRemoveDialog').addEventListener('close',()=>{pendingThemeRemoval=null});
}

// A single custom listbox keeps the creation form independent of native OS select menus.
function closeCreateThemePicker(restoreFocus=false){
 const menu=$('createThemeMenu');if(menu.matches(':popover-open'))menu.hidePopover();$('createThemeToggle').setAttribute('aria-expanded','false');if(restoreFocus)$('createThemeToggle').focus();
}
function syncCreateThemePicker(){
 if(!document.createComment)return;
 const selected=$('createTheme').value,menu=$('createThemeMenu');$('createThemeValue').textContent=THEME_DEFINITIONS[selected]?.displayName||'选择主题';menu.replaceChildren();
 for(const d of Object.values(THEME_DEFINITIONS)){
  const option=document.createElement('button');option.type='button';option.role='option';option.dataset.theme=d.id;option.setAttribute('aria-selected',String(d.id===selected));option.tabIndex=d.id===selected?0:-1;
  const swatch=document.createElement('span');swatch.className='theme-color-chip';swatch.style.backgroundColor=d.appearance.accent;const name=document.createElement('span');name.textContent=d.displayName;option.append(swatch,name);const check=document.createElement('span');check.innerHTML=appIcon('check');check.className='theme-choice-check';option.append(check);
  option.onclick=()=>{$('createTheme').value=d.id;closeCreateThemePicker(true);syncCreateThemePicker()};menu.append(option);
 }
}
function openCreateThemePicker(){
 syncCreateThemePicker();const menu=$('createThemeMenu'),rect=$('createThemeToggle').getBoundingClientRect(),below=innerHeight-rect.bottom-12,above=rect.top-12;
 const height=Math.min(260,Math.max(below,above));menu.style.width=rect.width+'px';menu.style.left=rect.left+'px';menu.style.maxHeight=height+'px';menu.style.top=below>=Math.min(260,menu.children.length*42+12)?rect.bottom+6+'px':'auto';menu.style.bottom=menu.style.top==='auto'?innerHeight-rect.top+6+'px':'auto';
 menu.showPopover();$('createThemeToggle').setAttribute('aria-expanded','true');const selected=menu.querySelector('[aria-selected=true]')||menu.firstElementChild;selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest'});
}
function bindCreateThemePicker(){
 if(!document.createComment)return;
 const toggle=$('createThemeToggle'),menu=$('createThemeMenu');toggle.onclick=()=>menu.matches(':popover-open')?closeCreateThemePicker():openCreateThemePicker();toggle.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();openCreateThemePicker()}};
 menu.onkeydown=e=>{const options=[...menu.children],index=options.indexOf(document.activeElement);let next=index;if(e.key==='ArrowDown')next=(index+1)%options.length;else if(e.key==='ArrowUp')next=(index+options.length-1)%options.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=options.length-1;else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCreateThemePicker(true);return}else if(e.key==='Tab'){closeCreateThemePicker(true);return}else return;e.preventDefault();options[next].focus()};
 document.addEventListener('pointerdown',e=>{if(menu.matches(':popover-open')&&!menu.contains(e.target)&&!toggle.contains(e.target))closeCreateThemePicker()});window.addEventListener('resize',()=>closeCreateThemePicker());$('createDialog').addEventListener('close',()=>closeCreateThemePicker());$('createDialog').addEventListener('cancel',e=>{if(menu.matches(':popover-open')){e.preventDefault();closeCreateThemePicker(true)}});$('createTitle').oninput=()=>{$('createTitle').setCustomValidity('');$('createTitle').removeAttribute('aria-invalid');$('createTitleError').hidden=true};$('createTheme').onchange=syncCreateThemePicker;
}


// Keep navigation anchored while the library fades out below it, without painting a header panel.
function bindHomeScrollChrome(){
 if(!document.createComment)return;
 const home=$('homeView'),header=home.querySelector('.home-top'),body=home.querySelector('.home-body');let pending=0;
 const paint=()=>{pending=0;const scrolled=home.scrollTop>1;home.classList.toggle('home-scrolled',scrolled);const cutoff=scrolled?Math.max(0,header.getBoundingClientRect().bottom-body.getBoundingClientRect().top):0;body.style.setProperty('--home-content-cutoff',cutoff+'px')};
 const schedule=()=>{if(!pending)pending=requestAnimationFrame(paint)};home.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);new ResizeObserver(schedule).observe(header);paint();
}
let libraryFilterPicker=null;
function syncLibraryFilterPicker(){libraryFilterPicker?.sync()}
function bindLibraryFilterPicker(){
 if(!document.createComment)return;
 const select=$('libraryFilter'),trigger=$('libraryFilterToggle'),menu=$('libraryFilterMenu'),value=$('libraryFilterValue');
 const close=(focus=false)=>{if(menu.matches(':popover-open'))menu.hidePopover();trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus()};
 const sync=()=>{value.textContent=select.selectedOptions[0]?.textContent||'全部曲目';for(const option of menu.children){const active=option.dataset.value===select.value;option.setAttribute('aria-selected',String(active));option.tabIndex=active?0:-1}};
 for(const item of select.options){const option=document.createElement('button');option.type='button';option.role='option';option.dataset.value=item.value;const label=document.createElement('span');label.textContent=item.textContent;const check=document.createElement('span');check.className='theme-choice-check';check.innerHTML=appIcon('check');option.append(label,check);option.onclick=()=>{select.value=item.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true)};menu.append(option)}
 const open=()=>{sync();const rect=trigger.getBoundingClientRect();menu.style.width=Math.max(150,rect.width)+'px';menu.style.left=Math.min(rect.left,innerWidth-Math.max(150,rect.width)-12)+'px';menu.style.top=rect.bottom+6+'px';menu.style.maxHeight=Math.max(100,innerHeight-rect.bottom-18)+'px';menu.showPopover();trigger.setAttribute('aria-expanded','true');menu.querySelector('[aria-selected=true]')?.focus({preventScroll:true})};
 trigger.onclick=()=>menu.matches(':popover-open')?close():open();trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open()}};
 menu.onkeydown=e=>{const options=[...menu.children],index=options.indexOf(document.activeElement);let next=index;if(e.key==='ArrowDown')next=(index+1)%options.length;else if(e.key==='ArrowUp')next=(index+options.length-1)%options.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=options.length-1;else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return}else if(e.key==='Tab'){close(true);return}else return;e.preventDefault();options[next].focus()};
 document.addEventListener('pointerdown',e=>{if(menu.matches(':popover-open')&&!menu.contains(e.target)&&!trigger.contains(e.target))close()});$('homeView').addEventListener('scroll',()=>close(),{passive:true});window.addEventListener('resize',()=>close());select.addEventListener('change',sync);libraryFilterPicker={sync,close};sync();
}

/* 45-workspace.js */
// v0.3 project library, non-destructive editor, theme controls and portable exports.
function escName(s){return (s||'untitled').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,90)}
function nextId(prefix='song'){return prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)}
function baseProject(title,theme,dur=60000,interval=250){return normalize({id:nextId(),title,subtitle:'SKY MUSIC · NEW SONG',description:'',durationMs:dur,score:{mode:'grid',gridIntervalMs:interval,events:Array.from({length:Math.min(4000,Math.ceil(dur/interval))},(_,i)=>({timeMs:i*interval,notes:[],durationMs:0,velocity:85,confidence:'manual'}))},theme:{id:theme},playback:{tuning:'C',rate:1,sustain:PLAYER_RULES.sustain.default},provenance:{source:'手工新建',status:'未识谱'}})}
function createProject(){const title=$('createTitle').value.trim().slice(0,100);if(!title){$('createTitle').focus();$('createTitle').setAttribute('aria-invalid','true');$('createTitleError').hidden=false;return}const dur=clamp(Number($('createDuration').value)||60,5,3600)*1000;const step=clamp(Number($('createInterval').value)||250,40,5000);const theme=$('createTheme').value;let p=baseProject(title,theme,dur,step);state.library.unshift(p);saveLibrary();$('createDialog').close();renderLibrary();openSong(p.id);openEditor();toast('新项目已创建，现已进入曲谱编辑模式')}
function favoriteSong(id){let p=state.library.find(x=>x.id===id);if(!p)return;p.favorite=!p.favorite;saveLibrary();renderLibrary();toast(p.favorite?'已加入收藏':'已取消收藏')}
function duplicateSong(id){const source=state.library.find(p=>p.id===id);if(!source)return;const p=normalize({...copy(source),id:nextId('copy'),originKind:'user',title:source.title+' · 副本',provenance:{...source.provenance,source:'副本',derivedFrom:source.id}});p._imageUrl=source._imageUrl;p._imageBytes=source._imageBytes;state.library.unshift(p);saveLibrary();renderLibrary();toast('副本已存入「我的曲谱」，可以重命名和删除')}
function deleteSong(id){const p=state.library.find(x=>x.id===id);if(!p)return;if(p.originKind==='builtin'&&BUILTIN_IDS.has(id)){toast('内置歌曲不可删除，可复制为我的曲谱后删除副本',5000);return}state.pendingDeleteId=id;$('deleteWarning').textContent=`确定删除《${p.title}》？本地删除无法撤销，请先导出备份。`;$('deleteDialog').showModal()}
function deleteConfirmed(){let id=state.pendingDeleteId;state.pendingDeleteId=null;let p=state.library.find(x=>x.id===id);if(!p)return;if(p.originKind==='builtin'&&BUILTIN_IDS.has(id))return toast('不能删除内置曲目');state.library=state.library.filter(x=>x.id!==id);$('deleteDialog').close();if(state.project?.id===id){state.editMode=false;state.project=null;goHome()}saveLibrary();renderLibrary();toast('已移除曲目')}
function renameSong(id){let p=state.library.find(x=>x.id===id);if(!p)return;state.pendingSongId=id;$('renameInput').value=p.title;$('renameDialog').showModal();requestAnimationFrame(()=>$('renameInput').focus())}
function renameConfirmed(){const id=state.pendingSongId,p=state.library.find(x=>x.id===id);if(!p)return;let name=$('renameInput').value.trim().slice(0,120);if(!name){toast('歌曲名称不能为空');return}if(p.card?.title===p.title)p.card.title=name;p.title=name;if(state.project?.id===id){state.project.title=name;$('songTitle').textContent=name}state.pendingSongId=null;$('renameDialog').close();saveLibrary();renderLibrary();toast('已重命名为《'+name+'》')}
function historyItems(map,id){if(!map.has(id))map.set(id,[]);return map.get(id)}
function snapshot(p){return JSON.stringify({score:p.score,theme:p.theme,playback:p.playback,title:p.title,subtitle:p.subtitle,description:p.description,durationMs:p.durationMs,provenance:p.provenance})}
function editHistoryEntry(p,focusOverride=null){
 const selected=editingNoteSelection(),index=selected?scoreEvents(p).indexOf(selected.event):state.selected;
 return {data:snapshot(p),focus:focusOverride||{index,note:selected?.note,position:state.position}};
}
function rememberEditFor(p,focusOverride=null){let h=historyItems(state.history,p.id);h.push(editHistoryEntry(p,focusOverride));if(h.length>40)h.shift();state.future.set(p.id,[]);refreshHistoryButtons()}
function rememberEdit(focusOverride=null){if(state.project)rememberEditFor(state.project,focusOverride)}
function restoreSnapshot(p,entry){
 const view=rollFrame(),focus=typeof entry==='string'?{index:state.selected}:entry.focus,v=JSON.parse(typeof entry==='string'?entry:entry.data);
 for(const key of Object.keys(v))p[key]=v[key];state.rate=p.playback.rate;syncSpeedPicker();syncLoopControl();state.tuning=p.playback.tuning;state.sustain=p.playback.sustain;
 const events=scoreEvents(p),index=clamp(focus?.index??state.selected,0,Math.max(0,events.length-1)),event=events[index];state.selected=index;state.lastSelected=index;state.position=event?.timeMs??clamp(focus?.position??state.position,0,p.durationMs);
 scoreConsole.selection=event?.notes.length?{project:p,event,note:event.notes.includes(focus?.note)?focus.note:event.notes[0]}:null;
 settleFineRollView(view,event);state.page=-1;refreshWorkspace();
}
function undo(){let p=state.project;if(!p||!canEditScore())return;let stack=historyItems(state.history,p.id);if(!stack.length){toast('没有可撤销的修改');return}pauseSong();historyItems(state.future,p.id).push(editHistoryEntry(p));restoreSnapshot(p,stack.pop());toast('已撤销');saveLibrary()}
function redo(){let p=state.project;if(!p||!canEditScore())return;let stack=historyItems(state.future,p.id);if(!stack.length){toast('没有可恢复的修改');return}pauseSong();historyItems(state.history,p.id).push(editHistoryEntry(p));restoreSnapshot(p,stack.pop());toast('已重做');saveLibrary()}
function refreshHistoryButtons(){$('consoleUndo').disabled=!state.project||!historyItems(state.history,state.project.id).length;$('consoleRedo').disabled=!state.project||!historyItems(state.future,state.project.id).length}
function refreshWorkspace(){if(!state.project)return;let p=state.project;cancelRollFinish();state.position=clamp(state.position,0,p.durationMs);state.selected=clamp(state.selected,0,Math.max(0,scoreEvents(p).length-1));$('songTitle').textContent=p.title;$('songSubtitle').textContent=p.subtitle;$('durationHeader').textContent=durationFmt(p.durationMs);$('noteCountHeader').textContent=songNotes(p)+' NOTES';if(!state.editMode){$('seekSlider').max=p.durationMs;$('seekMax').textContent=durationFmt(p.durationMs)}$('speedSelect').value=String(state.rate);syncSustainControl();$('keySelect').value=state.tuning;$('instrumentSelect').value=p.playback.instrument||'offline';setTuningButtons();applyTheme();renderBeatGrid(true);renderKeyBoard();updateVisual();refreshHistoryButtons();if(state.editMode)syncEditorFields()}
function openEditor(){cancelScoreEntrance();cancelPlayerValueScroll();if(state.mode!=='player')return;if(state.editMode){requestFinishEdit('exit');return}pauseSong();scoreConsole.returnView=captureTimelineView();const src=state.project;state.editSource=src;state.project=normalize({...copy(src),_imageUrl:src._imageUrl,_imageBytes:src._imageBytes});state.editBaseline=snapshot(state.project);state.editDirty=false;state.editMode=true;applyTimelineView(scoreConsole.views.get(src.id)||{position:0,rollPageStart:0,windowSec:PLAYER_RULES.roll.initialSeconds});state.history.set(src.id,[]);state.future.set(src.id,[]);updateEditButton();refreshWorkspace();syncEditorFields();openScoreConsole();toast('已打开谱面编辑控制台')}
function switchEditTab(){/* Editing modes live in the shared standalone score console. */}
function syncEditorFields(){let p=state.project;if(!p)return;let e=scoreEvents(p)[state.selected];if(!e)return;$('editorEventIndex').textContent=`第 ${String(state.selected+1).padStart(3,'0')} 事件`;$('editorEventNames').textContent=eventLabel(e);$('eventTime').value=e.timeMs;$('eventDuration').value=e.durationMs;$('eventVelocity').value=e.velocity||85;$('eventConfidence').value=e.confidence||'unknown';$('metaTitle').value=p.title;$('metaSubtitle').value=p.subtitle;$('metaDescription').value=p.description||''}
function commitEventFields(){if(!canEditScore())return;let p=state.project,e=scoreEvents(p)[state.selected];if(!e)return;let t=Number($('eventTime').value),d=Number($('eventDuration').value),v=Number($('eventVelocity').value);if(![t,d,v].every(Number.isFinite)||t<0||t>36000000||d<0||d>10000||v<1||v>127){toast('时间、时值或力度超出范围');return}rememberEdit();e.timeMs=Math.round(t);e.durationMs=Math.round(d);e.velocity=Math.round(v);e.confidence='user-corrected';scoreEvents(p).sort((a,b)=>a.timeMs-b.timeMs);state.selected=scoreEvents(p).indexOf(e);state.position=e.timeMs;state.lastSelected=state.selected;p.durationMs=Math.max(p.durationMs,e.timeMs+e.durationMs);saveLibrary();refreshWorkspace();syncEditorFields();toast('事件已更新')}
function eventInsert(){let p=state.project;if(!p||!canEditScore())return;pauseSong();rememberEdit();let old=scoreEvents(p)[state.selected];let t=old?Math.min(p.durationMs,old.timeMs+Math.max(1,Math.round(p.score.gridIntervalMs||167))):state.position;let ev={timeMs:t,notes:[],durationMs:0,velocity:85,confidence:'manual'};let list=scoreEvents(p);list.push(ev);list.sort((a,b)=>a.timeMs-b.timeMs);state.selected=list.indexOf(ev);state.position=t;state.lastSelected=state.selected;p.durationMs=Math.max(p.durationMs,t+500);saveLibrary();refreshWorkspace();syncEditorFields();toast('已插入空白事件，可在15键面板添加音符')}
function eventRemove(){let p=state.project;if(!p||!canEditScore())return;let list=scoreEvents(p);if(list.length<=1){toast('乐谱至少保留一格');return}pauseSong();rememberEdit();list.splice(state.selected,1);state.selected=Math.min(state.selected,list.length-1);saveLibrary();refreshWorkspace();syncEditorFields();toast('事件已删除，可撤销')}
function batchTransform(kind){let p=state.project;if(!p||!canEditScore())return;pauseSong();let list=scoreEvents(p),grid=Number($('quantizeMs').value)||167,offset=Number($('offsetMs').value)||0,dur=Number($('batchDuration').value)||190,k=Number($('stretchFactor').value)||1;
 if(kind==='quantize'&&(grid<10||grid>2000))return toast('量化间隔需要10–2000 ms');if(kind==='stretch'&&(k<.25||k>4))return toast('伸缩系数需要0.25–4');rememberEdit();if(kind==='quantize')list.forEach(e=>e.timeMs=Math.round(e.timeMs/grid)*grid);if(kind==='offset')list.forEach(e=>e.timeMs=Math.max(0,e.timeMs+offset));if(kind==='duration')list.forEach(e=>{if(e.notes.length)e.durationMs=clamp(dur,30,4000)});if(kind==='stretch')list.forEach(e=>{e.timeMs=Math.round(e.timeMs*k);e.durationMs=Math.round(e.durationMs*k)});list.sort((a,b)=>a.timeMs-b.timeMs);p.durationMs=Math.max(500,Math.ceil(Math.max(...list.map(e=>e.timeMs+e.durationMs),0)+500));const focus=editingNoteSelection()?.event;state.selected=focus?list.indexOf(focus):0;state.position=focus?focus.timeMs:0;state.lastSelected=state.selected;saveLibrary();refreshWorkspace();toast('批量处理完成，可撤销')}
function saveSongInfo(){let p=state.project;if(!p||!canEditScore())return;rememberEdit();p.title=$('metaTitle').value.trim().slice(0,120)||'未命名乐曲';p.subtitle=$('metaSubtitle').value.trim().slice(0,150)||'SKY MUSIC';p.description=$('metaDescription').value.slice(0,600);saveLibrary();refreshWorkspace();renderLibrary();if($('metadataDialog').open)$('metadataDialog').close();toast('歌曲信息已更新，退出编辑时请选择保存方式')}
function themeEditor(){if(!state.project||!state.editMode)return toast('请先点击「曲谱编辑」');populateThemeChoices();syncThemeFields();$('sceneDialog').showModal()}
function syncThemeFields(){let t=state.project?.theme;if(!t)return;document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('is-active',b.dataset.scene===t.id));$('themeName').value=t.name||PRESETS[t.id]?.name||'';$('themeAccent').value=t.accent||'#e8c88a';$('themeBackground').value=t.backgroundColor||themeDefinition().appearance.stageEnd;$('themeSnow').value=t.snow??40;$('themeGlow').value=t.glow??58;$('themeMotion').value=t.motion==='off'?'off':'ambient'}
function chooseTheme(id){if(!state.editMode)return;setTheme(id);syncThemeFields()}
function applyThemeFields(){let t=state.project?.theme;if(!t||!state.editMode)return;rememberEdit();t.name=$('themeName').value.slice(0,60);t.accent=$('themeAccent').value;t.backgroundColor=$('themeBackground').value;t.snow=clamp(Number($('themeSnow').value),0,100);t.glow=clamp(Number($('themeGlow').value),0,100);t.motion=$('themeMotion').value;saveLibrary();applyTheme();toast('已应用场景设置，导出项目即可保存')}
async function uploadStageImage(file){if(!state.editMode)throw Error('请先进入编辑模式');if(!file||!file.type.startsWith('image/'))throw Error('请选择图片文件');if(file.size>12*1024*1024)throw Error('原图超过12 MB');let image=await createImageBitmap(file);let c=document.createElement('canvas'),ratio=Math.min(1,1400/image.width,800/image.height);c.width=Math.round(image.width*ratio);c.height=Math.round(image.height*ratio);let ctx=c.getContext('2d');ctx.drawImage(image,0,0,c.width,c.height);image.close?.();let blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',.88));if(!blob)throw Error('图片转换失败');rememberEdit();let bytes=new Uint8Array(await blob.arrayBuffer()),p=state.project;p._imageBytes=bytes;p.theme.customStage=true;p._imageUrl='data:image/webp;base64,'+bytesToBase64(bytes);saveLibrary();initializeScene();toast('舞台图片已装载。分享时请使用 .skymusic 导出完整素材')}
// Standard MIDI file type 0 (single track), 480 PPQ, 120 BPM, C/G/sky base mapping.
function vlq(n){n=Math.max(0,Math.floor(n));let buf=[n&127];while(n>>=7)buf.unshift((n&127)|128);return buf}
function u16(n){return[(n>>8)&255,n&255]}function u32(n){return[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]}
function exportMIDI(p){let all=[{tick:0,kind:'meta',bytes:[0xff,0x51,3,7,161,32]}];const base=KEY_ROOTS[p.playback.tuning]??60;for(let e of scoreEvents(p)){for(let n of e.notes){let midi=base+SCALE[n-1],tick=Math.round(e.timeMs*.96),end=Math.max(tick+1,Math.round((e.timeMs+Math.max(30,e.durationMs))*.96));all.push({tick,kind:'on',bytes:[0x90,midi,clamp(e.velocity||85,1,127)]});all.push({tick:end,kind:'off',bytes:[0x80,midi,0]})}}all.sort((a,b)=>a.tick-b.tick||({'off':0,meta:1,on:2}[a.kind]-{'off':0,meta:1,on:2}[b.kind]));let body=[],t=0;for(let e of all){body.push(...vlq(e.tick-t),...e.bytes);t=e.tick}body.push(0,0xff,0x2f,0);let out=[...('MThd').split('').map(c=>c.charCodeAt(0)),...u32(6),...u16(0),...u16(1),...u16(480),...('MTrk').split('').map(c=>c.charCodeAt(0)),...u32(body.length),...body];downloadBytes(escName(p.title)+'.mid',new Uint8Array(out),'audio/midi')}
function exportCSV(p){let lines=['step,time_ms,notes,duration_ms,velocity,confidence'];for(let [i,e] of scoreEvents(p).entries())lines.push([i+1,e.timeMs,e.notes.join('+'),e.durationMs,e.velocity||85,e.confidence||''].map(v=>String(v).replaceAll(',',';')).join(','));downloadBytes(escName(p.title)+'.csv',ENCODER.encode('\ufeff'+lines.join('\r\n')),'text/csv;charset=utf-8')}
function exportJSON(p){downloadBytes(escName(p.title)+'.json',ENCODER.encode(JSON.stringify(p,(_,v)=>v instanceof Uint8Array?undefined:v,2)),'application/json')}
let returnHomeAfterExport=false;
function openExport(afterSave=false,returnHome=false){if(!state.project)return;returnHomeAfterExport=returnHome;$('exportTitle').textContent=afterSave?'新曲谱已保存 · 导出文件':'导出乐曲';$('exportDescription').textContent=afterSave?'已在音乐库创建独立副本。请选择 .skymusic 保存完整单曲，或 .skytrack 保存纯谱面；也可以稍后导出。':'选择需要的格式，分享单曲请选择 .skymusic；接收方须先录入引用的 .skytheme 主题。';$('exportLater').hidden=!afterSave;$('exportDialog').showModal()}
function bindWorkspace(){
 populateThemeChoices();
 $('newSongBtn').onclick=()=>{$('createTitle').value='';$('createTitle').setCustomValidity('');$('createTitle').removeAttribute('aria-invalid');$('createTitleError').hidden=true;populateThemeChoices();$('createDialog').showModal();$('createTitle').focus()};$('libraryFilter').onchange=renderLibrary;$('createConfirm').onclick=createProject;bindCreateThemePicker();bindThemeRepository();
 $('scoreEditorBtn').onclick=openEditor;$('consoleUndo').onclick=undo;$('consoleRedo').onclick=redo;
 $('sceneEditorBtn').onclick=themeEditor;$('exportProject').onclick=()=>openExport();$('exportDialog').addEventListener('close',()=>{const home=returnHomeAfterExport;returnHomeAfterExport=false;if(home)returnHomeFromPlayer()});
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$((b.dataset.close)).close());
 $('batchEditorBtn').onclick=()=>setConsoleMode('fine');$('songInfoBtn').onclick=openSongInfo;$('renameConfirm').onclick=renameConfirmed;$('deleteConfirm').onclick=deleteConfirmed;$('renameInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();renameConfirmed()}};$('saveDirect').onclick=()=>completeEdit('direct');$('saveAsNew').onclick=()=>completeEdit('new');$('discardChanges').onclick=()=>completeEdit('discard');
 $('eventApply').onclick=commitEventFields;$('eventAdd').onclick=eventInsert;$('eventDelete').onclick=eventRemove;
 $('quantizeBtn').onclick=()=>batchTransform('quantize');$('offsetBtn').onclick=()=>batchTransform('offset');$('durationBtn').onclick=()=>batchTransform('duration');$('stretchBtn').onclick=()=>batchTransform('stretch');$('saveMetadata').onclick=saveSongInfo;
 document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>chooseTheme(b.dataset.scene));$('themeApplyBtn').onclick=applyThemeFields;$('stageImageBtn').onclick=()=>$('stageImageInput').click();$('stageImageInput').onchange=async e=>{let f=e.target.files?.[0];e.target.value='';if(f)try{await uploadStageImage(f)}catch(err){toast('图片导入失败：'+err.message,6000)}};
 $('stageImageClear').onclick=()=>{if(!state.project||!state.editMode)return;rememberEdit();state.project._imageBytes=null;state.project._imageUrl=null;state.project.theme.customStage=false;initializeScene();saveLibrary();toast('已恢复默认舞台')};$('themeExportBtn').onclick=()=>exportTheme(state.project);$('exportPlatform').onclick=()=>exportPlatformEntry(state.project);$('exportNative').onclick=()=>exportTrack(state.project);$('exportMidi').onclick=()=>exportMIDI(state.project);$('exportCsv').onclick=()=>exportCSV(state.project);$('exportJson').onclick=()=>exportJSON(state.project);$('exportThemeOnly').onclick=()=>exportTheme(state.project);
 $('importDropzone').onclick=()=>$('fileInput').click();$('openVideoImport').onclick=()=>{ $('importDialog').close();openVideoDialog() };
 let depth=0;window.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();depth++;$('globalDropHint').hidden=false});window.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files'))e.preventDefault()});window.addEventListener('dragleave',e=>{depth--;if(depth<=0){depth=0;$('globalDropHint').hidden=true}});window.addEventListener('drop',async e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();depth=0;$('globalDropHint').hidden=true;const files=[...e.dataTransfer.files];try{await importFiles(files)}catch(err){toast('导入失败：'+err.message,7000)}});
 document.addEventListener('keydown',e=>{if(MusicWorkbench.active||state.mode!=='player'||e.target.closest('input,select,textarea,[contenteditable]')||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();e.shiftKey?redo():undo()}else if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();redo()}else if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();openExport()}});
 refreshHistoryButtons()
}
// IndexedDB is an optional backup for project data and uploaded images. The .skymusic file is the portable source of truth.
let dbInstance=null,dbSaveTimer=0;
function openDb(){return new Promise((resolve,reject)=>{if(!window.indexedDB){resolve(null);return}let req=indexedDB.open('sky-music-studio-library-v03',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('library'))req.result.createObjectStore('library')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function dbRead(db){return new Promise((res,rej)=>{let tx=db.transaction('library','readonly'),r=tx.objectStore('library').get('projects');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function dbWrite(db,projects){return new Promise((res,rej)=>{let tx=db.transaction('library','readwrite');tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.objectStore('library').put(projects,'projects')})}
async function startDbBackup(){try{dbInstance=await openDb();if(!dbInstance)return;let stored=await dbRead(dbInstance);if(Array.isArray(stored))for(let old of stored.slice(0,50)){try{let p=normalize({...old,originKind:BUILTIN_IDS.has(old.id)?'builtin':(old.originKind||'user')});p._imageBytes=old._imageBytes||null;p._imageUrl=old._imageUrl||null;let idx=state.library.findIndex(s=>s.id===p.id);
 // The synchronous library is the latest save; the debounced backup may be older.
 if(idx>=0&&LOCALLY_LOADED_IDS.has(p.id)){const current=state.library[idx];if(current.theme.customStage&&!current._imageUrl&&p.theme.customStage){current._imageBytes=p._imageBytes;current._imageUrl=p._imageUrl}continue}
 if(idx>=0)state.library[idx]=p;else state.library.push(p)}catch(err){console.warn('跳过损坏的缓存项目',err)}}renderLibrary()}catch(err){console.warn('持久化存储不可用，建议导出工程文件',err)}}
function scheduleDbBackup(){if(!dbInstance)return;clearTimeout(dbSaveTimer);dbSaveTimer=setTimeout(()=>dbWrite(dbInstance,state.library).catch(e=>console.warn('DB 保存失败',e)),450)}

/* 46-score-console.js */
// One editing work copy, three views of the same score and player controls.
const scoreConsole={mode:PLAYER_RULES.editor.initialMode,recording:false,start:0,at:0,raf:0,homes:[],fine:null,views:new Map(),returnView:null};
function setConsoleMode(mode){
 closeConsoleRangePicker();stopConsoleRecording();scoreConsole.mode=mode;const fine=mode==='fine',generate=mode==='generate';
 $('scoreConsole').dataset.mode=mode;$('consoleEditActions').parentElement.scrollTop=0;$('rollCanvas').title=fine?'点击音符选中；横向拖动改时间，纵向拖动改音高，拖动右边缘改长度':mode==='record'?'点击已有音符选中，再使用音符移动按钮；点击空白处定位':'点击或拖动扫描条定位，松开后保持暂停';
 for(const button of document.querySelectorAll('[data-console-mode]')){const on=button.dataset.consoleMode===mode;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1}
 $('consoleLayout').setAttribute('aria-labelledby',mode==='fine'?'consoleFineTab':generate?'consoleGenerateTab':'consoleRecordTab');
 $('consoleKeysSlot').hidden=mode!=='record';$('consoleGridSlot').hidden=!generate;$('consoleRecordControls').hidden=mode!=='record';$('consoleGenerateControls').hidden=!generate;$('consoleBatchControls').hidden=!fine;$('consoleInspectorSlot').hidden=!fine;
 renderBeatGrid(true);renderKeyBoard();updateVisual();requestAnimationFrame(()=>{drawRoll();initializeScene()});
}
function openScoreConsole(){
 if(!state.editMode)return;if(!document.createComment){$('scoreConsole').showModal();return;}
 if(!$('scoreConsole').open){pauseSong();scoreConsole.homes=[];for(const [selector,slot] of [['.roll-pane','consoleRollSlot'],['.keys-pane','consoleKeysSlot'],['.grid-pane','consoleGridSlot']]){const panel=document.querySelector(selector),marker=document.createComment('player-panel');panel.before(marker);scoreConsole.homes.push({panel,marker});$(slot).append(panel)}$('scoreConsole').showModal()}
 applyPlayerTemplate(state.project,$('scoreConsole'));setConsoleMode(scoreConsole.mode);syncEditorFields();updateScoreConsole();
}
function closeScoreConsole(){
 closeConsoleRangePicker(); if(!document.createComment){$('scoreConsole').close();return}stopConsoleRecording();pauseSong();scoreConsole.fine=null;
 if($('scoreConsole').open)$('scoreConsole').close();for(const {panel,marker} of scoreConsole.homes){marker.replaceWith(panel)}scoreConsole.homes=[];renderBeatGrid(true);renderKeyBoard();updateVisual();requestAnimationFrame(()=>{drawRoll();initializeScene()});
}
function updateScoreConsole(){
 if(!$('scoreConsole')?.open)return;$('consoleClock').textContent=positionFmt(state.position);$('consolePlay').textContent=state.isPlaying?'暂停':'播放';$('consoleTuning').value=state.tuning;syncConsoleRangePicker();
 $('consoleUndo').disabled=!historyItems(state.history,state.project.id).length;$('consoleRedo').disabled=!historyItems(state.future,state.project.id).length;
 $('consoleStatus').textContent=scoreConsole.recording?'录制中 · 所有改动可撤销':state.editDirty?'工作副本已修改 · 尚未保存':'编辑工作副本，保存后生效';
 const event=scoreEvents(state.project)[state.selected];for(const button of $('consoleNoteKeys').children)button.setAttribute('aria-pressed',String(event?.notes.includes(Number(button.dataset.note))));
 const selection=editingNoteSelection();for(const button of document.querySelectorAll('[data-note-move]'))button.disabled=!selection||(button.dataset.noteMove==='up'&&selection.note===15)||(button.dataset.noteMove==='down'&&selection.note===1)||(button.dataset.noteMove==='left'&&selection.event.timeMs===0);
}
const consoleHeldKeys=new Set();let consoleInputChord=null;
function clearConsoleChord(){consoleHeldKeys.clear();consoleInputChord=null}
function stopConsoleRecording(){clearConsoleChord();scoreConsole.recording=false;cancelAnimationFrame(scoreConsole.raf);if($('consoleRecordStart'))$('consoleRecordStart').textContent='开始输入'}
function startConsoleRecording(){
 if(scoreConsole.recording){stopConsoleRecording();updateScoreConsole();toast('已结束输入');return}pauseSong();scoreConsole.recording=true;$('consoleRecordStart').textContent='结束输入';updateScoreConsole();toast('已开始输入旋律');
}
function consoleNumber(id,min,max){const value=Number($(id).value);if(!Number.isFinite(value)||value<min||value>max)throw Error('参数超出范围：'+$(id).parentElement.textContent);return value}
function scoreConsoleCapture(note,keyboardChord=false){
 if(!$('scoreConsole')?.open||scoreConsole.mode!=='record'||!canEditScore()||$('consoleKeymapDialog').open)return false;
 if(keyboardChord&&consoleInputChord?.project===state.project&&scoreEvents(state.project).includes(consoleInputChord.event)&&state.position===consoleInputChord.nextPosition){const event=consoleInputChord.event;if(!event.notes.includes(note)){event.notes.push(note);event.notes.sort((a,b)=>a-b);state.selected=scoreEvents(state.project).indexOf(event);state.lastSelected=state.selected;scoreConsole.selection={project:state.project,event,note};scoreConsole.selectedNote=note;saveLibrary();refreshWorkspace();preloadPiano().then(()=>triggerSample(note,state.audioCtx.currentTime+.01,event.durationMs)).catch(()=>{})}return true}
 consoleInputChord=null;
 try{const step=consoleNumber('consoleInterval',20,5000),duration=consoleNumber('consoleNoteDuration',30,10000),time=Math.round(state.position),insert=$('consoleRecordMode').value==='insert',events=scoreEvents(state.project);
 if(events.length>=100000||Math.max(state.project.durationMs,time+duration)+step>36000000)throw Error('输入内容超出曲谱上限');pauseSong();rememberEdit();if(!scoreConsole.recording)startConsoleRecording();
 if(insert){for(const e of events)if(e.timeMs>=time)e.timeMs+=step;state.project.durationMs+=step}else{state.project.score.events=events.filter(e=>e.timeMs<time||e.timeMs>=time+step)}
 const event={timeMs:time,notes:[note],durationMs:duration,velocity:85,confidence:'recorded'},list=scoreEvents(state.project);list.push(event);list.sort((a,b)=>a.timeMs-b.timeMs);state.project.durationMs=Math.max(state.project.durationMs,time+step,time+duration);state.selected=list.indexOf(event);scoreConsole.selection={project:state.project,event,note};scoreConsole.selectedNote=note;state.position=time+step;state.lastSelected=state.selected;if(keyboardChord)consoleInputChord={project:state.project,event,nextPosition:state.position};saveLibrary();refreshWorkspace();preloadPiano().then(()=>triggerSample(note,state.audioCtx.currentTime+.01,duration)).catch(()=>{});
 }catch(error){stopConsoleRecording();toast(error.message,5000)}return true;
}
function generateConsoleScore(){
 try{const step=consoleNumber('consoleGenerateInterval',20,5000),lines=$('consoleNumberScore').value.trim().split(/\r?\n/);if(!lines[0]||lines.length>4000)throw Error('请输入1–4000行数字谱');const start=state.position;
 const events=lines.map((line,index)=>{const text=line.trim(),notes=text==='0'?[]:text.split(/[+\s,，]+/).map(Number);if(!text||notes.some(n=>!Number.isInteger(n)||n<1||n>15))throw Error('第 '+(index+1)+' 行需要1–15音符或0休止');return {timeMs:Math.round(start+index*step),notes:[...new Set(notes)],durationMs:notes.length?Math.min(190,step):0,velocity:85,confidence:'generated'}});
 if(start+lines.length*step>36000000||scoreEvents(state.project).length+events.length>100000)throw Error('生成内容超出曲谱上限');pauseSong();rememberEdit();state.project.score.events.push(...events);state.project.score.events.sort((a,b)=>a.timeMs-b.timeMs);state.project.durationMs=Math.max(state.project.durationMs,start+lines.length*step);saveLibrary();refreshWorkspace();toast('已插入 '+events.length+' 个事件，可撤销');
 }catch(error){toast(error.message,6000)}
}
function beginFineNoteDrag(event,canvas){
 if(!$('scoreConsole')?.open||!['fine','record'].includes(scoreConsole.mode))return false;
 const rect=canvas.getBoundingClientRect(),frame=rollFrame(),g=rollPlotGeometry(rect,frame),x=event.clientX-rect.left,y=event.clientY-rect.top,rowH=(rect.height-g.top-g.bottom)/15,note=15-Math.floor((y-g.top)/rowH);if(note<1||note>15)return false;
 const list=scoreEvents(state.project),time=frame.begin+(x-g.left)/g.plotW*frame.windowMs;
 const hit=[...list].reverse().find(e=>e.notes.includes(note)&&time>=e.timeMs&&time<=e.timeMs+(scoreConsole.mode==='record'?Math.min(22,Math.max(3,(e.durationMs||180)/frame.windowMs*g.plotW)):Math.max(4,e.durationMs/frame.windowMs*g.plotW))*frame.windowMs/g.plotW);if(!hit)return false;
 if(scoreConsole.mode==='record'){event.preventDefault();stopConsoleRecording();pauseSong();scoreConsole.selectedNote=note;scoreConsole.selection={project:state.project,event:hit,note};state.selected=list.indexOf(hit);state.position=hit.timeMs;state.lastSelected=state.selected;renderBeatGrid(true);renderKeyBoard();updateVisual();syncEditorFields();return true}
 event.preventDefault();pauseSong();let chosen=hit,split=false;if(hit.notes.length>1){rememberEdit({index:list.indexOf(hit),note,position:hit.timeMs});chosen={...copy(hit),notes:[note]};hit.notes=hit.notes.filter(n=>n!==note);list.push(chosen);list.sort((a,b)=>a.timeMs-b.timeMs);saveLibrary();split=true}const endX=g.left+(hit.timeMs+hit.durationMs-frame.begin)/frame.windowMs*g.plotW;
 scoreConsole.fine={pointerId:event.pointerId,canvas,event:chosen,note,frame,g,rect,x,y,time:hit.timeMs,duration:hit.durationMs,resize:Math.abs(x-endX)<Math.min(5,Math.max(1,hit.durationMs/frame.windowMs*g.plotW*.25)),changed:split};
 scoreConsole.selectedNote=note;scoreConsole.selection={project:state.project,event:chosen,note};state.selected=list.indexOf(chosen);state.position=hit.timeMs;state.lastSelected=state.selected;renderBeatGrid(true);renderKeyBoard();updateVisual();syncEditorFields();canvas.setPointerCapture(event.pointerId);return true;
}
function bindScoreConsole(){
 if(!document.createComment)return;
 $('consoleClose').onclick=()=>requestFinishEdit('exit');$('scoreConsole').addEventListener('cancel',event=>{event.preventDefault();requestFinishEdit('exit')});$('saveChoiceDialog').addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation()});
 for(const button of document.querySelectorAll('[data-console-mode]')){button.onclick=()=>setConsoleMode(button.dataset.consoleMode);button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...document.querySelectorAll('[data-console-mode]')],index=buttons.indexOf(button),next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;setConsoleMode(buttons[next].dataset.consoleMode);buttons[next].focus()}}}
 $('consoleSave').onclick=()=>{stopConsoleRecording();requestFinishEdit('exit')};$('consoleUndo').onclick=undo;$('consoleRedo').onclick=redo;$('consolePrev').onclick=()=>stepConsoleEvent(-1);$('consoleNext').onclick=()=>stepConsoleEvent(1);$('consolePlay').onclick=()=>{stopConsoleRecording();playPause()};$('consoleRecordStart').onclick=startConsoleRecording;$('consoleGenerate').onclick=generateConsoleScore;
 $('consoleTuning').innerHTML=$('keySelect').innerHTML;$('consoleTuning').onchange=event=>{$('keySelect').value=event.target.value;$('keySelect').onchange({target:$('keySelect')})};bindConsoleRangePicker();
 for(let n=1;n<=15;n++){const button=document.createElement('button');button.textContent=n;button.dataset.note=n;button.setAttribute('aria-label','当前事件音符 '+n);button.onclick=()=>toggleNote(n);$('consoleNoteKeys').append(button)}
 bindConsoleKeymap();for(const button of document.querySelectorAll('[data-write-mode]'))button.onclick=()=>{stopConsoleRecording();$('consoleRecordMode').value=button.dataset.writeMode;for(const b of document.querySelectorAll('[data-write-mode]'))b.setAttribute('aria-pressed',String(b===button));toast(button.dataset.writeMode==='insert'?'插入模式：后续序列整体后移':'覆写模式：替换当前一步内的事件')};
 for(const button of document.querySelectorAll('[data-note-move]'))button.onclick=()=>moveConsoleNote(button.dataset.noteMove);
 $('scoreConsole').addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey){if(event.code==='KeyS'){event.preventDefault();stopConsoleRecording();requestFinishEdit('exit')}if(event.code==='KeyZ'){event.preventDefault();event.shiftKey?redo():undo()}if(event.code==='KeyY'){event.preventDefault();redo()}return}if(event.altKey||event.isComposing||event.target.closest('input,select,textarea,[contenteditable]'))return;const note=consoleKeymap.indexOf(event.code)+1;if(note&&scoreConsole.mode==='record'){event.preventDefault();event.stopPropagation();if(!event.repeat&&!consoleHeldKeys.has(event.code)){consoleHeldKeys.add(event.code);scoreConsoleCapture(note,true)}}else if(event.code==='Space'&&!event.target.closest('button')){event.preventDefault();$('consolePlay').click()}});
 document.addEventListener('keyup',event=>{consoleHeldKeys.delete(event.code);if(!consoleHeldKeys.size)consoleInputChord=null});window.addEventListener('blur',clearConsoleChord);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearConsoleChord()});
 const canvas=$('rollCanvas');canvas.addEventListener('pointermove',event=>{const drag=scoreConsole.fine;if(!drag||drag.pointerId!==event.pointerId)return;const dx=event.clientX-drag.rect.left-drag.x,dy=event.clientY-drag.rect.top-drag.y;if(!drag.changed&&Math.abs(dx)+Math.abs(dy)<3)return;
 if(!drag.changed){rememberEdit();if(drag.event.notes.length>1){drag.event.notes=drag.event.notes.filter(n=>n!==drag.note);drag.event={...copy(drag.event),notes:[drag.note]};scoreEvents(state.project).push(drag.event)}drag.changed=true}
 const step=state.project.score.gridIntervalMs,delta=dx/drag.g.plotW*drag.frame.windowMs;
 if(drag.resize)drag.event.durationMs=clamp(Math.round((drag.duration+delta)/10)*10,30,10000);else{drag.event.timeMs=clamp(Math.round((drag.time+delta)/step)*step,Math.max(0,drag.frame.begin),Math.min(35990000,drag.frame.end-.001));const rowH=(drag.rect.height-drag.g.top-drag.g.bottom)/15;drag.event.notes=[clamp(drag.note-Math.round(dy/rowH),1,15)]}
 const list=scoreEvents(state.project);list.sort((a,b)=>a.timeMs-b.timeMs);state.selected=list.indexOf(drag.event);state.lastSelected=state.selected;state.position=clamp(drag.event.timeMs,drag.frame.begin,drag.frame.end);state.rollPageStart=drag.frame.begin;state.project.durationMs=Math.max(state.project.durationMs,drag.event.timeMs+drag.event.durationMs);saveLibrary();renderBeatGrid(true);renderKeyBoard();updateVisual();syncEditorFields();
 });
 const end=()=>{if(scoreConsole.fine){scoreConsole.fine=null;refreshWorkspace()}};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
}

function stepConsoleEvent(direction){pauseSong();const events=scoreEvents(state.project),index=clamp(state.selected+direction,0,events.length-1);if(!events[index])return;seekTo(events[index].timeMs);state.selected=index;scoreConsole.selection={project:state.project,event:events[index],note:events[index].notes[0]};state.lastSelected=index;renderKeyBoard();updateVisual();syncEditorFields()}

// Editing operations retain the current view unless their target leaves it.
function settleFineRollView(view,event){
 if(!$('scoreConsole')?.open||scoreConsole.mode!=='fine'||!event)return;
 const drag=scoreConsole.fine;scoreConsole.fine=null;if(drag&&drag.canvas.hasPointerCapture(drag.pointerId))drag.canvas.releasePointerCapture(drag.pointerId);
 cancelRollFinish();const time=event.timeMs,duration=state.project.durationMs,windowMs=state.windowSec*1000;
 const inside=time>=view.begin&&time<view.end||(time===duration&&time===view.end);
 if(inside){state.rollPageStart=view.begin;return}
 const lastStart=Math.floor(Math.max(0,duration-.001)/windowMs)*windowMs;
 state.rollPageStart=time<windowMs?0:time>=lastStart?lastStart:clamp(time-windowMs*PLAYER_RULES.editor.crossPageFocusFraction,0,lastStart);
}

function moveConsoleNote(direction){
 if(!canEditScore())return;const selection=editingNoteSelection();if(!selection)return;const {event,note}=selection,step=state.project.score.gridIntervalMs,vertical=direction==='up'||direction==='down',nextNote=vertical?clamp(note+(direction==='up'?1:-1),1,15):note,nextTime=vertical?event.timeMs:clamp(event.timeMs+(direction==='right'?step:-step),0,35990000);
 if(nextNote===note&&nextTime===event.timeMs)return;pauseSong();stopConsoleRecording();const view=rollFrame();rememberEdit({index:scoreEvents(state.project).indexOf(event),note,position:state.position});let target=event;
 if(event.notes.length>1){target={...copy(event),notes:[note]};event.notes=event.notes.filter(n=>n!==note);scoreEvents(state.project).push(target)}target.notes=[nextNote];target.timeMs=nextTime;target.confidence='user-corrected';const list=scoreEvents(state.project);list.sort((a,b)=>a.timeMs-b.timeMs);state.selected=list.indexOf(target);state.lastSelected=state.selected;state.position=nextTime;scoreConsole.selection={project:state.project,event:target,note:nextNote};scoreConsole.selectedNote=nextNote;state.project.durationMs=Math.max(state.project.durationMs,nextTime+target.durationMs);settleFineRollView(view,target);saveLibrary();refreshWorkspace();toast(vertical?'音高已移动一键':'音符已移动一个网格');
}

const CONSOLE_KEYMAP_STORAGE='sky-studio-keymap-v1';
const validConsoleCode=code=>typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code);
let consoleKeymap=[...PLAYER_RULES.editor.keyboardCodes],consoleKeymapDraft=null,consoleKeymapPending=-1;
function keymapLabel(code){return code.replace('Key','').replace('Digit','').replace('Numpad','数字键盘 ')}
function renderConsoleKeymap(){
 const grid=$('consoleKeymapGrid');grid.innerHTML='';for(let n=0;n<15;n++){const b=document.createElement('button');b.type='button';b.textContent=String(n+1).padStart(2,'0')+' · '+keymapLabel(consoleKeymapDraft[n]);b.setAttribute('aria-label','音键 '+(n+1)+'，当前按键 '+keymapLabel(consoleKeymapDraft[n]));b.setAttribute('aria-pressed',String(n===consoleKeymapPending));b.onclick=()=>{consoleKeymapPending=n;renderConsoleKeymap();$('consoleKeymapHelp').textContent='请按下音键 '+(n+1)+' 对应的字母或数字键（Escape取消此次绑定）';grid.children[n].focus()};grid.append(b)}
}
function bindConsoleKeymap(){
 try{const saved=JSON.parse(localStorage.getItem(CONSOLE_KEYMAP_STORAGE)||'null');if(Array.isArray(saved)&&saved.length===15&&saved.every(validConsoleCode)&&new Set(saved).size===15)consoleKeymap=saved}catch(error){console.warn('按键映射读取失败',error)}
 $('consoleKeymapOpen').onclick=()=>{stopConsoleRecording();consoleKeymapDraft=[...consoleKeymap];consoleKeymapPending=-1;renderConsoleKeymap();$('consoleKeymapHelp').textContent='点击音键，再按字母或数字键。重复按键会交换位置。';syncDialogAppearance();$('consoleKeymapDialog').showModal()};
 $('consoleKeymapReset').onclick=()=>{consoleKeymapDraft=[...PLAYER_RULES.editor.keyboardCodes];consoleKeymapPending=-1;renderConsoleKeymap();$('consoleKeymapHelp').textContent='已恢复默认，点击保存映射后生效。'};
 $('consoleKeymapSave').onclick=()=>{try{localStorage.setItem(CONSOLE_KEYMAP_STORAGE,JSON.stringify(consoleKeymapDraft));consoleKeymap=[...consoleKeymapDraft];$('consoleKeymapDialog').close();toast('已保存15键映射')}catch(error){$('consoleKeymapHelp').textContent='保存失败，请检查浏览器存储设置。'}};
 $('consoleKeymapDialog').addEventListener('keydown',e=>{if(consoleKeymapPending<0)return;if(e.code==='Escape'){e.preventDefault();e.stopPropagation();consoleKeymapPending=-1;renderConsoleKeymap();$('consoleKeymapHelp').textContent='已取消此次绑定。';return}if(e.code==='Tab')return;e.preventDefault();e.stopPropagation();if(e.repeat)return;if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||!validConsoleCode(e.code)){$('consoleKeymapHelp').textContent='请选择单独的字母或数字键，保留空格、方向键及组合快捷键。';return}const index=consoleKeymapPending,other=consoleKeymapDraft.indexOf(e.code);if(other>=0)consoleKeymapDraft[other]=consoleKeymapDraft[index];consoleKeymapDraft[index]=e.code;consoleKeymapPending=-1;renderConsoleKeymap();$('consoleKeymapHelp').textContent='音键 '+(index+1)+' 已设为 '+keymapLabel(e.code)+'，保存后生效。'});
}

// Each surface owns its own navigation state; score data is the only shared result.
function captureTimelineView(){const frame=rollFrame();return {position:state.position,rollPageStart:frame.begin,windowSec:state.windowSec}}
function applyTimelineView(view){
 if(!view)return;cancelRollFinish();state.windowSec=PLAYER_RULES.roll.windowsSeconds.includes(view.windowSec)?view.windowSec:PLAYER_RULES.roll.initialSeconds;
 state.position=clamp(view.position,0,state.project.durationMs);state.rollPageStart=view.position>state.project.durationMs||view.rollPageStart>=state.project.durationMs?Math.floor(Math.max(0,state.project.durationMs-.001)/(state.windowSec*1000))*state.windowSec*1000:view.rollPageStart;rollFrame();state.selected=beatIndex(state.position);state.lastSelected=-1;state.page=-1;$('rollWindow').value=String(state.windowSec);
}

/* 47-edit-session.js */
function canEditScore(){return Boolean(state.editMode&&$('scoreConsole').open&&!$('saveChoiceDialog').open)}
// Transactional score editing. The public library copy remains untouched until Save.
function updateEditButton(){
 const on=Boolean(state.editMode),p=$('playerView');if(!p)return;
 p.classList.toggle('editing',on);
 const b=$('scoreEditorBtn');setControlContent(b,'edit','曲谱编辑');
 b.classList.toggle('has-changes',on&&state.editDirty);
 const hint=$('gridHint');if(hint)hint.textContent=on?'点击节拍选择事件':'点击节拍可查看';
 const info=$('saveMetadata');if(info)info.hidden=!on;
}
function requestFinishEdit(action='exit'){
 closeConsoleRangePicker(); if(!state.editMode){if(action==='home')goHome();return}
 stopConsoleRecording();pauseSong();cancelRollDrag();const drag=scoreConsole.fine;scoreConsole.fine=null;if(drag&&drag.canvas.hasPointerCapture(drag.pointerId))drag.canvas.releasePointerCapture(drag.pointerId);
 state.pendingEditAction=action;
 if(!$('saveChoiceDialog').open)$('saveChoiceDialog').showModal();
}
function completeEdit(kind){
 if(!state.editMode)return;
 const editorView=captureTimelineView();closeScoreConsole();pauseSong();
 const action=state.pendingEditAction||'exit',working=state.project,original=state.editSource;
 let chosen=original;
 if(kind==='direct'||kind==='new')trimTrailingRests(working);
 if(kind==='direct'){
  const idx=state.library.findIndex(p=>p.id===original.id);
  if(idx<0){toast('找不到原曲，无法直接保存');return}
  state.library[idx]=working;chosen=working;
 }else if(kind==='new'){
  chosen=normalize({...copy(working),id:nextId('copy'),title:working.title+' · 新曲谱',originKind:'user',provenance:{...working.provenance,source:'用户另存为',derivedFrom:original.id}});
  chosen._imageUrl=working._imageUrl;chosen._imageBytes=working._imageBytes;
  state.library.unshift(chosen);
 }else if(kind!=='discard')return;
 if($('saveChoiceDialog').open)$('saveChoiceDialog').close();
 state.project=chosen;state.editMode=false;state.editDirty=false;state.editSource=null;state.editBaseline=null;state.pendingEditAction=null;
 scoreConsole.views.set(original.id,editorView);if(kind==='new')scoreConsole.views.set(chosen.id,{...editorView});const playerView=scoreConsole.returnView;scoreConsole.returnView=null;applyTimelineView(playerView);
 state.history.delete(original.id);state.future.delete(original.id);updateEditButton();
 saveLibrary();
 if(action==='home'&&kind!=='new'){returnHomeFromPlayer();return}
 try{history.replaceState(null,'','#song='+encodeURIComponent(chosen.id))}catch(error){}
 state.rate=chosen.playback?.rate||1;state.volume=normalizeVolume(chosen.playback?.volume);syncSpeedPicker();syncVolumeControl();
 state.tuning=chosen.playback?.tuning||'C';state.sustain=chosen.playback?.sustain??PLAYER_RULES.sustain.default;
 refreshWorkspace();renderLibrary();saveLibrary();
 toast(kind==='new'?'已另存为新曲谱，请选择导出格式':kind==='direct'?'已保存，已结束编辑':'已结束编辑，未保存修改');
 if(kind==='new')openExport(true,action==='home');
}
function openSongInfo(){if(!state.project)return;syncEditorFields();for(let id of ['metaTitle','metaSubtitle','metaDescription'])$(id).readOnly=!state.editMode;$('saveMetadata').hidden=!state.editMode;$('metadataDialog').showModal()}

/* 50-music-model.js */
// Canonical musical data. Milliseconds are a derived playback view, never a second editor.
const Music={PPQ:960,serial:0,id(prefix='n'){return prefix+'-'+Date.now().toString(36)+'-'+(++this.serial).toString(36)},pitch(n){return SEMIS[((n%12)+12)%12]+(Math.floor(n/12)-1)},assert(ok,message){if(!ok)throw Error(message)}};
Music.blank=function(bpm=120,meter=[4,4],key='C'){return {format:'skytrack',schemaVersion:2,ppq:960,timeUnit:'tick',calibrated:true,key,scale:'major',tempoMap:[{tick:0,bpm}],meterMap:[{tick:0,numerator:meter[0],denominator:meter[1]}],tracks:[{id:Music.id('track'),name:'钢琴',instrument:'offline',volume:1,mute:false,solo:false}],notes:[],rests:[],lengthTicks:7680,source:{type:'new'}}};
Music.validate=function(raw){
 const c=copy(raw);Music.assert(c?.format==='skytrack'&&c.schemaVersion===2&&c.ppq===960&&c.timeUnit==='tick','不支持的音乐谱面版本');
 Music.assert(Array.isArray(c.tracks)&&c.tracks.length>0&&c.tracks.length<=64,'需要1–64条音轨');Music.assert(Array.isArray(c.notes)&&c.notes.length<=100000,'音符数量超出限制');
 const tids=new Set();for(const t of c.tracks){Music.assert(typeof t.id==='string'&&!tids.has(t.id),'音轨ID重复');tids.add(t.id);t.name=String(t.name||'音轨').slice(0,80);t.instrument=instrumentSpec(t.instrument).id;Music.assert(Number.isFinite(Number(t.volume??1)),'音轨音量无效');t.volume=clamp(Number(t.volume??1),0,2);t.mute=!!t.mute;t.solo=!!t.solo}
 for(const [name,check]of [['tempoMap',m=>Number.isFinite(m.bpm)&&m.bpm>=1&&m.bpm<=999],['meterMap',m=>Number.isInteger(m.numerator)&&m.numerator>=1&&m.numerator<=32&&[1,2,4,8,16,32].includes(m.denominator)]]){Music.assert(Array.isArray(c[name])&&c[name].length&&c[name].length<=10000,'缺少速度或拍号');c[name].sort((a,b)=>a.tick-b.tick);Music.assert(c[name][0].tick===0,'速度和拍号必须从0开始');let last=-1;for(const m of c[name]){Music.assert(Number.isFinite(m.tick)&&m.tick>=0&&m.tick>last&&check(m),'速度或拍号标记无效');last=m.tick}}
 for(let i=1;i<c.meterMap.length;i++){const prev=c.meterMap[i-1],size=prev.numerator*3840/prev.denominator;Music.assert(Math.abs((c.meterMap[i].tick-prev.tick)/size-Math.round((c.meterMap[i].tick-prev.tick)/size))<1e-7,'拍号变更必须位于小节边界')}
 const ids=new Set();for(const n of c.notes){Music.assert(typeof n.id==='string'&&!ids.has(n.id)&&tids.has(n.trackId),'音符ID或音轨无效');ids.add(n.id);Music.assert(Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127,'音高必须为MIDI 0–127');Music.assert([n.startTick,n.durationTicks,n.soundTicks].every(Number.isFinite)&&n.startTick>=0&&n.durationTicks>0&&n.soundTicks>=0,'音符时间无效');n.velocity=clamp(Math.round(Number(n.velocity)||85),1,127);n.gate=Number.isFinite(n.gate)?clamp(n.gate,0,2):n.soundTicks/n.durationTicks}
 const byId=new Map(c.notes.map(n=>[n.id,n]));for(const n of c.notes)if(n.tieNext){const next=byId.get(n.tieNext);if(!next||next.pitch!==n.pitch||next.trackId!==n.trackId||Math.abs(next.startTick-n.startTick-n.durationTicks)>1e-6)delete n.tieNext;} c.rests=Array.isArray(c.rests)?c.rests:[];Music.assert(c.rests.length<=100000,'休止数量超出限制');Music.assert(c.rests.every(r=>tids.has(r.trackId)&&Number.isFinite(r.startTick)&&r.startTick>=0&&Number.isFinite(r.durationTicks)&&r.durationTicks>0),'休止符无效');c.lengthTicks=c.notes.reduce((end,n)=>Math.max(end,n.startTick+Math.max(n.durationTicks,n.soundTicks)),Number(c.lengthTicks)||0);c.lengthTicks=c.rests.reduce((end,r)=>Math.max(end,r.startTick+r.durationTicks),c.lengthTicks);Music.assert(Music.tickMs(c,c.lengthTicks)<=36000000,'谱面不能超过10小时');c.key=Object.hasOwn(KEY_ROOTS,c.key)?c.key:'C';c.scale=c.scale==='minor'?'minor':'major';return c;
};
Music.meterAt=function(c,tick){return Music.search(Music.meterIndex(c),tick,'tick')};
Music.label=function(c,tick){const p=Music.barPosition(c,tick);return p.bar+'.'+p.beat+'.'+Math.round(p.tick*100)/100};
Music.value=function(denominator,modifier='plain'){return 3840/Number(denominator)*(modifier==='dot'?1.5:modifier==='triplet'?2/3:1)};
Music.fromLegacy=function(p){const c=Music.blank();c.calibrated=false;c.key=p.playback?.tuning==='sky-original'?'C':p.playback?.tuning||'C';c.source={type:'legacy',originalScore:copy(p.score),originalTuning:p.playback?.tuning||c.key,originalDurationMs:p.durationMs};c.tracks[0].instrument=p.playback?.instrument||'offline';c.lengthTicks=Music.msTick(c,p.durationMs);const trackId=c.tracks[0].id;for(const e of scoreEvents(p)){const startTick=Music.msTick(c,e.timeMs),soundTicks=Music.msTick(c,e.timeMs+e.durationMs)-startTick;if(!e.notes.length)c.rests.push({id:Music.id('rest'),trackId,startTick,durationTicks:Math.max(1,Music.msTick(c,e.timeMs+(p.score.gridIntervalMs||167))-startTick)});for(const key of e.notes)c.notes.push({id:Music.id(),trackId,pitch:noteMidi(key,p.playback?.tuning),startTick,durationTicks:Math.max(1,soundTicks),soundTicks,gate:1,velocity:e.velocity||85,originalMs:{start:e.timeMs,duration:e.durationMs},source:{confidence:e.confidence,key}})}return Music.validate(c)};
Music.ensure=function(p){if(!p.composition)p.composition=Music.fromLegacy(p);return p.composition};
Music.project=function(c,title='导入音乐',extra={}){const p=normalize({title,id:Music.id('song'),score:{mode:'free',events:[]},theme:{id:'starlight'},...extra});p.composition=Music.validate(c);Music.sync(p);return p};
Music.sync=function(p){const c=p.composition;if(!c)return;p.durationMs=Music.tickMs(c,c.lengthTicks);const root=KEY_ROOTS[p.playback?.tuning]||KEY_ROOTS[c.key]||60,groups=new Map();for(const n of c.notes){const timeMs=Music.tickMs(c,n.startTick),durationMs=Music.tickMs(c,n.startTick+n.soundTicks)-timeMs,key=SCALE.reduce((best,v,i)=>Math.abs(root+v-n.pitch)<Math.abs(root+SCALE[best]-n.pitch)?i:best,0)+1;const id=String(timeMs),e=groups.get(id)||{timeMs,durationMs:0,notes:[],velocity:0};e.durationMs=Math.max(e.durationMs,durationMs);e.velocity=Math.max(e.velocity,n.velocity);if(!e.notes.includes(key))e.notes.push(key);groups.set(id,e)}p.score={mode:'free',gridIntervalMs:250,events:[...groups.values()].sort((a,b)=>a.timeMs-b.timeMs)};return p};
Music.compile=function(c){const solo=c.tracks.some(t=>t.solo),tracks=new Map(c.tracks.map(t=>[t.id,t])),tied=new Set(),byId=new Map(c.notes.map(n=>[n.id,n])),result=[];for(const n of [...c.notes].sort((a,b)=>a.startTick-b.startTick)){if(tied.has(n.id))continue;const track=tracks.get(n.trackId);if(!track||track.mute||(solo&&!track.solo))continue;let end=n.startTick+n.soundTicks,next=n,visited=new Set([n.id]);while(next.tieNext){const target=byId.get(next.tieNext);if(!target||visited.has(target.id)||target.pitch!==n.pitch||target.trackId!==n.trackId||Math.abs(target.startTick-(next.startTick+next.durationTicks))>1e-6)break;visited.add(target.id);tied.add(target.id);end=target.startTick+target.soundTicks;next=target}result.push({id:n.id,pitch:n.pitch,track,timeMs:Music.tickMs(c,n.startTick),durationMs:Music.tickMs(c,end)-Music.tickMs(c,n.startTick),velocity:n.velocity})}return result.sort((a,b)=>a.timeMs-b.timeMs)};
Music.insertRegion=function(c,trackId,start,length,notes,mode){Music.assert(length>0,'录制区间为空');const end=start+length,original=c.notes,rests=c.rests||[];if(mode==='insert'){for(const n of original)if(n.trackId===trackId){if(n.startTick>=start)n.startTick+=length;else if(n.startTick+n.durationTicks>start){n.durationTicks+=length;n.soundTicks+=length}}for(const r of rests)if(r.trackId===trackId&&r.startTick>=start)r.startTick+=length;c.lengthTicks+=length}else{const retained=[];for(const n of original){if(n.trackId!==trackId||n.startTick>=end||n.startTick+n.durationTicks<=start){retained.push(n);continue}if(n.startTick<start){const left=copy(n);left.durationTicks=start-n.startTick;left.soundTicks=Math.min(left.soundTicks,left.durationTicks);delete left.tieNext;retained.push(left)}if(n.startTick+n.durationTicks>end){const right=copy(n);right.id=Music.id();right.startTick=end;right.durationTicks=n.startTick+n.durationTicks-end;right.soundTicks=Math.max(0,n.startTick+n.soundTicks-end);delete right.tieNext;retained.push(right)}}c.notes=retained;c.rests=rests.filter(r=>r.trackId!==trackId||r.startTick<start||r.startTick>=end)}c.notes.push(...notes);c.lengthTicks=Math.max(c.lengthTicks,end,...notes.map(n=>n.startTick+Math.max(n.durationTicks,n.soundTicks)))};
Music.parseNumbers=function(text,c,trackId,start,octave=4,gate=.9){const tokens=[...text.matchAll(/\S+/g)],notes=[],rests=[];let tick=start;Music.assert(tokens.length>0&&tokens.length<=4000,'请输入1–4000项节奏数字谱');for(const [i,entry]of tokens.entries()){const token=entry[0],line=text.slice(0,entry.index).split('\n').length;const m=token.match(/^(0|[#b]?[1-7]|\[(?:[#b]?[1-7]\+)*[#b]?[1-7]\])\/(1|2|4|8|16|32)([.t]?)$/);Music.assert(m,'第 '+line+' 行，第 '+(i+1)+' 项语法错误：'+token);const duration=Music.value(m[2],m[3]==='.'?'dot':m[3]==='t'?'triplet':'plain');if(m[1]==='0')rests.push({id:Music.id('rest'),trackId,startTick:tick,durationTicks:duration});else for(const degree of m[1].replace(/[\[\]]/g,'').split('+')){const n=Number(degree.replace(/[#b]/,'')),pitch=12*(octave+1)+(KEY_ROOTS[c.key]%12)+(c.scale==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11])[n-1]+(degree[0]==='#'?1:degree[0]==='b'?-1:0);Music.assert(pitch>=0&&pitch<=127,'数字谱音高超出范围');notes.push({id:Music.id(),trackId,pitch,startTick:tick,durationTicks:duration,soundTicks:duration*gate,gate,velocity:85})}tick+=duration}return {notes,rests,length:tick-start}};
Music.skyPreview=function(c,{transpose=0,fold=false,approximate=false,key='C'}={}){const root=KEY_ROOTS[key]||60,issues=[],events=new Map(),notes=[];for(const n of c.notes){let pitch=n.pitch+transpose,changed=transpose?['移调 '+transpose+' 半音']:[];if(fold){while(pitch<root){pitch+=12;changed.push('八度折返')}while(pitch>root+24){pitch-=12;changed.push('八度折返')}}const choices=SCALE.map((v,i)=>({key:i+1,d:Math.abs(root+v-pitch)})).sort((a,b)=>a.d-b.d);if(choices[0].d&&!approximate){issues.push({id:n.id,pitch:n.pitch,reason:pitch<root||pitch>root+24?'超音域':'半音'});continue}if(choices[0].d)changed.push('近似音');if(changed.length)issues.push({id:n.id,pitch:n.pitch,reason:[...new Set(changed)].join('、'),resolved:true});notes.push({...copy(n),pitch:root+SCALE[choices[0].key-1],source:{...n.source,adaptedFrom:n.pitch}});const time=Music.tickMs(c,n.startTick),k=time.toFixed(5),entry=events.get(k)||{timeMs:time,notes:[],durationMs:Music.tickMs(c,n.startTick+n.soundTicks)-time,velocity:n.velocity};if(entry.notes.includes(choices[0].key))issues.push({id:n.id,pitch:n.pitch,reason:'同音碰撞',resolved:true});entry.notes.push(choices[0].key);entry.notes=[...new Set(entry.notes)];entry.durationMs=Math.max(entry.durationMs,Music.tickMs(c,n.startTick+n.soundTicks)-time);events.set(k,entry)}return {notes,events:[...events.values()].sort((a,b)=>a.timeMs-b.timeMs),issues,unresolved:issues.filter(x=>!x.resolved).length}};

Music.noteName=function(c,pitch){const flat=(c.scale==='minor'?['D','G','C','F','Bb','Eb','Ab']:['F','Bb','Eb','Ab','Db']).includes(c.key);return (flat?['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B']:SEMIS)[pitch%12]+(Math.floor(pitch/12)-1)};

// Prefix indexes keep dense tempo/meter maps off the per-note/per-frame hot path.
Music.clockIndexes=new WeakMap();Music.meterIndexes=new WeakMap();
Music.search=function(entries,value,key){let low=0,high=entries.length;while(low<high){const mid=(low+high)>>1;if(entries[mid][key]<=value)low=mid+1;else high=mid}return entries[Math.max(0,low-1)]};
Music.clockIndex=function(c){const map=c.tempoMap,old=Music.clockIndexes.get(c),signature=[map.length,map[0]?.bpm,map.at(-1)?.tick,map.at(-1)?.bpm].join(':');if(old?.map===map&&old.signature===signature)return old.entries;let ms=0,last=0,bpm=map[0].bpm;const entries=map.map(m=>{ms+=(m.tick-last)*60000/(960*bpm);last=m.tick;bpm=m.bpm;return {...m,ms}});Music.clockIndexes.set(c,{map,signature,entries});return entries};
Music.tickMs=function(c,tick){const m=Music.search(Music.clockIndex(c),tick,'tick');return m.ms+(tick-m.tick)*60000/(960*m.bpm)};
Music.msTick=function(c,ms){const m=Music.search(Music.clockIndex(c),ms,'ms');return m.tick+(ms-m.ms)*960*m.bpm/60000};
Music.meterIndex=function(c){const map=c.meterMap,old=Music.meterIndexes.get(c);if(old?.map===map&&old.length===map.length)return old.entries;let bar=1,last=map[0];const entries=map.map((m,i)=>{if(i)bar+=Math.round((m.tick-last.tick)/(last.numerator*3840/last.denominator));last=m;return {...m,bar}});Music.meterIndexes.set(c,{map,length:map.length,entries});return entries};
Music.barPosition=function(c,tick){const m=Music.search(Music.meterIndex(c),tick,'tick'),unit=3840/m.denominator,size=unit*m.numerator,delta=Math.max(0,tick-m.tick),offset=delta%size;return {bar:m.bar+Math.floor(delta/size),beat:Math.floor(offset/unit)+1,tick:offset%unit,meter:m}};
Music.positionTick=function(c,bar,beat=1,sub=0){Music.assert(Number.isInteger(bar)&&bar>=1&&Number.isInteger(beat)&&beat>=1,'小节/拍位置无效');const m=Music.search(Music.meterIndex(c),bar,'bar');Music.assert(beat<=m.numerator&&sub>=0&&sub<3840/m.denominator,'拍位置超出小节');return m.tick+(bar-m.bar)*m.numerator*3840/m.denominator+(beat-1)*3840/m.denominator+sub};

/* 51-music-formats.js */
// Lossless source retention accompanies the editable musical representation.
Music.gm={0:'offline',4:'online-electric-piano',10:'offline-music-box',24:'offline-nylon-guitar',40:'online-violin',42:'online-cello',46:'offline-harp',48:'online-strings',52:'online-choir',73:'offline-flute'};
Music.fromMIDI=function(buffer){const b=new Uint8Array(buffer),v=new DataView(buffer),c=Music.blank();let p=0;const readChunk=()=>{Music.assert(p+8<=b.length,'MIDI区块不完整');const name=String.fromCharCode(...b.slice(p,p+4)),size=v.getUint32(p+4);p+=8;Music.assert(p+size<=b.length,'MIDI区块越界');return {name,end:p+size}};const header=readChunk();Music.assert(header.name==='MThd'&&header.end-p>=6,'无效MIDI头');const format=v.getUint16(p),count=v.getUint16(p+2),ppq=v.getUint16(p+4);Music.assert(format<=1&&ppq>0&&!(ppq&0x8000)&&count<=64,'暂不支持此MIDI格式（仅格式0/1、PPQ时间、最多64轨）');p=header.end;c.tracks=[];c.notes=[];c.tempoMap=[];c.meterMap=[];c.source={type:'midi',originalBase64:bytesToBase64(b),ppq,report:[]};
 for(let ti=0;ti<count;ti++){const chunk=readChunk();Music.assert(chunk.name==='MTrk','缺少MIDI轨道');let tick=0,running=0,name='音轨 '+(ti+1),programs={},trackByChannel=new Map(),active=new Map();const trackFor=channel=>{if(!trackByChannel.has(channel)){const program=programs[channel]||0,t={id:Music.id('track'),name:name+(channel===9?' · 打击乐':''),instrument:Music.gm[program]||'offline',volume:1,mute:false,solo:false,source:{track:ti,channel,program,events:[]}};trackByChannel.set(channel,t);c.tracks.push(t);if(!Music.gm[program])c.source.report.push('音轨 '+name+' 的GM音色 '+program+' 使用钢琴试听，原程序号已保留')}return trackByChannel.get(channel)};
  while(p<chunk.end){const ptr={i:p};tick+=readVarLen(b,ptr);p=ptr.i;Music.assert(p<chunk.end,'MIDI事件不完整');let status=b[p];if(status&128){p++;if(status<0xf0)running=status}else{Music.assert(running,'MIDI缺少运行状态');status=running}if(status===0xff){Music.assert(p<chunk.end,'MIDI元事件不完整');const kind=b[p++],lenPtr={i:p},len=readVarLen(b,lenPtr);p=lenPtr.i;Music.assert(p+len<=chunk.end,'MIDI元事件越界');const at=tick/ppq*960;if(kind===0x51&&len===3)c.tempoMap.push({tick:at,bpm:60000000/((b[p]<<16)|(b[p+1]<<8)|b[p+2])});else if(kind===0x58&&len>=2)c.meterMap.push({tick:at,numerator:b[p],denominator:2**b[p+1]});else if(kind===0x59&&len===2){const fifths=b[p]>127?b[p]-256:b[p],minor=b[p+1]===1,keys=minor?['Ab','Eb','Bb','F','C','G','D','A','E','B','Fs','Db','Ab','Eb','Bb']:['B','Fs','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','Fs','Db'];(c.source.keySignatures||(c.source.keySignatures=[])).push({tick:at,fifths,minor});if(at===0){c.key=keys[clamp(fifths+7,0,14)];c.scale=minor?'minor':'major'}else c.source.report.push('曲中调号变化已保留，界面显示初始调号')}else if(kind===3){name=new TextDecoder().decode(b.slice(p,p+len));for(const t of trackByChannel.values())t.name=name}else if(![0x2f,0x20,0x21].includes(kind))(c.source.meta||(c.source.meta=[])).push({track:ti,tick:at,kind,bytes:[...b.slice(p,p+len)]});p+=len;continue}
   if(status===0xf0||status===0xf7){const ptr={i:p},len=readVarLen(b,ptr);p=ptr.i+len;Music.assert(p<=chunk.end,'MIDI SysEx越界');c.source.report.push('SysEx仅保留在原始文件中');continue}
   const type=status&0xf0,ch=status&15,length=[0xc0,0xd0].includes(type)?1:2;Music.assert(type>=0x80&&type<=0xe0&&p+length<=chunk.end,'不支持或损坏的MIDI事件');const a=b[p++],d=length===2?b[p++]:0;Music.assert(a<128&&d<128,'MIDI数据字节无效');if(type===0xc0){programs[ch]=a;const existing=trackByChannel.get(ch);if(existing){existing.source.events.push({tick:tick/ppq*960,type:'program',value:a});c.source.report.push('轨内音色变化已保留，试听使用轨道初始音色')}continue}const track=trackFor(ch),key=ch+':'+a,at=tick/ppq*960;
   if(type===0x90&&d>0){const n={id:Music.id(),trackId:track.id,pitch:a,startTick:at,durationTicks:240,soundTicks:240,gate:1,velocity:d,source:{track:ti,channel:ch,originalTick:tick}};c.notes.push(n);const queue=active.get(key)||[];queue.push(n);active.set(key,queue)}else if(type===0x80||(type===0x90&&d===0)){const queue=active.get(key);if(queue?.length){const n=queue.shift();n.durationTicks=n.soundTicks=Math.max(.001,at-n.startTick)}}else track.source.events.push({tick:at,type:'raw',status,a,b:d});
  }for(const queue of active.values())if(queue.length)c.source.report.push('缺少Note Off的音符使用默认时长');p=chunk.end;
 }
 const dedupe=(list,fallback)=>{const m=new Map([[0,fallback]]);for(const x of list)m.set(x.tick,x);return [...m.values()].sort((a,b)=>a.tick-b.tick)};c.tempoMap=dedupe(c.tempoMap,{tick:0,bpm:120});c.meterMap=dedupe(c.meterMap,{tick:0,numerator:4,denominator:4});if(!c.tracks.length)c.tracks=Music.blank().tracks;c.lengthTicks=Math.max(960,...c.notes.map(n=>n.startTick+n.durationTicks));return Music.validate(c);
};
Music.midiBytes=function(c){c=Music.validate(c);const keyFifths=c.scale==='minor'?{A:0,E:1,B:2,Fs:3,Db:4,Ab:-7,Eb:-6,Bb:-5,F:-4,C:-3,G:-2,D:-1}:{C:0,G:1,D:2,A:3,E:4,B:5,Fs:6,Db:-5,Ab:-4,Eb:-3,Bb:-2,F:-1},conductor=[{tick:0,order:0,bytes:[255,89,2,(keyFifths[c.key]||0)&255,c.scale==='minor'?1:0]}];for(const m of c.tempoMap){const us=Math.round(60000000/m.bpm);Music.assert(us>0&&us<=0xffffff,'BPM超出MIDI可表达范围');conductor.push({tick:Math.round(m.tick),order:0,bytes:[255,81,3,(us>>16)&255,(us>>8)&255,us&255]})}for(const m of c.meterMap)conductor.push({tick:Math.round(m.tick),order:0,bytes:[255,88,4,m.numerator,Math.log2(m.denominator),m.denominator===8&&m.numerator%3===0?36:24,8]});
 const chunk=events=>{events.sort((a,b)=>a.tick-b.tick||a.order-b.order);let at=0,bytes=[];for(const e of events){bytes.push(...vlq(e.tick-at),...e.bytes);at=e.tick}bytes.push(0,255,47,0);return [...[77,84,114,107],...u32(bytes.length),...bytes]};const noteById=new Map(c.notes.map(n=>[n.id,n])),compiled=Music.compile({...c,tracks:c.tracks.map(t=>({...t,mute:false,solo:false}))}),chunks=[chunk(conductor)],channels=new Map(),available=Array.from({length:16},(_,i)=>i).filter(i=>i!==9);for(const track of c.tracks){const program=Number(track.source?.program??Object.entries(Music.gm).find(([,id])=>id===track.instrument)?.[0]??0),channel=track.source?.channel===9?9:available[channels.size];Music.assert(channel!==undefined,'MIDI最多支持15条独立旋律通道，请用.skytrack保存完整多轨');if(channel!==9)channels.set(track.id,channel);const name=[...ENCODER.encode(track.name)],events=[{tick:0,order:0,bytes:[255,3,...vlq(name.length),...name]},{tick:0,order:1,bytes:[0xc0|channel,program]}];for(const event of compiled.filter(e=>e.track.id===track.id)){const n=noteById.get(event.id),start=Math.round(n.startTick),end=Math.max(start+1,Math.round(Music.msTick(c,event.timeMs+event.durationMs)));events.push({tick:start,order:3,bytes:[0x90|channel,n.pitch,n.velocity]},{tick:end,order:2,bytes:[0x80|channel,n.pitch,0]})}for(const e of track.source?.events||[])if(e.type==='raw')events.push({tick:Math.round(e.tick),order:1,bytes:[(e.status&0xf0)|channel,e.a,...([0xc0,0xd0].includes(e.status&0xf0)?[]:[e.b])]});else if(e.type==='program')events.push({tick:Math.round(e.tick),order:1,bytes:[0xc0|channel,e.value]});chunks.push(chunk(events))}const header=[77,84,104,100,...u32(6),...u16(1),...u16(chunks.length),...u16(960)];return new Uint8Array(header.concat(...chunks));
};
Music.fromXML=function(text){const doc=new DOMParser().parseFromString(text,'application/xml');Music.assert(!doc.querySelector('parsererror'),'MusicXML XML错误');const parts=[...doc.querySelectorAll('score-partwise>part')];Music.assert(parts.length>0&&parts.length<=64,'仅支持partwise MusicXML，最多64个Part');const c=Music.blank();c.tracks=[];c.notes=[];c.rests=[];c.tempoMap=[];c.meterMap=[];c.source={type:'musicxml',originalXML:text,report:[]};const txt=(el,tag,fallback='')=>el.querySelector(tag)?.textContent||fallback,num=(el,tag,fallback=0)=>Number(txt(el,tag,String(fallback))),ties=new Map();
 for(const part of parts){let div=1,base=0,transpose=0,meter=[4,4],tracks=new Map();const getTrack=voice=>{if(!tracks.has(voice)){const def=[...doc.querySelectorAll('score-part')].find(x=>x.id===part.id),t={id:Music.id('track'),name:(def?txt(def,'part-name',part.id):part.id)+' · 声部'+voice,instrument:'offline',volume:1,mute:false,solo:false,source:{part:part.id,voice}};tracks.set(voice,t);c.tracks.push(t)}return tracks.get(voice)};
  for(const measure of [...part.children].filter(x=>x.tagName==='measure')){let cursor=base,furthest=base,last=base;for(const el of measure.children){if(el.tagName==='attributes'){div=num(el,'divisions',div);Music.assert(div>0,'MusicXML divisions无效');if(el.querySelector('transpose'))transpose=num(el,'transpose>chromatic')+num(el,'transpose>octave-change')*12;if(el.querySelector('key')){const fifths=num(el,'fifths'),minor=txt(el,'mode')==='minor';if(base===0){c.scale=minor?'minor':'major';c.key=(minor?['Ab','Eb','Bb','F','C','G','D','A','E','B','Fs','Db','Ab','Eb','Bb']:['B','Fs','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','Fs','Db'])[clamp(fifths+7,0,14)]}else c.source.report.push('曲中调号变化已保留在原文，界面显示初始调号')}if(el.querySelector('time')){meter=[num(el,'beats',4),num(el,'beat-type',4)];c.meterMap.push({tick:base,numerator:meter[0],denominator:meter[1]})}}else if(el.tagName==='direction'){const sound=el.querySelector('sound'),per=num(el,'per-minute'),unit=txt(el,'beat-unit','quarter'),unitValue={whole:4,half:2,quarter:1,eighth:.5,'16th':.25}[unit]||1,bpm=Number(sound?.getAttribute('tempo'))||per*unitValue*(el.querySelector('beat-unit-dot')?1.5:1);if(bpm>0)c.tempoMap.push({tick:cursor+num(el,'offset')/div*960,bpm})}else if(el.tagName==='backup')cursor-=num(el,'duration')/div*960;else if(el.tagName==='forward'){cursor+=num(el,'duration')/div*960;furthest=Math.max(furthest,cursor)}else if(el.tagName==='note'){if(el.querySelector('grace')){c.source.report.push('装饰音仅保留在原始MusicXML中');continue}const duration=num(el,'duration')/div*960,chord=!!el.querySelector('chord'),start=chord?last:cursor,voice=txt(el,'voice','1'),track=getTrack(voice);Music.assert(duration>0,'MusicXML音符缺少有效时长');if(!chord)last=start;if(el.querySelector('rest'))c.rests.push({id:Music.id('rest'),trackId:track.id,startTick:start,durationTicks:duration});else{const pitch=(num(el,'octave',4)+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[txt(el,'step','C')])+num(el,'alter')+transpose,n={id:Music.id(),trackId:track.id,pitch,startTick:start,durationTicks:duration,soundTicks:duration,gate:1,velocity:85,notation:{type:txt(el,'type'),dots:el.querySelectorAll('dot').length,actual:num(el,'actual-notes',1),normal:num(el,'normal-notes',1)},source:{measure:measure.getAttribute('number'),voice}},key=track.id+':'+pitch,tieTypes=[...el.querySelectorAll('tie')].map(x=>x.getAttribute('type'));if(tieTypes.includes('stop')&&ties.has(key))ties.get(key).tieNext=n.id;if(tieTypes.includes('start'))ties.set(key,n);else ties.delete(key);c.notes.push(n)}if(!chord)cursor+=duration;furthest=Math.max(furthest,start+duration)}if(['repeat','ending'].some(tag=>el.querySelector?.(tag)))c.source.report.push('反复/跳转标记未展开，已保留原文')}base=measure.getAttribute('implicit')==='yes'?furthest:Math.max(furthest,base+meter[0]*3840/meter[1]);}
 }
 const unique=(list,initial)=>{const m=new Map([[0,initial]]),seen=new Set();for(const x of list){const old=m.get(x.tick);if(seen.has(x.tick)&&JSON.stringify(old)!==JSON.stringify(x))c.source.report.push('不同声部的时间标记冲突，采用后读入标记');m.set(x.tick,x);seen.add(x.tick)}return [...m.values()].sort((a,b)=>a.tick-b.tick)};c.calibrated=c.tempoMap.length>0;c.tempoMap=unique(c.tempoMap,{tick:0,bpm:120});c.meterMap=unique(c.meterMap,{tick:0,numerator:4,denominator:4});c.lengthTicks=Math.max(960,...c.notes.map(n=>n.startTick+n.durationTicks),...c.rests.map(n=>n.startTick+n.durationTicks));return Music.validate(c);
};

/* 52-music-audio.js */
// Every track owns a gain bus and bank; all timing uses the same AudioContext clock.
const MusicAudio={generation:0,playing:false,voices:new Set(),banks:new Map(),buses:new Map(),raf:0,timer:0,position:0,rate:1,index:0,events:[],clickTick:0};
MusicAudio.stop=function(){if(this.playing)this.position=this.now();this.playing=false;this.generation++;clearInterval(this.timer);cancelAnimationFrame(this.raf);for(const v of [...this.voices])v.stop();this.voices.clear();for(const bus of this.buses.values())bus.disconnect();this.buses.clear();if(typeof musicRenderClock==='function')musicRenderClock()};
MusicAudio.now=function(){return this.playing?this.anchorMs+(getAudio().currentTime-this.anchorClock)*1000*this.rate:this.position};
MusicAudio.prepare=async function(c){const generation=this.generation,ac=getAudio();await ac.resume();for(const t of c.tracks){if(this.banks.has(t.instrument))continue;try{this.banks.set(t.instrument,await loadInstrumentBank(t.instrument))}catch(error){await loadOfflinePiano();this.banks.set(t.instrument,state.pianoBuffers);toast(t.name+' 音源不可用，使用离线钢琴试听',4500)}if(generation!==this.generation)return false}return true};
MusicAudio.note=function(pitch,track,at,durationMs,velocity=85,live=false){const ac=getAudio(),bank=this.banks.get(track.instrument)||state.pianoBuffers,root=sampledKey(pitch,bank);if(root==null)return null;const source=ac.createBufferSource(),gain=ac.createGain();source.buffer=bank.get(root);source.playbackRate.value=2**((pitch-root)/12);const level=instrumentSpec(track.instrument).gain*track.volume*(velocity/95)**1.28,release=.12+(Number(state.project?.playback?.sustain)||0)*1.6;
 let bus=this.buses.get(track.id);if(!bus){bus=ac.createGain();bus.connect(state.dryBus);bus.connect(state.reverbSend);this.buses.set(track.id,bus)}source.connect(gain);gain.connect(bus);gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(Math.max(.0002,level),at+.008);const sustained=['online-strings','online-choir','online-violin','online-cello','offline-flute','online-electric-piano'].includes(track.instrument);if(sustained&&source.buffer.duration>.2){source.loop=true;source.loopStart=source.buffer.duration*.35;source.loopEnd=source.buffer.duration*.85}
 const voice={source,gain,ended:false,stop:()=>{if(voice.ended)return;voice.ended=true;try{source.stop()}catch(error){}this.voices.delete(voice)},release:()=>{if(voice.ended)return;const now=ac.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(Math.max(.0001,gain.gain.value),now);gain.gain.exponentialRampToValueAtTime(.0001,now+release);try{source.stop(now+release+.02)}catch(error){}}};this.voices.add(voice);source.onended=()=>{voice.ended=true;this.voices.delete(voice);source.disconnect();gain.disconnect()};source.start(at);if(!live){const end=at+Math.max(.01,durationMs/1000/this.rate);gain.gain.setValueAtTime(Math.max(.0002,level*.75),Math.max(at+.009,end));gain.gain.exponentialRampToValueAtTime(.0001,Math.max(at+.02,end+release));source.stop(end+release+.02)}return voice;
};
MusicAudio.click=function(at,accent){const ac=getAudio(),o=ac.createOscillator(),g=ac.createGain();o.frequency.value=accent?1200:800;g.gain.setValueAtTime(.12,at);g.gain.exponentialRampToValueAtTime(.0001,at+.045);o.connect(g);g.connect(state.master);const v={stop(){try{o.stop()}catch(error){}}};this.voices.add(v);o.onended=()=>{this.voices.delete(v);o.disconnect();g.disconnect()};o.start(at);o.stop(at+.05)};
MusicAudio.play=async function(c,position=0){this.stop();this.position=position;const generation=this.generation;if(!await this.prepare(c)||generation!==this.generation)return;this.c=c;this.rate=Number($('musicRate').value)||1;this.events=Music.compile(c);this.index=this.events.findIndex(e=>e.timeMs>=position-.01);if(this.index<0)this.index=this.events.length;this.anchorMs=position;this.anchorClock=getAudio().currentTime+.06;this.playing=true;this.clickTick=Music.msTick(c,position);for(const e of this.events)if(e.timeMs<position&&e.timeMs+e.durationMs>position)this.note(e.pitch,e.track,this.anchorClock,e.timeMs+e.durationMs-position,e.velocity);
 const tick=()=>{if(!this.playing)return;const now=Math.max(position,this.now()),limit=now+160*this.rate,clock=getAudio().currentTime;while(this.index<this.events.length&&this.events[this.index].timeMs<limit){const e=this.events[this.index++];if(e.timeMs>=now-25)this.note(e.pitch,e.track,clock+Math.max(.001,(e.timeMs-now)/1000/this.rate),e.durationMs,e.velocity)}if($('musicMetronome').checked){while(Music.tickMs(c,this.clickTick)<limit){const m=Music.meterAt(c,this.clickTick),unit=3840/m.denominator,group=m.denominator===8&&m.numerator%3===0&&m.numerator>3?3:1,p=Music.barPosition(c,this.clickTick),start=Music.positionTick(c,p.bar,1),step=unit*group,next=start+Math.ceil((this.clickTick-start)/step-1e-8)*step;if(next<this.clickTick-.001){this.clickTick+=step;continue}const time=Music.tickMs(c,next);if(time>=now-10)this.click(clock+Math.max(.001,(time-now)/1000/this.rate),Math.abs(next-start)<.01);this.clickTick=next+step;const boundary=c.meterMap.find(x=>x.tick>next&&x.tick<this.clickTick);if(boundary)this.clickTick=boundary.tick}}
 const end=Music.tickMs(c,c.lengthTicks),loop=MusicWorkbench.loop;if(loop.enabled&&now>=Music.tickMs(c,loop.end)){this.position=Music.tickMs(c,loop.start);this.play(c,this.position);return}if(now>=end&&!MusicWorkbench.recording){this.position=end;this.stop();return}};this.timer=setInterval(tick,25);tick();const frame=()=>{if(!this.playing)return;musicRenderClock();musicDrawRoll();this.raf=requestAnimationFrame(frame)};this.raf=requestAnimationFrame(frame);
};

/* 53-music-workbench.js */
const MusicWorkbench={active:false,editing:false,project:null,original:null,cursor:0,track:null,selected:new Set(),history:[],future:[],clipboard:[],zoom:90,row:22,min:21,max:108,tool:'select',loop:{enabled:false,start:0,end:7680},recording:null,held:new Map(),gesture:null,numberPreview:null,sky:null};
const mw=MusicWorkbench;
function musicComposition(){return mw.project.composition}
function musicTrack(){return musicComposition().tracks.find(t=>t.id===mw.track)||musicComposition().tracks[0]}
function musicGrid(){return Music.value($('musicGrid').value,$('musicGridModifier').value)}
function musicDuration(){return Music.value($('musicValue').value,$('musicModifier').value)}
function musicSelected(){return musicComposition().notes.filter(n=>mw.selected.has(n.id))}
function musicRequireCalibrated(){Music.assert(musicComposition().calibrated,'请先确认参考BPM与拍号，再进行按拍编辑')}
function musicSnapshot(){return {composition:copy(musicComposition()),title:mw.project.title,author:mw.project.author||'',description:mw.project.description||'',playback:copy(mw.project.playback)}}
function musicRestore(snapshot){if(snapshot.composition){mw.project.composition=snapshot.composition;for(const key of ['title','author','description','playback'])mw.project[key]=snapshot[key]}else mw.project.composition=snapshot}
function musicCommand(change,{musical=true}={}){if(!mw.editing)return;if(mw.recording)musicStopRecording();const saved=musicSnapshot(),old=saved.composition,transportTick=Music.msTick(old,Math.max(0,MusicAudio.now())),wasPlaying=MusicAudio.playing;try{MusicAudio.stop();if(wasPlaying)mw.cursor=transportTick;if(musical)musicRequireCalibrated();change(musicComposition());mw.project.composition=Music.validate(musicComposition());mw.history.push(saved);if(mw.history.length>100)mw.history.shift();mw.future=[];MusicAudio.position=Music.tickMs(musicComposition(),mw.cursor);Music.sync(mw.project);mw.numberPreview=null;mw.sky=null;musicRender();musicRevealSelection();}catch(error){musicRestore(saved);toast(error.message,5000);musicRender()}}
function musicHistory(redo=false){musicFinishHeld();const from=redo?mw.future:mw.history,to=redo?mw.history:mw.future;if(!mw.editing||!from.length)return;MusicAudio.stop();to.push(musicSnapshot());musicRestore(from.pop());mw.cursor=clamp(mw.cursor,0,musicComposition().lengthTicks);MusicAudio.position=Music.tickMs(musicComposition(),mw.cursor);Music.sync(mw.project);mw.selected.clear();musicRender();toast(redo?'已重做':'已撤销')}
function musicUI(){
 const host=document.createElement('section');host.id='musicWorkbench';host.hidden=true;host.setAttribute('aria-label','钢琴编曲工作台');host.append($('musicWorkbenchTemplate').content.cloneNode(true));
 document.querySelector('.site-wrap').append(host);for(const id of ['musicGrid','musicValue'])for(const v of [1,2,4,8,16,32])$(id).add(new Option('1/'+v,v));$('musicGrid').value=String(PLAYER_RULES.workbench.defaults.grid);$('musicValue').value=String(PLAYER_RULES.workbench.defaults.value);$('musicGate').value=PLAYER_RULES.workbench.defaults.gate*100;for(const id of ['musicKey','musicSkyKey'])for(const k of Object.keys(KEY_ROOTS).filter(k=>k!=='sky-original'))$(id).add(new Option(KEY_DEGREES[k][0]+(id==='musicKey'?'':' 大调'),k));
 host.addEventListener('click',e=>{const b=e.target.closest('[data-music-action]');if(b)musicAction(b.dataset.musicAction);const tab=e.target.closest('[data-bottom]');if(tab){for(const t of host.querySelectorAll('[data-bottom]'))t.setAttribute('aria-selected',String(t===tab));for(const name of ['velocity','rhythm','numbers','sky'])$('music'+name[0].toUpperCase()+name.slice(1)+'Panel').hidden=name!==tab.dataset.bottom;musicDrawVelocity();musicDrawRhythm()}});
 $('musicMeter').add(new Option('自定义…','custom'));$('musicMeter').onchange=()=>{if($('musicMeter').value!=='custom')return;const current=Music.meterAt(musicComposition(),mw.cursor),d=musicDialog('自定义拍号','<label>分子<input id="musicCustomNumerator" type="number" min="1" max="32" value="'+current.numerator+'"></label><label>分母<select id="musicCustomDenominator">'+[1,2,4,8,16,32].map(n=>'<option>'+n+'</option>').join('')+'</select></label>',()=>{const numerator=musicNumber('musicCustomNumerator',1,32),denominator=Number($('musicCustomDenominator').value);Music.assert(Number.isInteger(numerator),'拍号分子必须为整数');const value=numerator+'/'+denominator;if(![...$('musicMeter').options].some(o=>o.value===value))$('musicMeter').add(new Option(value,value));$('musicMeter').value=value});$('musicCustomDenominator').value=String(current.denominator);d.onclose=()=>{if($('musicMeter').value==='custom')$('musicMeter').value=current.numerator+'/'+current.denominator}};$('musicPitchZoom').oninput=()=>{mw.row=Number($('musicPitchZoom').value);mw.manualPitchZoom=true;musicDrawRoll()};$('musicTool').onchange=()=>mw.tool=$('musicTool').value;$('musicZoom').oninput=()=>{mw.zoom=Number($('musicZoom').value);musicDrawRoll()};$('musicVolume').oninput=()=>{state.volume=Number($('musicVolume').value)/100;updateVolumeAudio()};$('musicSustain').oninput=()=>{state.project.playback.sustain=Number($('musicSustain').value)/100;state.sustain=state.project.playback.sustain;updateSustainAudio()};$('musicRate').onchange=()=>{const pos=MusicAudio.now(),playing=MusicAudio.playing;MusicAudio.stop();MusicAudio.position=pos;if(playing)MusicAudio.play(musicComposition(),pos)};
 for(const id of ['musicLoop','musicLoopStart','musicLoopEnd'])$(id).onchange=()=>{try{const c=musicComposition(),start=Music.positionTick(c,Number($('musicLoopStart').value)),end=Music.positionTick(c,Number($('musicLoopEnd').value));Music.assert(end>start,'循环终点必须晚于起点');Music.assert(end<=c.lengthTicks,'循环终点超出曲谱长度');mw.loop={enabled:$('musicLoop').checked,start,end};MusicAudio.stop()}catch(e){$('musicLoop').checked=false;mw.loop.enabled=false;toast(e.message)}};
 $('musicTracks').addEventListener('click',e=>{const el=e.target.closest('[data-track]');if(el){musicStopRecording();musicFinishHeld();MusicAudio.stop();mw.track=el.dataset.track;musicRender()}});$('musicTracks').addEventListener('change',e=>{const id=e.target.closest('[data-track]')?.dataset.track,field=e.target.dataset.trackField;if(!field||!mw.editing)return;const value=e.target.type==='checkbox'?e.target.checked:e.target.value;musicCommand(c=>{const t=c.tracks.find(t=>t.id===id);t[field]=field==='volume'?Number(value):value;if(field==='instrument'&&t.source)t.source.program=Number(Object.entries(Music.gm).find(([,id])=>id===value)?.[0]||0)},{musical:false})});
 $('musicRollViewport').addEventListener('scroll',musicDrawRoll,{passive:true});new ResizeObserver(()=>{if(mw.active)musicDrawRoll()}).observe($('musicRollViewport'));musicBindPointer();musicBindKeyboard();
}
function musicOpen(p){musicFinishHeld();MusicAudio.stop();Music.ensure(p);mw.active=true;mw.editing=false;mw.project=p;mw.original=null;mw.cursor=0;mw.selected.clear();mw.track=p.composition.tracks[0].id;mw.history=[];mw.future=[];mw.loop={enabled:false,start:0,end:Music.positionTick(p.composition,3)};state.project=p;state.mode='player';$('homeView').hidden=true;$('playerView').hidden=true;$('musicWorkbench').hidden=false;MusicAudio.position=0;$('musicRate').value=String(p.playback.rate||1);$('musicLoop').checked=false;$('musicLoopStart').value='1';$('musicLoopEnd').value='3';$('musicMetronome').checked=false;mw.min=Math.min(21,...p.composition.notes.map(n=>n.pitch));mw.max=Math.max(108,...p.composition.notes.map(n=>n.pitch));$('musicVolume').value=Math.round(p.playback.volume*100);$('musicSustain').value=Math.round((p.playback.sustain||0)*100);musicRender();requestAnimationFrame(()=>{mw.manualPitchZoom=false;musicFitPitch();musicDrawRoll()})}
function musicRender(){if(!mw.active)return;const c=musicComposition(),host=$('musicWorkbench'),colors=resolvedPlayerColors(mw.project);mw.min=Math.min(21,...c.notes.map(n=>n.pitch));mw.max=Math.max(108,...c.notes.map(n=>n.pitch));const decor=themeDefinition(mw.project).decorations,cover=decor.cover||decor.scene?.image;host.style.setProperty('--music-scene',cover?'url("'+themeAsset(cover,mw.project)+'")':'none');if(decor.identity.image){$('musicIdentity').hidden=false;$('musicIdentity').src=themeAsset(decor.identity.image,mw.project)}else $('musicIdentity').hidden=true;applySurfaceTokens(host,colors,themeDefinition(mw.project).materials);host.classList.toggle('music-editing',mw.editing);host.dataset.theme=sceneId(mw.project);host.style.setProperty('--gold',colors.accent);$('musicTitle').textContent=mw.project.title;$('musicSubtitle').textContent=mw.editing?'全屏编曲工作台 · 编辑工作副本':'完整音高播放器 · 只读';$('musicEdit').textContent=mw.editing?'保存／退出编辑':'曲谱编辑';$('musicUndo').disabled=!mw.history.length;$('musicRedo').disabled=!mw.future.length;
 const at=Music.msTick(c,MusicAudio.playing?MusicAudio.now():MusicAudio.position),tempo=[...c.tempoMap].reverse().find(t=>t.tick<=at)||c.tempoMap[0],m=Music.meterAt(c,at);$('musicBpm').value=tempo.bpm;$('musicMeter').value=m.numerator+'/'+m.denominator;if(!$('musicMeter').value){$('musicMeter').add(new Option(m.numerator+'/'+m.denominator,m.numerator+'/'+m.denominator));$('musicMeter').value=m.numerator+'/'+m.denominator}$('musicKey').value=c.key;$('musicScaleMode').value=c.scale||'major';$('musicScaleMode').disabled=!mw.editing;$('musicBpm').disabled=$('musicMeter').disabled=$('musicKey').disabled=!mw.editing;$('musicCalibrate').hidden=c.calibrated;$('musicCalibration').textContent=c.calibrated?'960 PPQ · 音乐时间':'参考速度，尚未校准 · 原始听感保留';
 $('musicTracks').innerHTML='';for(const t of c.tracks){const el=document.createElement('article');el.dataset.track=t.id;el.className=t.id===mw.track?'is-current':'';const name=document.createElement('input');name.value=t.name;name.dataset.trackField='name';name.setAttribute('aria-label','音轨名称');name.disabled=!mw.editing;el.append(name);const instrument=document.createElement('select');instrument.dataset.trackField='instrument';instrument.setAttribute('aria-label',t.name+'音色');for(const i of INSTRUMENTS)instrument.add(new Option(i.name,i.id));instrument.value=t.instrument;instrument.disabled=!mw.editing;el.append(instrument);const vol=document.createElement('input');vol.type='range';vol.min=0;vol.max=2;vol.step=.01;vol.value=t.volume;vol.dataset.trackField='volume';vol.setAttribute('aria-label',t.name+'音量');vol.disabled=!mw.editing;el.append(vol);for(const [field,label]of [['mute','静音'],['solo','独奏']]){const l=document.createElement('label'),b=document.createElement('input');b.type='checkbox';b.checked=t[field];b.disabled=!mw.editing;b.dataset.trackField=field;l.append(b,label);el.append(l)}if(mw.editing){const b=document.createElement('button');b.textContent='删除轨道';b.onclick=e=>{e.stopPropagation();musicCommand(data=>{Music.assert(data.tracks.length>1,'至少保留一条音轨');data.tracks=data.tracks.filter(x=>x.id!==t.id);data.notes=data.notes.filter(n=>n.trackId!==t.id);data.rests=data.rests.filter(n=>n.trackId!==t.id);mw.track=data.tracks[0].id},{musical:false})};el.append(b)}$('musicTracks').append(el)}
 const selected=musicSelected(),n=selected[0];$('musicSelection').textContent=selected.length?'已选 '+selected.length+' 音 · '+(n?Music.noteName(c,n.pitch):''):Music.label(c,mw.cursor)+' · 当前轨 '+musicTrack().name;for(const [id,key]of [['musicPitch','pitch'],['musicStart','startTick'],['musicNoteLength','durationTicks'],['musicVelocity','velocity'],['musicSoundTicks','soundTicks']]){$(id).value=n?Math.round(n[key]*1000)/1000:'';$(id).disabled=!mw.editing||!n}const pos=n?Music.barPosition(c,n.startTick):{bar:1,beat:1,tick:0};$('musicStartBar').value=pos.bar;$('musicStartBeat').value=pos.beat;$('musicStartSub').value=pos.tick;$('musicStartMs').value=n?Music.tickMs(c,n.startTick):0;$('musicSoundMs').value=n?Music.tickMs(c,n.startTick+n.soundTicks)-Music.tickMs(c,n.startTick):0;$('musicNoteValue').value='custom';for(const den of [1,2,4,8,16,32])for(const mod of ['plain','dot','triplet'])if(n&&Math.abs(n.durationTicks-Music.value(den,mod))<1e-6){$('musicNoteValue').value=String(den);$('musicNoteModifier').value=mod}for(const id of ['musicStartBar','musicStartBeat','musicStartSub','musicNoteValue','musicNoteModifier','musicStartMs','musicSoundMs'])$(id).disabled=!mw.editing||!n;$('musicNoteGate').value=n?Math.round(n.gate*100):90;$('musicNoteGate').disabled=!mw.editing||!n;$('musicNoteDetails').textContent=n?JSON.stringify({position:Music.label(c,n.startTick),startMs:Music.tickMs(c,n.startTick),soundMs:Music.tickMs(c,n.startTick+n.soundTicks)-Music.tickMs(c,n.startTick),source:n.source||n.originalMs||null},null,2):'点击音符查看；Shift加选或在空白区域框选';$('musicStatus').textContent=mw.recording?'录制中 · 停止后提交完整区间':mw.editing?'编辑工作副本 · 保存前不改原曲':'只读播放 · '+c.notes.length+' 音符 · '+c.tracks.length+' 音轨';musicRenderClock();musicDrawRoll();musicDrawRhythm();syncStatusNotificationAppearance();
}
function musicRenderClock(){if(!mw.active)return;const ms=Math.max(0,MusicAudio.now());$('musicClock').textContent=Music.label(musicComposition(),Music.msTick(musicComposition(),ms))+' · '+positionFmt(ms);$('musicPlay').innerHTML=appIcon(MusicAudio.playing?'pause':'play')+(MusicAudio.playing?'暂停':'播放')}
function musicGeometry(){const view=$('musicRollViewport');return {w:view.clientWidth,h:view.clientHeight,x:view.scrollLeft,y:view.scrollTop,scale:Math.min(mw.zoom/960,16000000/Math.max(1,musicComposition().lengthTicks)),left:64,top:52}}
function musicDrawRoll(){if(!mw.active)return;const c=musicComposition(),view=$('musicRollViewport'),canvas=$('musicCanvas'),g=musicGeometry(),width=Math.max(g.w,64+c.lengthTicks*g.scale),height=52+(mw.max-mw.min+1)*mw.row,world=$('musicRollWorld');world.style.width=width+'px';world.style.height=height+'px';const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(g.w*dpr)||canvas.height!==Math.round(g.h*dpr)){canvas.width=Math.round(g.w*dpr);canvas.height=Math.round(g.h*dpr);canvas.style.width=g.w+'px';canvas.style.height=g.h+'px'}const ctx=canvas.getContext('2d'),colors=resolvedPlayerColors(mw.project);if(MusicAudio.playing){const current=Music.msTick(c,Math.max(0,MusicAudio.now()))*g.scale;if(current<g.x||current>g.x+g.w-80)view.scrollLeft=Math.max(0,Math.min(width-g.w,current-g.w*.25))}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,g.w,g.h);ctx.fillStyle=colors.rest;ctx.fillRect(0,0,g.w,g.h);ctx.font='11px Arial';
 for(let pitch=mw.min;pitch<=mw.max;pitch++){const y=52+(mw.max-pitch)*mw.row-g.y;if(y<52-mw.row||y>g.h)continue;ctx.fillStyle=[1,3,6,8,10].includes(pitch%12)?colors.rest:colors.gridStart;ctx.fillRect(64,y,g.w-64,mw.row-1);ctx.fillStyle=[1,3,6,8,10].includes(pitch%12)?'#15202a':'#dce6ee';ctx.fillRect(0,y,63,mw.row-1);ctx.fillStyle=[1,3,6,8,10].includes(pitch%12)?'#edf7ff':'#152b3d';ctx.font=Math.max(8,Math.min(11,mw.row-2))+'px Arial';if(mw.row>=10||[0,5].includes(pitch%12))ctx.fillText(Music.noteName(c,pitch),8,y+Math.min(15,mw.row-2))}
 const start=Math.max(0,(g.x-64)/g.scale),end=(g.x+g.w)/g.scale,step=musicGrid();let count=0;for(let t=Math.floor(start/step)*step;t<end&&count++<1600;t+=step){const x=64+t*g.scale-g.x,p=Music.barPosition(c,t),bar=p.beat===1&&Math.abs(p.tick)<.01;ctx.strokeStyle=bar?colors.border:colors.dot;ctx.globalAlpha=bar?.8:.18;ctx.beginPath();ctx.moveTo(x,52);ctx.lineTo(x,g.h);ctx.stroke();ctx.globalAlpha=1}for(const n of c.notes){const x=64+n.startTick*g.scale-g.x,y=52+(mw.max-n.pitch)*mw.row-g.y,w=Math.max(4,n.durationTicks*g.scale-2);if(x+w<64||x>g.w||y+mw.row<52||y>g.h)continue;ctx.save();ctx.beginPath();ctx.rect(64,52,g.w-64,g.h-52);ctx.clip();ctx.globalAlpha=n.trackId===mw.track?1:.35;ctx.fillStyle=mw.selected.has(n.id)?colors.accent:colors.note;ctx.beginPath();ctx.roundRect(x+1,y+mw.row*.18,w,Math.max(3,mw.row*.64),Math.min(3,mw.row/3));ctx.fill();if(mw.selected.has(n.id)){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke()}if(n.tieNext){ctx.strokeStyle=colors.accent;ctx.beginPath();ctx.moveTo(x+Math.max(2,w-8),y+mw.row-4);ctx.quadraticCurveTo(x+w,y+mw.row+3,x+w+9,y+mw.row-4);ctx.stroke()}ctx.restore()}
 ctx.font='11px Arial';ctx.fillStyle=colors.surfaceEnd;ctx.fillRect(0,0,g.w,52);ctx.fillStyle=colors.text;let lastBar='';for(let t=Math.ceil(start/240)*240,k=0;t<end&&k++<3000;t+=240){const p=Music.barPosition(c,t);if(Math.abs(p.tick)>.01)continue;const x=64+t*g.scale-g.x,label=p.bar+'.'+p.beat;if(x<64)continue;if(label!==lastBar){ctx.fillText(label,x+3,17);ctx.fillStyle=colors.muted;ctx.fillText((Music.tickMs(c,t)/1000).toFixed(2)+'s',x+3,36);ctx.fillStyle=colors.text;lastBar=label}}for(const mark of [...c.tempoMap.map(m=>({...m,text:'♩ '+Number(m.bpm.toFixed(2))})),...c.meterMap.map(m=>({...m,text:m.numerator+'/'+m.denominator}))]){const x=64+mark.tick*g.scale-g.x;if(x>=64&&x<g.w){ctx.fillStyle=colors.accent;ctx.fillRect(x,46,2,6)}}const cursor=MusicAudio.playing?Music.msTick(c,Math.max(0,MusicAudio.now())):mw.cursor,x=64+cursor*g.scale-g.x;if(x>=64&&x<=g.w){ctx.strokeStyle=colors.accent;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,g.h);ctx.stroke()}if(mw.gesture?.kind==='box'){const a=mw.gesture;ctx.fillStyle=colors.accent+'33';ctx.fillRect(a.x,a.y,a.lastX-a.x,a.lastY-a.y)}musicDrawVelocity()}
function musicDrawVelocity(){if(!mw.active||$('musicVelocityPanel').hidden)return;const canvas=$('musicVelocityCanvas'),width=$('musicVelocityPanel').clientWidth;canvas.width=Math.max(200,width);const ctx=canvas.getContext('2d'),notes=musicSelected(),colors=resolvedPlayerColors(mw.project);ctx.clearRect(0,0,canvas.width,66);ctx.fillStyle=colors.accent;const size=Math.max(10,canvas.width/Math.max(1,notes.length));for(let i=0;i<notes.length;i++)ctx.fillRect(i*size+2,64-notes[i].velocity/127*60,Math.max(3,size-4),notes[i].velocity/127*60);ctx.fillStyle=colors.text;if(!notes.length)ctx.fillText('选中音符后，在此点击调整力度',12,30)}

function musicDrawRhythm(){if(!mw.active||$('musicRhythmPanel').hidden)return;const c=musicComposition(),grid=$('musicRhythmGrid'),step=musicGrid(),at=MusicAudio.playing?Music.msTick(c,MusicAudio.now()):mw.cursor,start=Math.floor(at/step/32)*32;grid.innerHTML='';for(let i=0;i<32;i++){const tick=(start+i)*step,notes=c.notes.filter(n=>n.startTick>=tick-.001&&n.startTick<tick+step-.001),button=document.createElement('button');button.classList.toggle('is-current',at>=tick&&at<tick+step);const number=document.createElement('small'),label=document.createElement('span');number.textContent=Music.label(c,tick);label.textContent=notes.map(n=>Music.noteName(c,n.pitch)).join(' · ')||'休止';button.append(number,label);button.onclick=()=>{musicFinishHeld();MusicAudio.stop();mw.cursor=tick;MusicAudio.position=Music.tickMs(c,tick);mw.selected=new Set(notes.map(n=>n.id));musicRender()};grid.append(button)}}

function musicFitPitch(notes=musicComposition().notes){const view=$('musicRollViewport'),low=notes.length?Math.min(...notes.map(n=>n.pitch)):60,high=notes.length?Math.max(...notes.map(n=>n.pitch)):84;mw.row=Math.round(clamp((view.clientHeight-65)/(high-low+5),6,22)*2)/2;$('musicPitchZoom').value=mw.row;musicDrawRoll();view.scrollTop=Math.max(0,(mw.max-high-2)*mw.row);musicDrawRoll()}
function musicRevealSelection(){const notes=musicSelected();if(!notes.length)return;const view=$('musicRollViewport'),low=Math.min(...notes.map(n=>n.pitch)),high=Math.max(...notes.map(n=>n.pitch));if(!mw.manualPitchZoom&&(high-low+3)*mw.row>view.clientHeight-52)musicFitPitch(notes);const top=(mw.max-high)*mw.row,bottom=(mw.max-low+1)*mw.row;if(top<view.scrollTop)view.scrollTop=top;else if(bottom>view.scrollTop+view.clientHeight-52)view.scrollTop=Math.max(0,bottom-view.clientHeight+65);const tick=Math.min(...notes.map(n=>n.startTick)),x=tick*musicGeometry().scale;if(x<view.scrollLeft||x>view.scrollLeft+view.clientWidth-80)view.scrollLeft=Math.max(0,x-view.clientWidth*.25);musicDrawRoll()}

/* 54-music-commands.js */
function musicNumber(id,min,max){const value=Number($(id).value);Music.assert(Number.isFinite(value)&&value>=min&&value<=max,'参数超出范围：'+$(id).parentElement.textContent);return value}
function musicEscape(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function musicDialog(title,html,apply=null){let d=$('musicDialog');if(!d){d=document.createElement('dialog');d.id='musicDialog';d.className='work-dialog';document.body.append(d)}d.onkeydown=null;d.onclick=null;d.onclose=null;d.innerHTML='<div class="dialog-head"><h2>'+musicEscape(title)+'</h2><button class="icon-btn" aria-label="关闭">'+appIcon('close')+'</button></div><div class="music-dialog-content">'+html+'</div><p id="musicDialogError" role="alert"></p><div class="dialog-footer">'+(apply?'<button id="musicDialogApply" class="btn-primary">应用</button>':'')+'</div>';d.querySelector('.icon-btn').onclick=()=>d.close();syncDialogAppearance();if(apply)$('musicDialogApply').onclick=()=>{try{apply();d.close()}catch(e){$('musicDialogError').textContent=e.message}};d.showModal();return d}
let musicReturnToPlayer;
function musicEdit(){if(mw.editing){musicExit();return}if(!state.project)return;pauseSong();cancelScoreEntrance();mw.returnView=captureTimelineView();const original=state.project;musicOpen(copy(original));MusicAudio.stop();mw.original=original;mw.project=copy(mw.project);state.project=mw.project;mw.editing=true;mw.history=[];mw.future=[];mw.playerPosition=mw.returnView.position;mw.baseline=JSON.stringify(mw.project);musicRender();toast('已进入全屏编曲工作台')}
function musicExit(action='exit'){musicStopRecording();musicFinishHeld();MusicAudio.stop();mw.pending=action;$('saveChoiceDialog').showModal();syncDialogAppearance()}
function musicSave(kind){try{musicStopRecording();musicFinishHeld();const old=mw.original;let chosen=old;if(kind!=='discard'){Music.validate(musicComposition());chosen=copy(mw.project);if(kind==='new'){chosen.id=nextId('copy');chosen.title+=' · 新曲谱';chosen.originKind='user';chosen.provenance={...chosen.provenance,derivedFrom:old.id}}Music.sync(chosen);const next=state.library.slice();if(kind==='new')next.unshift(chosen);else{const index=next.findIndex(x=>x.id===old.id);Music.assert(index>=0,'原曲不存在');next[index]=chosen}musicPersist(next);state.library=next}const action=mw.pending;mw.editing=false;mw.original=null;mw.project=chosen;state.project=chosen;mw.history=[];mw.future=[];$('saveChoiceDialog').close();musicReturnToPlayer(chosen,mw.returnView);renderLibrary();toast(kind==='discard'?'已退出编辑，未保存修改':kind==='new'?'已另存为独立曲谱':'已保存曲谱');if(kind==='new')openExport(true,action==='home');else if(action==='home')goHome()}catch(e){toast('保存失败，编辑副本仍保留：'+e.message,6000)}}
function musicAction(action){try{
 const c=musicComposition(),notes=musicSelected(),at=mw.cursor;
 if(action==='fitPitch'){mw.manualPitchZoom=false;musicFitPitch();return}
 if(action==='back'){if(mw.editing)musicExit('home');else{MusicAudio.stop();returnHomeFromPlayer()}return}
 if(action==='edit'){mw.editing?musicExit():musicEdit();return}
 if(action==='play'){musicFinishHeld();const wasPlaying=MusicAudio.playing;if(wasPlaying){MusicAudio.stop();mw.cursor=Music.msTick(c,MusicAudio.position)}else MusicAudio.play(c,MusicAudio.position).catch(e=>toast('播放失败：'+e.message,5000));toast(wasPlaying?'已暂停演奏':'正在开始演奏');return}
 if(action==='reset'){musicStopRecording();musicFinishHeld();MusicAudio.stop();MusicAudio.position=0;mw.cursor=0;musicDrawRoll();musicRenderClock();return}
 if(action==='undo'||action==='redo'){musicHistory(action==='redo');return}
 if(action==='export'){openExport();return}
 if(action==='record'){if(mw.recording)musicStopRecording();else musicStartRecording();return}
 if(action==='toggleTracks'||action==='toggleInspector'){$('musicWorkbench').classList.toggle(action==='toggleTracks'?'music-show-tracks':'music-show-inspector');return}
 if(action==='info'){musicDialog('歌曲信息','<label>名称<input id="musicMetaTitle" maxlength="120" value="'+musicEscape(mw.project.title)+'" '+(mw.editing?'':'readonly')+'></label><label>作者<input id="musicMetaAuthor" maxlength="100" value="'+musicEscape(mw.project.author||'')+'" '+(mw.editing?'':'readonly')+'></label><pre>'+musicEscape((c.source?.report||[]).join('\n')||'暂无导入警告')+'</pre>',mw.editing?()=>{const title=$('musicMetaTitle').value.trim();Music.assert(title,'名称不能为空');const author=$('musicMetaAuthor').value;musicCommand(()=>{mw.project.title=title;mw.project.author=author},{musical:false})}:null);return}
 if(action==='maps'){const d=musicDialog('速度与拍号标记','<h3>速度（四分音符BPM）</h3>'+c.tempoMap.map((m,i)=>'<p><button data-seek-tick="'+m.tick+'">'+Music.label(c,m.tick)+'</button> <input aria-label="BPM" data-tempo-value="'+i+'" type="number" step="any" value="'+m.bpm+'" '+(mw.editing?'':'disabled')+'> '+(mw.editing?'<button data-edit-tempo="'+i+'">应用</button>':'')+' '+(mw.editing&&i?'<button data-remove-tempo="'+i+'">移除</button>':'')+'</p>').join('')+'<h3>拍号</h3>'+c.meterMap.map((m,i)=>'<p><button data-seek-tick="'+m.tick+'">'+Music.label(c,m.tick)+'</button> <input aria-label="拍号" data-meter-value="'+i+'" value="'+m.numerator+'/'+m.denominator+'" '+(mw.editing?'':'disabled')+'> '+(mw.editing?'<button data-edit-meter="'+i+'">应用</button>':'')+' '+(mw.editing&&i?'<button data-remove-meter="'+i+'">移除</button>':'')+'</p>').join('')+'<p>点击位置定位；顶部可新增标记。拍号变更必须保持在小节边界。</p>');d.onclick=e=>{const el=e.target.closest('button');if(!el)return;const data=el.dataset;if(el.hasAttribute('data-seek-tick')){MusicAudio.stop();mw.cursor=Number(data.seekTick);MusicAudio.position=Music.tickMs(musicComposition(),mw.cursor);musicRender();d.close()}else if(el.hasAttribute('data-edit-tempo')){const index=Number(data.editTempo),bpm=Number(d.querySelector('[data-tempo-value="'+index+'"]').value);musicCommand(c=>{Music.assert(Number.isFinite(bpm)&&bpm>=1&&bpm<=999,'BPM需要1–999');c.tempoMap[index].bpm=bpm});d.close()}else if(el.hasAttribute('data-edit-meter')){const index=Number(data.editMeter),[numerator,denominator]=d.querySelector('[data-meter-value="'+index+'"]').value.split('/').map(Number);musicCommand(c=>{c.meterMap[index].numerator=numerator;c.meterMap[index].denominator=denominator});d.close()}else if(data.removeTempo){musicCommand(c=>c.tempoMap.splice(Number(data.removeTempo),1));d.close()}else if(data.removeMeter){musicCommand(c=>c.meterMap.splice(Number(data.removeMeter),1));d.close()}};return}
 if(action==='keymap'){musicKeymapDialog();return}
 if(action==='previewSky'){mw.sky=Music.skyPreview(c,{transpose:musicNumber('musicSkyTranspose',-48,48),fold:$('musicSkyFold').checked,approximate:$('musicSkyApprox').checked,key:$('musicSkyKey').value});$('musicSkyReport').textContent=mw.sky.events.length+'个起音，'+mw.sky.issues.length+'项差异，'+mw.sky.unresolved+'项待解决\n'+mw.sky.issues.slice(0,30).map(x=>Music.pitch(x.pitch)+'：'+x.reason).join('\n');return}
 if(action==='applySky'){Music.assert(mw.sky,'请先分析预览');const fresh=Music.skyPreview(c,{transpose:musicNumber('musicSkyTranspose',-48,48),fold:$('musicSkyFold').checked,approximate:$('musicSkyApprox').checked,key:$('musicSkyKey').value});Music.assert(JSON.stringify(fresh)===JSON.stringify(mw.sky),'参数已变化，请重新预览');Music.assert(!fresh.unresolved,'仍有不能映射的音符，请先解决');const p=copy(mw.project);p.id=nextId('sky');p.title+=' · 光遇改编';p.originKind='user';p.provenance={source:'光遇改编',derivedFrom:mw.project.id,changes:fresh.issues};p.composition=Music.validate({...copy(c),key:$('musicSkyKey').value,scale:'major',notes:copy(fresh.notes),source:{type:'sky-adaptation',adaptationOf:mw.project.id,originalComposition:copy(c),changes:fresh.issues}});Music.sync(p);const next=[p,...state.library];musicPersist(next);state.library=next;renderLibrary();toast('已生成独立光遇改编曲，完整原谱保留');return}
 if(action==='previewNumbers'){mw.numberPreview=Music.parseNumbers($('musicNumbers').value,c,mw.track,at,musicNumber('musicNumberOctave',-1,8),musicNumber('musicGate',0,200)/100);mw.numberPreviewSignature=JSON.stringify([$('musicNumbers').value,mw.track,at,$('musicNumberOctave').value,$('musicGate').value,c.key]);$('musicNumberReport').textContent=mw.numberPreview.notes.length+' 音符，'+mw.numberPreview.rests.length+' 休止 · '+mw.numberPreview.length+' Tick';return}
 Music.assert(mw.editing,'请先进入曲谱编辑');
 if(action==='calibrate'){musicCommand(c=>{const old=copy(c),bpm=musicNumber('musicBpm',1,999),[numerator,denominator]=$('musicMeter').value.split('/').map(Number);c.tempoMap=[{tick:0,bpm}];c.meterMap=[{tick:0,numerator,denominator}];for(const n of c.notes){const start=Music.tickMs(old,n.startTick),end=Music.tickMs(old,n.startTick+n.durationTicks),sound=Music.tickMs(old,n.startTick+n.soundTicks);n.startTick=Music.msTick(c,start);n.durationTicks=Music.msTick(c,end)-n.startTick;n.soundTicks=Music.msTick(c,sound)-n.startTick}for(const r of c.rests){const start=Music.tickMs(old,r.startTick),end=Music.tickMs(old,r.startTick+r.durationTicks);r.startTick=Music.msTick(c,start);r.durationTicks=Music.msTick(c,end)-r.startTick}c.lengthTicks=Music.msTick(c,Music.tickMs(old,old.lengthTicks));c.calibrated=true},{musical:false});return}
 if(action==='tempo'){const bpm=musicNumber('musicBpm',1,999);musicCommand(c=>{c.tempoMap=c.tempoMap.filter(m=>Math.abs(m.tick-at)>1e-7);c.tempoMap.push({tick:at,bpm})});return}
 if(action==='meter'){const [numerator,denominator]=$('musicMeter').value.split('/').map(Number);musicCommand(c=>{const p=Music.barPosition(c,at);Music.assert(p.beat===1&&Math.abs(p.tick)<1e-6,'请先定位到小节起点');c.meterMap=c.meterMap.filter(m=>Math.abs(m.tick-at)>1e-7);c.meterMap.push({tick:at,numerator,denominator})});return}
 if(action==='addTrack'){musicCommand(c=>{const track={id:Music.id('track'),name:'音轨 '+(c.tracks.length+1),instrument:'offline',volume:1,mute:false,solo:false};c.tracks.push(track);mw.track=track.id},{musical:false});return}
 if(action==='applyNumbers'){Music.assert(mw.numberPreview&&mw.numberPreviewSignature===JSON.stringify([$('musicNumbers').value,mw.track,at,$('musicNumberOctave').value,$('musicGate').value,c.key]),'请先预览当前数字谱和位置');const result=copy(mw.numberPreview);musicCommand(c=>{Music.insertRegion(c,mw.track,at,result.length,result.notes,$('musicWriteMode').value);c.rests.push(...result.rests);mw.cursor=at+result.length});return}
 if(action==='paste'){Music.assert(mw.clipboard.length,'剪贴板为空');musicCommand(c=>{const base=Math.min(...mw.clipboard.map(n=>n.startTick));for(const old of mw.clipboard){const n={...copy(old),id:Music.id(),trackId:mw.track,startTick:at+old.startTick-base};delete n.tieNext;c.notes.push(n)}c.lengthTicks=Math.max(c.lengthTicks,...c.notes.map(n=>n.startTick+n.durationTicks))});return}
 Music.assert(notes.length,'请先选中音符');if(action==='copy'){mw.clipboard=copy(notes);toast('已复制 '+notes.length+' 音符');return}
 if(action==='applyNote'){const pitch=musicNumber('musicPitch',0,127),start=Music.positionTick(c,musicNumber('musicStartBar',1,1e7),musicNumber('musicStartBeat',1,32),musicNumber('musicStartSub',0,3840)),length=$('musicNoteValue').value==='custom'?musicNumber('musicNoteLength',.001,1e9):Music.value($('musicNoteValue').value,$('musicNoteModifier').value),gate=musicNumber('musicNoteGate',0,200)/100,velocity=musicNumber('musicVelocity',1,127),first=notes[0],pitchDelta=pitch-first.pitch,timeDelta=start-first.startTick;musicCommand(c=>{for(const n of musicSelected()){Music.assert(n.pitch+pitchDelta>=0&&n.pitch+pitchDelta<=127,'音高超出MIDI范围');n.pitch+=pitchDelta;n.startTick=Math.max(0,n.startTick+timeDelta);n.durationTicks=length;n.gate=gate;n.soundTicks=length*gate;n.velocity=velocity;delete n.originalMs}c.lengthTicks=Math.max(c.lengthTicks,...c.notes.map(n=>n.startTick+n.durationTicks))});return}
 if(action==='applyTicks'||action==='applyMs'){const start=action==='applyTicks'?musicNumber('musicStart',0,1e9):Music.msTick(c,musicNumber('musicStartMs',0,36000000)),length=action==='applyTicks'?musicNumber('musicNoteLength',.001,1e9):null,sound=action==='applyMs'?musicNumber('musicSoundMs',0,36000000):null,base=notes[0].startTick;musicCommand(()=>{for(const n of musicSelected()){n.startTick=Math.max(0,n.startTick+start-base);if(length!==null){n.durationTicks=length;n.soundTicks=length*n.gate}else{n.soundTicks=Music.msTick(c,Music.tickMs(c,n.startTick)+sound)-n.startTick;n.gate=n.soundTicks/n.durationTicks}delete n.originalMs}},{musical:action==='applyTicks'});return}
 if(action==='applySound'){const length=musicNumber('musicSoundTicks',0,1e9);musicCommand(()=>{for(const n of musicSelected()){n.soundTicks=length;n.gate=length/n.durationTicks}},{musical:false});return}
 musicCommand(c=>{const selected=musicSelected(),ids=new Set(selected.map(n=>n.id)),base=Math.min(...selected.map(n=>n.startTick)),grid=musicGrid();
  if(action==='delete'){c.notes=c.notes.filter(n=>!ids.has(n.id));mw.selected.clear()}
  else if(['up','down','left','right','transpose'].includes(action)){const amount=action==='transpose'?musicNumber('musicTranspose',-127,127):action==='up'?1:-1;for(const n of selected){if(action==='left'||action==='right')n.startTick=Math.max(0,n.startTick+(action==='right'?grid:-grid));else{let pitch=n.pitch+amount;if(action!=='transpose'&&$('musicDiatonic').checked){const scale=c.scale==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11],root=(KEY_ROOTS[c.key]||60)%12;while(pitch>=0&&pitch<=127&&!scale.includes(((pitch-root)%12+12)%12))pitch+=amount}Music.assert(pitch>=0&&pitch<=127,'音高超出MIDI范围');n.pitch=pitch}}}
  else if(action==='quantize')for(const n of selected)n.startTick=Math.max(0,Math.round(n.startTick/grid)*grid);
  else if(action==='quantizeLength')for(const n of selected){const ratio=n.soundTicks/n.durationTicks;n.durationTicks=Math.max(grid,Math.round(n.durationTicks/grid)*grid);n.soundTicks=n.durationTicks*ratio}
  else if(action==='stretch'){const k=musicNumber('musicStretch',.1,10);for(const n of selected){n.startTick=base+(n.startTick-base)*k;n.durationTicks*=k;n.soundTicks*=k}}
  else if(action==='offset'||action==='quantizeMs'){const amount=musicNumber(action==='offset'?'musicOffset':'musicMsGrid',action==='offset'?-36000000:1,36000000);for(const n of selected){const ms=Music.tickMs(c,n.startTick);n.startTick=Music.msTick(c,Math.max(0,action==='offset'?ms+amount:Math.round(ms/amount)*amount))}}
  else if(action==='tie'){const sorted=[...selected].sort((a,b)=>a.startTick-b.startTick);let count=0;for(const n of sorted){const next=sorted.find(x=>x.id!==n.id&&x.pitch===n.pitch&&x.trackId===n.trackId&&Math.abs(x.startTick-n.startTick-n.durationTicks)<1e-6);if(next){n.tieNext=next.id;count++}}Music.assert(count,'请选择同轨、同音高且首尾相接的音符')}
  c.lengthTicks=Math.max(c.lengthTicks,...c.notes.map(n=>n.startTick+Math.max(n.durationTicks,n.soundTicks)));
 },{musical:!['offset','quantizeMs'].includes(action)});
 }catch(error){toast(error.message,5000);if(action==='previewNumbers')$('musicNumberReport').textContent=error.message}}
function musicBindings(){let codes,pitches;try{codes=JSON.parse(localStorage.getItem('sky-studio-keymap-v1')||'null');pitches=JSON.parse(localStorage.getItem('sky-studio-pitches-v2')||'null')}catch(e){}if(!Array.isArray(codes)||codes.length!==15||!codes.every(validConsoleCode)||new Set(codes).size!==15)codes=[...PLAYER_RULES.editor.keyboardCodes];if(!Array.isArray(pitches)||pitches.length!==15||!pitches.every(p=>Number.isInteger(p)&&p>=0&&p<=127))pitches=SCALE.map(n=>60+n);return {codes,pitches}}
function musicKeymapDialog(){const {codes,pitches}=musicBindings();const d=musicDialog('键盘映射 · 点击按钮再按键','<p>15个可自定义槽；右侧MIDI音高可设为黑键，八度偏移在工作台左侧调整。重复键自动交换。</p><button id="musicKeymapDefault">恢复默认（保存后生效）</button><div id="musicKeymapRows"></div>',()=>{Music.assert(new Set(codes).size===15,'按键重复');localStorage.setItem('sky-studio-keymap-v1',JSON.stringify(codes));localStorage.setItem('sky-studio-pitches-v2',JSON.stringify(pitches));toast('已保存键盘映射')});let pending=-1;const render=()=>{const root=$('musicKeymapRows');root.innerHTML='';for(let i=0;i<15;i++){const row=document.createElement('label'),button=document.createElement('button'),input=document.createElement('input');button.textContent=(i+1)+' · '+keymapLabel(codes[i])+(pending===i?' · 等待按键':'');button.onclick=()=>{pending=i;render();$('musicKeymapRows').children[i].querySelector('button').focus()};input.type='number';input.min=0;input.max=127;input.value=pitches[i];input.setAttribute('aria-label','音键 '+(i+1)+' 的MIDI音高');input.onchange=()=>{pitches[i]=clamp(Math.round(Number(input.value)),0,127)};row.append(button,input);root.append(row)}};render();$('musicKeymapDefault').onclick=()=>{codes.splice(0,15,...PLAYER_RULES.editor.keyboardCodes);pitches.splice(0,15,...SCALE.map(n=>60+n));pending=-1;render()};d.onkeydown=e=>{if(pending<0)return;if(e.code==='Escape'){e.preventDefault();pending=-1;render();return}if(e.code==='Tab')return;e.preventDefault();if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||!validConsoleCode(e.code))return;const other=codes.indexOf(e.code);if(other>=0)codes[other]=codes[pending];codes[pending]=e.code;pending=-1;render()}}

/* 55-music-input.js */
function musicBindPointer(){const canvas=$('musicCanvas'),view=$('musicRollViewport');const point=e=>{const r=canvas.getBoundingClientRect(),g=musicGeometry(),x=e.clientX-r.left,y=e.clientY-r.top;return {x,y,pitch:clamp(mw.max-Math.floor((y-52+g.y)/mw.row),0,127),tick:Math.max(0,(x-64+g.x)/g.scale),g}};
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;view.focus();const p=point(e),c=musicComposition();if(p.x<64&&p.y>=52){e.preventDefault();musicNoteDown('pointer-'+e.pointerId,p.pitch);canvas.setPointerCapture(e.pointerId);return}if(p.y<52){musicFinishHeld();MusicAudio.stop();mw.cursor=p.tick;MusicAudio.position=Music.tickMs(c,p.tick);musicRenderClock();musicDrawRoll();return}const hits=c.notes.filter(n=>p.pitch===n.pitch&&p.tick>=n.startTick&&p.tick<=n.startTick+Math.max(n.durationTicks,4/p.g.scale));const hit=hits.findLast(n=>n.trackId===mw.track)||hits.at(-1);musicFinishHeld();MusicAudio.stop();e.preventDefault();if(hit){if(e.shiftKey){mw.selected.has(hit.id)?mw.selected.delete(hit.id):mw.selected.add(hit.id)}else if(!mw.selected.has(hit.id)){mw.selected=new Set([hit.id])}mw.track=hit.trackId;mw.cursor=hit.startTick;MusicAudio.position=Music.tickMs(c,hit.startTick);if(mw.editing){const right=64+(hit.startTick+hit.durationTicks)*p.g.scale-p.g.x;mw.gesture={kind:Math.abs(p.x-right)<7?'resize':'move',snapshot:copy(c),projectSnapshot:musicSnapshot(),ids:new Set(mw.selected),x:p.x,y:p.y,tick:p.tick,pitch:p.pitch,changed:false}}}else if(mw.editing&&mw.tool==='draw'){const start=Math.max(0,Math.round(p.tick/musicGrid())*musicGrid()),duration=musicDuration(),gate=musicNumber('musicGate',0,200)/100;musicCommand(c=>{const n={id:Music.id(),trackId:mw.track,pitch:p.pitch,startTick:start,durationTicks:duration,soundTicks:duration*gate,gate,velocity:85};c.notes.push(n);c.lengthTicks=Math.max(c.lengthTicks,start+duration);mw.selected=new Set([n.id])})}else{if(!e.shiftKey)mw.selected.clear();mw.cursor=p.tick;MusicAudio.position=Music.tickMs(c,p.tick);mw.gesture={kind:'box',x:p.x,y:p.y,lastX:p.x,lastY:p.y,tick:p.tick,pitch:p.pitch,add:e.shiftKey,base:new Set(mw.selected)}}canvas.setPointerCapture(e.pointerId);musicRender()});
 canvas.addEventListener('pointermove',e=>{const a=mw.gesture;if(!a)return;const p=point(e);if(a.kind==='box'){a.lastX=p.x;a.lastY=p.y;const lo=Math.min(a.tick,p.tick),hi=Math.max(a.tick,p.tick),bottom=Math.min(a.pitch,p.pitch),top=Math.max(a.pitch,p.pitch);mw.selected=new Set(a.base);for(const n of musicComposition().notes)if(n.startTick<=hi&&n.startTick+n.durationTicks>=lo&&n.pitch>=bottom&&n.pitch<=top)mw.selected.add(n.id);musicDrawRoll();return}if(!mw.editing||Math.abs(p.x-a.x)+Math.abs(p.y-a.y)<3&&!a.changed)return;try{musicRequireCalibrated();a.changed=true;const dx=Math.round((p.tick-a.tick)/musicGrid())*musicGrid(),dy=p.pitch-a.pitch,c=copy(a.snapshot);for(const n of c.notes.filter(n=>a.ids.has(n.id))){if(a.kind==='resize'){const ratio=n.soundTicks/n.durationTicks;n.durationTicks=Math.max(musicGrid(),n.durationTicks+dx);n.soundTicks=n.durationTicks*ratio}else{n.startTick=Math.max(0,n.startTick+dx);n.pitch=clamp(n.pitch+dy,0,127)}delete n.originalMs}c.lengthTicks=Math.max(c.lengthTicks,...c.notes.map(n=>n.startTick+n.durationTicks));mw.project.composition=c;musicDrawRoll()}catch(error){mw.gesture=null;toast(error.message)}});
 const end=e=>{if(mw.held.has('pointer-'+e.pointerId)){musicNoteUp('pointer-'+e.pointerId);return}const a=mw.gesture;mw.gesture=null;if(a?.changed){try{mw.project.composition=Music.validate(musicComposition());mw.history.push(a.projectSnapshot);mw.future=[];Music.sync(mw.project)}catch(error){mw.project.composition=a.snapshot;toast(error.message)}}musicRender()};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',e=>{if(mw.gesture)end(e)});
 $('musicVelocityCanvas').onclick=e=>{if(!mw.editing)return;const list=musicSelected(),r=e.target.getBoundingClientRect(),index=Math.floor((e.clientX-r.left)/r.width*list.length),n=list[index];if(n)musicCommand(()=>{n.velocity=clamp(Math.round((1-(e.clientY-r.top)/66)*127),1,127)},{musical:false})};
}
function musicBindKeyboard(){document.addEventListener('keydown',e=>{if(!mw.active||document.querySelector('dialog[open]')||e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.ctrlKey||e.metaKey){const cmd={KeyZ:e.shiftKey?'redo':'undo',KeyY:'redo',KeyC:'copy',KeyV:'paste',KeyS:'edit',KeyA:'selectAll'}[e.code];if(cmd){e.preventDefault();if(cmd==='selectAll'){mw.selected=new Set(musicComposition().notes.filter(n=>n.trackId===mw.track).map(n=>n.id));musicRender()}else musicAction(cmd)}return}if(e.altKey||e.isComposing)return;const actions={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Delete:'delete',Backspace:'delete',Space:'play'};if(actions[e.code]){if(e.target.closest('button')&&e.code==='Space')return;e.preventDefault();if(!e.repeat)musicAction(actions[e.code]);return}const {codes,pitches}=musicBindings();const slot=codes.indexOf(e.code);if(slot>=0){e.preventDefault();if(!e.repeat)musicNoteDown(e.code,clamp(pitches[slot]+Number($('musicOctave').value)*12,0,127))}});document.addEventListener('keyup',e=>{if(mw.held.has(e.code)){e.preventDefault();musicNoteUp(e.code)}});window.addEventListener('blur',musicFinishHeld);document.addEventListener('visibilitychange',()=>{if(document.hidden){musicFinishHeld();musicStopRecording();MusicAudio.stop()}});$('musicKey').onchange=()=>musicCommand(c=>{c.key=$('musicKey').value},{musical:false});$('musicScaleMode').onchange=()=>musicCommand(c=>{c.scale=$('musicScaleMode').value},{musical:false})}
function musicNoteDown(code,pitch){if(mw.held.has(code))return;const project=mw.project,track=copy(musicTrack()),held={pitch,track,wallStart:performance.now(),generation:MusicAudio.generation,released:false,voice:null,at:Math.max(0,MusicAudio.now()),startTick:mw.cursor};mw.held.set(code,held);MusicAudio.prepare(musicComposition()).then(ready=>{if(!mw.active||mw.project!==project||MusicAudio.generation>held.generation+1||(!held.released&&MusicAudio.generation!==held.generation))return;held.voice=MusicAudio.note(pitch,track,getAudio().currentTime+.005,held.released?140:0,85,!held.released)}).catch(error=>toast(error.message));if(!mw.editing)return;try{musicRequireCalibrated();if(mw.recording){held.startMs=Math.max(mw.recording.startMs,MusicAudio.now())}else if($('musicRecordMode').value==='step'){if(!mw.stepCapture)mw.stepCapture={trackId:mw.track,start:mw.cursor,duration:musicDuration(),gate:musicNumber('musicGate',0,200)/100,pitches:new Set(),mode:$('musicWriteMode').value};mw.stepCapture.pitches.add(pitch)}}catch(error){toast(error.message,4000)}}
function musicNoteUp(code){const h=mw.held.get(code);if(!h)return;h.released=true;h.voice?.release();mw.held.delete(code);if(mw.recording&&Number.isFinite(h.startMs)){const c=musicComposition(),end=Math.max(h.startMs+1,MusicAudio.now()),rawStart=Music.msTick(c,h.startMs),rawEnd=Music.msTick(c,end),grid=musicGrid(),start=mw.recording.mode==='quantized'?Math.round(rawStart/grid)*grid:rawStart;let duration=rawEnd-rawStart;if($('musicLengthQuantize').checked)duration=Math.max(grid,Math.round(duration/grid)*grid);mw.recording.notes.push({id:Music.id(),trackId:mw.recording.trackId,pitch:h.pitch,startTick:Math.max(mw.recording.startTick,start),durationTicks:Math.max(.001,duration),soundTicks:Math.max(.001,duration),gate:1,velocity:85,performance:{startMs:h.startMs,durationMs:end-h.startMs,wallStartMs:h.wallStart,wallDurationMs:performance.now()-h.wallStart,baseLatencyMs:(getAudio().baseLatency||0)*1000}})}if(!mw.held.size&&mw.stepCapture){const group=mw.stepCapture;mw.stepCapture=null;const notes=[...group.pitches].map(pitch=>({id:Music.id(),trackId:group.trackId,pitch,startTick:group.start,durationTicks:group.duration,soundTicks:group.duration*group.gate,gate:group.gate,velocity:85}));musicCommand(c=>{Music.insertRegion(c,group.trackId,group.start,group.duration,notes,group.mode);mw.cursor=group.start+group.duration;MusicAudio.position=Music.tickMs(c,mw.cursor);mw.selected=new Set(notes.map(n=>n.id))})}}
function musicFinishHeld(){for(const code of [...mw.held.keys()])musicNoteUp(code)}
async function musicStartRecording(){if(!mw.editing||mw.preparing)return;mw.preparing=true;try{musicRequireCalibrated();Music.assert(!mw.loop.enabled,'实时录制请先关闭区间循环');if($('musicRecordMode').value==='step'){toast('步骤输入：按住多个音键形成和弦，全部松开后前进');return}musicFinishHeld();const project=mw.project,startTick=mw.cursor,startMs=Music.tickMs(musicComposition(),startTick);await MusicAudio.play(musicComposition(),startMs);if(mw.project!==project||!mw.active||!mw.editing||!MusicAudio.playing)return;mw.recording={mode:$('musicRecordMode').value,writeMode:$('musicWriteMode').value,startTick,startMs,trackId:mw.track,notes:[]};$('musicRecord').textContent='停止并提交';$('musicStatus').textContent='录制中 · 按下/松开各音键独立记录';toast('开始'+(mw.recording.mode==='free'?'自由':'节拍')+'录制')}catch(error){toast(error.message,5000)}finally{mw.preparing=false}}
function musicStopRecording(){if(!mw.recording)return;musicFinishHeld();const recording=mw.recording,end=Math.max(recording.startTick+.001,Music.msTick(musicComposition(),Math.max(recording.startMs,MusicAudio.now())));mw.recording=null;MusicAudio.stop();$('musicRecord').textContent='开始录制';if(!recording.notes.length){musicRender();toast('未录入音符');return}const length=Math.max(end-recording.startTick,...recording.notes.map(n=>n.startTick+n.durationTicks-recording.startTick));musicCommand(c=>{Music.insertRegion(c,recording.trackId,recording.startTick,length,recording.notes,recording.writeMode);mw.cursor=recording.startTick+length;MusicAudio.position=Music.tickMs(c,mw.cursor);mw.selected=new Set(recording.notes.map(n=>n.id))});toast('已提交整段录制，可一次撤销')}

/* 56-music-integration.js */
// Compatibility is deliberately at the boundary; legacy sources and test fixtures remain readable.
const legacyNormalize=normalize,legacyScoreDocument=scoreDocument,legacyProjectEntry=projectEntry,legacyValidateEntry=validateEntry,legacyReadMusicResource=readMusicResource,legacyParseMIDI=parseMIDI,legacyParseXML=parseMusicXML,legacyExportMIDI=exportMIDI,legacyLoadLibrary=loadLibrary;
normalize=function(raw){const composition=raw.composition||(raw.format==='skytrack'&&raw.schemaVersion===2?raw:null)||(raw.score?.format==='skytrack'&&raw.score.schemaVersion===2?raw.score:null)||(raw.music?.schemaVersion===2&&raw.music.format==='skytrack'?raw.music:null);if(!composition)return legacyNormalize(raw);const c=Music.validate(composition),p=legacyNormalize({...raw,score:{mode:'free',events:[]}});p.composition=c;Music.sync(p);return p};
scoreDocument=function(p){return p.composition?Music.validate(p.composition):legacyScoreDocument(p)};
projectEntry=function(p){if(!p.composition)return legacyProjectEntry(p);return {format:'skymusic',schemaVersion:3,id:p.id,title:p.title,subtitle:p.subtitle,author:p.author,description:p.description,music:scoreDocument(p),theme:{id:sceneId(p)},card:copy(p.card||{}),playback:copy(p.playback),provenance:copy(p.provenance||{})}};
validateEntry=function(entry){if(entry?.format==='skymusic'&&entry.schemaVersion===3){Music.assert(typeof entry.id==='string'&&entry.id.length>0&&entry.id.length<=100,'单曲ID无效');Music.validate(entry.music);Music.assert(entry.theme&&Object.keys(entry.theme).length===1&&Object.hasOwn(THEME_DEFINITIONS,entry.theme.id),'主题尚未录入平台');return entry}return legacyValidateEntry(entry)};
const legacyCompose=platformController.compose;platformController.compose=function(entry){if(entry?.schemaVersion===3){validateEntry(entry);return normalize({...entry,composition:entry.music,theme:{id:entry.theme.id}})}return legacyCompose(entry)};
readMusicResource=async function(bytes){const data=asBytes(bytes);if(data[0]===80&&data[1]===75)return legacyReadMusicResource(bytes);const raw=JSON.parse(DECODER.decode(data));if(raw.format==='skytrack'&&raw.schemaVersion===2)return Music.project(raw);return legacyReadMusicResource(bytes)};
parseMIDI=function(buffer){if(!document.createComment)return legacyParseMIDI(buffer);const c=Music.fromMIDI(buffer);return {project:Music.project(c,'导入的 MIDI'),warning:'已保留完整音高与多轨。'+[...new Set(c.source.report)].slice(0,5).join('；')}};
parseMusicXML=function(text){if(!document.createComment)return legacyParseXML(text);const c=Music.fromXML(text);return {project:Music.project(c,'导入的 MusicXML'),warning:'已保留声部和音乐时值。'+[...new Set(c.source.report)].slice(0,5).join('；')}};
exportMIDI=function(p){if(!p.composition)return legacyExportMIDI(p);try{downloadBytes(escName(p.title)+'.mid',Music.midiBytes(p.composition),'audio/midi')}catch(error){toast('MIDI导出失败：'+error.message,6000)}};
const legacyExportCSV=exportCSV,legacyParseCSV=parseCSV;
exportCSV=function(p){if(!p.composition)return legacyExportCSV(p);const c=Music.validate(p.composition),metadata={...c};delete metadata.notes;const lines=['#SKYTRACK2,'+bytesToBase64(ENCODER.encode(JSON.stringify(metadata))),'id,track_id,midi_pitch,start_tick,duration_ticks,sound_ticks,velocity,gate,start_ms,sound_ms,note_json'];for(const n of c.notes)lines.push([n.id,n.trackId,n.pitch,n.startTick,n.durationTicks,n.soundTicks,n.velocity,n.gate,Music.tickMs(c,n.startTick),Music.tickMs(c,n.startTick+n.soundTicks)-Music.tickMs(c,n.startTick),JSON.stringify(n)].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(','));downloadBytes(escName(p.title)+'.csv',ENCODER.encode('\ufeff'+lines.join('\r\n')),'text/csv;charset=utf-8')};
parseCSV=function(text){text=text.replace(/^\uFEFF/,'');if(!text.startsWith('#SKYTRACK2,'))return legacyParseCSV(text);const lines=text.split(/\r?\n/),c=JSON.parse(DECODER.decode(base64ToBytes(lines[0].slice(11))));c.notes=lines.slice(2).filter(x=>x.trim()).map(line=>{const values=[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replaceAll('""','"'));Music.assert(values.length>=10,'CSV音符列不完整');return {...(values[10]?JSON.parse(values[10]):{}),id:values[0],trackId:values[1],pitch:Number(values[2]),startTick:Number(values[3]),durationTicks:Number(values[4]),soundTicks:Number(values[5]),velocity:Number(values[6]),gate:Number(values[7])}});return Music.project(c,'导入的 CSV 乐谱')};
const MusicStorage={raw:null,rejected:[],blocked:false};
loadLibrary=function(){if(!document.createComment)return legacyLoadLibrary();try{const raw=localStorage.getItem('sky-studio-projects-v03')||localStorage.getItem('sky-studio-projects-v02');MusicStorage.raw=raw;if(!raw)return;const records=JSON.parse(raw);Music.assert(Array.isArray(records),'曲库格式无效');MusicStorage.rejected=[];for(const record of records){try{const p=normalize({...record,originKind:BUILTIN_IDS.has(record.id)?'builtin':record.originKind||'user'}),index=state.library.findIndex(p=>p.id===record.id);LOCALLY_LOADED_IDS.add(p.id);if(index<0)state.library.push(p);else state.library[index]=p}catch(error){MusicStorage.rejected.push(record)}}if(MusicStorage.rejected.length)console.warn('保留未能读取的曲库记录',MusicStorage.rejected.length)}catch(error){MusicStorage.blocked=true;console.error('原曲库保留，写入已暂停',error)}};
function musicPersist(library){Music.assert(!MusicStorage.blocked,'原曲库格式损坏，写入已暂停；请先导出当前曲谱备份');const records=library.map(p=>({...p,_imageBytes:null,_imageUrl:(p._imageUrl?.length||0)<500000?p._imageUrl:null}));for(const p of records)if(p.composition)Music.validate(p.composition);for(const raw of MusicStorage.rejected)records.push(raw);const text=JSON.stringify(records);if(MusicStorage.raw&&!localStorage.getItem('sky-studio-projects-v03-backup-musical-v2'))localStorage.setItem('sky-studio-projects-v03-backup-musical-v2',MusicStorage.raw);localStorage.setItem('sky-studio-projects-v03',text);scheduleDbBackup?.()}
function activePlayerSurface(){return mw.active?$('musicWorkbench'):$('playerView')}
function installMusicWorkbench(){if(!document.createComment||!PLAYER_RULES.workbench?.enabled)return;musicUI();
 const originalOpen=openSong,originalHome=goHome,originalComplete=completeEdit,originalCreate=createProject,originalDraw=drawRoll,originalRefresh=resetStartupNavigation,originalSaveLibrary=saveLibrary;
 saveLibrary=function(){state.beatLayoutCache=null;try{musicPersist(state.library)}catch(error){toast(error.message,5000)}};
 openSong=function(id){if(mw.editing){musicExit();return}const p=state.library.find(x=>x.id===id);if(!p)return;try{musicStopRecording();musicFinishHeld();MusicAudio.stop();mw.active=false;mw.editing=false;$('musicWorkbench').hidden=true;originalOpen(id)}catch(error){toast('无法装配音乐：'+error.message,6000)}};
 goHome=function(){if(mw.active&&mw.editing){musicExit('home');return}musicStopRecording();musicFinishHeld();MusicAudio.stop();mw.active=false;$('musicWorkbench').hidden=true;return originalHome()};
 completeEdit=function(kind){if(mw.active&&mw.editing)return musicSave(kind);return originalComplete(kind)};
 drawRoll=function(){if(mw.active)return;return originalDraw()};
 resetStartupNavigation=function(home=true){musicStopRecording();musicFinishHeld();MusicAudio.stop();mw.active=false;mw.editing=false;$('musicWorkbench').hidden=true;originalRefresh(home);};
 $('scoreEditorBtn').onclick=()=>musicEdit();
 musicReturnToPlayer=function(chosen,view){mw.active=false;mw.editing=false;$('musicWorkbench').hidden=true;originalOpen(chosen.id);applyTimelineView(view);refreshWorkspace()};
 const form=$('createDialog').querySelector('.fields-grid');const fields=document.createElement('div');fields.className='music-create-fields';fields.innerHTML='<label>BPM（四分音符）<input id="createMusicBpm" type="number" min="1" max="999" value="120"></label><label>拍号<select id="createMusicMeter"><option>4/4</option><option>3/4</option><option>6/8</option><option>2/4</option><option>9/8</option><option>12/8</option></select></label><label>网格<select id="createMusicGrid"><option value="4">四分</option><option selected value="8">八分</option><option value="16">十六分</option></select></label><label>写入时值<select id="createMusicValue"><option value="4">四分</option><option selected value="8">八分</option><option value="16">十六分</option></select></label><label>Gate %<input id="createMusicGate" type="number" min="0" max="200" value="90"></label><label>调性<select id="createMusicKey"></select></label><label>调式<select id="createMusicScale"><option value="major">大调</option><option value="minor">自然小调</option></select></label>';form.after(fields);for(const k of Object.keys(KEY_ROOTS).filter(k=>k!=='sky-original'))$('createMusicKey').add(new Option(KEY_DEGREES[k][0],k));$('createInterval').closest('label').hidden=true;const originalNewSong=$('newSongBtn').onclick;$('newSongBtn').onclick=()=>{originalNewSong();const d=PLAYER_RULES.workbench.defaults;$('createMusicBpm').value=d.bpm;$('createMusicMeter').value=d.meter.join('/');$('createMusicGrid').value=d.grid;$('createMusicValue').value=d.value;$('createMusicGate').value=d.gate*100;$('createMusicKey').value='C';$('createMusicScale').value='major'};
 createProject=function(){const title=$('createTitle').value.trim();if(!title){$('createTitle').focus();$('createTitle').setAttribute('aria-invalid','true');$('createTitleError').hidden=false;return}try{const c=Music.blank(musicNumber('createMusicBpm',1,999),$('createMusicMeter').value.split('/').map(Number),$('createMusicKey').value),duration=musicNumber('createDuration',5,3600)*1000;c.scale=$('createMusicScale').value;c.lengthTicks=Music.msTick(c,duration);const p=Music.project(c,title.slice(0,120),{theme:{id:$('createTheme').value},originKind:'user',playback:{volume:.25,sustain:0,tuning:c.key}}),next=[p,...state.library];musicPersist(next);state.library=next;$('createDialog').close();renderLibrary();openSong(p.id);$('musicGrid').value=$('createMusicGrid').value;$('musicValue').value=$('createMusicValue').value;$('musicGate').value=$('createMusicGate').value;musicEdit()}catch(error){toast(error.message,5000)}};$('createConfirm').onclick=createProject;
 window.SKY_MUSIC_TEST={Music,MusicAudio,mw,musicAction,musicCommand,musicOpen,musicEdit,musicExit,musicSave,musicPersist,musicNoteDown,musicNoteUp,musicStartRecording,musicStopRecording,musicRender,musicComposition};
}

const legacyMusicPreload=preloadPiano,legacyMusicSchedule=scheduleAudio,legacyMusicBeginClock=beginClock,legacyMusicStopVoices=stopVoices;
preloadPiano=async function(){if(!state.project?.composition)return legacyMusicPreload();return MusicAudio.prepare(state.project.composition)};
stopVoices=function(){legacyMusicStopVoices();for(const voice of [...MusicAudio.voices])voice.stop()};
beginClock=function(){if(state.project?.composition){state.musicPlaybackEvents=Music.compile(state.project.composition);state.musicPlaybackIndex=lowerBound(state.musicPlaybackEvents,state.position-2)}return legacyMusicBeginClock()};
scheduleAudio=function(){if(!state.project?.composition)return legacyMusicSchedule();if(!state.isPlaying)return;const events=state.musicPlaybackEvents||[],now=realPosition(),limit=Math.min(state.project.durationMs,now+170*state.rate);MusicAudio.rate=state.rate;while(state.musicPlaybackIndex<events.length&&events[state.musicPlaybackIndex].timeMs<=limit){const e=events[state.musicPlaybackIndex++];if(e.timeMs<now-35)continue;MusicAudio.note(e.pitch,e.track,state.audioCtx.currentTime+Math.max(.001,(e.timeMs-now)/(1000*state.rate)),e.durationMs,e.velocity)}};

/* 99-bootstrap.js */
function install(){bindAppIcons();restorePlatformThemes();state.library=BUILTINS.map(p=>normalize(p));loadLibrary();snowPopulate($('worldSnow'),70);snowPopulate($('stageSnow'),24,'stage');$('showGuide').onclick=()=>$('helpDialog').showModal();for(let b of document.querySelectorAll('[data-import]'))b.onclick=openImport;$('songSearch').oninput=renderLibrary;
 $('fileInput').onchange=async ev=>{let files=[...(ev.target.files||[])],file=files[0];ev.target.value='';if(!file)return;toast('正在检查 '+file.name,1200);try{await importFiles(files)}catch(err){console.error('Import failed',err);toast('导入失败：'+err.message,7500)}};
 $('importThemeLibrary').onclick=openThemeRepository;$('themeLibraryInput').onchange=async ev=>{const file=ev.target.files?.[0];ev.target.value='';if(file)try{await importFile(file)}catch(error){toast('主题录入失败：'+error.message,7500)}};
 bindPlayerInteractions();
 bindRangePicker();bindInstrumentPicker();bindSpeedPicker();bindWorkspace();bindScoreConsole();bindVideo();bindHomeExperience();renderLibrary();const navigation=performance.getEntriesByType?.('navigation')?.[0];if(navigation?.type==='reload'){try{history.replaceState(null,'',location.pathname+location.search)}catch(error){}}else if(location.hash.startsWith('#song=')){let id=decodeURIComponent(location.hash.slice(6));if(state.library.some(x=>x.id===id))openSong(id)}
 }
// Browsers can restore a complete page or its form controls independently of app data.
function resetStartupNavigation(home=true){
 cancelScoreEntrance();
 cancelSongEntry();
 stopConsoleRecording();cancelRollDrag();pauseSong();cancelRollFinish();closeInstrumentPicker();closeSpeedPicker();closeRangePicker();
 if($('scoreConsole').open)closeScoreConsole();
 if(state.editMode&&state.editSource)state.project=state.editSource;
 state.editMode=false;state.editDirty=false;state.editSource=null;state.editBaseline=null;state.pendingEditAction=null;
 state.history.clear();state.future.clear();scoreConsole.views.clear();scoreConsole.returnView=null;scoreConsole.selection=null;scoreConsole.selectedNote=null;scoreConsole.mode=PLAYER_RULES.editor.initialMode;
 state.position=0;state.rollPageStart=0;state.windowSec=PLAYER_RULES.roll.initialSeconds;state.selected=0;state.lastSelected=-1;state.page=-1;state.beatLayoutCache=null;
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 for(const id of ['consoleInterval','consoleNoteDuration','consoleGenerateInterval','consoleNumberScore','quantizeMs','offsetMs','batchDuration','stretchFactor']){const input=$(id);input.value=input.defaultValue}
 $('consoleRecordMode').value='insert';for(const b of document.querySelectorAll('[data-write-mode]'))b.setAttribute('aria-pressed',String(b.dataset.writeMode==='insert'));$('rollWindow').value=String(state.windowSec);$('timeClock').textContent=positionFmt(0);$('consoleClock').textContent=positionFmt(0);$('seekSlider').value='0';$('rollSeekSlider').value='0';setControlContent($('playBtn'),'play','播放');
 updateEditButton();
 if(home){state.mode='home';state.project=null;resetHomePresentation();$('playerView').hidden=true;$('homeView').hidden=false;$('songSearch').value='';$('libraryFilter').value='all';$('homeView').scrollTop=0;try{history.replaceState(null,'',location.pathname+location.search)}catch(error){}renderLibrary()}
 else if(state.project){refreshWorkspace()}
 try{window.scrollTo(0,0)}catch(error){}
}
function bindStartupNavigation(){
 try{history.scrollRestoration='manual'}catch(error){}
 window.addEventListener('pageshow',event=>{const navigation=performance.getEntriesByType?.('navigation')?.[0],home=event.persisted||navigation?.type==='reload'||state.mode==='home';resetStartupNavigation(home);requestAnimationFrame(()=>{if(state.position===0&&!state.editMode){$('seekSlider').value='0';$('rollSeekSlider').value='0';$('rollWindow').value=String(PLAYER_RULES.roll.initialSeconds)}})});
}
// Avoid editing the user-provided v7 backup: all transforms occur on copied score objects.

window.__SKY_STUDIO_TEST__={state,scoreConsole,refreshWorkspace,openSong,goHome,normalize,makeZip,readZip,unpackProject,parseMIDI,parseCSV,parseMusicXML,exportProject,exportMIDI,exportCSV,importFile,createProject,renameSong,renameConfirmed,duplicateSong,deleteSong,deleteConfirmed,completeEdit,openEditor,requestFinishEdit,KEY_ROOTS,noteMidi,noteName,rollFrame,rollTimeLabels,rollPlotGeometry,platformController,importFiles,importPlatformFile,readMusicResource,exportPlatformEntry,projectEntry,PLAYER_RULES,THEME_DEFINITIONS,bindPlayerInteractions,INSTRUMENTS,loadInstrumentBank,preloadPiano,triggerSample,chooseInstrument,undo,redo,eventInsert,eventRemove,applyThemeFields,analyseSkyGrid,applyPlayerTemplate,PLAYER_TEMPLATE_ID};
install();installMusicWorkbench();bindStartupNavigation();startDbBackup();
})();
