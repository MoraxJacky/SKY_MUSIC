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
function toast(text,ms=3500){const el=$('toast');el.textContent=text;el.hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.hidden=true,ms)}
function saveLibrary(){if(state.editMode&&state.project&&state.editBaseline){state.editDirty=snapshot(state.project)!==state.editBaseline;updateEditButton()}try{localStorage.setItem('sky-studio-projects-v03',JSON.stringify(state.library.map(p=>({...p,_imageBytes:null,_imageUrl:(p._imageUrl?.length||0)<500000?p._imageUrl:null}))))}catch(e){console.warn('本地收藏缓存空间不足',e);toast(e?.name==='SecurityError'?'当前预览环境禁止本地保存，请导出 .skymusic 文件':'本地存储空间不足，请导出 .skymusic 备份',6000)}scheduleDbBackup?.()}
function loadLibrary(){try{let saved=JSON.parse(localStorage.getItem('sky-studio-projects-v03')||localStorage.getItem('sky-studio-projects-v02')||'[]');if(Array.isArray(saved)){for(const p of saved.slice(0,40)){try{let n=normalize({...p,originKind:BUILTIN_IDS.has(p.id)?'builtin':(p.originKind||'user')});{let idx=state.library.findIndex(q=>q.id===n.id);if(idx>=0)state.library[idx]=n;else state.library.push(n)}}catch(e){}}}}catch(e){}}
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
async function playPause(){if(state.isPlaying){pauseSong();return}if(!state.project)return;cancelRollFinish();try{toast('正在准备音源…',1300);if(!await preloadPiano())return}catch(err){console.error(err);toast('音源加载失败：'+err.message,6000);return}if(state.position>=state.project.durationMs-80){state.position=0;state.rollPageStart=0}state.isPlaying=true;beginClock();$('playBtn').textContent='Ⅱ 暂停';state.sceneBase=performance.now();state.raf=requestAnimationFrame(playFrame);toast('开始演奏',1000)}
function pauseSong(){if(!state.isPlaying)return;state.position=clamp(realPosition(),0,state.project.durationMs);state.isPlaying=false;clearInterval(state.interval);cancelAnimationFrame(state.raf);stopVoices();$('playBtn').textContent='▶ 播放';updateVisual();$('stageStatus').textContent='已暂停'}
function seekTo(time,preserveRoll=false){
 if(!state.project)return;
 const was=state.isPlaying,frame=rollFrame(was?realPosition():state.position),fraction=frame.phase/frame.windowMs;
 cancelRollFinish();
 if(was){clearInterval(state.interval);stopVoices()}
 state.position=clamp(time,0,Math.max(0,state.project.durationMs));
 state.rollPageStart=preserveRoll?rollSeekOrigin(state.position,fraction):Math.floor(Math.max(0,state.position-(state.position>=state.project.durationMs ? .001 : 0))/(state.windowSec*1000))*state.windowSec*1000;
 state.lastSelected=-1;
 // Re-anchor the running audio clock directly: rapid drag events never spawn async play calls.
 if(was)beginClock();
 updateVisual();
}
function playFrame(){if(!state.isPlaying)return;state.position=clamp(realPosition(),0,state.project.durationMs);if(state.position>=state.project.durationMs){finishRollScan();return}updateVisual();animateScene();state.raf=requestAnimationFrame(playFrame)}
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
 registerThemeDefinition(definition);PLATFORM_THEME_ASSETS[definition.id]=pack.assets||{};populateThemeChoices();
}
function sanitizeThemeDefinition(raw){
 if(!raw||typeof raw!=='object'||!/^[-a-zA-Z0-9_]{1,80}$/.test(raw.id||''))throw Error('主题定义缺少有效 ID');
 raw=copy(raw);
 if(raw.elementRefs){
  const refs=raw.elementRefs,elements=raw.elements||{},element=id=>{if(!elements[id])throw Error('主题缺少元素 '+id);return elements[id]};
  const identity=element(refs.identity),scene=element(refs.stage);
  raw.decorations={...raw.decorations,identity:{image:identity.path||null,glyph:identity.glyph||'✧'},cover:refs.cover?element(refs.cover).path:null,treeImage:refs.tree?element(refs.tree).path:null,
   scene:{type:scene.kind,frameCount:scene.count||0,framePattern:scene.pattern||null,periodMs:scene.periodMs||6000},effects:(refs.effects||[]).map(id=>element(id).type)};
  if(refs.palette)raw.appearance={...element(refs.palette).colors,...(raw.appearanceOverrides||raw.appearance)};
 }
 const base=THEME_DEFINITIONS[raw.id]||THEME_DEFINITIONS[APP_CONFIG.defaultTheme],definition=copy(base),input=raw.decorations||{};
 definition.elementRefs=raw.elementRefs||{};definition.appearanceOverrides=raw.appearanceOverrides||{};definition.id=raw.id;definition.name=String(raw.name||base.name).slice(0,100);definition.displayName=String(raw.displayName||definition.name).slice(0,60);
 definition.appearance={...base.appearance,...sanitizePlayerAppearance(raw.appearance)};
 definition.defaults={...base.defaults,...raw.defaults};definition.initialOverrides=Object.fromEntries(Object.entries(raw.initialOverrides||{}).filter(([key])=>['accent','backgroundColor','snow','glow','motion','name','customStage'].includes(key)));
 const image=path=>{if(path!=null)safeResourcePath(path,path.slice(path.lastIndexOf('.')));if(path&&!path.startsWith('assets/'))throw Error('主题资源必须位于 assets/');return path||null};
 const scene=input.scene||base.decorations.scene;
 if(!['frames','symbol','image'].includes(scene.type))throw Error('不支持的主题舞台类型');
 if(scene.type==='frames'&&(!Number.isInteger(scene.frameCount)||scene.frameCount<1||scene.frameCount>48))throw Error('主题帧数超出范围');
 const classes=(input.classes||base.decorations.classes).filter(name=>['theme-starlight','theme-citylights'].includes(name));
 definition.decorations={classes,identity:{image:image(input.identity?.image),glyph:String(input.identity?.glyph||'✧').slice(0,8)},
  tree:Boolean(input.tree),treeImage:image(input.treeImage),motif:Boolean(input.motif),cover:image(input.cover),choiceGlyph:String(input.choiceGlyph||'✧').slice(0,8),
  effects:(input.effects||['snow','glow','lights']).filter(type=>['snow','glow','lights'].includes(type)),scene:{type:scene.type,frameCount:scene.type==='frames'?scene.frameCount:0,framePattern:scene.type==='frames'?image(scene.framePattern):null,periodMs:clamp(Number(scene.periodMs)||6000,100,60000),...(scene.type==='image'?{image:image(scene.image)}:{})}};
 definition.elements={};for(const [id,element] of Object.entries(raw.elements||{})){
  if(element.kind==='image')definition.elements[id]={kind:'image',path:image(element.path)};
  if(element.kind==='symbol')definition.elements[id]={kind:'symbol',glyph:String(element.glyph||'✧').slice(0,8)};
  if(element.kind==='frames'&&Number.isInteger(element.count)&&element.count>=1&&element.count<=48)definition.elements[id]={kind:'frames',pattern:image(element.pattern),count:element.count,periodMs:clamp(Number(element.periodMs)||6000,100,60000)};
  if(element.kind==='palette')definition.elements[id]={kind:'palette',colors:sanitizePlayerAppearance(element.colors)};
  if(element.kind==='effect'&&['snow','glow','lights'].includes(element.type))definition.elements[id]={kind:'effect',type:element.type};
 }
 if(raw.rollPalette&&Object.values(raw.rollPalette).every(value=>/^#[0-9a-f]{6}$/i.test(value)))definition.rollPalette=copy(raw.rollPalette);
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
   const mime=path.endsWith('.png')?'image/png':path.endsWith('.jpg')||path.endsWith('.jpeg')?'image/jpeg':'image/webp';
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
 if(project._imageUrl?.startsWith('data:image/')){definition.decorations.scene={type:'image',image:'assets/custom-stage.webp',frameCount:0,framePattern:null,periodMs:6000};definition.decorations.cover='assets/custom-stage.webp';definition.elements['custom.cover']={kind:'image',path:'assets/custom-stage.webp'};definition.elementRefs={};files['assets/custom-stage.webp']=base64ToBytes(project._imageUrl.split(',')[1]);files['theme.json']=JSON.stringify(definition);}
 const decor=definition.decorations,paths=new Set([decor.identity.image,decor.treeImage,decor.cover,decor.scene.image]);
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
function animateScene(){const sounding=isSounding(state.position);$('stageStatus').textContent=state.isPlaying?(sounding?'♪ 演奏中':'休止'):'已暂停';if(themeDefinition().decorations.scene.type!=='frames'||$('playerView').classList.contains('motion-off'))return;let now=performance.now();if(!state.stageImages?.length)return;if(sounding){if(!state.sceneTick)state.sceneTick=now;let dt=Math.min(65,now-state.sceneTick);state.sceneFrame=(state.sceneFrame+dt/themeDefinition().decorations.scene.periodMs*state.stageImages.length)%state.stageImages.length;}state.sceneTick=now;
 const a=state.stageImages[Math.floor(state.sceneFrame)%state.stageImages.length],b=state.stageImages[(Math.floor(state.sceneFrame)+1)%state.stageImages.length];const f=state.sceneFrame%1;
 const c=$('sceneCanvas'),ctx=c?.getContext('2d');if(!ctx)return;let box=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);let width=Math.max(1,Math.round(box.width*dpr)),height=Math.max(1,Math.round(box.height*dpr));if(c.width!==width||c.height!==height){c.width=width;c.height=height}ctx.clearRect(0,0,width,height);let scale=Math.min(width/a.width,height/a.height);let w=a.width*scale,h=a.height*scale,x=(width-w)/2,y=(height-h)/2;ctx.globalAlpha=1;ctx.drawImage(a,x,y,w,h);if(b&&f>0){ctx.globalAlpha=f;ctx.drawImage(b,x,y,w,h);ctx.globalAlpha=1}
}
function initializeScene(){let pane=$('stagePane');const definition=themeDefinition();applyThemeClasses(pane,definition);pane.classList.toggle('has-custom-image',Boolean(state.project._imageUrl));$('sceneName').textContent=state.project.theme.name||PRESETS[sceneId(state.project)].name;
 let stage=$('stageArt');if(definition.decorations.scene.type==='image'){stage.src=themeAsset(definition.decorations.scene.image);stage.style.display='block';$('sceneCanvas')?.remove();return}const extra=state.project._imageUrl;if(extra&&(definition.decorations.scene.type!=='frames'||state.project.theme?.customStage)){stage.src=extra;stage.style.display='block';$('sceneCanvas')?.remove();return}
 if(definition.decorations.scene.type!=='frames'){stage.style.display='none';$('sceneCanvas')?.remove();return}
 if(!state.stageImages.length||state.stageThemeId!==definition.id){state.stageThemeId=definition.id;state.stageImages=Array.from({length:definition.decorations.scene.frameCount},(_,i)=>{let im=new Image();const path=definition.decorations.scene.framePattern.replace('{index}',String(i).padStart(2,'0'));im.src=themeAsset(path);return im})}
 stage.style.display='none';if(!$('sceneCanvas')){let canvas=document.createElement('canvas');canvas.id='sceneCanvas';canvas.style.cssText='width:100%;height:100%;object-fit:contain;display:block';stage.parentNode.append(canvas)}state.sceneTick=performance.now();state.sceneFrame=0;const c=$('sceneCanvas');function firstDraw(){const img=state.stageImages[0];if(!img.complete||!img.naturalWidth){img.onload=firstDraw;return}let rect=c.getBoundingClientRect(),dpr=devicePixelRatio||1;c.width=rect.width*dpr;c.height=rect.height*dpr;let ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);let scale=Math.min(c.width/img.width,c.height/img.height);ctx.drawImage(img,(c.width-img.width*scale)/2,(c.height-img.height*scale)/2,img.width*scale,img.height*scale)}requestAnimationFrame(firstDraw)
}

/* 38-player-template.js */
// One player shell, one interaction model. Themes provide data, never duplicate markup.
const PLAYER_TEMPLATE_ID=PLAYER_RULES.templateId;
const PLAYER_APPEARANCE=Object.fromEntries(Object.entries(THEME_DEFINITIONS).map(([id,t])=>[id,t.appearance]));
function themeDefinition(project=state.project){return project?.theme?.definition||THEME_DEFINITIONS[sceneId(project)]}
function themeAsset(path,project=state.project){return project?.theme?.assets?.[path]||PLATFORM_THEME_ASSETS[sceneId(project)]?.[path]||window.SKY_THEME_ASSETS?.[path]||path}
function applyThemeClasses(host,definition){const classes=new Set(Object.values(THEME_DEFINITIONS).flatMap(t=>t.decorations.classes));for(const name of classes)host.classList.toggle(name,definition.decorations.classes.includes(name))}
function sanitizePlayerAppearance(raw){let result={};if(!raw||typeof raw!=='object')return result;for(let key of Object.keys(PLAYER_APPEARANCE.christmas))if(/^#[0-9a-f]{6}$/i.test(raw[key]||''))result[key]=raw[key];return result}
function applyPlayerTemplate(project,host){
 const id=sceneId(project),definition=themeDefinition(project),decor=definition.decorations,theme=project.theme||{},colors={...definition.appearance,...sanitizePlayerAppearance(theme.appearance)};
 if(/^#[0-9a-f]{6}$/i.test(theme.accent||''))colors.accent=theme.accent;
 if(/^#[0-9a-f]{6}$/i.test(theme.backgroundColor||''))colors.stageEnd=colors.backdrop=theme.backgroundColor;
 state.playerColors=colors;applyThemeClasses(host,definition);
 host.dataset.template=PLAYER_TEMPLATE_ID;host.dataset.theme=id;
 for(let [name,value]of Object.entries(colors))host.style.setProperty('--player-'+name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);
 host.style.setProperty('--gold',colors.accent);host.style.setProperty('--theme-accent',colors.accent);host.style.setProperty('--note',colors.note);host.style.setProperty('--chord',colors.chord);
 host.style.setProperty('--glow-strength',String((theme.glow??58)/100));
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 host.classList.toggle('motion-off',theme.motion==='off'||Boolean(reduced));
 $('stageSnow').hidden=decor.effects&&!decor.effects.includes('snow');const lights=document.querySelector('.stage-lights');if(lights)lights.hidden=decor.effects&&!decor.effects.includes('lights');
 $('stageSnow').style.opacity=String(clamp(Number(theme.snow??40),0,100)/100);
 $('identitySnow').hidden=!decor.identity.image;if(decor.identity.image)$('identitySnow').src=themeAsset(decor.identity.image);$('identityGlyph').hidden=Boolean(decor.identity.image);$('identityGlyph').textContent=decor.identity.glyph;
 const tree=document.querySelector('.stage-tree');if(tree){tree.hidden=!decor.tree||Boolean(project._imageUrl);tree.style.display=tree.hidden?'none':'block';if(decor.treeImage)tree.src=themeAsset(decor.treeImage)}
 const motif=document.querySelector('.stage-motif');if(motif)motif.hidden=!decor.motif;$('stagePane').dataset.motif=decor.motif?'on':'off';
 $('sceneName').textContent=theme.name||PRESETS[id].name;
}

function populateThemeChoices(){
 $('themeChoices').innerHTML='';$('createTheme').innerHTML='';
 for(const definition of Object.values(THEME_DEFINITIONS)){
  const button=document.createElement('button');button.dataset.scene=definition.id;button.onclick=()=>chooseTheme(definition.id);button.textContent=definition.decorations.choiceGlyph+' '+definition.displayName;$('themeChoices').append(button);
  const option=document.createElement('option');option.value=definition.id;option.textContent=definition.displayName;$('createTheme').append(option);
 }
}

/* 39-player-interactions.js */
// One player interaction entry for every score and theme.
function syncVolumeControl(){
 const rules=PLAYER_RULES.volume,percent=Math.round(state.volume*100),slider=$(rules.sliderId);
 slider.value=String(percent);slider.setAttribute('aria-valuetext',percent===0?'静音':percent+'%');$(rules.outputId).textContent=percent+'%';updateVolumeAudio();
}
function bindPlayerInteractions(){
 $(PLAYER_RULES.volume.sliderId).oninput=ev=>{state.volume=normalizeVolume(Number(ev.target.value)/100);if(state.project){state.project.playback.volume=state.volume;saveLibrary()}syncVolumeControl()};

 $('backLibrary').onclick=goHome;
 $('rollWindow').innerHTML='';for(const seconds of PLAYER_RULES.roll.windowsSeconds){const option=document.createElement('option');option.value=String(seconds);option.textContent=seconds+'秒';$('rollWindow').append(option)}
 $('playBtn').onclick=()=>playPause();$('restartBtn').onclick=()=>seekTo(0);
 $('sustainSlider').oninput=ev=>{state.sustain=Number(ev.target.value)/100;$('sustainValue').textContent=Math.round(state.sustain*100)+'%';if(state.project){state.project.playback.sustain=state.sustain;saveLibrary()}updateSustainAudio()};
 $('speedSelect').onchange=ev=>{let was=state.isPlaying;if(was)pauseSong();state.rate=Number(ev.target.value);if(state.project){state.project.playback.rate=state.rate;saveLibrary()}if(was)playPause()};
 $('rollWindow').onchange=ev=>{const finishing=Boolean(state.rollFinish),frame=rollFrame(),fraction=frame.phase/frame.windowMs;cancelRollFinish();state.windowSec=Number(ev.target.value);state.rollPageStart=rollSeekOrigin(state.position,fraction);if(finishing)finishRollScan();else drawRoll()};
 $('rollWindow').value=String(state.windowSec);$('stepPrev').onclick=()=>stepEvent(-1);$('stepNext').onclick=()=>stepEvent(1);
 $('seekSlider').oninput=ev=>seekTo(Number(ev.target.value));
 $('rollSeekSlider').oninput=ev=>seekTo(Number(ev.target.value),true);
 $('pagePrev').onclick=()=>{pauseSong();let pg=Math.floor(state.selected/BEATS_PER_PAGE);let ev=scoreEvents(state.project),i=Math.max(0,(pg-1)*BEATS_PER_PAGE);seekTo(ev[i]?.timeMs||0)};
 $('pageNext').onclick=()=>{pauseSong();let pg=Math.floor(state.selected/BEATS_PER_PAGE);let ev=scoreEvents(state.project),i=Math.min(ev.length-1,(pg+1)*BEATS_PER_PAGE);seekTo(ev[i]?.timeMs||0)};
 $('resetKeyEdit').onclick=()=>{if(!state.editMode)return;let p=state.project;let original=BUILTINS.find(x=>x.id===(p.provenance?.derivedFrom||p.id));let e=scoreEvents(p)[state.selected],reference=original&&scoreEvents(original)[state.selected];if(!e)return;if(reference){rememberEdit();e.notes=[...reference.notes];e.durationMs=reference.durationMs;e.confidence='source';renderKeyBoard();renderBeatGrid(true);updateVisual();toast('已恢复此格的原始琴键')}else toast('导入曲目无内置原谱，请通过导入文件恢复')};
 $('keySelect').onchange=ev=>{if(!state.project)return;let was=state.isPlaying;if(was)pauseSong();state.tuning=ev.target.value;state.project.playback.tuning=state.tuning;saveLibrary();setTuningButtons();renderKeyBoard();renderBeatGrid(true);updateVisual();if(state.editMode)syncEditorFields();if(was)playPause()};
 $('instrumentSelect').onchange=ev=>chooseInstrument(ev.target.value);
 document.addEventListener('keydown',e=>{if(state.mode!=='player'||e.target.closest('input,select,textarea,button'))return;if(e.code===PLAYER_RULES.keyboard.playPause){e.preventDefault();playPause()}else if(e.code===PLAYER_RULES.keyboard.nextEvent){e.preventDefault();stepEvent(1)}else if(e.code===PLAYER_RULES.keyboard.previousEvent){e.preventDefault();stepEvent(-1)}});
 window.addEventListener('resize',()=>{if(state.mode==='player')requestAnimationFrame(()=>{drawRoll();if(!state.isPlaying)initializeScene()})});
}
function setTuningButtons(){
 const key=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';
 $('keySelect').value=key;$('keyRangeValue').textContent=key==='sky-original'?'光遇原调':KEY_DEGREES[key][0]+' 大调';syncInstrumentPicker();
 for(const button of document.querySelectorAll('#keyRangeMenu [data-key]'))button.setAttribute('aria-selected',String(button.dataset.key===key));
}
let cancelRangeWheel=()=>{};
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
 closeInstrumentPicker();setTuningButtons();$('keyRangeMenu').hidden=false;$('keyRangeToggle').setAttribute('aria-expanded','true');positionRangePicker();
 const selected=$('keyRangeMenu').querySelector('[aria-selected="true"]');selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function bindRangePicker(){
 const trigger=$('keyRangeToggle'),menu=$('keyRangeMenu'),track=$('keyRangeTrack');
 trigger.onclick=()=>menu.hidden?openRangePicker():closeRangePicker();
 cancelRangeWheel=bindSmoothWheel(track,menu,'x',PLAYER_RULES.selectors.rangeMaxStepPx);
 trigger.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openRangePicker()}};
 for(const button of menu.querySelectorAll('[data-key]'))button.onclick=()=>{
  $('keySelect').value=button.dataset.key;$('keySelect').onchange({target:$('keySelect')});closeRangePicker(true);
 };
 menu.onkeydown=event=>{
  cancelRangeScroll();
  const options=[...menu.querySelectorAll('[data-key]')],index=options.indexOf(document.activeElement);let next;
  if(event.key==='ArrowLeft')next=(index-1+options.length)%options.length;
  if(event.key==='ArrowRight')next=(index+1)%options.length;
  if(event.key==='Home')next=0;if(event.key==='End')next=options.length-1;
  if(next!==undefined){event.preventDefault();options[next].focus({preventScroll:true});options[next].scrollIntoView({block:'nearest',inline:'nearest'})}
  if(event.key==='Escape'){event.preventDefault();closeRangePicker(true)}
  if(event.key==='Tab')closeRangePicker();
 };
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))closeRangePicker()});
 window.addEventListener('resize',()=>{if(!menu.hidden)positionRangePicker()});
 window.addEventListener('scroll',event=>{if(!menu.hidden&&event.target!==menu&&!menu.contains(event.target))closeRangePicker()},true);
}

