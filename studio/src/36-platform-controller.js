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
