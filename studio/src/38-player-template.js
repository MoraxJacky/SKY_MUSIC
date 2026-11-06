// One player shell, one interaction model. Themes provide data, never duplicate markup.
const PLAYER_TEMPLATE_ID=PLAYER_RULES.templateId;
const PLAYER_APPEARANCE=Object.fromEntries(Object.entries(THEME_DEFINITIONS).map(([id,t])=>[id,t.appearance]));
function themeDefinition(project=state.project){return project?.theme?.definition||THEME_DEFINITIONS[sceneId(project)]}
function themeAsset(path,project=state.project){return project?.theme?.assets?.[path]||PLATFORM_THEME_ASSETS[sceneId(project)]?.[path]||window.SKY_THEME_ASSETS?.[path]||path}
function applyThemeClasses(host,definition){const classes=new Set(Object.values(THEME_DEFINITIONS).flatMap(t=>t.decorations.classes));for(const name of classes)host.classList.toggle(name,definition.decorations.classes.includes(name))}
function rollPaletteForTheme(definition,colors){return {base:colors.surfaceEnd,light:colors.gridStart,medium:colors.gridEnd,dark:colors.rest,label:colors.muted,anchor:colors.accent,...definition.rollPalette}}
function themeCaption(project=state.project){const definition=themeDefinition(project),name=project?.theme?.name;return !name||definition.legacyNames?.includes(name)?definition.name:name}
function sanitizeThemeMaterials(raw={}){const base=APP_CONFIG.themeTemplate.materials;return {surfaceGradient:typeof raw.surfaceGradient==='boolean'?raw.surfaceGradient:base.surfaceGradient,activeGradient:typeof raw.activeGradient==='boolean'?raw.activeGradient:base.activeGradient,surfaceAngle:clamp(Number(raw.surfaceAngle)||base.surfaceAngle,0,360),activeAngle:clamp(Number(raw.activeAngle)||base.activeAngle,0,360)}}
function sanitizeThemeLayout(raw={}){const result={sceneFit:raw.sceneFit==='cover'?'cover':'contain'};for(const [key,fallback,min,max]of [['companionWidth',28,12,60],['companionHeight',64,20,95],['companionLeft',8,0,70],['companionBottom',9,0,60],['ornamentWidth',14,4,25],['ornamentHeight',32,8,50],['ornamentRight',3,0,40],['ornamentBottom',11,0,60]])result[key]=clamp(Number.isFinite(raw[key])?raw[key]:fallback,min,max);return result}
function sanitizeKeyFeedback(raw={},colors={}){const base=APP_CONFIG.themeTemplate.keyFeedback,shapes=['snowflake','star','spark','butterfly','drop','diamond'];return {enabled:raw.enabled===true,shape:shapes.includes(raw.shape)?raw.shape:'star',element:typeof raw.element==='string'?raw.element:null,count:clamp(Math.round(Number(raw.count)||base.count),1,16),durationMs:clamp(Number(raw.durationMs)||base.durationMs,180,1500),spreadPx:clamp(Number(raw.spreadPx)||base.spreadPx,8,100),risePx:clamp(Number(raw.risePx)||base.risePx,8,100),sizePx:clamp(Number(raw.sizePx)||base.sizePx,6,24),colors:(raw.colors||[colors.accent,colors.note]).filter(color=>/^#[0-9a-f]{6}$/i.test(color)).slice(0,4)}}
function sanitizePlayerAppearance(raw){let result={};if(!raw||typeof raw!=='object')return result;for(let key of Object.keys(PLAYER_APPEARANCE.christmas))if(/^#[0-9a-f]{6}$/i.test(raw[key]||''))result[key]=raw[key];return result}
function resolvedPlayerColors(project){
 const definition=themeDefinition(project),theme=project?.theme||{},colors={...definition.appearance,...sanitizePlayerAppearance(theme.appearance)};
 if(/^#[0-9a-f]{6}$/i.test(theme.accent||''))colors.accent=theme.accent;
 if(/^#[0-9a-f]{6}$/i.test(theme.backgroundColor||''))colors.stageEnd=colors.backdrop=theme.backgroundColor;
 return colors;
}
function syncStatusNotificationAppearance(){
 const el=$('toast');if(!el?.style?.setProperty)return;
 const preview=$('homeThemeDialog')?.open?homeExperience.preview?.project:null,project=preview||(state.mode==='player'?state.project:null);
 const colors=project?resolvedPlayerColors(project):{surfaceStart:'#273e56',surfaceEnd:'#172b42',text:'#edf6ff',border:'#718ba3',accent:'#d8eaf8'};
 for(const key of ['surfaceStart','surfaceEnd','text','border','accent'])el.style.setProperty('--notice-'+key,colors[key]);el.dataset.theme=project?sceneId(project):'platform';
}
function applyPlayerTemplate(project,host){
 const id=sceneId(project),definition=themeDefinition(project),decor=definition.decorations,theme=project.theme||{},colors=resolvedPlayerColors(project);
 state.playerColors=colors;applyThemeClasses(host,definition);
 host.dataset.template=PLAYER_TEMPLATE_ID;host.dataset.theme=id;
 for(let [name,value]of Object.entries(colors))host.style.setProperty('--player-'+name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);
 const material=sanitizeThemeMaterials(definition.materials);
 host.style.setProperty('--player-surface-paint',material.surfaceGradient?`linear-gradient(${material.surfaceAngle}deg,${colors.surfaceStart},${colors.surfaceEnd})`:colors.surfaceEnd);
 host.style.setProperty('--player-active-paint',material.activeGradient?`linear-gradient(${material.activeAngle}deg,${colors.activeStart},${colors.activeEnd})`:colors.activeEnd);
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
 $('themeChoices').innerHTML='';$('createTheme').innerHTML='';
 for(const definition of Object.values(THEME_DEFINITIONS)){
  const button=document.createElement('button');button.dataset.scene=definition.id;button.onclick=()=>chooseTheme(definition.id);button.textContent=definition.displayName;const description=document.createElement('small');description.textContent=definition.description||definition.name;button.append(description);$('themeChoices').append(button);
  const option=document.createElement('option');option.value=definition.id;option.textContent=definition.displayName;$('createTheme').append(option);
 }
}

// UI pictograms use the same vector geometry on every platform. Legacy theme glyphs
// are accepted as data, then mapped to this registry before the browser paints them.
const APP_ICON_PATHS={
 play:'<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
 restart:'<path d="M4 10a8 8 0 1 1 2 9M4 4v6h6"/>',
 'repeat-one':'<path d="M3 9V6h15l3 3M21 15v3H6l-3-3M18 3l3 3-3 3M6 21l-3-3 3-3"/><path d="m11 10 2-1v7m-2 0h4"/>',
 edit:'<path d="m4 16-1 5 5-1L20 8l-4-4Zm10-10 4 4M3 21l5-1"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',info:'<path d="M12 6v8m0 4h.01"/>',
 left:'<path d="m15 5-7 7 7 7"/>',right:'<path d="m9 5 7 7-7 7"/>',down:'<path d="m5 8 7 7 7-7"/>',plus:'<path d="M12 4v16M4 12h16"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
 favorite:'<path d="m12 2 3 6.5 7 .9-5 5 1.3 7-6.3-3.3-6.3 3.3 1.3-7-5-5 7-.9Z"/>',
 'favorite-filled':'<path d="m12 2 3 6.5 7 .9-5 5 1.3 7-6.3-3.3-6.3 3.3 1.3-7-5-5 7-.9Z" fill="currentColor"/>',
 spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
 note:'<path d="M9 18V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>',
 scene:'<path d="M12 3a9 9 0 1 0 0 18Z" fill="currentColor"/><circle cx="12" cy="12" r="9"/>',check:'<path d="m4 12 5 5L20 6"/>'
};
function appIcon(name){return '<svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(APP_ICON_PATHS[name]||APP_ICON_PATHS.spark)+'</svg>'}
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
