function snowPopulate(element,count,scope='world'){element.innerHTML='';for(let i=0;i<count;i++){let dot=document.createElement('i');dot.className='snow-dot';let size=1+Math.random()*3.3;dot.style.cssText=`left:${Math.random()*100}%;width:${size.toFixed(2)}px;height:${size.toFixed(2)}px;opacity:${(.18+Math.random()*.38).toFixed(2)};animation-duration:${(scope==='world'?16:9)+Math.random()*15}s;animation-delay:-${Math.random()*30}s;--dx:${Math.round((Math.random()-.5)*170)}px`;element.append(dot)}}
function renderLibrary(){let q=$('songSearch').value.trim().toLowerCase(),c=$('libraryCards');c.innerHTML='';let filter=$('libraryFilter').value;let visible=state.library.filter(p=>(p.title+' '+p.subtitle+' '+(p.author||'')).toLowerCase().includes(q)).filter(p=>filter==='favorite'?p.favorite:filter==='recent'?p.lastOpened>0:true);if(filter==='recent')visible.sort((a,b)=>b.lastOpened-a.lastOpened);$('libraryCount').textContent=state.library.length+' 首乐曲';for(let song of visible){let card=document.createElement('article');card.className='song-card';let scene=sceneId(song);const cover=(platformCover(song)||THEME_DEFINITIONS[scene].decorations.cover)?`<img alt="" src="${platformCover(song)||song._imageUrl||themeAsset(THEME_DEFINITIONS[scene].decorations.cover,song)}">`:'';card.innerHTML=`<div class="song-cover ${scene}"><span class="cover-tag">${song.originKind==='builtin'?'内置歌曲':song.originKind==='imported'?'导入曲谱':'我的曲谱'}</span>${cover}</div><div class="song-details"><div><h3></h3><p></p></div><button class="card-play">▶</button></div>`;card.querySelector('h3').textContent=song.card?.title||song.title;card.querySelector('p').textContent=song.card?.subtitle||durationFmt(song.durationMs)+' · '+songNotes(song)+' 音符 · '+(PRESETS[scene]?.name||'主题');card.querySelector('.card-play').onclick=()=>openSong(song.id);card.querySelector('.song-cover').onclick=()=>openSong(song.id);
 let actions=document.createElement('div');actions.className='song-card-actions';for(let [label,func,title] of [[song.favorite?'★':'☆',()=>favoriteSong(song.id),'收藏'],['✎',()=>renameSong(song.id),'重命名'],['⧉',()=>duplicateSong(song.id),'制作副本'],['×',()=>deleteSong(song.id),'删除项目']]){let btn=document.createElement('button');btn.textContent=label;btn.title=title;btn.setAttribute('aria-label',title);btn.onclick=e=>{e.stopPropagation();func()};actions.append(btn)}card.querySelector('.song-cover').append(actions);c.append(card)}let add=document.createElement('button');add.className='song-card add-card';add.innerHTML='<span class="plus">＋</span><strong>导入新的乐曲</strong><span>SKYMUSIC · MIDI · MUSICXML · AUDIO</span>';add.onclick=()=>openImport();c.append(add)}