// A reusable bounded wheel animation for both instrument and range pickers.
function bindSmoothWheel(track,host,axis='x',limit=24,model=null){
 let raf=0,target=0,position=0,last=0,snapTimer=0;
 const read=()=>model?model.read():(axis==='x'?track.scrollLeft:track.scrollTop);
 const write=value=>{if(model)model.write(value);else if(axis==='x')track.scrollLeft=value;else track.scrollTop=value};
 const maximum=()=>Math.max(0,model?model.max():(axis==='x'?track.scrollWidth-track.clientWidth:track.scrollHeight-track.clientHeight));
 const cancel=()=>{cancelAnimationFrame(raf);clearTimeout(snapTimer);raf=0};
 const animate=now=>{
  if(host.hidden){cancel();return}const dt=Math.min(40,now-last);last=now;
  position+=(target-position)*(1-Math.exp(-dt/PLAYER_RULES.selectors.smoothingMs));
  if(Math.abs(target-position)<.5){write(target);raf=0;return}
  write(position);raf=requestAnimationFrame(animate);
 };
 const start=()=>{if(!raf){position=read();last=performance.now();raf=requestAnimationFrame(animate)}};
 cancel.to=value=>{cancel();target=clamp(value,0,maximum());start()};
 host.addEventListener('wheel',event=>{
  event.preventDefault();let delta=event.deltaY+event.deltaX;
  if(event.deltaMode===1)delta*=16;if(event.deltaMode===2)delta*=axis==='x'?track.clientWidth:track.clientHeight;
  if(!delta)return;if(!raf)target=read();
  target=clamp(target+Math.sign(delta)*Math.min(limit,Math.abs(delta)*PLAYER_RULES.selectors.wheelGain),0,maximum());start();
  clearTimeout(snapTimer);
  if(model?.snap)snapTimer=setTimeout(()=>{target=clamp(model.snap(target),0,maximum());start()},PLAYER_RULES.selectors.instrumentSnapDelayMs);
 },{passive:false});
 host.addEventListener('pointerdown',cancel);host.addEventListener('keydown',cancel);
 return cancel;
}
let cancelInstrumentWheel=()=>{};
const instrumentViewport={position:0,row:31,step:36,touch:null,suppressClick:false};
function closeInstrumentPicker(returnFocus=false){cancelInstrumentWheel();$('instrumentMenu').hidden=true;$('instrumentToggle').setAttribute('aria-expanded','false');if(returnFocus)$('instrumentToggle').focus()}
function syncInstrumentPicker(){
 const spec=instrumentSpec(state.project?.playback?.instrument);
 $('instrumentSelect').value=spec.id;$('instrumentValue').textContent=spec.name;
 for(const button of $('instrumentOptions').querySelectorAll('[data-instrument]'))button.setAttribute('aria-selected',String(button.dataset.instrument===spec.id));
}
function positionInstrumentPicker(){
 const rect=$('instrumentToggle').getBoundingClientRect(),menu=$('instrumentMenu'),view=instrumentViewport;
 view.row=rect.height;view.step=rect.height+PLAYER_RULES.selectors.instrumentRowGapPx;
 const above=0; // Expand downward from the original control, never above it.
 const below=Math.min(PLAYER_RULES.selectors.instrumentRowsBelow*view.step,(INSTRUMENTS.length-1-view.position)*view.step,Math.max(0,innerHeight-rect.bottom-8));
 menu.style.width=rect.width+'px';menu.style.left=rect.left+'px';menu.style.top=(rect.top-above)+'px';menu.style.height=(above+rect.height+below)+'px';
 const focus=$('instrumentCurrent');focus.style.top=above+'px';focus.style.height=rect.height+'px';
 const buttons=$('instrumentOptions').querySelectorAll('[data-instrument]');
 for(let i=0;i<buttons.length;i++){
  const y=above+(i-view.position)*view.step,visible=y+view.row>0&&y<above+view.row+below;
  buttons[i].style.top=y+'px';buttons[i].style.height=view.row+'px';buttons[i].style.visibility=visible?'visible':'hidden';
 }
 menu.dataset.position=String(view.position);
}
function openInstrumentPicker(){
 closeRangePicker();syncInstrumentPicker();cancelInstrumentWheel();
 instrumentViewport.position=Math.max(0,INSTRUMENTS.findIndex(spec=>spec.id===state.project?.playback?.instrument));
 $('instrumentMenu').hidden=false;$('instrumentToggle').setAttribute('aria-expanded','true');positionInstrumentPicker();
 $('instrumentOptions').querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
}
async function chooseInstrument(id){
 if(!state.project)return;const project=state.project,selection=++instrumentSelection,was=state.isPlaying||instrumentResume;
 instrumentResume=was;if(state.isPlaying)pauseSong();project.playback.instrument=instrumentSpec(id).id;saveLibrary();syncInstrumentPicker();closeInstrumentPicker(true);
 toast('正在准备'+instrumentSpec(id).name+'…',1300);
 try{const ready=await preloadPiano();if(selection!==instrumentSelection||project!==state.project)return;instrumentResume=false;if(ready&&was&&!state.isPlaying)await playPause()}catch(error){if(selection===instrumentSelection)instrumentResume=false;console.warn(error);toast('音源加载异常：'+error.message,5000)}
}
function bindInstrumentPicker(){
 const menu=$('instrumentMenu'),trigger=$('instrumentToggle'),options=$('instrumentOptions'),view=instrumentViewport;
 for(const spec of INSTRUMENTS){
  const button=document.createElement('button');button.type='button';button.dataset.instrument=spec.id;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;button.textContent=spec.name+' · '+(spec.mode==='offline'?'离线':'在线');
  button.onclick=()=>{if(view.suppressClick){view.suppressClick=false;return}if(state.project?.playback?.instrument===spec.id)closeInstrumentPicker(true);else chooseInstrument(spec.id)};options.append(button);
 }
 menu.tabIndex=-1;
 const move=position=>{view.position=clamp(position,0,INSTRUMENTS.length-1);positionInstrumentPicker();if(options.contains(document.activeElement)&&document.activeElement.style.visibility==='hidden')menu.focus({preventScroll:true})};
 cancelInstrumentWheel=bindSmoothWheel(options,menu,'y',PLAYER_RULES.selectors.instrumentMaxStepPx,{read:()=>view.position*view.step,write:pixels=>move(pixels/view.step),max:()=>(INSTRUMENTS.length-1)*view.step,snap:pixels=>Math.round(pixels/view.step)*view.step});
 trigger.onclick=()=>menu.hidden?openInstrumentPicker():closeInstrumentPicker();
 trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openInstrumentPicker()}};
 menu.onkeydown=event=>{
  const buttons=[...options.querySelectorAll('[data-instrument]')],focused=buttons.indexOf(document.activeElement),index=focused>=0?focused:Math.round(view.position);let next;
  if(event.key==='ArrowDown')next=Math.min(buttons.length-1,index+1);if(event.key==='ArrowUp')next=Math.max(0,index-1);
  if(event.key==='Home')next=0;if(event.key==='End')next=buttons.length-1;
  if(next!==undefined){event.preventDefault();cancelInstrumentWheel();move(next);buttons[next].focus({preventScroll:true})}
  if(event.key==='Escape'){event.preventDefault();closeInstrumentPicker(true)}if(event.key==='Tab')closeInstrumentPicker();
 };
 menu.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'){view.touch={id:event.pointerId,y:event.clientY,position:view.position};view.suppressClick=false}});
 menu.addEventListener('pointermove',event=>{
  if(!view.touch||view.touch.id!==event.pointerId)return;
  const dy=event.clientY-view.touch.y;
  if(Math.abs(dy)>6){view.suppressClick=true;menu.setPointerCapture(event.pointerId);move(view.touch.position-dy/view.step)}
 });
 const endTouch=()=>{if(view.touch&&view.suppressClick)cancelInstrumentWheel.to(Math.round(view.position)*view.step);view.touch=null;setTimeout(()=>view.suppressClick=false,0)};
 menu.addEventListener('pointerup',endTouch);menu.addEventListener('pointercancel',endTouch);
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))closeInstrumentPicker()});
 window.addEventListener('resize',()=>{if(!menu.hidden){cancelInstrumentWheel();positionInstrumentPicker()}});
 window.addEventListener('scroll',event=>{if(!menu.hidden&&event.target!==menu&&!menu.contains(event.target))closeInstrumentPicker()},true);
}

