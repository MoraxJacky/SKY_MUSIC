// One player shell, one interaction model. Themes provide data, never duplicate markup.
const PLAYER_TEMPLATE_ID='legacy-v7';
const PLAYER_APPEARANCE={
 christmas:{surfaceStart:'#17372f',surfaceEnd:'#0d2826',controlStart:'#123a30',controlEnd:'#302729',button:'#193a31',hover:'#295044',border:'#456056',text:'#fff8eb',muted:'#b4c9bf',gridStart:'#254337',gridEnd:'#183229',rest:'#112b25',dot:'#476354',note:'#ddf1c4',chord:'#f2d09e',poly:'#f1a9a0',activeStart:'#765740',activeEnd:'#aa754b',accent:'#eac68a',stageStart:'#132e2c',stageEnd:'#193c38',backdrop:'#091e1b'},
 starlight:{surfaceStart:'#202c49',surfaceEnd:'#142039',controlStart:'#252b48',controlEnd:'#382e50',button:'#26344e',hover:'#3a4c69',border:'#626b8b',text:'#fff4fb',muted:'#c0c9dc',gridStart:'#303d5b',gridEnd:'#202c46',rest:'#17213a',dot:'#526281',note:'#d5dffc',chord:'#f0cce1',poly:'#e3b4cb',activeStart:'#7d5879',activeEnd:'#b47e9b',accent:'#f2c9dd',stageStart:'#171e38',stageEnd:'#302748',backdrop:'#131b30'},
 citylights:{surfaceStart:'#302c43',surfaceEnd:'#1b233b',controlStart:'#332c45',controlEnd:'#442e42',button:'#33334a',hover:'#4b4863',border:'#76647c',text:'#fff5eb',muted:'#d3c4ce',gridStart:'#42384f',gridEnd:'#292b43',rest:'#211f35',dot:'#6b5c72',note:'#dacde9',chord:'#f3d09b',poly:'#efb0b7',activeStart:'#845b55',activeEnd:'#b78666',accent:'#f0c3a8',stageStart:'#24223d',stageEnd:'#46314b',backdrop:'#201e31'}
};
function sanitizePlayerAppearance(raw){let result={};if(!raw||typeof raw!=='object')return result;for(let key of Object.keys(PLAYER_APPEARANCE.christmas))if(/^#[0-9a-f]{6}$/i.test(raw[key]||''))result[key]=raw[key];return result}
function applyPlayerTemplate(project,host){
 const id=sceneId(project),theme=project.theme||{},colors={...PLAYER_APPEARANCE[id],...sanitizePlayerAppearance(theme.appearance)};
 if(/^#[0-9a-f]{6}$/i.test(theme.accent||''))colors.accent=theme.accent;
 if(/^#[0-9a-f]{6}$/i.test(theme.backgroundColor||''))colors.stageEnd=colors.backdrop=theme.backgroundColor;
 state.playerColors=colors;
 host.dataset.template=PLAYER_TEMPLATE_ID;host.dataset.theme=id;
 for(let [name,value]of Object.entries(colors))host.style.setProperty('--player-'+name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);
 host.style.setProperty('--gold',colors.accent);host.style.setProperty('--theme-accent',colors.accent);host.style.setProperty('--note',colors.note);host.style.setProperty('--chord',colors.chord);
 host.style.setProperty('--glow-strength',String((theme.glow??58)/100));
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 host.classList.toggle('motion-off',theme.motion==='off'||Boolean(reduced));
 $('stageSnow').style.opacity=String(clamp(Number(theme.snow??40),0,100)/100);
 $('identitySnow').hidden=id!=='christmas';$('identityGlyph').hidden=id==='christmas';$('identityGlyph').textContent=id==='citylights'?'☾':'✧';
 $('sceneName').textContent=theme.name||PRESETS[id].name;
}
