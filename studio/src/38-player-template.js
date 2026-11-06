// One player shell, one interaction model. Themes provide data, never duplicate markup.
const PLAYER_TEMPLATE_ID=PLAYER_RULES.templateId;
const PLAYER_APPEARANCE=Object.fromEntries(Object.entries(THEME_DEFINITIONS).map(([id,t])=>[id,t.appearance]));
function themeDefinition(project=state.project){return project?.theme?.definition||THEME_DEFINITIONS[sceneId(project)]}
function themeAsset(path,project=state.project){return project?.theme?.assets?.[path]||PLATFORM_THEME_ASSETS[sceneId(project)]?.[path]||window.SKY_THEME_ASSETS?.[path]||path}
function applyThemeClasses(host,definition){const classes=new Set(Object.values(THEME_DEFINITIONS).flatMap(t=>t.decorations.classes));for(const name of classes)host.classList.toggle(name,definition.decorations.classes.includes(name))}
function rollPaletteForTheme(definition,colors){return {base:colors.surfaceEnd,light:colors.gridStart,medium:colors.gridEnd,dark:colors.rest,label:colors.muted,anchor:colors.accent,...definition.rollPalette}}
function themeCaption(project=state.project){const definition=themeDefinition(project),name=project?.theme?.name;return !name||definition.legacyNames?.includes(name)?definition.name:name}
function sanitizeThemeMaterials(raw={}){const base=APP_CONFIG.themeTemplate.materials;return {surfaceGradient:typeof raw.surfaceGradient==='boolean'?raw.surfaceGradient:base.surfaceGradient,activeGradient:typeof raw.activeGradient==='boolean'?raw.activeGradient:base.activeGradient,surfaceAngle:clamp(Number(raw.surfaceAngle)||base.surfaceAngle,0,360),activeAngle:clamp(Number(raw.activeAngle)||base.activeAngle,0,360)}}
function sanitizeKeyFeedback(raw={},colors={}){const base=APP_CONFIG.themeTemplate.keyFeedback,shapes=['snowflake','star','spark','butterfly','drop','diamond'];return {enabled:raw.enabled===true,shape:shapes.includes(raw.shape)?raw.shape:'star',element:typeof raw.element==='string'?raw.element:null,count:clamp(Math.round(Number(raw.count)||base.count),1,16),durationMs:clamp(Number(raw.durationMs)||base.durationMs,180,1500),spreadPx:clamp(Number(raw.spreadPx)||base.spreadPx,8,100),risePx:clamp(Number(raw.risePx)||base.risePx,8,100),sizePx:clamp(Number(raw.sizePx)||base.sizePx,6,24),colors:(raw.colors||[colors.accent,colors.note]).filter(color=>/^#[0-9a-f]{6}$/i.test(color)).slice(0,4)}}
function sanitizePlayerAppearance(raw){let result={};if(!raw||typeof raw!=='object')return result;for(let key of Object.keys(PLAYER_APPEARANCE.christmas))if(/^#[0-9a-f]{6}$/i.test(raw[key]||''))result[key]=raw[key];return result}
function applyPlayerTemplate(project,host){
 const id=sceneId(project),definition=themeDefinition(project),decor=definition.decorations,theme=project.theme||{},colors={...definition.appearance,...sanitizePlayerAppearance(theme.appearance)};
 if(/^#[0-9a-f]{6}$/i.test(theme.accent||''))colors.accent=theme.accent;
 if(/^#[0-9a-f]{6}$/i.test(theme.backgroundColor||''))colors.stageEnd=colors.backdrop=theme.backgroundColor;
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
 const companion=document.querySelector('.stage-companion');if(companion){companion.hidden=!decor.companion||Boolean(project._imageUrl);if(decor.companion)companion.src=themeAsset(decor.companion,project)}
 for(const image of document.querySelectorAll('[data-theme-decoration]')){const path=decor.ornaments?.[0];image.hidden=!path;if(path)image.src=themeAsset(path,project)}
 $('sceneName').textContent=themeCaption(project);
}

function populateThemeChoices(){
 $('themeChoices').innerHTML='';$('createTheme').innerHTML='';
 for(const definition of Object.values(THEME_DEFINITIONS)){
  const button=document.createElement('button');button.dataset.scene=definition.id;button.onclick=()=>chooseTheme(definition.id);button.textContent=definition.displayName;const description=document.createElement('small');description.textContent=definition.description||definition.name;button.append(description);$('themeChoices').append(button);
  const option=document.createElement('option');option.value=definition.id;option.textContent=definition.displayName;$('createTheme').append(option);
 }
}