/* 40-ui.js */
function snowPopulate(element,count,scope='world'){element.innerHTML='';for(let i=0;i<count;i++){let dot=document.createElement('i');dot.className='snow-dot';let size=1+Math.random()*3.3;dot.style.cssText=`left:${Math.random()*100}%;width:${size.toFixed(2)}px;height:${size.toFixed(2)}px;opacity:${(.18+Math.random()*.38).toFixed(2)};animation-duration:${(scope==='world'?16:9)+Math.random()*15}s;animation-delay:-${Math.random()*30}s;--dx:${Math.round((Math.random()-.5)*170)}px`;element.append(dot)}}
function renderLibrary(){let q=$('songSearch').value.trim().toLowerCase(),c=$('libraryCards');c.innerHTML='';let filter=$('libraryFilter').value;let visible=state.library.filter(p=>(p.title+' '+p.subtitle+' '+(p.author||'')).toLowerCase().includes(q)).filter(p=>filter==='favorite'?p.favorite:filter==='recent'?p.lastOpened>0:true);if(filter==='recent')visible.sort((a,b)=>b.lastOpened-a.lastOpened);$('libraryCount').textContent=state.library.length+' 首乐曲';for(let song of visible){let card=document.createElement('article');card.className='song-card';let scene=sceneId(song);const cover=(platformCover(song)||THEME_DEFINITIONS[scene].decorations.cover)?`<img alt="" src="${platformCover(song)||song._imageUrl||themeAsset(THEME_DEFINITIONS[scene].decorations.cover,song)}">`:'';card.innerHTML=`<div class="song-cover ${scene}"><span class="cover-tag">${song.originKind==='builtin'?'内置歌曲':song.originKind==='imported'?'导入曲谱':'我的曲谱'}</span>${cover}</div><div class="song-details"><div><h3></h3><p></p></div><button class="card-play">▶</button></div>`;card.querySelector('h3').textContent=song.card?.title||song.title;card.querySelector('p').textContent=song.card?.subtitle||durationFmt(song.durationMs)+' · '+songNotes(song)+' 音符 · '+(PRESETS[scene]?.name||'主题');card.querySelector('.card-play').onclick=()=>openSong(song.id);card.querySelector('.song-cover').onclick=()=>openSong(song.id);
 let actions=document.createElement('div');actions.className='song-card-actions';for(let [label,func,title] of [[song.favorite?'★':'☆',()=>favoriteSong(song.id),'收藏'],['✎',()=>renameSong(song.id),'重命名'],['⧉',()=>duplicateSong(song.id),'制作副本'],['×',()=>deleteSong(song.id),'删除项目']]){let btn=document.createElement('button');btn.textContent=label;btn.title=title;btn.setAttribute('aria-label',title);btn.onclick=e=>{e.stopPropagation();func()};actions.append(btn)}card.querySelector('.song-cover').append(actions);c.append(card)}let add=document.createElement('button');add.className='song-card add-card';add.innerHTML='<span class="plus">＋</span><strong>导入新的乐曲</strong><span>SKYMUSIC · MIDI · MUSICXML · AUDIO</span>';add.onclick=()=>openImport();c.append(add)}