function openImport(){$('importDialog').showModal()}
function mountPlatformProject(id){cancelRollDrag();invalidateInstrumentChange();closeInstrumentPicker();closeSpeedPicker();closeRangePicker();cancelRollFinish();pauseSong();let p=state.library.find(p=>p.id===id);if(!p){toast('找不到歌曲');return}state.project=p;state.editMode=false;state.editDirty=false;state.editSource=null;state.editBaseline=null;updateEditButton();p.lastOpened=Date.now();saveLibrary();state.position=0;state.rollPageStart=0;state.selected=0;state.lastSelected=-1;state.page=-1;state.rate=p.playback.rate||1;state.tuning=p.playback.tuning||'C';state.sustain=Number.isFinite(p.playback.sustain)?p.playback.sustain:.45;state.volume=normalizeVolume(p.playback.volume);syncVolumeControl();$('homeView').hidden=true;$('playerView').hidden=false;state.mode='player';$('playBtn').textContent='▶ 播放';$('songTitle').textContent=p.title;$('songSubtitle').textContent=p.subtitle;$('durationHeader').textContent=durationFmt(p.durationMs);$('noteCountHeader').textContent=songNotes(p)+' NOTES';syncSpeedPicker();$('sustainSlider').value=Math.round(state.sustain*100);$('sustainValue').textContent=Math.round(state.sustain*100)+'%';$('instrumentSelect').value=p.playback.instrument||'offline';$('keySelect').value=Object.hasOwn(KEY_ROOTS,state.tuning)?state.tuning:'C';$('seekSlider').max=p.durationMs;$('seekMax').textContent=durationFmt(p.durationMs);$('playBtn').disabled=false;applyTheme();initializeScene();renderKeyBoard();renderBeatGrid(true);updateVisual();refreshHistoryButtons();try{localStorage.setItem('sky-last-song',id)}catch(e){console.warn('最近播放缓存不可用',e)}requestAnimationFrame(drawRoll);try{history.replaceState(null,'','#song='+encodeURIComponent(id))}catch(e){}}
function goHome(){cancelRollDrag();invalidateInstrumentChange();closeInstrumentPicker();closeSpeedPicker();closeRangePicker();cancelRollFinish();if(state.editMode){requestFinishEdit('home');return}pauseSong();state.mode='home';$('playerView').hidden=true;$('homeView').hidden=false;try{history.replaceState(null,'',location.pathname)}catch(e){};renderLibrary();toast('已返回音乐馆',1000)}
function applyTheme(){let p=state.project;if(!p)return;let theme=sceneId(p),host=$('playerView');applyPlayerTemplate(p,host);if($('scoreConsole')?.open)applyPlayerTemplate(p,$('scoreConsole'));initializeScene()}
function beatIndex(time){let events=scoreEvents(state.project);return clamp(lowerBound(events,time+1)-1,0,Math.max(events.length-1,0))}
// A grid cell represents a time slot, not one independently editable audio event.
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
  btn.onclick=()=>{pauseSong();seekTo(e.timeMs);if(e.indices.length){state.selected=e.indices[0];state.lastSelected=state.selected}renderKeyBoard();updateVisual();if(state.editMode)syncEditorFields()};frag.append(btn);
 }
 for(let i=Math.min(layout.count-pg*size,size);i<size;i++){const tile=document.createElement('div');tile.className='beat empty beat-placeholder';tile.setAttribute('aria-hidden','true');frag.append(tile)}grid.append(frag);
 const split=size!==BEATS_PER_PAGE,total=Math.max(1,Math.ceil(layout.count/BEATS_PER_PAGE));$('pageLabel').textContent=(split?String(Math.floor(pg/2)+1)+(pg%2?'B':'A'):String(pg+1).padStart(2,'0'))+' / '+String(total).padStart(2,'0');grid.dataset.section=split?(pg%2?'B':'A'):'full';grid.setAttribute('aria-label',split?'第 '+(Math.floor(pg/2)+1)+' 组 '+(pg%2?'B':'A')+' 段，8列2行逐拍谱':'逐拍谱，8列4行');$('pagePrev').disabled=pg===0;$('pageNext').disabled=pg===Math.max(1,Math.ceil(layout.count/size))-1;
}
function renderKeyBoard(){let c=$('keyBoard');c.innerHTML='';let active=displayedBeat().notes;for(let n=1;n<=15;n++){let b=document.createElement('button');b.className='key-tile'+(active.includes(n)?' active':'');b.dataset.note=n;b.setAttribute('aria-label','切换琴键 '+n+' '+noteName(n));b.innerHTML=`<span class="key-no">${String(n).padStart(2,'0')}</span><span class="key-name">${noteName(n)}</span>`;b.onclick=()=>toggleNote(n);c.append(b)}}
async function toggleNote(n){if(!state.project)return;if(scoreConsoleCapture(n))return;if(!state.editMode){try{await preloadPiano();triggerSample(n,state.audioCtx.currentTime+.02,280)}catch(e){toast('音源尚未就绪',2500)}return}let item=scoreEvents(state.project)[state.selected];if(!item)return;let exists=item.notes.includes(n);rememberEdit();item.notes=exists?item.notes.filter(v=>v!==n):[...item.notes,n].sort((a,b)=>a-b);if(item.notes.length&&item.durationMs<70)item.durationMs=190;if(!item.notes.length)item.durationMs=0;item.confidence='user-corrected';saveLibrary();renderKeyBoard();renderBeatGrid(true);updateVisual();refreshHistoryButtons();if(state.editMode)syncEditorFields();$('noteCountHeader').textContent=songNotes(state.project)+' NOTES';if(!exists){try{await preloadPiano();triggerSample(n,state.audioCtx.currentTime+.015,300)}catch(e){console.warn(e)}}}
function updateVisual(){let p=state.project;if(!p)return;let pos=state.position,events=scoreEvents(p),now=beatIndex(pos);let changed=now!==state.selected;if(state.isPlaying||state.lastSelected!==state.selected){state.selected=now;if(Math.floor(beatDisplayIndex()/beatPageSize())!==state.page)renderBeatGrid();if(changed)renderKeyBoard()}
 state.lastSelected=state.selected;const displayIndex=beatDisplayIndex();if(Math.floor(displayIndex/beatPageSize())!==state.page)renderBeatGrid();$('timeClock').textContent=positionFmt(pos);$('seekSlider').value=Math.round(pos);$('rollSeekSlider').max=p.durationMs;$('rollSeekSlider').value=Math.round(pos);$('rollPosition').textContent=String(state.selected+1).padStart(4,'0')+' / '+events.length;
 const e=displayedBeat();$('selectedSummary').textContent=eventLabel(e);$('currentBeatIndex').textContent='第 '+String(displayIndex+1).padStart(3,'0')+' 格';$('currentBeatNotes').textContent=eventLabel(e);
 let keys=state.isPlaying?activeNotes(pos):new Set();
 for(let el of $('beatGrid').children){let index=+el.dataset.index,on=index===displayIndex;el.classList.toggle('active',on);el.classList.toggle('select',on);el.classList.toggle('echo',state.isPlaying&&index<displayIndex&&index>=displayIndex-8&&beatLayout().cells.get(index)?.notes.length>0);el.setAttribute('aria-current',on?'step':'false');for(let dot of el.querySelectorAll('.mini-dot'))dot.classList.toggle('resonance',on&&keys.has(+dot.dataset.note)&&!e?.notes?.includes(+dot.dataset.note))}
 if(state.isPlaying&&!e?.notes.length&&keys.size){let names=[...keys].sort((a,b)=>a-b).map(noteName).join(' · ');$('currentBeatNotes').textContent='余音 '+names;$('selectedSummary').textContent=names}
 for(let k of $('keyBoard').children){let n=Number(k.dataset.note);k.classList.toggle('ringing',state.isPlaying&&keys.has(n));k.classList.toggle('active',e?.notes?.includes(n))}drawRoll();updateScoreConsole()
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
 if(typeof scoreConsole!=='undefined'&&scoreConsole.fine){const f=scoreConsole.fine.frame;return {...f,phase:clamp(position-f.begin,0,f.windowMs)}}
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
function rollPlotGeometry(rect,frame=rollFrame(),context=$('rollCanvas').getContext('2d')){
 context.save();context.font='10px ui-monospace,monospace';const right=Math.max(13,context.measureText(rollTimeText(frame.end)).width/2+4);context.restore();
 return {left:59,top:25,bottom:23,right,plotW:rect.width-59-right};
}
function drawRoll(){if(!state.project||state.mode!=='player')return;let cv=$('rollCanvas'),rect=cv.getBoundingClientRect();if(rect.width<30||rect.height<30)return;let dpr=Math.min(2,devicePixelRatio||1);if(cv.width!==Math.round(rect.width*dpr)||cv.height!==Math.round(rect.height*dpr)){cv.width=Math.round(rect.width*dpr);cv.height=Math.round(rect.height*dpr)}const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);let W=rect.width,H=rect.height,left=59,top=25,bottom=23,sec=state.windowSec,{begin,end,windowMs,phase}=rollFrame();const {plotW}=rollPlotGeometry(rect,{begin,end},c),rowH=(H-top-bottom)/15;
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
 c.save();c.beginPath();c.rect(left,top,plotW,H-top-bottom);c.clip();const ev=platformController.events(),start=lowerBound(ev,begin-10000);for(let i=start;i<ev.length;i++){let e=ev[i];if(e.timeMs>end)break;if(!e.notes.length)continue;let x=left+(e.timeMs-begin)/windowMs*plotW;let width=Math.max(3,Math.min(windowMs<state.windowSec*1000||($('scoreConsole')?.open&&scoreConsole.mode==='fine')?Infinity:22,(e.durationMs||180)/windowMs*plotW));for(let n of e.notes){let tileWidth=Math.max(2,width-1.8),tileHeight=Math.max(3,rowH*.5),tileX=x+.8,y=top+(15-n)*rowH+(rowH-tileHeight)/2;
 // Keep repeated notes distinct even when their sounding durations overlap.
 for(let j=i+1;j<ev.length&&ev[j].timeMs<e.timeMs+(width+2)/plotW*windowMs;j++){if(ev[j].notes.includes(n)){tileWidth=Math.min(tileWidth,Math.max(.8,(ev[j].timeMs-e.timeMs)/windowMs*plotW-1.8));break}}
 c.fillStyle=e.notes.length>=3?colors.poly:e.notes.length===2?colors.chord:colors.note;c.shadowColor='rgba(0,0,0,.32)';c.shadowBlur=2;c.shadowOffsetY=1;c.beginPath();c.roundRect(tileX,y,tileWidth,tileHeight,Math.min(2,tileWidth/2,tileHeight/2));c.fill();if($('scoreConsole')?.open&&scoreConsole.mode==='fine'&&i===state.selected){c.strokeStyle=colors.accent;c.lineWidth=1.5;c.stroke()}}}
 c.restore();let cursorX=left+phase/windowMs*plotW;c.strokeStyle='#ffd89c';c.lineWidth=1.5;c.beginPath();c.moveTo(cursorX,top);c.lineTo(cursorX,H-bottom);c.stroke();c.fillStyle='#ffe0ac';c.beginPath();c.arc(cursorX,top,3.6,0,Math.PI*2);c.fill();c.beginPath();c.arc(cursorX,H-bottom,3.6,0,Math.PI*2);c.fill();c.lineWidth=1
}