function openImport(){$('importDialog').showModal()}
function mountPlatformProject(id){invalidateInstrumentChange();closeInstrumentPicker();closeRangePicker();cancelRollFinish();pauseSong();let p=state.library.find(p=>p.id===id);if(!p){toast('找不到歌曲');return}state.project=p;state.editMode=false;state.editDirty=false;state.editSource=null;state.editBaseline=null;updateEditButton();p.lastOpened=Date.now();saveLibrary();state.position=0;state.rollPageStart=0;state.selected=0;state.lastSelected=-1;state.page=-1;state.rate=p.playback.rate||1;state.tuning=p.playback.tuning||'C';state.sustain=Number.isFinite(p.playback.sustain)?p.playback.sustain:.45;state.volume=normalizeVolume(p.playback.volume);syncVolumeControl();$('homeView').hidden=true;$('playerView').hidden=false;state.mode='player';$('playBtn').textContent='▶ 播放';$('songTitle').textContent=p.title;$('songSubtitle').textContent=p.subtitle;$('durationHeader').textContent=durationFmt(p.durationMs);$('noteCountHeader').textContent=songNotes(p)+' NOTES';$('speedSelect').value=String(state.rate);$('sustainSlider').value=Math.round(state.sustain*100);$('sustainValue').textContent=Math.round(state.sustain*100)+'%';$('instrumentSelect').value=p.playback.instrument||'offline';$('keySelect').value=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';$('seekSlider').max=p.durationMs;$('seekMax').textContent=durationFmt(p.durationMs);$('playBtn').disabled=false;applyTheme();initializeScene();renderKeyBoard();renderBeatGrid(true);updateVisual();refreshHistoryButtons();try{localStorage.setItem('sky-last-song',id)}catch(e){console.warn('最近播放缓存不可用',e)}requestAnimationFrame(drawRoll);try{history.replaceState(null,'','#song='+encodeURIComponent(id))}catch(e){}}
function goHome(){invalidateInstrumentChange();closeInstrumentPicker();closeRangePicker();cancelRollFinish();if(state.editMode){requestFinishEdit('home');return}pauseSong();state.mode='home';$('playerView').hidden=true;$('homeView').hidden=false;try{history.replaceState(null,'',location.pathname)}catch(e){};renderLibrary();toast('已返回音乐馆',1000)}
function applyTheme(){let p=state.project;if(!p)return;let theme=sceneId(p),host=$('playerView');applyPlayerTemplate(p,host);initializeScene()}
function beatIndex(time){let events=scoreEvents(state.project);return clamp(lowerBound(events,time+1)-1,0,Math.max(events.length-1,0))}
function stepEvent(direction){if(!state.project)return;pauseSong();let events=scoreEvents(state.project),index=clamp(state.selected+direction,0,events.length-1);if(events[index])seekTo(events[index].timeMs)}
function renderBeatGrid(force=false){let events=platformController.events();let pg=events.length?Math.floor(state.selected/BEATS_PER_PAGE):0;if(pg===state.page&&!force)return;state.page=pg;let grid=$('beatGrid');grid.innerHTML='';let frag=document.createDocumentFragment();for(let i=pg*BEATS_PER_PAGE;i<Math.min(events.length,(pg+1)*BEATS_PER_PAGE);i++){let e=events[i],btn=document.createElement('button');btn.className='beat'+(e.notes.length===2?' poly2':e.notes.length>=3?' poly3':'')+(e.notes.length?'':' empty')+(e.confidence==='unverified'?' uncertain':'');btn.dataset.index=i;btn.title=`${positionFmt(e.timeMs)} · ${eventLabel(e)}`;btn.setAttribute('aria-label',`第 ${String(i+1).padStart(3,'0')} 格 · ${btn.title}`);let label=document.createElement('span');label.className='beat-number';label.textContent=String(i+1).padStart(3,'0');let dots=document.createElement('div');dots.className='mini-keys';dots.setAttribute('aria-hidden','true');for(let n=1;n<=15;n++){let dot=document.createElement('span');dot.className='mini-dot'+(e.notes.includes(n)?' on':'');dot.dataset.note=n;dots.append(dot)}let name=document.createElement('span');name.className='beat-name';name.textContent=e.notes.length?e.notes.map(noteName).join('·'):'·';btn.append(label,dots,name);btn.onclick=()=>{pauseSong();seekTo(e.timeMs);state.selected=i;renderBeatGrid();renderKeyBoard();updateVisual();if(state.editMode)syncEditorFields()};frag.append(btn)}for(let i=Math.min(events.length-pg*BEATS_PER_PAGE,BEATS_PER_PAGE);i<BEATS_PER_PAGE;i++){let tile=document.createElement('div');tile.className='beat empty beat-placeholder';tile.setAttribute('aria-hidden','true');frag.append(tile)}grid.append(frag);$('pageLabel').textContent=String(pg+1).padStart(2,'0')+' / '+String(Math.max(1,Math.ceil(events.length/BEATS_PER_PAGE))).padStart(2,'0');$('pagePrev').disabled=pg===0;$('pageNext').disabled=pg===Math.max(1,Math.ceil(events.length/BEATS_PER_PAGE))-1}
function renderKeyBoard(){let c=$('keyBoard');c.innerHTML='';let active=platformController.event(state.selected)?.notes||[];for(let n=1;n<=15;n++){let b=document.createElement('button');b.className='key-tile'+(active.includes(n)?' active':'');b.dataset.note=n;b.setAttribute('aria-label','切换琴键 '+n+' '+noteName(n));b.innerHTML=`<span class="key-no">${String(n).padStart(2,'0')}</span><span class="key-name">${noteName(n)}</span>`;b.onclick=()=>toggleNote(n);c.append(b)}}
async function toggleNote(n){if(!state.project)return;if(!state.editMode){try{await preloadPiano();triggerSample(n,state.audioCtx.currentTime+.02,280)}catch(e){toast('音源尚未就绪',2500)}return}let item=scoreEvents(state.project)[state.selected];if(!item)return;let exists=item.notes.includes(n);rememberEdit();item.notes=exists?item.notes.filter(v=>v!==n):[...item.notes,n].sort((a,b)=>a-b);if(item.notes.length&&item.durationMs<70)item.durationMs=190;if(!item.notes.length)item.durationMs=0;item.confidence='user-corrected';saveLibrary();renderKeyBoard();renderBeatGrid(true);updateVisual();refreshHistoryButtons();if(state.editMode)syncEditorFields();$('noteCountHeader').textContent=songNotes(state.project)+' NOTES';if(!exists){try{await preloadPiano();triggerSample(n,state.audioCtx.currentTime+.015,300)}catch(e){console.warn(e)}}}
function updateVisual(){let p=state.project;if(!p)return;let pos=state.position,events=scoreEvents(p),now=beatIndex(pos);let changed=now!==state.selected;if(state.isPlaying||state.lastSelected!==state.selected){state.selected=now;if(Math.floor(now/BEATS_PER_PAGE)!==state.page)renderBeatGrid();if(changed)renderKeyBoard()}
 state.lastSelected=state.selected;$('timeClock').textContent=positionFmt(pos);$('seekSlider').value=Math.round(pos);$('rollSeekSlider').max=p.durationMs;$('rollSeekSlider').value=Math.round(pos);$('rollPosition').textContent=String(state.selected+1).padStart(4,'0')+' / '+events.length;
 const e=events[state.selected];$('selectedSummary').textContent=eventLabel(e);$('currentBeatIndex').textContent='第 '+String(state.selected+1).padStart(3,'0')+' 格';$('currentBeatNotes').textContent=eventLabel(e);
 let keys=state.isPlaying?activeNotes(pos):new Set();
 for(let el of $('beatGrid').children){let index=+el.dataset.index,on=index===state.selected;el.classList.toggle('active',on);el.classList.toggle('select',on);el.classList.toggle('echo',state.isPlaying&&index<state.selected&&index>=state.selected-8&&events[index]?.notes.length>0);el.setAttribute('aria-current',on?'step':'false');for(let dot of el.querySelectorAll('.mini-dot'))dot.classList.toggle('resonance',on&&keys.has(+dot.dataset.note)&&!e?.notes?.includes(+dot.dataset.note))}
 if(state.isPlaying&&!e?.notes.length&&keys.size){let names=[...keys].sort((a,b)=>a-b).map(noteName).join(' · ');$('currentBeatNotes').textContent='余音 '+names;$('selectedSummary').textContent=names}
 for(let k of $('keyBoard').children){let n=Number(k.dataset.note);k.classList.toggle('ringing',state.isPlaying&&keys.has(n));k.classList.toggle('active',e?.notes?.includes(n))}drawRoll()
}
// Page origin may move independently of the scan phase when the score is scrubbed.
function rollSeekOrigin(position,fraction,windowMs=state.windowSec*1000){
 const end=state.project.durationMs;
 // At the true end always retain a populated final view instead of starting an empty page.
 if(position>=end)return Math.max(0,end-windowMs);
 const remaining=end-position;
 const span=fraction<1?Math.min(windowMs,remaining/(1-fraction)):windowMs;
 return position-fraction*Math.max(1,span);
}
function rollFrame(position=state.position){
 const nominal=state.windowSec*1000,duration=state.project.durationMs;
 if(state.rollFinish){const f=state.rollFinish;return {begin:f.begin,end:f.begin+f.windowMs,windowMs:f.windowMs,phase:Math.min(f.windowMs,f.phase+(performance.now()-f.at)*f.rate)}}
 let begin=state.rollPageStart,phase=position-begin;
 if(phase<0||phase>=nominal){
  // Exact page-boundary endings belong to the previous page, never a new blank page.
  const pagePosition=position>=duration?Math.max(0,position-.001):position;
  begin+=Math.floor((pagePosition-begin)/nominal)*nominal;
 }
 if(begin>=duration&&duration>0)begin=Math.max(0,duration-nominal);
 state.rollPageStart=begin;
 // The final page ends at the music, not at a padded 8/10/12/20-second boundary.
 const windowMs=Math.max(1,Math.min(nominal,duration-begin));
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
function drawRoll(){if(!state.project||state.mode!=='player')return;let cv=$('rollCanvas'),rect=cv.getBoundingClientRect();if(rect.width<30||rect.height<30)return;let dpr=Math.min(2,devicePixelRatio||1);if(cv.width!==Math.round(rect.width*dpr)||cv.height!==Math.round(rect.height*dpr)){cv.width=Math.round(rect.width*dpr);cv.height=Math.round(rect.height*dpr)}const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);let W=rect.width,H=rect.height,left=59,top=25,bottom=23,sec=state.windowSec,{begin,end,windowMs,phase}=rollFrame();c.font='10px ui-monospace,monospace';const right=Math.max(13,c.measureText(rollTimeText(end)).width/2+4),plotW=W-left-right,rowH=(H-top-bottom)/15;
 const colors=state.playerColors||PLAYER_APPEARANCE[APP_CONFIG.defaultTheme];
 const paper=themeDefinition().rollPalette||{base:colors.surfaceEnd,light:colors.surfaceStart,medium:colors.gridEnd,dark:colors.rest,label:colors.muted,anchor:colors.accent};
 c.clearRect(0,0,W,H);c.fillStyle=paper.base;c.fillRect(0,0,W,H);
 const cellGrid=true;
 // Lane distribution copied verbatim from the user-provided v7 drawRoll function.
 for(let row=0;row<15;row++){let n=15-row,y=top+row*rowH,anchor=n===1||n===8||n===15;c.fillStyle=[1,8,15].includes(n)?paper.light:row%2?paper.dark:paper.medium;c.fillRect(left,y,plotW,rowH);c.fillStyle=anchor?paper.anchor:paper.label;c.font=`600 ${Math.min(11,Math.max(9,rowH*.54))}px Georgia,serif`;c.textAlign='right';c.textBaseline='middle';c.fillText(n+' '+noteName(n),left-7,y+rowH/2)}
 // Draw subdivisions after opaque lane fills in every supported window.
 if(cellGrid){const divisions=PLAYER_RULES.roll.subdivisionsPerSecond,stepMs=1000/divisions;for(let i=Math.ceil(begin/stepMs);i*stepMs<=end;i++){if(i%divisions===0)continue;let x=left+(i*stepMs-begin)/windowMs*plotW;c.strokeStyle=i%3===0?'#55786872':'#43665932';c.lineWidth=.6;c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}c.lineWidth=1;for(let row=0;row<=15;row++){let y=top+row*rowH;c.strokeStyle='#43665932';c.beginPath();c.moveTo(left,y);c.lineTo(left+plotW,y);c.stroke()}}
 // Keep second grid lines independent of the sparser time labels.
 for(let t=Math.max(0,Math.ceil(begin/1000)*1000);t<=end;t+=1000){const x=left+(t-begin)/windowMs*plotW;c.strokeStyle=cellGrid?'#79927b88':'#cce2b725';c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}
 c.textAlign='center';c.textBaseline='middle';c.fillStyle='#d1c298';c.font='10px ui-monospace,monospace';
 const labels=rollTimeLabels({begin,end}),terminal=labels.find(label=>label.terminal),labelX=label=>left+(label.timeMs-begin)/windowMs*plotW;
 for(const label of labels){
  const text=rollTimeText(label.timeMs),x=labelX(label);
  // Preserve the final-note label when a short last page would crowd a regular tick.
  if(terminal&&label!==terminal&&Math.abs(x-labelX(terminal))<(c.measureText(text).width+c.measureText(rollTimeText(terminal.timeMs)).width)/2+6)continue;
  if(label.timeMs%1000!==0){c.strokeStyle='#79927b88';c.beginPath();c.moveTo(x,top);c.lineTo(x,H-bottom);c.stroke()}
  c.fillText(text,x,12);
 }
 c.save();c.beginPath();c.rect(left,top,plotW,H-top-bottom);c.clip();const ev=platformController.events(),start=lowerBound(ev,begin-10000);for(let i=start;i<ev.length;i++){let e=ev[i];if(e.timeMs>end)break;if(!e.notes.length)continue;let x=left+(e.timeMs-begin)/windowMs*plotW;let width=Math.max(3,Math.min(windowMs<state.windowSec*1000?Infinity:22,(e.durationMs||180)/windowMs*plotW));for(let n of e.notes){let tileWidth=Math.max(2,width-1.8),tileHeight=Math.max(3,rowH*.5),tileX=x+.8,y=top+(15-n)*rowH+(rowH-tileHeight)/2;
 // Keep repeated notes distinct even when their sounding durations overlap.
 for(let j=i+1;j<ev.length&&ev[j].timeMs<e.timeMs+(width+2)/plotW*windowMs;j++){if(ev[j].notes.includes(n)){tileWidth=Math.min(tileWidth,Math.max(.8,(ev[j].timeMs-e.timeMs)/windowMs*plotW-1.8));break}}
 c.fillStyle=e.notes.length>=3?colors.poly:e.notes.length===2?colors.chord:colors.note;c.shadowColor='rgba(0,0,0,.32)';c.shadowBlur=2;c.shadowOffsetY=1;c.beginPath();c.roundRect(tileX,y,tileWidth,tileHeight,Math.min(2,tileWidth/2,tileHeight/2));c.fill()}}
 c.restore();let cursorX=left+phase/windowMs*plotW;c.strokeStyle='#ffd89c';c.lineWidth=1.5;c.beginPath();c.moveTo(cursorX,top);c.lineTo(cursorX,H-bottom);c.stroke();c.fillStyle='#ffe0ac';c.beginPath();c.arc(cursorX,top,3.6,0,Math.PI*2);c.fill();c.beginPath();c.arc(cursorX,H-bottom,3.6,0,Math.PI*2);c.fill();c.lineWidth=1
}

/* 45-workspace.js */
// v0.3 project library, non-destructive editor, theme controls and portable exports.
function escName(s){return (s||'untitled').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,90)}
function nextId(prefix='song'){return prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)}
function baseProject(title,theme,dur=60000,interval=250){return normalize({id:nextId(),title,subtitle:'SKY MUSIC · NEW SONG',description:'',durationMs:dur,score:{mode:'grid',gridIntervalMs:interval,events:Array.from({length:Math.min(4000,Math.ceil(dur/interval))},(_,i)=>({timeMs:i*interval,notes:[],durationMs:0,velocity:85,confidence:'manual'}))},theme:{id:theme},playback:{tuning:'C',rate:1,sustain:.45},provenance:{source:'手工新建',status:'未识谱'}})}
function createProject(){const title=$('createTitle').value.trim().slice(0,100)||'未命名';const dur=clamp(Number($('createDuration').value)||60,5,3600)*1000;const step=clamp(Number($('createInterval').value)||250,40,5000);const theme=$('createTheme').value;let p=baseProject(title,theme,dur,step);state.library.unshift(p);saveLibrary();$('createDialog').close();renderLibrary();openSong(p.id);openEditor();toast('新项目已创建，现已进入曲谱编辑模式')}
function favoriteSong(id){let p=state.library.find(x=>x.id===id);if(!p)return;p.favorite=!p.favorite;saveLibrary();renderLibrary();toast(p.favorite?'已加入收藏':'已取消收藏')}
function duplicateSong(id){const source=state.library.find(p=>p.id===id);if(!source)return;const p=normalize({...copy(source),id:nextId('copy'),originKind:'user',title:source.title+' · 副本',provenance:{...source.provenance,source:'副本',derivedFrom:source.id}});p._imageUrl=source._imageUrl;p._imageBytes=source._imageBytes;state.library.unshift(p);saveLibrary();renderLibrary();toast('副本已存入「我的曲谱」，可以重命名和删除')}
function deleteSong(id){const p=state.library.find(x=>x.id===id);if(!p)return;if(p.originKind==='builtin'&&BUILTIN_IDS.has(id)){toast('内置歌曲不可删除，可复制为我的曲谱后删除副本',5000);return}state.pendingDeleteId=id;$('deleteWarning').textContent=`确定删除《${p.title}》？本地删除无法撤销，请先导出备份。`;$('deleteDialog').showModal()}
function deleteConfirmed(){let id=state.pendingDeleteId;state.pendingDeleteId=null;let p=state.library.find(x=>x.id===id);if(!p)return;if(p.originKind==='builtin'&&BUILTIN_IDS.has(id))return toast('不能删除内置曲目');state.library=state.library.filter(x=>x.id!==id);$('deleteDialog').close();if(state.project?.id===id){state.editMode=false;state.project=null;goHome()}saveLibrary();renderLibrary();toast('已移除曲目')}
function renameSong(id){let p=state.library.find(x=>x.id===id);if(!p)return;state.pendingSongId=id;$('renameInput').value=p.title;$('renameDialog').showModal();requestAnimationFrame(()=>$('renameInput').focus())}
function renameConfirmed(){const id=state.pendingSongId,p=state.library.find(x=>x.id===id);if(!p)return;let name=$('renameInput').value.trim().slice(0,120);if(!name){toast('歌曲名称不能为空');return}if(p.card?.title===p.title)p.card.title=name;p.title=name;if(state.project?.id===id){state.project.title=name;$('songTitle').textContent=name}state.pendingSongId=null;$('renameDialog').close();saveLibrary();renderLibrary();toast('已重命名为《'+name+'》')}
function historyItems(map,id){if(!map.has(id))map.set(id,[]);return map.get(id)}
function snapshot(p){return JSON.stringify({score:p.score,theme:p.theme,playback:p.playback,title:p.title,subtitle:p.subtitle,description:p.description,durationMs:p.durationMs,provenance:p.provenance})}
function rememberEditFor(p){let h=historyItems(state.history,p.id);h.push(snapshot(p));if(h.length>40)h.shift();state.future.set(p.id,[]);refreshHistoryButtons()}
function rememberEdit(){if(state.project)rememberEditFor(state.project)}
function restoreSnapshot(p,s){let v=JSON.parse(s);for(let k of Object.keys(v))p[k]=v[k];state.rate=p.playback.rate;state.tuning=p.playback.tuning;state.sustain=p.playback.sustain;state.position=clamp(state.position,0,p.durationMs);state.page=-1;refreshWorkspace()}
function undo(){let p=state.project;if(!p||!state.editMode)return;let stack=historyItems(state.history,p.id);if(!stack.length){toast('没有可撤销的修改');return}pauseSong();historyItems(state.future,p.id).push(snapshot(p));restoreSnapshot(p,stack.pop());toast('已撤销');saveLibrary()}
function redo(){let p=state.project;if(!p||!state.editMode)return;let stack=historyItems(state.future,p.id);if(!stack.length){toast('没有可恢复的修改');return}pauseSong();historyItems(state.history,p.id).push(snapshot(p));restoreSnapshot(p,stack.pop());toast('已重做');saveLibrary()}
function refreshHistoryButtons(){$('undoEdit').disabled=!state.project||!historyItems(state.history,state.project.id).length;$('redoEdit').disabled=!state.project||!historyItems(state.future,state.project.id).length}
function refreshWorkspace(){if(!state.project)return;let p=state.project;cancelRollFinish();state.position=clamp(state.position,0,p.durationMs);state.selected=clamp(state.selected,0,Math.max(0,scoreEvents(p).length-1));$('songTitle').textContent=p.title;$('songSubtitle').textContent=p.subtitle;$('durationHeader').textContent=durationFmt(p.durationMs);$('noteCountHeader').textContent=songNotes(p)+' NOTES';$('seekSlider').max=p.durationMs;$('seekMax').textContent=durationFmt(p.durationMs);$('speedSelect').value=String(state.rate);$('sustainSlider').value=Math.round(state.sustain*100);$('sustainValue').textContent=Math.round(state.sustain*100)+'%';$('keySelect').value=state.tuning;$('instrumentSelect').value=p.playback.instrument||'offline';setTuningButtons();applyTheme();renderBeatGrid(true);renderKeyBoard();updateVisual();refreshHistoryButtons();if(state.editMode)syncEditorFields()}
function openEditor(){if(state.mode!=='player')return;if(state.editMode){requestFinishEdit('exit');return}pauseSong();const src=state.project;state.editSource=src;state.project=normalize({...copy(src),_imageUrl:src._imageUrl,_imageBytes:src._imageBytes});state.editBaseline=snapshot(state.project);state.editDirty=false;state.editMode=true;state.history.set(src.id,[]);state.future.set(src.id,[]);updateEditButton();refreshWorkspace();syncEditorFields();toast('已进入编辑模式：修改后点击「保存」')}
function switchEditTab(){/* 编辑台已迁移到右下角；批量操作单独以弹窗显示 */}
function syncEditorFields(){let p=state.project;if(!p)return;let e=scoreEvents(p)[state.selected];if(!e)return;$('editorEventIndex').textContent=`第 ${String(state.selected+1).padStart(3,'0')} 事件`;$('editorEventNames').textContent=eventLabel(e);$('eventTime').value=e.timeMs;$('eventDuration').value=e.durationMs;$('eventVelocity').value=e.velocity||85;$('eventConfidence').value=e.confidence||'unknown';$('metaTitle').value=p.title;$('metaSubtitle').value=p.subtitle;$('metaDescription').value=p.description||''}
function commitEventFields(){if(!state.editMode)return;let p=state.project,e=scoreEvents(p)[state.selected];if(!e)return;let t=Number($('eventTime').value),d=Number($('eventDuration').value),v=Number($('eventVelocity').value);if(![t,d,v].every(Number.isFinite)||t<0||t>36000000||d<0||d>10000||v<1||v>127){toast('时间、时值或力度超出范围');return}rememberEdit();e.timeMs=Math.round(t);e.durationMs=Math.round(d);e.velocity=Math.round(v);e.confidence='user-corrected';scoreEvents(p).sort((a,b)=>a.timeMs-b.timeMs);state.selected=scoreEvents(p).indexOf(e);p.durationMs=Math.max(p.durationMs,e.timeMs+e.durationMs);saveLibrary();refreshWorkspace();syncEditorFields();toast('事件已更新')}
function eventInsert(){let p=state.project;if(!p||!state.editMode)return;pauseSong();rememberEdit();let old=scoreEvents(p)[state.selected];let t=old?Math.min(p.durationMs,old.timeMs+Math.max(1,Math.round(p.score.gridIntervalMs||167))):state.position;let ev={timeMs:t,notes:[],durationMs:0,velocity:85,confidence:'manual'};let list=scoreEvents(p);list.push(ev);list.sort((a,b)=>a.timeMs-b.timeMs);state.selected=list.indexOf(ev);p.durationMs=Math.max(p.durationMs,t+500);saveLibrary();refreshWorkspace();syncEditorFields();toast('已插入空白事件，可在15键面板添加音符')}
function eventRemove(){let p=state.project;if(!p||!state.editMode)return;let list=scoreEvents(p);if(list.length<=1){toast('乐谱至少保留一格');return}pauseSong();rememberEdit();list.splice(state.selected,1);state.selected=Math.min(state.selected,list.length-1);saveLibrary();refreshWorkspace();syncEditorFields();toast('事件已删除，可撤销')}
function batchTransform(kind){let p=state.project;if(!p||!state.editMode)return;pauseSong();let list=scoreEvents(p),grid=Number($('quantizeMs').value)||167,offset=Number($('offsetMs').value)||0,dur=Number($('batchDuration').value)||190,k=Number($('stretchFactor').value)||1;
 if(kind==='quantize'&&(grid<10||grid>2000))return toast('量化间隔需要10–2000 ms');if(kind==='stretch'&&(k<.25||k>4))return toast('伸缩系数需要0.25–4');rememberEdit();if(kind==='quantize')list.forEach(e=>e.timeMs=Math.round(e.timeMs/grid)*grid);if(kind==='offset')list.forEach(e=>e.timeMs=Math.max(0,e.timeMs+offset));if(kind==='duration')list.forEach(e=>{if(e.notes.length)e.durationMs=clamp(dur,30,4000)});if(kind==='stretch')list.forEach(e=>{e.timeMs=Math.round(e.timeMs*k);e.durationMs=Math.round(e.durationMs*k)});list.sort((a,b)=>a.timeMs-b.timeMs);p.durationMs=Math.max(500,Math.ceil(Math.max(...list.map(e=>e.timeMs+e.durationMs),0)+500));state.position=0;state.selected=0;saveLibrary();refreshWorkspace();toast('批量处理完成，可撤销')}
function saveSongInfo(){let p=state.project;if(!p||!state.editMode)return;rememberEdit();p.title=$('metaTitle').value.trim().slice(0,120)||'未命名乐曲';p.subtitle=$('metaSubtitle').value.trim().slice(0,150)||'SKY MUSIC';p.description=$('metaDescription').value.slice(0,600);saveLibrary();refreshWorkspace();renderLibrary();if($('metadataDialog').open)$('metadataDialog').close();toast('歌曲信息已更新，退出编辑时请选择保存方式')}
function themeEditor(){if(!state.project||!state.editMode)return toast('请先点击「曲谱编辑」');populateThemeChoices();syncThemeFields();$('sceneDialog').showModal()}
function syncThemeFields(){let t=state.project?.theme;if(!t)return;document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('is-active',b.dataset.scene===t.id));$('themeName').value=t.name||PRESETS[t.id]?.name||'';$('themeAccent').value=t.accent||'#e8c88a';$('themeBackground').value=t.backgroundColor||'#192b48';$('themeSnow').value=t.snow??40;$('themeGlow').value=t.glow??58;$('themeMotion').value=t.motion==='off'?'off':'ambient'}
function chooseTheme(id){if(!state.editMode)return;setTheme(id);syncThemeFields()}
function applyThemeFields(){let t=state.project?.theme;if(!t||!state.editMode)return;rememberEdit();t.name=$('themeName').value.slice(0,60);t.accent=$('themeAccent').value;t.backgroundColor=$('themeBackground').value;t.snow=clamp(Number($('themeSnow').value),0,100);t.glow=clamp(Number($('themeGlow').value),0,100);t.motion=$('themeMotion').value;saveLibrary();applyTheme();toast('已应用场景设置，导出项目即可保存')}
async function uploadStageImage(file){if(!state.editMode)throw Error('请先进入编辑模式');if(!file||!file.type.startsWith('image/'))throw Error('请选择图片文件');if(file.size>12*1024*1024)throw Error('原图超过12 MB');let image=await createImageBitmap(file);let c=document.createElement('canvas'),ratio=Math.min(1,1400/image.width,800/image.height);c.width=Math.round(image.width*ratio);c.height=Math.round(image.height*ratio);let ctx=c.getContext('2d');ctx.drawImage(image,0,0,c.width,c.height);image.close?.();let blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',.88));if(!blob)throw Error('图片转换失败');rememberEdit();let bytes=new Uint8Array(await blob.arrayBuffer()),p=state.project;p._imageBytes=bytes;p.theme.customStage=true;p._imageUrl='data:image/webp;base64,'+bytesToBase64(bytes);saveLibrary();initializeScene();toast('舞台图片已装载。分享时请使用 .skymusic 导出完整素材')}
// Standard MIDI file type 0 (single track), 480 PPQ, 120 BPM, C/G/sky base mapping.
function vlq(n){n=Math.max(0,Math.floor(n));let buf=[n&127];while(n>>=7)buf.unshift((n&127)|128);return buf}
function u16(n){return[(n>>8)&255,n&255]}function u32(n){return[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]}
function exportMIDI(p){let all=[{tick:0,kind:'meta',bytes:[0xff,0x51,3,7,161,32]}];const base=KEY_ROOTS[p.playback.tuning]??60;for(let e of scoreEvents(p)){for(let n of e.notes){let midi=base+SCALE[n-1],tick=Math.round(e.timeMs*.96),end=Math.max(tick+1,Math.round((e.timeMs+Math.max(30,e.durationMs))*.96));all.push({tick,kind:'on',bytes:[0x90,midi,clamp(e.velocity||85,1,127)]});all.push({tick:end,kind:'off',bytes:[0x80,midi,0]})}}all.sort((a,b)=>a.tick-b.tick||({'off':0,meta:1,on:2}[a.kind]-{'off':0,meta:1,on:2}[b.kind]));let body=[],t=0;for(let e of all){body.push(...vlq(e.tick-t),...e.bytes);t=e.tick}body.push(0,0xff,0x2f,0);let out=[...('MThd').split('').map(c=>c.charCodeAt(0)),...u32(6),...u16(0),...u16(1),...u16(480),...('MTrk').split('').map(c=>c.charCodeAt(0)),...u32(body.length),...body];downloadBytes(escName(p.title)+'.mid',new Uint8Array(out),'audio/midi')}
function exportCSV(p){let lines=['step,time_ms,notes,duration_ms,velocity,confidence'];for(let [i,e] of scoreEvents(p).entries())lines.push([i+1,e.timeMs,e.notes.join('+'),e.durationMs,e.velocity||85,e.confidence||''].map(v=>String(v).replaceAll(',',';')).join(','));downloadBytes(escName(p.title)+'.csv',ENCODER.encode('\ufeff'+lines.join('\r\n')),'text/csv;charset=utf-8')}
function exportJSON(p){downloadBytes(escName(p.title)+'.json',ENCODER.encode(JSON.stringify(p,(_,v)=>v instanceof Uint8Array?undefined:v,2)),'application/json')}
function openExport(){if(state.project)$('exportDialog').showModal()}
function bindWorkspace(){
 populateThemeChoices();
 $('newSongBtn').onclick=()=>$('createDialog').showModal();$('libraryFilter').onchange=renderLibrary;$('createConfirm').onclick=createProject;
 $('scoreEditorBtn').onclick=openEditor;$('quickNewEvent').onclick=eventInsert;$('quickDeleteEvent').onclick=eventRemove;$('undoEdit').onclick=undo;$('redoEdit').onclick=redo;
 $('sceneEditorBtn').onclick=themeEditor;$('exportProject').onclick=openExport;
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$((b.dataset.close)).close());
 $('batchEditorBtn').onclick=()=>{if(state.editMode)$('batchDialog').showModal()};$('songInfoBtn').onclick=openSongInfo;$('renameConfirm').onclick=renameConfirmed;$('deleteConfirm').onclick=deleteConfirmed;$('renameInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();renameConfirmed()}};$('saveDirect').onclick=()=>completeEdit('direct');$('saveAsNew').onclick=()=>completeEdit('new');$('discardChanges').onclick=()=>completeEdit('discard');
 $('eventApply').onclick=commitEventFields;$('eventAdd').onclick=eventInsert;$('eventDelete').onclick=eventRemove;
 $('quantizeBtn').onclick=()=>batchTransform('quantize');$('offsetBtn').onclick=()=>batchTransform('offset');$('durationBtn').onclick=()=>batchTransform('duration');$('stretchBtn').onclick=()=>batchTransform('stretch');$('saveMetadata').onclick=saveSongInfo;
 document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>chooseTheme(b.dataset.scene));$('themeApplyBtn').onclick=applyThemeFields;$('stageImageBtn').onclick=()=>$('stageImageInput').click();$('stageImageInput').onchange=async e=>{let f=e.target.files?.[0];e.target.value='';if(f)try{await uploadStageImage(f)}catch(err){toast('图片导入失败：'+err.message,6000)}};
 $('stageImageClear').onclick=()=>{if(!state.project||!state.editMode)return;rememberEdit();state.project._imageBytes=null;state.project._imageUrl=null;state.project.theme.customStage=false;initializeScene();saveLibrary();toast('已恢复默认舞台')};$('themeExportBtn').onclick=()=>exportTheme(state.project);$('exportPlatform').onclick=()=>exportPlatformEntry(state.project);$('exportNative').onclick=()=>exportTrack(state.project);$('exportMidi').onclick=()=>exportMIDI(state.project);$('exportCsv').onclick=()=>exportCSV(state.project);$('exportJson').onclick=()=>exportJSON(state.project);$('exportThemeOnly').onclick=()=>exportTheme(state.project);
 $('importDropzone').onclick=()=>$('fileInput').click();$('openVideoImport').onclick=()=>{ $('importDialog').close();openVideoDialog() };
 let depth=0;window.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();depth++;$('globalDropHint').hidden=false});window.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files'))e.preventDefault()});window.addEventListener('dragleave',e=>{depth--;if(depth<=0){depth=0;$('globalDropHint').hidden=true}});window.addEventListener('drop',async e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();depth=0;$('globalDropHint').hidden=true;const files=[...e.dataTransfer.files];try{await importFiles(files)}catch(err){toast('导入失败：'+err.message,7000)}});
 document.addEventListener('keydown',e=>{if(state.mode!=='player'||e.target.closest('input,select,textarea,[contenteditable]')||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();e.shiftKey?redo():undo()}else if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();redo()}else if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();openExport()}});
 refreshHistoryButtons()
}
// IndexedDB is an optional backup for project data and uploaded images. The .skymusic file is the portable source of truth.
let dbInstance=null,dbSaveTimer=0;
function openDb(){return new Promise((resolve,reject)=>{if(!window.indexedDB){resolve(null);return}let req=indexedDB.open('sky-music-studio-library-v03',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('library'))req.result.createObjectStore('library')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function dbRead(db){return new Promise((res,rej)=>{let tx=db.transaction('library','readonly'),r=tx.objectStore('library').get('projects');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function dbWrite(db,projects){return new Promise((res,rej)=>{let tx=db.transaction('library','readwrite');tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.objectStore('library').put(projects,'projects')})}
async function startDbBackup(){try{dbInstance=await openDb();if(!dbInstance)return;let stored=await dbRead(dbInstance);if(Array.isArray(stored))for(let old of stored.slice(0,50)){try{let p=normalize({...old,originKind:BUILTIN_IDS.has(old.id)?'builtin':(old.originKind||'user')});p._imageBytes=old._imageBytes||null;p._imageUrl=old._imageUrl||null;let idx=state.library.findIndex(s=>s.id===p.id);if(idx>=0)state.library[idx]=p;else state.library.push(p)}catch(err){console.warn('跳过损坏的缓存项目',err)}}renderLibrary()}catch(err){console.warn('持久化存储不可用，建议导出工程文件',err)}}
function scheduleDbBackup(){if(!dbInstance)return;clearTimeout(dbSaveTimer);dbSaveTimer=setTimeout(()=>dbWrite(dbInstance,state.library).catch(e=>console.warn('DB 保存失败',e)),450)}

/* 47-edit-session.js */
// Transactional score editing. The public library copy remains untouched until Save.
function updateEditButton(){
 const on=Boolean(state.editMode),p=$('playerView');if(!p)return;
 p.classList.toggle('editing',on);
 const b=$('scoreEditorBtn');b.textContent=!on?'✎ 曲谱编辑':state.editDirty?'▣ 保存':'✓ 完成编辑';
 b.classList.toggle('has-changes',on&&state.editDirty);
 const hint=$('gridHint');if(hint)hint.textContent=on?'点击节拍选择事件':'点击节拍可查看';
 const info=$('saveMetadata');if(info)info.hidden=!on;
}
function requestFinishEdit(action='exit'){
 if(!state.editMode){if(action==='home')goHome();return}
 state.pendingEditAction=action;
 if(state.editDirty){$('saveChoiceDialog').showModal();return}
 completeEdit('discard');
}
function completeEdit(kind){
 if(!state.editMode)return;
 pauseSong();
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
 state.history.delete(original.id);state.future.delete(original.id);updateEditButton();
 saveLibrary();
 if(action==='home'){goHome();return}
 state.tuning=chosen.playback?.tuning||'C';state.sustain=chosen.playback?.sustain??.45;
 refreshWorkspace();renderLibrary();saveLibrary();
 toast(kind==='new'?'已另存为普通曲谱，可自由重命名和删除':kind==='direct'?'已保存当前项目':'已退出编辑模式');
}
function openSongInfo(){if(!state.project)return;syncEditorFields();for(let id of ['metaTitle','metaSubtitle','metaDescription'])$(id).readOnly=!state.editMode;$('saveMetadata').hidden=!state.editMode;$('metadataDialog').showModal()}

/* 99-bootstrap.js */
function install(){restorePlatformThemes();state.library=BUILTINS.map(p=>normalize(p));loadLibrary();snowPopulate($('worldSnow'),70);snowPopulate($('stageSnow'),24,'stage');$('showGuide').onclick=()=>$('helpDialog').showModal();for(let b of document.querySelectorAll('[data-import]'))b.onclick=openImport;$('openFirst').onclick=()=>openSong(state.library[0].id);$('songSearch').oninput=renderLibrary;
 $('fileInput').onchange=async ev=>{let files=[...(ev.target.files||[])],file=files[0];ev.target.value='';if(!file)return;toast('正在检查 '+file.name,1200);try{await importFiles(files)}catch(err){console.error('Import failed',err);toast('导入失败：'+err.message,7500)}};
 $('importThemeLibrary').onclick=()=>$('themeLibraryInput').click();$('themeLibraryInput').onchange=async ev=>{const file=ev.target.files?.[0];ev.target.value='';if(file)try{await importFile(file)}catch(error){toast('主题录入失败：'+error.message,7500)}};
 bindPlayerInteractions();
 bindRangePicker();bindInstrumentPicker();bindWorkspace();bindVideo();renderLibrary();if(location.hash.startsWith('#song=')){let id=decodeURIComponent(location.hash.slice(6));if(state.library.some(x=>x.id===id))openSong(id)}
 }
// Avoid editing the user-provided v7 backup: all transforms occur on copied score objects.

window.__SKY_STUDIO_TEST__={state,openSong,goHome,normalize,makeZip,readZip,unpackProject,parseMIDI,parseCSV,parseMusicXML,exportProject,exportMIDI,exportCSV,importFile,createProject,renameSong,renameConfirmed,duplicateSong,deleteSong,deleteConfirmed,completeEdit,openEditor,requestFinishEdit,KEY_ROOTS,noteMidi,noteName,rollFrame,rollTimeLabels,platformController,importFiles,importPlatformFile,readMusicResource,exportPlatformEntry,projectEntry,PLAYER_RULES,THEME_DEFINITIONS,bindPlayerInteractions,INSTRUMENTS,loadInstrumentBank,preloadPiano,triggerSample,chooseInstrument,undo,redo,eventInsert,eventRemove,applyThemeFields,analyseSkyGrid,applyPlayerTemplate,PLAYER_TEMPLATE_ID};
install();startDbBackup();
})();
